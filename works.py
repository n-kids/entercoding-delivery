"""네이버웍스 API 2.0 클라이언트.

- 서비스 계정(JWT) 토큰: 봇 메시지, 캘린더, 구성원 조회
- 구성원(User OAuth) 토큰: 할 일 (서비스 계정으로는 불가). 관리자 계정의 refresh token 으로 갱신한다.
"""
import base64
import hashlib
import hmac
import os
import threading
import time

import logging

import jwt
import requests

log = logging.getLogger("newkids-bot.works")

AUTH_URL = "https://auth.worksmobile.com/oauth2/v2.0/token"
API_BASE = "https://www.worksapis.com/v1.0"
TIMEZONE = "Asia/Seoul"


def _env(name, default=""):
    return os.getenv(name, default).strip()


def _private_key():
    # 클라우드에서는 키 내용을 환경변수로, 로컬에서는 파일 경로로 받는다
    key = _env("NW_PRIVATE_KEY")
    if key:
        return key.replace("\\n", "\n")
    with open(_env("NW_PRIVATE_KEY_PATH"), encoding="utf-8") as f:
        return f.read()


class WorksError(RuntimeError):
    pass


class Works:
    def __init__(self):
        self.client_id = _env("NW_CLIENT_ID")
        self.client_secret = _env("NW_CLIENT_SECRET")
        self.service_account = _env("NW_SERVICE_ACCOUNT")
        self.bot_id = _env("NW_BOT_ID")
        self.bot_secret = _env("NW_BOT_SECRET")
        self.admin_id = _env("NW_USER_ID")  # 할 일 요청자(assignor)이자 아침 요약을 받는 사람
        self.scope = _env("NW_SCOPE", "bot bot.read calendar calendar.read user.read")
        self._refresh_token = _env("NW_USER_REFRESH_TOKEN")
        self._store_loaded = False
        self._candidates = []
        self._lock = threading.Lock()
        self._svc = (None, 0)
        self._usr = (None, 0)
        self._user_cache = {}

    # ---------- 인증 ----------
    def verify_signature(self, body: bytes, signature: str) -> bool:
        if not self.bot_secret:
            return False
        digest = hmac.new(self.bot_secret.encode(), body, hashlib.sha256).digest()
        return hmac.compare_digest(base64.b64encode(digest).decode(), signature or "")

    def _service_token(self):
        with self._lock:
            token, exp = self._svc
            if token and time.time() < exp - 300:
                return token
            now = int(time.time())
            assertion = jwt.encode(
                {"iss": self.client_id, "sub": self.service_account, "iat": now, "exp": now + 3600},
                _private_key(), algorithm="RS256")
            data = self._token_request({
                "assertion": assertion,
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "scope": self.scope,
            })
            self._svc = (data["access_token"], time.time() + int(data.get("expires_in", 3600)))
            return self._svc[0]

    # ---- 관리자 로그인 토큰 보관 ----
    # 웍스 'Refresh Token Rotation' 이 켜져 있으면 갱신할 때마다 새 토큰이 나오고, 100개를 넘으면 오래된 것부터 만료된다.
    # 새 토큰을 메모리에만 두면 재배포·재시작 때 Render 의 처음 값(이미 만료됨)으로 돌아가 '토큰 발급 실패'가 난다.
    # 그래서 새 토큰을 Supabase(nk_bot_secret_put, 납품시트 키로 보호)에 저장해 두고 재시작 때 먼저 쓴다.
    _SECRET_NAME = "nw_user_refresh_token"

    def _store_rpc(self, name, **params):
        url = _env("APP_SUPABASE_URL").rstrip("/")
        key = _env("APP_SUPABASE_KEY")
        sheet = _env("NK_SHEET_KEY")
        if not (url and key and sheet):
            return None
        resp = requests.post(f"{url}/rest/v1/rpc/{name}", json={"p_key": sheet, **params}, timeout=10,
                             headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        if resp.status_code >= 300:
            raise WorksError(f"토큰 보관소 {name} {resp.status_code}: {resp.text[:150]}")
        return resp.json() if resp.text else None

    def _stored_refresh_token(self):
        try:
            got = self._store_rpc("nk_bot_secret_get", p_name=self._SECRET_NAME)
            return (got or {}).get("value") or ""
        except Exception as e:
            log.info("저장된 관리자 토큰을 읽지 못함 (보관소 미설정이면 정상): %s", e)
            return ""

    def _save_refresh_token(self, token):
        try:
            self._store_rpc("nk_bot_secret_put", p_name=self._SECRET_NAME, p_value=token)
        except Exception as e:
            log.warning("새 관리자 토큰을 저장하지 못함 (재시작하면 다시 로그인이 필요할 수 있음): %s", e)

    def _user_token(self):
        with self._lock:
            token, exp = self._usr
            if token and time.time() < exp - 300:
                return token
            # 새 접근 토큰이 필요할 때마다 보관소를 다시 읽는다: PC에서 다시 로그인해 저장한 토큰을 재시작 없이 바로 쓰도록 (2026-11-18)
            stored = self._stored_refresh_token()
            if stored and stored != self._refresh_token and stored not in self._candidates:
                self._candidates = [stored, *self._candidates]
            cands = [c for c in dict.fromkeys([*self._candidates, self._refresh_token]) if c]
            if not cands:
                raise WorksError("NW_USER_REFRESH_TOKEN 이 없어 할 일 API를 쓸 수 없음")
            last = None
            for rt in cands:
                try:
                    data = self._token_request({"refresh_token": rt, "grant_type": "refresh_token"})
                except WorksError as e:
                    last = e
                    continue
                new_rt = data.get("refresh_token") or rt
                if data.get("refresh_token") or rt != _env("NW_USER_REFRESH_TOKEN"):
                    self._save_refresh_token(new_rt)
                self._refresh_token = new_rt
                self._candidates = []
                self._usr = (data["access_token"], time.time() + int(data.get("expires_in", 3600)))
                return self._usr[0]
            raise last

    def _token_request(self, data):
        data = {**data, "client_id": self.client_id, "client_secret": self.client_secret}
        resp = requests.post(AUTH_URL, data=data, timeout=15)
        if resp.status_code != 200:
            raise WorksError(f"토큰 발급 실패: HTTP {resp.status_code} {resp.text[:300]}")
        try:
            body = resp.json()
        except ValueError:
            body = {}
        if not body.get("access_token"):
            # 200 이어도 토큰 대신 오류가 오는 경우가 있다 (로그인 토큰 만료·취소 등)
            why = body.get("error_description") or body.get("error") or body.get("message") or resp.text[:200]
            hint = (" → 관리자 로그인 토큰(NW_USER_REFRESH_TOKEN)이 만료됐거나 취소됐습니다. PC에서 nw_task_test.py로 다시 로그인해 새 값을 Render에 넣어 주세요."
                    if data.get("grant_type") == "refresh_token" else "")
            raise WorksError(f"토큰 발급 실패: {why}{hint}")
        return body

    def _call(self, method, path, user=False, **kwargs):
        token = self._user_token() if user else self._service_token()
        resp = requests.request(method, f"{API_BASE}{path}", timeout=20,
                                headers={"Authorization": f"Bearer {token}"}, **kwargs)
        if resp.status_code >= 400:
            raise WorksError(f"{method} {path} 실패: HTTP {resp.status_code} {resp.text[:300]}")
        return resp.json() if resp.content else {}

    # ---------- 메시지 ----------
    def send_to_user(self, user_id, text):
        self._call("POST", f"/bots/{self.bot_id}/users/{user_id}/messages",
                   json={"content": {"type": "text", "text": text}})

    def send_to_channel(self, channel_id, text):
        self._call("POST", f"/bots/{self.bot_id}/channels/{channel_id}/messages",
                   json={"content": {"type": "text", "text": text}})

    def channel_title(self, channel_id):
        return self._call("GET", f"/bots/{self.bot_id}/channels/{channel_id}").get("title", "")

    def channel_members(self, channel_id):
        """대화방 구성원 userId 목록."""
        members, cursor = [], None
        while True:
            params = {"cursor": cursor} if cursor else {}
            data = self._call("GET", f"/bots/{self.bot_id}/channels/{channel_id}/members", params=params)
            members += data.get("members", [])
            cursor = (data.get("responseMetaData") or {}).get("nextCursor")
            if not cursor:
                return members

    # ---------- 구성원 ----------
    def users(self):
        if self._user_cache:
            return list(self._user_cache.values())
        cursor = None
        while True:
            params = {"count": 100, **({"cursor": cursor} if cursor else {})}
            data = self._call("GET", "/users", params=params)
            for u in data.get("users", []):
                name = (u["userName"].get("lastName", "") + u["userName"].get("firstName", "")).strip()
                self._user_cache[u["userId"]] = {"userId": u["userId"], "name": name, "email": u.get("email", "")}
            cursor = (data.get("responseMetaData") or {}).get("nextCursor")
            if not cursor:
                return list(self._user_cache.values())

    def user_name(self, user_id):
        for u in self.users():
            if user_id in (u["userId"], u["email"]):
                return u["name"]
        return user_id

    def user_id_of(self, user):
        """이메일/ID 를 사용자 UUID 로 바꾼다."""
        for u in self.users():
            if user in (u["userId"], u["email"]):
                return u["userId"]
        raise WorksError(f"구성원을 찾을 수 없음: {user}")

    # ---------- 캘린더 ----------
    def calendars(self, user):
        return self._call("GET", f"/users/{user}/calendar-personals").get("calendarPersonals", [])

    def calendar_id(self, user, name):
        for c in self.calendars(user):
            if c.get("calendarName", "").strip() == name:
                return c["calendarId"]
        raise WorksError(f"'{name}' 캘린더를 찾을 수 없음")

    def events(self, user, start_iso, end_iso, calendar_id=None):
        path = f"/users/{user}/calendars/{calendar_id}/events" if calendar_id else f"/users/{user}/calendar/events"
        data = self._call("GET", path, params={"fromDateTime": start_iso, "untilDateTime": end_iso})
        result = []
        for e in data.get("events", []):
            for c in e.get("eventComponents", []):
                result.append({
                    "summary": c.get("summary", ""),
                    "start": c.get("start", {}).get("dateTime") or c.get("start", {}).get("date"),
                    "end": c.get("end", {}).get("dateTime") or c.get("end", {}).get("date"),
                    "location": c.get("location", ""),
                    "description": c.get("description", ""),
                })
        return result

    def create_event(self, user, summary, start, end, description="", location="", calendar_id=None):
        """start/end 가 'YYYY-MM-DD' 이면 종일 일정 (end 는 마지막 날의 다음 날)."""
        if "T" in start:
            span = {"start": {"dateTime": start, "timeZone": TIMEZONE},
                    "end": {"dateTime": end, "timeZone": TIMEZONE}}
        else:
            span = {"start": {"date": start}, "end": {"date": end}}
        comp = {"summary": summary, **span}
        if description:
            comp["description"] = description
        if location:
            comp["location"] = location
        path = f"/users/{user}/calendars/{calendar_id}/events" if calendar_id else f"/users/{user}/calendar/events"
        return self._call("POST", path, json={"eventComponents": [comp]})

    # ---------- 할 일 (관리자 계정 토큰) ----------
    def tasks(self, status="TODO"):
        data = self._call("GET", "/users/me/tasks", user=True, params={"categoryId": "default", "status": status})
        return [{
            "taskId": t.get("taskId", ""),
            "title": t.get("title", ""),
            "content": t.get("content", ""),
            "dueDate": t.get("dueDate"),
            "assignees": [a.get("assigneeName", "") for a in t.get("assignees", [])],
            "assignor": t.get("assignorName", ""),
        } for t in data.get("tasks", [])]

    def create_task(self, title, assignee_ids, due_date=None, content=""):
        body = {
            "assignorId": self.user_id_of(self.admin_id),
            "assignees": [{"assigneeId": a, "status": "TODO"} for a in assignee_ids],
            "title": title,
            "content": content,
            "completionCondition": "ANY_ONE",
        }
        if due_date:
            body["dueDate"] = due_date
        return self._call("POST", "/users/me/tasks", user=True, json=body)

    # ---------- 납품 앱용: 회수·반품 할 일 ----------
    def all_tasks(self, status="TODO", filter_type="ALL", max_pages=20):
        """관리자 할 일을 다음 페이지까지 모두 가져온다 (taskId·담당자 ID 포함)."""
        if str(status).upper() not in ("TODO", "ALL"):  # 웍스 규칙: TODO 또는 ALL 만 허용
            status = "ALL"
        out, cursor = [], None
        for _ in range(max(1, int(max_pages))):
            params = {"categoryId": "default", "status": status, "searchFilterType": filter_type, "count": 100}
            if cursor:
                params["cursor"] = cursor
            data = self._call("GET", "/users/me/tasks", user=True, params=params)
            out.extend(data.get("tasks", []))
            cursor = (data.get("responseMetaData") or {}).get("nextCursor")
            if not cursor:
                break
        return out

    def task(self, task_id):
        data = self._call("GET", f"/tasks/{task_id}", user=True)
        return data.get("task", data)

    def set_task_assignees(self, task_id, assignee_ids):
        """할 일 담당자를 바꾼다 (PATCH /tasks/{taskId}). 원래 있던 담당자의 완료 상태는 그대로 둔다."""
        ids = [i for i in dict.fromkeys(assignee_ids or []) if i]
        if not ids:
            raise WorksError("담당자를 한 명 이상 지정해야 합니다.")
        t = self.task(task_id)
        old = {a.get("assigneeId"): (a.get("status") or "TODO") for a in t.get("assignees", []) if a.get("assigneeId")}
        body = {"assignees": [{"assigneeId": i, "status": old.get(i, "TODO")} for i in ids]}
        if len(ids) >= 2:  # 웍스 규칙: 담당자가 2명 이상일 때만 완료 조건을 넣는다
            body["completionCondition"] = t.get("completionCondition") or "ANY_ONE"
        self._call("PATCH", f"/tasks/{task_id}", user=True, json=body)
        return self.task(task_id)

    @staticmethod
    def _is_task_done(t):
        if not isinstance(t, dict):
            return False
        if str(t.get("status") or "TODO").upper() == "DONE":
            return True
        sts = [str(a.get("status") or "TODO").upper() for a in (t.get("assignees") or []) if isinstance(a, dict)]
        if not sts:
            return False
        if str(t.get("completionCondition") or "ANY_ONE").upper() == "MUST_ALL":
            return all(x == "DONE" for x in sts)
        return any(x == "DONE" for x in sts)

    def _my_user_id(self):
        if not self.admin_id:
            return None
        try:
            return self.user_id_of(self.admin_id)
        except Exception:
            return None

    def set_task_done(self, task_id, done=True):
        """할 일을 완료(또는 미완료)로 바꾼다.

        전체 완료 API가 권한 등으로 막히면 담당자 완료 API로 전환하되,
        네이버웍스 규칙상 토큰 본인(관리자 계정)의 담당 상태를 우선 시도한다.
        """
        action = "complete" if done else "incomplete"
        try:
            self._call("POST", f"/tasks/{task_id}/{action}", user=True)
            return
        except WorksError as first:
            err = first
        t = self.task(task_id)
        if self._is_task_done(t) == bool(done):
            return
        raw_assignees = [a for a in (t.get("assignees") or []) if isinstance(a, dict) and a.get("assigneeId")]
        assignees = [a["assigneeId"] for a in raw_assignees]
        if not assignees:
            raise err
        my_id = self._my_user_id()
        must_all = str(t.get("completionCondition") or "ANY_ONE").upper() == "MUST_ALL"

        def _prioritized(ids):
            if my_id and my_id in ids:
                return [my_id] + [i for i in ids if i != my_id]
            return list(ids)

        if done:
            pending_ids = [a["assigneeId"] for a in raw_assignees if str(a.get("status") or "TODO").upper() != "DONE"]
            targets = _prioritized(pending_ids or assignees)
            if must_all:
                last_err = err
                for a in targets:
                    try:
                        self._call("POST", f"/tasks/{task_id}/assignees/{a}/complete", user=True)
                    except WorksError as e:
                        last_err = e
                if self._is_task_done(self.task(task_id)):
                    return
                raise last_err
            last_err = err
            for a in targets:
                try:
                    self._call("POST", f"/tasks/{task_id}/assignees/{a}/complete", user=True)
                    return
                except WorksError as e:
                    last_err = e
            # 관리자가 요청자이지만 담당자 목록에 없는 ANY_ONE 할 일: 본인을 담당자에 추가 후 본인 완료
            if my_id and my_id not in assignees and t.get("assignorId") == my_id:
                try:
                    self.set_task_assignees(task_id, [*assignees, my_id])
                    self._call("POST", f"/tasks/{task_id}/assignees/{my_id}/complete", user=True)
                    return
                except WorksError as e:
                    last_err = e
            raise last_err

        done_ids = [a["assigneeId"] for a in raw_assignees if str(a.get("status") or "TODO").upper() == "DONE"]
        targets = _prioritized(done_ids or assignees)
        last_err = err
        succeeded = 0
        for a in targets:
            try:
                self._call("POST", f"/tasks/{task_id}/assignees/{a}/incomplete", user=True)
                succeeded += 1
            except WorksError as e:
                last_err = e
        if succeeded and not self._is_task_done(self.task(task_id)):
            return
        raise last_err
