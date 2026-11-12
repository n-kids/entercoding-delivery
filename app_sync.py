"""웍스 할 일 → 납품 앱(Supabase ec_records) 실시간 동기화.

봇 서버가 1분마다(그리고 봇이 할 일을 만든 직후, 앱에서 버튼을 누를 때) 웍스의 미완료
할 일([회수]·[반품]·[교구]·[A/S]·[추가] 머리말 할 일 + 사용자가 웍스에서 머리말 없이 직접 등록한 할 일)을
납품 앱 데이터로 올린다. 앱은 Supabase 실시간 채널로 바로 받아 화면에 보여 준다.

- 새 할 일 → 앱에 새 항목 (id 'w_' + 할 일 ID)
- 기한·담당자·내용이 바뀌면 → 앱 항목도 바꿈 (앱에서 고친 원 이름·위치·메모·완료 여부는 그대로)
- 웍스에서 완료/삭제 → 앱에서도 완료 표시
- 앱에서 완료했는데 웍스에 반영이 안 됐으면 → 웍스에서 완료 처리
- 앱에서 완료·반영까지 됐는데 웍스에서 다시 미완료로 돌리면 → 앱에서도 다시 미완료

앱 데이터는 기존 RPC(nk_ec_pickups / nk_ec_pickup_put, 납품시트 키로 보호)로만 읽고 쓴다.
"""
import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone

import requests

log = logging.getLogger("newkids-bot.app_sync")
KST = timezone(timedelta(hours=9))

SUPABASE_URL = os.getenv("APP_SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.getenv("APP_SUPABASE_KEY", "").strip()   # 공개용(publishable) 키
SHEET_KEY = os.getenv("NK_SHEET_KEY", "").strip()           # 납품시트 연동 키 (비밀값, Render 에서만 입력)
SYNC_SECONDS = max(20, int(os.getenv("APP_SYNC_SECONDS", "30") or 30))
SYNC_HOURS = os.getenv("APP_SYNC_HOURS", "7-21").strip()     # 이 시간(한국)에만 자동 동기화. 비우면 항상
# 사용자가 웍스에서 머리말([회수] 등) 없이 직접 등록한 할 일도 자동 연동할지 여부 (기본 켜짐)
ALLOW_UNPREFIXED = os.getenv("APP_ALLOW_UNPREFIXED_TASKS", "1").strip() not in ("0", "false", "False", "no")

_lock = threading.Lock()
_again = threading.Event()
state = {"lastAt": None, "lastOk": None, "lastError": "", "last": None}


def enabled():
    return bool(SUPABASE_URL and SUPABASE_KEY and SHEET_KEY)


def in_hours(now=None):
    m = re.match(r"^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$", SYNC_HOURS or "")
    if not m:
        return True
    h = (now or datetime.now(KST)).hour
    a, b = int(m.group(1)), int(m.group(2))
    return a <= h <= b if a <= b else (h >= a or h <= b)


def _rpc(name, **params):
    resp = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/{name}", json=params, timeout=20,
                         headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                                  "Content-Type": "application/json"})
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase {name} {resp.status_code}: {resp.text[:200]}")
    return resp.json() if resp.text else None


def _put(value):
    _rpc("nk_ec_pickup_put", p_key=SHEET_KEY, p_rid=value["id"], p_value=value)


def prefix_key(text):
    m = re.match(r"\s*\[([^\]]*)\]", text or "")
    return re.sub(r"[\s/]", "", m.group(1)).upper() if m else ""


# PC 전용 사무 처리 스킬([메일], [계산서], [견적서], [거래명세서], [확정], [취소])은 납품 앱에서 제외
EXCLUDED_PREFIX_KEYS = {
    "메일", "계산서", "세금계산서", "견적서", "거래명세서",
    "확정", "확정변경", "취소", "발주취소",
}

TYPE_OF_KEY = {
    "회수": "회수",
    "반품": "반품",
    "교구": "교구",
    "AS": "A/S",
    "에이에스": "A/S",
    "수리": "A/S",
    "교환": "A/S",
    "추가": "추가",
    "납품": "추가",
    "발주": "추가",
    "배송": "추가",
    "출고": "추가",
    "증정": "추가",
    "방문": "추가",
}


def infer_task_type(title, content=""):
    """제목 머리말이 있으면 우선 사용하고, 머리말이 없으면 제목·본문 키워드로 유형을 자동 판별한다."""
    key = prefix_key(title)
    if key in TYPE_OF_KEY:
        return TYPE_OF_KEY[key]
    combined = f"{title or ''} {content or ''}"
    if re.search(r"반품", combined):
        return "반품"
    if re.search(r"회수|수거|유보", combined):
        return "회수"
    if re.search(r"A\s*/?\s*S|에이에스|수리|교체|불량|고장|파손|교환", combined, re.I):
        return "A/S"
    if re.search(r"교구", combined):
        return "교구"
    # 사용자가 직접 등록한 납품/발주/선물용품/품목 리스트 할 일은 기본 '추가'(추가 납품 탭)로 분류
    return "추가"


def is_app_task(task_or_title, app_prefix_keys=None, allow_unprefixed=None):
    """납품 앱으로 연동할 할 일인지 판별한다.
    - [메일], [계산서], [견적서], [거래명세서], [확정], [취소] 등 PC 사무 전용 할 일은 제외
    - [회수], [반품], [교구], [A/S], [추가] 등 앱 머리말이 있으면 포함
    - 머리말([ ]) 없이 사용자가 웍스에서 직접 등록한 할 일도 자동 포함
    """
    if isinstance(task_or_title, dict):
        title = str(task_or_title.get("title") or "").strip()
    else:
        title = str(task_or_title or "").strip()
    if not title:
        return False
    key = prefix_key(title)
    if key in EXCLUDED_PREFIX_KEYS:
        return False
    if key:
        if app_prefix_keys is not None and key in app_prefix_keys:
            return True
        return key in TYPE_OF_KEY
    use_unprefixed = ALLOW_UNPREFIXED if allow_unprefixed is None else bool(allow_unprefixed)
    return use_unprefixed


def _norm(s):
    return re.sub(r"[\s()\[\]·.,\-]", "", str(s or "")).lower()


def _match_school(first, title, schools):
    """앱과 같은 방식으로: 첫 단어가 원 이름과 같거나, 제목에 4글자 이상 원 이름이 그대로 들어 있으면 연결."""
    nf, nt = _norm(first), _norm(title)
    best = None
    for s in schools:
        ns = _norm(s.get("name"))
        if not ns:
            continue
        if nf and (nf == ns or (len(nf) >= 3 and (ns.startswith(nf) or nf.startswith(ns)) and abs(len(nf) - len(ns)) <= 3)):
            return s
        if len(ns) >= 4 and ns in nt and (best is None or len(ns) > len(_norm(best.get("name")))):
            best = s
    return best


_TRAILING_ACTION_RE = re.compile(
    r"\s*(추가\s*납품|납품\s*요청|납품|회수\s*요청|회수|반품\s*요청|반품|수거|전달|배송|출고|발주|요청|부탁드립니다|부탁해요|부탁)\s*$"
)
_ITEM_QTY_END_RE = re.compile(
    r"^(.+?)\s*(\d+)\s*(개|권|부|세트|박스|set|EA|ea|장|팩|종|명|분)?\s*$"
)
_PROSE_NOISE_RE = re.compile(
    r"(요망|바랍니다|부탁|원장님|선생님|연락|통화|확인|예정|때문에|으로\s|에서\s|에게\s)"
)
_USER_ID_RE = re.compile(r"\s*\(\s*userId\s+[0-9a-fA-F\-]+\s*\)|\buserId\s+[0-9a-fA-F\-]+", re.I)
_META_LINE_RE = re.compile(
    r"^(미완료된\s*할\s*일|완료된\s*할\s*일|기한|없음|기한\s*없음|메시지방|발주/추가/취소\s*방|카테고리|미분류\s*할\s*일|요청자|담당자|완료하기|미완료로\s*변경)$"
    r"|^(요청자|담당자|보낸\s*사람|기한|메시지방|카테고리|생성일|등록자)\s*[:：]"
    r"|^DATA\s*:",
    re.I,
)


def _strip_user_id(text):
    return _USER_ID_RE.sub("", str(text or "")).strip()


def _is_meta_line(text):
    s = _strip_user_id(text)
    return not s or bool(_META_LINE_RE.search(s))


def _parse_single_token(token):
    """'책상4개', '보석화장대 12', '스마트테트리스 5개 회수' 같은 단일 품목+수량 문자열을 파싱한다."""
    t = re.sub(r"^[\s\-·•*]+", "", _strip_user_id(token)).strip()
    t = re.sub(r"^원문\s*[:：]\s*", "", t, flags=re.I).strip()
    if not t or _is_meta_line(t) or _PROSE_NOISE_RE.search(t):
        return None
    t_clean = _TRAILING_ACTION_RE.sub("", t).strip(" ,.:·-")
    if not t_clean or _is_meta_line(t_clean):
        return None
    m = _ITEM_QTY_END_RE.match(t_clean)
    if m:
        name = _TRAILING_ACTION_RE.sub("", m.group(1)).strip(" ,.:·-")
        qty = int(m.group(2))
        unit = (m.group(3) or "개").strip()
        if name and len(name) <= 25 and qty > 0 and not _is_meta_line(name):
            return {
                "label": name,
                "qty": qty,
                "done": 0,
                "item": name,
                "plannedQty": qty,
                "actualQty": qty,
                "unit": unit,
                "checked": False,
            }
    return None


def _parse_items_and_qty(rest, content="", prev_fq=None):
    """제목 나머지(rest)와 웍스 본문(content)에서 품목 요약 문자열, 총수량, 품목별 수량(fieldQuantities)을 추출한다."""
    rest = _strip_user_id(rest)
    content = _strip_user_id(content)

    title_tokens = [x.strip() for x in re.split(r"[,/·]+", rest) if x.strip() and not _is_meta_line(x)] if rest else []
    raw_lines = [ln.strip() for ln in re.split(r"[\r\n]+", content) if ln.strip()] if content else []
    content_lines = []
    content_tokens = []
    for ln in raw_lines:
        if _is_meta_line(ln):
            continue
        cleaned_ln = re.sub(r"^원문\s*[:：]\s*", "", ln, flags=re.I).strip()
        if not cleaned_ln or _is_meta_line(cleaned_ln):
            continue
        content_lines.append(cleaned_ln)
        parts = [x.strip() for x in re.split(r"[,/]+", cleaned_ln) if x.strip() and not _is_meta_line(x)]
        content_tokens.extend(parts)

    parsed = []
    seen = set()
    for raw in title_tokens + content_tokens:
        entry = _parse_single_token(raw)
        if not entry:
            continue
        key = _norm(entry["label"])
        if not key or key in seen:
            continue
        seen.add(key)
        parsed.append(entry)

    # 기존 앱에서 체크하거나 수정한 done / actualQty / checked 상태 보존
    if prev_fq and isinstance(prev_fq, list):
        prev_map = {
            _norm(p.get("label") or p.get("item")): p
            for p in prev_fq
            if isinstance(p, dict) and (p.get("label") or p.get("item"))
        }
        for entry in parsed:
            old = prev_map.get(_norm(entry["label"]))
            if old:
                qty_val = entry["qty"]
                old_done = old.get("done")
                if old_done is None:
                    old_done = qty_val if old.get("checked") else 0
                done_val = min(qty_val, max(0, int(old_done or 0)))
                entry["done"] = done_val
                entry["checked"] = bool(old.get("checked")) or (done_val >= qty_val)
                if old.get("actualQty") is not None:
                    entry["actualQty"] = old["actualQty"]

    qty_sum = sum(e["qty"] for e in parsed if isinstance(e.get("qty"), int) and e["qty"] > 0)
    if qty_sum == 0:
        qm = re.search(r"(\d+)\s*(개|권|부|세트|박스|set)", f"{rest} {' '.join(content_lines)}", re.I)
        qty_sum = int(qm.group(1)) if qm else 0

    content_summary = ", ".join(
        ln for ln in content_lines if _norm(ln) and _norm(ln) not in _norm(rest)
    )
    if rest and content_summary:
        items_str = f"{rest} · {content_summary}"
    else:
        items_str = rest or content_summary

    return items_str, qty_sum, parsed


def _new_record(t, schools, now_ms, i):
    title = str(t.get("title") or "").strip()
    content = _strip_user_id(t.get("content") or "")
    body = re.sub(r"^\s*\[[^\]]*\]\s*", "", title)
    flat = re.sub(r"\s+", " ", body).strip()
    first = re.sub(r"[(\[].*$", "", (flat.split(" ")[0] if flat else ""))
    first = re.sub(r"(샘플)?(회수|반품|수거|증정|선물|방문|납품|추가)(요청|하기)?[.]?$", "", first)
    if len(first) < 2:
        first = " ".join(flat.split(" ")[:2])
    s = _match_school(first, flat, schools)
    rest = flat[len(first):] if first and flat.startswith(first) else flat
    rest = re.sub(r"^[\s,.:·-]+", "", rest).strip()

    school_name = s["name"] if s else first
    items_str, total_qty, field_quantities = _parse_items_and_qty(rest, content)
    task_type = infer_task_type(title, content)

    return {
        "id": "w_" + str(t["taskId"]),
        "title": body,
        "school": school_name,
        "target": school_name,
        "schoolId": s.get("id") if s else None,
        "type": task_type,
        "items": items_str,
        "qty": total_qty,
        "fieldQuantities": field_quantities,
        "due": _due(t),
        "assignee": _assignees(t),
        "assigneeIds": _assignee_ids(t),
        "memo": "",
        "address": "",
        "lat": None,
        "lng": None,
        "done": False,
        "doneAt": None,
        "createdAt": now_ms + i,
        "source": "works-api",
        "worksTaskId": str(t["taskId"]),
        "worksStatus": "TODO",
        "worksContent": content,
        "worksSyncPending": False,
        "schoolChecked": False,
    }


def build_record(t, schools=None, now_ms=None, i=0):
    """단일 웍스 할 일 dict를 앱 레코드 dict로 변환하는 공개 헬퍼."""
    return _new_record(t, schools or [], now_ms or int(time.time() * 1000), i)


def _due(t):
    d = str(t.get("dueDate") or "")
    return d[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", d) else ""


def _assignees(t):
    return ", ".join(a.get("assigneeName", "") for a in t.get("assignees", []) if a.get("assigneeName"))


def _assignee_ids(t):
    return [a.get("assigneeId") for a in t.get("assignees", []) if isinstance(a, dict) and a.get("assigneeId")]


def task_done(t):
    """웍스 할 일이 실제로 끝났는지 판단한다.

    발주/추가/취소 방 할 일은 방 구성원 전원이 담당자이고 '담당자 중 1명 완료(ANY_ONE)' 조건이다.
    이때 한 명이 완료해도 목록의 status 가 TODO 로 남는 경우가 있어, 담당자별 상태와 완료 조건까지 본다.
    """
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


def _iso_ms(v):
    try:
        return int(datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:
        return 0


def title_key(title):
    """[회수] 머리말·userId·공백·기호를 뺀 제목 비교용 키 (앱에서 캡처·붙여넣기로 넣은 할 일을 웍스 할 일과 연결할 때 사용)."""
    t = re.sub(r"^\s*\[[^\]]*\]\s*", "", _strip_user_id(title or ""))
    return _norm(t)


def _name_key(s):
    return re.sub(r"[\s()·.,\-]", "", str(s or "")).lower()


def resolve_assignees(works, names):
    """담당자 이름(또는 userId·이메일) 목록을 웍스 userId 로 바꾼다. (ids, 이름들, 못 찾은 이름들)"""
    if isinstance(names, str):
        names = [x for x in re.split(r"[,，/·]+", names)]
    users = works.users()
    ids, labels, missing = [], [], []
    for raw in names or []:
        n = _strip_user_id(raw).strip()
        if not n:
            continue
        k = _name_key(n)
        hit = next((u for u in users if n in (u["userId"], u["email"]) or _name_key(u["name"]) == k), None)
        if hit is None:
            cands = [u for u in users if k and (k in _name_key(u["name"]) or _name_key(u["name"]) in k) and len(_name_key(u["name"])) >= 2]
            hit = cands[0] if len(cands) == 1 else None
        if hit is None:
            missing.append(n)
        elif hit["userId"] not in ids:
            ids.append(hit["userId"])
            labels.append(hit["name"])
    return ids, labels, missing


def _call_is_app_task(fn, t):
    """is_app_task 콜백이 할 일 dict 또는 제목 문자열 어느 쪽을 받더라도 안전하게 호출."""
    if fn is None:
        return is_app_task(t)
    try:
        return bool(fn(t))
    except TypeError:
        return bool(fn(t.get("title")))


def sync(works, is_app_task_fn=None, reason="timer", wait=False):
    """한 번 동기화한다. 이미 돌고 있으면 끝난 뒤 한 번 더 돌도록 표시한다 (wait=True 면 끝날 때까지 기다림)."""
    if not enabled():
        return None
    got = _lock.acquire(timeout=40) if wait else _lock.acquire(blocking=False)
    if not got:
        _again.set()
        return {"ok": True, "busy": True}
    try:
        while True:
            _again.clear()
            result = _sync_once(works, is_app_task_fn, reason)
            if not _again.is_set():
                return result
            reason = "again"
    finally:
        _lock.release()


def _push_assignee(works, tid, v, t, out):
    """앱에서 바꾼 담당자(worksAssigneePending)를 웍스 할 일에 반영한다. 반영했거나 정리했으면 True."""
    ids, labels, missing = resolve_assignees(works, v.get("assignee") or "")
    """반환값: 담당자 기준으로 삼을 웍스 할 일 (실패해서 앱 값을 유지할 땐 None)."""
    if missing or not ids:
        # 웍스 구성원에서 찾을 수 없는 이름이면 웍스 값을 따른다 (계속 실패하며 덮어쓰기를 막지 않도록)
        log.warning("담당자 변경 반영 불가 %s: 못 찾은 이름 %s", tid, missing)
        v.update(worksAssigneePending=False, worksAssigneeError="웍스 구성원에서 찾지 못함: " + ", ".join(missing or ["(비어 있음)"]))
        return t
    if set(ids) == set(_assignee_ids(t)):
        v.update(worksAssigneePending=False, worksAssigneeError="")
        return t
    try:
        nt = works.set_task_assignees(tid, ids) or {}
        if not nt.get("assignees"):
            nt = dict(t, assignees=[{"assigneeId": i, "assigneeName": n, "status": "TODO"} for i, n in zip(ids, labels)])
        v.update(worksAssigneePending=False, worksAssigneeError="")
        out["assigneePushed"] += 1
        return nt
    except Exception as e:
        log.warning("웍스 담당자 변경 실패 %s: %s", tid, e)
        v["worksAssigneeError"] = str(e)[:200]
        out["failed"] += 1
        return None


def _sync_once(works, is_app_task_fn, reason):
    started = time.time()
    try:
        # 앱 기록을 먼저 읽고 웍스를 나중에 읽는다 (그 사이 앱에서 완료한 것을 '다시 열림'으로 오해하지 않게)
        rows = _rpc("nk_ec_pickups", p_key=SHEET_KEY) or []
        listed = [t for t in works.all_tasks(status="TODO")
                  if t.get("taskId") and _call_is_app_task(is_app_task_fn, t)]
    except Exception as e:
        state.update(lastAt=int(started * 1000), lastOk=False, lastError=str(e)[:300])
        log.warning("앱 동기화 실패(%s): %s", reason, e)
        raise
    # 목록에는 남아 있지만 담당자 한 명이 이미 완료한 할 일(ANY_ONE)은 완료로 본다
    tasks = [t for t in listed if not task_done(t)]
    done_listed = [t for t in listed if task_done(t)]
    schools, by_task, unlinked = [], {}, {}
    for r in rows:
        v = r.get("value") or {}
        if v.get("id") != r.get("rid") and (v.get("worksTaskId") or v.get("title")):
            v = dict(v, id=r.get("rid"))
        if v.get("worksTaskId"):
            by_task.setdefault(str(v["worksTaskId"]), v)
        elif v.get("title") and v.get("source") == "works":
            # 웍스 화면 캡처·붙여넣기로 넣은 할 일: 제목이 같은 웍스 할 일과 연결해 완료 상태를 맞춘다
            k = title_key(v.get("title"))
            if k:
                unlinked.setdefault(k, []).append(v)
        elif v.get("name") and not v.get("title"):
            schools.append(v)
    remote = {str(t["taskId"]): t for t in tasks}
    now_ms = int(time.time() * 1000)
    out = {"added": 0, "updated": 0, "closed": 0, "reopened": 0, "pushed": 0, "failed": 0,
           "linked": 0, "assigneeChanged": 0, "assigneePushed": 0}
    changed = []
    linked_ids = set()

    def link(t, done_now):
        k = title_key(t.get("title"))
        cands = unlinked.get(k) or []
        created = _iso_ms(t.get("createdTime"))
        for v in cands:
            # 오래전에 끝낸 앱 항목이 같은 제목의 새 웍스 할 일을 완료시키지 않도록
            if v.get("done") and created and int(v.get("doneAt") or 0) < created:
                continue
            if done_now and created and created < int(v.get("createdAt") or 0) - 45 * 86400000:
                continue
            cands.remove(v)
            return dict(v)
        return None

    for t in tasks:
        tid = str(t["taskId"])
        if tid in by_task:
            continue
        v = link(t, False)
        if v is not None:
            v.update(worksTaskId=tid, worksStatus="TODO", worksSyncPending=bool(v.get("done")),
                     worksClosedRemote=False, assignee=v.get("assignee") or _assignees(t))
            by_task[tid] = v
            linked_ids.add(tid)
            out["linked"] += 1

    for i, t in enumerate(tasks):
        tid = str(t["taskId"])
        v = by_task.get(tid)
        if v is None:
            changed.append(_new_record(t, schools, now_ms, i))
            out["added"] += 1
            continue
        v = dict(v)
        dirty = tid in linked_ids  # 방금 제목으로 연결한 항목은 꼭 저장
        due, who, content = _due(t), _assignees(t), _strip_user_id(t.get("content") or "")
        at = t
        if v.get("worksAssigneePending"):
            at = _push_assignee(works, tid, v, t, out)
            dirty = True
            if at is not None:
                who = _assignees(at)
                v["assignee"] = who  # 앱에서 바꾼 값 → 웍스 반영 완료 (변경 건수로 세지 않음)
        if at is not None:
            if (v.get("assignee") or "") != who or list(v.get("assigneeIds") or []) != _assignee_ids(at):
                if (v.get("assignee") or "") != who:
                    out["assigneeChanged"] += 1
                v.update(assignee=who, assigneeIds=_assignee_ids(at))
                dirty = True
        content_changed = (v.get("worksContent") or "") != content
        legacy_fq = any(
            isinstance(x, dict) and ("label" not in x or "qty" not in x)
            for x in (v.get("fieldQuantities") or [])
        )
        dirty_meta_in_items = bool(
            _USER_ID_RE.search(str(v.get("items") or ""))
            or re.search(r"(요청자|담당자)\s*[:：]", str(v.get("items") or ""))
        )
        needs_enrichment = (
            content_changed
            or legacy_fq
            or dirty_meta_in_items
            or v.get("type") in (None, "", "기타")
            or (bool(content.strip()) and not v.get("fieldQuantities"))
        )
        if (v.get("due") or "") != due or content_changed or needs_enrichment:
            v.update(due=due, worksContent=content)
            if v.get("type") in (None, "", "기타"):
                v["type"] = infer_task_type(t.get("title"), content)
            if content_changed or legacy_fq or dirty_meta_in_items or not v.get("fieldQuantities"):
                fresh = _new_record(t, schools, now_ms, i)
                _, total_qty, fq = _parse_items_and_qty(
                    fresh["items"].split(" · ")[0] if " · " in fresh["items"] else fresh["items"],
                    content,
                    prev_fq=v.get("fieldQuantities"),
                )
                v["items"] = fresh["items"]
                v["qty"] = total_qty
                v["fieldQuantities"] = fq
            out["updated"] += 1
            dirty = True
        if v.get("done"):
            confirmed = not v.get("worksSyncPending") and (v.get("worksStatus") == "DONE" or v.get("worksDoneAt"))
            if confirmed:  # 웍스에서 다시 미완료로 돌린 것 (방금 완료한 건 웍스 반영이 늦을 수 있어 2분 뒤, 한 번 더 확인)
                since = now_ms - int(v.get("worksDoneAt") or v.get("doneAt") or 0)
                if since < 120000:
                    if dirty:
                        changed.append(v)
                    continue
                try:
                    still_open = not task_done(works.task(tid) or {})
                except Exception:
                    still_open = False
                if not still_open:
                    if dirty:
                        changed.append(v)
                    continue
                v.update(done=False, doneAt=None, worksClosedRemote=False, worksStatus="TODO", worksDoneAt=None)
                out["reopened"] += 1
            else:          # 앱에서 완료했는데 웍스에는 아직 → 웍스 완료 처리
                try:
                    works.set_task_done(tid, True)
                    v.update(worksStatus="DONE", worksSyncPending=False, worksDoneAt=now_ms)
                    out["pushed"] += 1
                except Exception as e:
                    log.warning("웍스 완료 처리 실패 %s: %s", t.get("title"), e)
                    out["failed"] += 1
                    if dirty:
                        changed.append(v)
                    continue
            dirty = True
        elif v.get("worksStatus") != "TODO" or v.get("worksSyncPending"):
            v.update(worksStatus="TODO", worksSyncPending=False)
            dirty = True
        if dirty:
            changed.append(v)

    # 웍스에서 완료(또는 삭제)됐는데 캡처·붙여넣기로만 들어와 연결이 안 된 앱 항목도 제목으로 찾아 완료 표시
    if any(not v.get("done") for vs in unlinked.values() for v in vs):
        try:
            # 웍스 목록 API 의 status 는 TODO·ALL 만 된다 (DONE 은 400 오류) → 전체에서 완료된 것만 고른다
            done_tasks = done_listed + [t for t in works.all_tasks(status="ALL", max_pages=3)
                                        if t.get("taskId") and task_done(t) and _call_is_app_task(is_app_task_fn, t)]
        except Exception as e:
            log.warning("완료된 웍스 할 일 조회 실패: %s", e)
            done_tasks = done_listed
        for t in done_tasks:
            tid = str(t["taskId"])
            if tid in by_task or tid in remote:
                continue
            k = title_key(t.get("title"))
            if not any(not v.get("done") for v in unlinked.get(k) or []):
                continue
            v = link(t, True)
            if v is None:
                continue
            v.update(worksTaskId=tid, worksStatus="DONE", worksSyncPending=False, worksDoneAt=now_ms,
                     done=True, doneAt=v.get("doneAt") or now_ms, worksClosedRemote=True)
            by_task[tid] = v
            remote[tid] = None  # 아래 '웍스에서 완료' 처리에서 다시 건드리지 않게
            changed.append(v)
            out["linked"] += 1
            out["closed"] += 1

    for tid, v in by_task.items():
        if tid in remote:
            continue
        v = dict(v)
        if not v.get("done") and not v.get("worksSyncPending"):      # 웍스에서 완료(또는 삭제)
            v.update(done=True, doneAt=now_ms, worksStatus="DONE", worksClosedRemote=True, worksDoneAt=now_ms)
            out["closed"] += 1
        elif not v.get("done") and v.get("worksSyncPending"):          # 앱에서 되돌렸는데 웍스엔 아직 완료
            try:
                works.set_task_done(tid, False)
                v.update(worksStatus="TODO", worksSyncPending=False, worksDoneAt=None)
                out["pushed"] += 1
            except Exception as e:
                log.warning("웍스 미완료 처리 실패 %s: %s", tid, e)
                out["failed"] += 1
                continue
        elif v.get("done") and (v.get("worksSyncPending") or v.get("worksStatus") != "DONE"):
            v.update(worksStatus="DONE", worksSyncPending=False, worksDoneAt=v.get("worksDoneAt") or now_ms)
        else:
            continue
        changed.append(v)

    for v in changed:
        try:
            _put(v)
        except Exception as e:
            log.warning("앱 기록 저장 실패 %s: %s", v.get("id"), e)
            out["failed"] += 1
    by_type = {}
    for t in tasks:
        k = infer_task_type(t.get("title"), t.get("content"))
        by_type[k] = by_type.get(k, 0) + 1
    out.update(ok=True, tasks=len(tasks), byType=by_type, written=len(changed), reason=reason,
               at=int(time.time() * 1000), ms=int((time.time() - started) * 1000))
    state.update(lastAt=out["at"], lastOk=True, lastError="", last=out)
    if changed or reason != "timer":
        log.info("앱 동기화(%s): 웍스 %d건, 새로 %d, 변경 %d, 담당자 %d, 완료 %d, 재개 %d, 연결 %d, 웍스 반영 %d(담당자 %d), 실패 %d",
                 reason, len(tasks), out["added"], out["updated"], out["assigneeChanged"], out["closed"], out["reopened"],
                 out["linked"], out["pushed"], out["assigneePushed"], out["failed"])
    return out


_soon_until = [0.0]
_soon_lock = threading.Lock()


def sync_soon(works, is_app_task_fn, reason, delay=2.0):
    """봇이 할 일을 만든 직후처럼 응답을 막지 않고 곧 동기화한다."""
    if not enabled():
        return
    with _soon_lock:  # 웍스 방 메시지가 몰려 와도 몇 초 안에는 한 번만 돈다
        now = time.time()
        if _soon_until[0] > now:
            return
        _soon_until[0] = now + delay

    def run():
        time.sleep(delay)
        try:
            sync(works, is_app_task_fn, reason)
        except Exception:
            pass
    threading.Thread(target=run, daemon=True).start()