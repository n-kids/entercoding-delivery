#!/usr/bin/env node
// patch-overlay-native.mjs
// ---------------------------------------------------------------------------
// 엔터코딩 납품알리미 APK – 네이티브 오버레이 디버그 + 빌드 상태 연동 패치
//
// 실행 순서 (반드시 configure-android.mjs 다음):
//   npm run prepare:www
//   node scripts/configure-android.mjs      <- MainActivity / FloatingOverlayManager 재생성
//   node scripts/patch-overlay-native.mjs   <- 이 스크립트
//   npx cap sync android
//
// 하는 일
//   1) OverlayBuildState.java 생성 (빌드 시각, 커밋 SHA, Actions 실행 번호)
//   2) FloatingOverlayManager.java
//        - 표시/숨김/권한 차단 이벤트를 Logcat(태그 NkOverlay)에 기록
//        - JS 메서드 추가: AndroidOverlay.getOverlayState(), AndroidOverlay.getBuildInfo()
//   3) MainActivity.java – AndroidOverlay 등록 시 빌드 정보 로그
//   4) (--web 옵션) index.html – 상태 배지에 APK 버전 표시 + 콘솔 함수 nkOverlayDebug()
//
// 안전장치
//   - 모든 패치를 메모리에서 먼저 계산하고, 하나라도 실패하면 아무 파일도 쓰지 않음
//   - 마커(NK_OVERLAY_PATCH_V1)로 중복 적용 방지 (여러 번 실행해도 결과 동일)
//   - 변경되는 파일만 .overlay-patch-backups/<시각>/ 에 원본 백업 (src 밖 → 컴파일 충돌 없음)
//   - 임시 파일에 쓴 뒤 rename 하는 원자적 저장
//   - Java 중괄호/괄호 균형 검사
//
// 옵션
//   -n, --dry-run     파일을 쓰지 않고 바뀔 내용만 출력 (환경변수 OVERLAY_PATCH_DRY_RUN=1 도 가능)
//   -v, --verbose     삽입 위치 주변 코드와 추가 줄을 출력
//       --web         index.html 배지 패치 포함 (GitHub Pages 소스가 바뀜)
//       --check       미적용 패치가 있으면 exit 2 (파일 쓰지 않음)
//       --no-backup   백업 생략 (CI용)
//       --restore[=ID] 최근(또는 지정한) 백업으로 되돌리기
//       --root=DIR    프로젝트 루트 (기본: 현재 폴더)
//   -h, --help
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

const PATCH_ID = 'NK_OVERLAY_PATCH_V1';
const LOG_TAG = 'NkOverlay';
const BACKUP_DIR_NAME = '.overlay-patch-backups';
const KEEP_BACKUPS = 5;

// ---------------------------------------------------------------- CLI -------
const argv = process.argv.slice(2);
const flag = (...names) => argv.some((a) => names.includes(a));
const value = (name) => {
  const hit = argv.find((a) => a === name || a.startsWith(name + '='));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};

if (flag('-h', '--help')) {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
  console.log(src.split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}

const opts = {
  dryRun: flag('-n', '--dry-run') || process.env.OVERLAY_PATCH_DRY_RUN === '1',
  verbose: flag('-v', '--verbose') || process.env.OVERLAY_PATCH_VERBOSE === '1',
  web: flag('--web'),
  check: flag('--check'),
  backup: !flag('--no-backup'),
  restore: value('--restore'),
  root: path.resolve(typeof value('--root') === 'string' ? value('--root') : process.cwd()),
};

// ------------------------------------------------------------- logging ------
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const P = paint('36', '[overlay-patch]');
const log = {
  info: (m) => console.log(`${P} ${m}`),
  ok: (m) => console.log(`${P} ${paint('32', 'OK  ')} ${m}`),
  skip: (m) => console.log(`${P} ${paint('90', 'SKIP')} ${m}`),
  plan: (m) => console.log(`${P} ${paint('33', 'PLAN')} ${m}`),
  warn: (m) => console.warn(`${P} ${paint('33', 'WARN')} ${m}`),
  err: (m) => console.error(`${P} ${paint('31', 'FAIL')} ${m}`),
  debug: (m) => { if (opts.verbose) console.log(`${P} ${paint('90', '  · ' + m)}`); },
  block: (title, text) => {
    if (!opts.verbose) return;
    console.log(paint('90', `    ┌─ ${title}`));
    for (const line of text.split('\n')) console.log(paint('90', '    │ ') + line);
    console.log(paint('90', '    └─'));
  },
};

const rel = (p) => path.relative(opts.root, p) || '.';

// ------------------------------------------------------------- helpers ------
function findFile(dir, fileName) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, fileName);
      if (found) return found;
    } else if (entry.name === fileName) {
      return full;
    }
  }
  return null;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function contextAround(source, index, radius = 2) {
  const lines = source.split('\n');
  const at = lineOf(source, index) - 1;
  const from = Math.max(0, at - radius);
  const to = Math.min(lines.length, at + radius + 1);
  return lines.slice(from, to).map((l, i) => `${String(from + i + 1).padStart(5)}  ${l}`).join('\n');
}

// 문자열/주석을 제외하고 괄호 균형 계산 (Java 대략 검사용)
function bracketBalance(src) {
  let curly = 0, round = 0, i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '{') curly++; else if (c === '}') curly--;
    else if (c === '(') round++; else if (c === ')') round--;
    i++;
  }
  return { curly, round };
}

class PatchError extends Error {}

// 하나의 파일에 대한 편집 묶음. 원본은 건드리지 않고 메모리에서만 수정.
class FilePatch {
  constructor(file, { create = false, label } = {}) {
    this.file = file;
    this.label = label || rel(file);
    this.exists = fs.existsSync(file);
    if (!this.exists && !create) throw new PatchError(`파일 없음: ${rel(file)}`);
    this.original = this.exists ? fs.readFileSync(file, 'utf8') : '';
    this.source = this.original;
    this.steps = [];
  }

  record(name, status, extra = '') {
    this.steps.push({ name, status, extra });
    const msg = `${this.label} › ${name}${extra ? ' — ' + extra : ''}`;
    if (status === 'applied') log.plan(msg); // 실제 저장은 모든 계획이 성공한 뒤 '저장' 로그로 표시
    else log.skip(msg);
  }

  // anchor(문자열 또는 정규식) 앞/뒤에 snippet 삽입. marker 가 이미 있으면 건너뜀.
  insert(name, { anchor, snippet, marker, position = 'after', last = false }) {
    if (this.source.includes(marker)) return this.record(name, 'skipped', '이미 적용됨');
    let index = -1, matchLen = 0;
    if (anchor instanceof RegExp) {
      const re = new RegExp(anchor.source, anchor.flags.includes('g') ? anchor.flags : anchor.flags + 'g');
      const all = [...this.source.matchAll(re)];
      if (all.length > 1 && !last) {
        throw new PatchError(`${this.label} › ${name}: 앵커가 ${all.length}곳에서 발견됨 (모호함) ${anchor}`);
      }
      const m = last ? all[all.length - 1] : all[0];
      if (m) { index = m.index; matchLen = m[0].length; }
    } else {
      const first = this.source.indexOf(anchor);
      const lastIdx = this.source.lastIndexOf(anchor);
      if (first !== lastIdx && !last) {
        throw new PatchError(`${this.label} › ${name}: 앵커가 여러 곳에 있음 "${anchor.trim().slice(0, 60)}"`);
      }
      index = last ? lastIdx : first;
      matchLen = anchor.length;
    }
    if (index < 0) {
      throw new PatchError(`${this.label} › ${name}: 앵커를 찾지 못함 ${anchor instanceof RegExp ? anchor : JSON.stringify(anchor.trim().slice(0, 80))}\n` +
        `      configure-android.mjs 구조가 바뀌었는지 확인하세요.`);
    }
    const at = position === 'before' ? index : index + matchLen;
    log.debug(`${name}: ${rel(this.file)}:${lineOf(this.source, index)} 에 ${position === 'before' ? '앞' : '뒤'} 삽입`);
    log.block('앵커 주변', contextAround(this.source, index));
    log.block('추가될 코드', snippet.replace(/^\n|\n$/g, ''));
    this.source = this.source.slice(0, at) + snippet + this.source.slice(at);
    this.record(name, 'applied', `+${snippet.split('\n').length - 1}줄 (L${lineOf(this.source, at)})`);
  }

  addImports(imports) {
    const missing = imports.filter((imp) => !new RegExp(`^import\\s+${imp.replace(/\./g, '\\.')}\\s*;`, 'm').test(this.source));
    if (!missing.length) return this.record('imports', 'skipped', '이미 있음');
    const lastImport = [...this.source.matchAll(/^import\s+[\w.]+\s*;\s*$/gm)].pop();
    const pkg = this.source.match(/^package\s+[\w.]+\s*;\s*$/m);
    const anchorMatch = lastImport || pkg;
    if (!anchorMatch) throw new PatchError(`${this.label} › imports: package/import 선언을 찾지 못함`);
    const at = anchorMatch.index + anchorMatch[0].length;
    const text = missing.map((imp) => `\nimport ${imp};`).join('');
    this.source = this.source.slice(0, at) + text + this.source.slice(at);
    this.record('imports', 'applied', missing.join(', '));
  }

  replaceWhole(name, content, { compareIgnoring } = {}) {
    const norm = (s) => (compareIgnoring ? s.replace(compareIgnoring, '') : s);
    if (this.exists && norm(this.original) === norm(content)) {
      return this.record(name, 'skipped', '내용 동일');
    }
    this.source = content;
    this.record(name, 'applied', this.exists ? '갱신' : '새로 생성');
  }

  get changed() { return this.source !== this.original; }

  validateJava() {
    if (!this.file.endsWith('.java') || !this.changed) return;
    const before = this.exists ? bracketBalance(this.original) : { curly: 0, round: 0 };
    const after = bracketBalance(this.source);
    if (after.curly !== before.curly || after.round !== before.round) {
      throw new PatchError(`${this.label}: 괄호 균형이 깨짐 (전 {${before.curly}/(${before.round} → 후 {${after.curly}/(${after.round})`);
    }
    if (!this.source.includes(`// ${PATCH_ID}`)) {
      throw new PatchError(`${this.label}: 패치 마커가 없음 — 내부 오류`);
    }
    log.debug(`${this.label}: 괄호 균형 OK (curly=${after.curly}, round=${after.round})`);
  }

  diffStat() {
    const a = this.original.split('\n').length;
    const b = this.source.split('\n').length;
    return this.exists ? `${a} → ${b}줄 (${b - a >= 0 ? '+' : ''}${b - a})` : `새 파일 ${b}줄`;
  }
}

// -------------------------------------------------------------- backup ------
function stampNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backupFiles(patches) {
  const base = path.join(opts.root, BACKUP_DIR_NAME);
  const dir = path.join(base, stampNow());
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { patchId: PATCH_ID, createdAt: new Date().toISOString(), files: [] };
  for (const p of patches) {
    const relPath = rel(p.file);
    if (p.exists) {
      const dest = path.join(dir, relPath + '.bak');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(p.file, dest);
      manifest.files.push({ path: relPath, backup: path.relative(dir, dest), existed: true });
    } else {
      manifest.files.push({ path: relPath, existed: false });
    }
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log.ok(`백업 저장: ${rel(dir)} (${manifest.files.length}개 파일)`);

  // 오래된 백업 정리
  const all = fs.readdirSync(base).filter((n) => fs.existsSync(path.join(base, n, 'manifest.json'))).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) {
    fs.rmSync(path.join(base, old), { recursive: true, force: true });
    log.debug(`오래된 백업 삭제: ${old}`);
  }
}

function restoreBackup(id) {
  const base = path.join(opts.root, BACKUP_DIR_NAME);
  if (!fs.existsSync(base)) throw new PatchError(`백업 폴더가 없습니다: ${rel(base)}`);
  const list = fs.readdirSync(base).filter((n) => fs.existsSync(path.join(base, n, 'manifest.json'))).sort();
  if (!list.length) throw new PatchError('복원할 백업이 없습니다.');
  const pick = id === true ? list[list.length - 1] : id;
  if (!list.includes(pick)) throw new PatchError(`백업 "${pick}" 없음. 사용 가능: ${list.join(', ')}`);
  const dir = path.join(base, pick);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  log.info(`백업 ${pick} 복원 ${opts.dryRun ? '(dry-run)' : ''}`);
  for (const f of manifest.files) {
    const target = path.join(opts.root, f.path);
    if (f.existed) {
      if (opts.dryRun) log.plan(`되돌림 ${f.path}`);
      else { fs.copyFileSync(path.join(dir, f.backup), target); log.ok(`되돌림 ${f.path}`); }
    } else if (fs.existsSync(target)) {
      if (opts.dryRun) log.plan(`삭제 ${f.path} (패치가 새로 만든 파일)`);
      else { fs.rmSync(target); log.ok(`삭제 ${f.path} (패치가 새로 만든 파일)`); }
    }
  }
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.overlay-patch.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

// ------------------------------------------------------------- snippets -----
function buildStateJava(pkg) {
  const env = process.env;
  const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const sha = env.GITHUB_SHA || '';
  return `package ${pkg};

// ${PATCH_ID} – patch-overlay-native.mjs 가 자동 생성합니다. 직접 수정하지 마세요.
public final class OverlayBuildState {
    private OverlayBuildState() {}

    public static final String PATCH_ID = "${PATCH_ID}";
    public static final String BUILD_STAMP = "${esc(new Date().toISOString())}";
    public static final String GIT_SHA = "${esc(sha.slice(0, 12))}";
    public static final String GIT_REF = "${esc(env.GITHUB_REF_NAME || '')}";
    public static final String RUN_NUMBER = "${esc(env.GITHUB_RUN_NUMBER || '')}";
    public static final String BUILD_SOURCE = "${env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local'}";
}
`;
}

const OVERLAY_FIELDS = `
    // ${PATCH_ID}: overlay debug state
    private static final String NK_TAG = "${LOG_TAG}";
    private String nkLastEvent = "init";
    private long nkLastEventAt = 0L;
    private int nkShowCount = 0;
    private int nkBlockedCount = 0;
`;

const OVERLAY_MARK_SHOW = `
                        nkMark("show"); // ${PATCH_ID}`;
const OVERLAY_MARK_HIDE = `
                    nkMark("hide"); // ${PATCH_ID}`;
const OVERLAY_MARK_BLOCKED = `nkMark("blocked:no-overlay-permission"); // ${PATCH_ID}
                    `;

const OVERLAY_METHODS = `
    // ${PATCH_ID}: overlay + build state bridge ---------------------------
    private void nkMark(String event) {
        nkLastEvent = event;
        nkLastEventAt = System.currentTimeMillis();
        if ("show".equals(event)) nkShowCount++;
        if (event.startsWith("blocked")) nkBlockedCount++;
        Log.d(NK_TAG, "event=" + event
            + " showing=" + isShowing
            + " collapsed=" + isCollapsed
            + " canDraw=" + canDrawOverlays()
            + " payloadBytes=" + (lastPayloadJson != null ? lastPayloadJson.length() : 0)
            + " build=" + OverlayBuildState.BUILD_STAMP);
    }

    private JSONObject nkBuildJson() {
        JSONObject o = new JSONObject();
        try {
            String versionName = "";
            long versionCode = 0L;
            try {
                PackageInfo pi = appContext.getPackageManager().getPackageInfo(appContext.getPackageName(), 0);
                versionName = pi.versionName != null ? pi.versionName : "";
                versionCode = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            } catch (PackageManager.NameNotFoundException ignored) {}
            o.put("packageName", appContext.getPackageName());
            o.put("versionName", versionName);
            o.put("versionCode", versionCode);
            o.put("buildStamp", OverlayBuildState.BUILD_STAMP);
            o.put("gitSha", OverlayBuildState.GIT_SHA);
            o.put("gitRef", OverlayBuildState.GIT_REF);
            o.put("runNumber", OverlayBuildState.RUN_NUMBER);
            o.put("buildSource", OverlayBuildState.BUILD_SOURCE);
            o.put("patchId", OverlayBuildState.PATCH_ID);
            o.put("sdkInt", Build.VERSION.SDK_INT);
            o.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        } catch (Exception e) {
            Log.w(NK_TAG, "build json failed", e);
        }
        return o;
    }

    @JavascriptInterface
    public String getBuildInfo() {
        return nkBuildJson().toString();
    }

    @JavascriptInterface
    public String getOverlayState() {
        JSONObject o = new JSONObject();
        try {
            o.put("showing", isShowing);
            o.put("collapsed", isCollapsed);
            o.put("canDrawOverlays", canDrawOverlays());
            o.put("viewCreated", rootContainer != null);
            o.put("lastEvent", nkLastEvent);
            o.put("lastEventAt", nkLastEventAt);
            o.put("showCount", nkShowCount);
            o.put("blockedCount", nkBlockedCount);
            o.put("payloadBytes", lastPayloadJson != null ? lastPayloadJson.length() : 0);
            o.put("target", lastName);
            o.put("distance", lastDist);
            o.put("hasNaviUrl", currentNaviUrl != null && currentNaviUrl.length() > 0);
            o.put("build", nkBuildJson());
        } catch (Exception e) {
            Log.w(NK_TAG, "state json failed", e);
        }
        return o.toString();
    }
`;

const MAIN_LOG = `
            // ${PATCH_ID}
            android.util.Log.i("${LOG_TAG}", "AndroidOverlay registered build="
                + OverlayBuildState.BUILD_STAMP + " sha=" + OverlayBuildState.GIT_SHA
                + " run=" + OverlayBuildState.RUN_NUMBER);`;

const WEB_BADGE = `
          /* ${PATCH_ID} */
          try {
            if (typeof window.AndroidOverlay.getBuildInfo === 'function') {
              const nkBuild = JSON.parse(window.AndroidOverlay.getBuildInfo() || '{}');
              if (nkBuild.versionName) stateBadge.textContent += ' · v' + nkBuild.versionName + ' (' + nkBuild.versionCode + ')';
              stateBadge.title = 'APK 빌드 ' + (nkBuild.buildStamp || '?') + (nkBuild.gitSha ? ' · ' + nkBuild.gitSha : '') + (nkBuild.runNumber ? ' · run #' + nkBuild.runNumber : '');
            } else {
              stateBadge.title = '구버전 APK (빌드 정보 없음)';
            }
          } catch (e) { console.warn('[nkOverlay] build info', e); }`;

const WEB_DEBUG_FN = `
    /* ${PATCH_ID}: 콘솔에서 nkOverlayDebug() 로 네이티브 오버레이/빌드 상태 확인 */
    window.nkOverlayDebug = function () {
      const out = { mode: 'web', nativeBridge: typeof window.AndroidOverlay !== 'undefined' };
      try {
        if (out.nativeBridge && typeof window.AndroidOverlay.getOverlayState === 'function') {
          out.mode = 'apk';
          out.state = JSON.parse(window.AndroidOverlay.getOverlayState());
        } else if (out.nativeBridge) {
          out.mode = 'apk (구버전, 상태 API 없음)';
          out.state = { showing: window.AndroidOverlay.isOverlayShowing(), canDrawOverlays: window.AndroidOverlay.canDrawOverlays() };
        }
      } catch (e) { out.error = String(e); }
      console.table(out.state || {});
      return out;
    };
`;

// ---------------------------------------------------------------- plan ------
function planPatches() {
  const javaRoot = path.join(opts.root, 'android/app/src/main/java');
  if (!fs.existsSync(path.join(opts.root, 'android'))) {
    throw new PatchError('android 폴더가 없습니다. 먼저 "npx cap add android" 와 configure-android.mjs 를 실행하세요.');
  }
  const mainPath = findFile(javaRoot, 'MainActivity.java');
  if (!mainPath) throw new PatchError(`MainActivity.java 를 찾지 못함 (${rel(javaRoot)})`);
  const pkgDir = path.dirname(mainPath);
  const overlayPath = path.join(pkgDir, 'FloatingOverlayManager.java');
  log.info(`MainActivity: ${rel(mainPath)}`);

  const main = new FilePatch(mainPath, { label: 'MainActivity.java' });
  const pkg = (main.source.match(/^package\s+([\w.]+)\s*;/m) || [])[1];
  if (!pkg) throw new PatchError('MainActivity.java 에서 package 선언을 찾지 못함');
  log.info(`package: ${pkg}`);

  if (!fs.existsSync(overlayPath)) {
    throw new PatchError(`FloatingOverlayManager.java 없음 — configure-android.mjs 를 먼저 실행하세요.`);
  }
  const overlay = new FilePatch(overlayPath, { label: 'FloatingOverlayManager.java' });
  const build = new FilePatch(path.join(pkgDir, 'OverlayBuildState.java'), { create: true, label: 'OverlayBuildState.java' });

  // 1) 빌드 상태 클래스 (BUILD_STAMP 만 다르면 갱신하지 않음 → 로컬 반복 실행 시 불필요한 변경 방지)
  build.replaceWhole('빌드 상태 클래스', buildStateJava(pkg), {
    compareIgnoring: /BUILD_STAMP = "[^"]*"/,
  });

  // 2) FloatingOverlayManager
  overlay.addImports(['android.util.Log', 'android.content.pm.PackageInfo', 'android.content.pm.PackageManager']);
  overlay.insert('디버그 필드', {
    anchor: /private String lastPayloadJson = "\{\}";/,
    snippet: OVERLAY_FIELDS,
    marker: `// ${PATCH_ID}: overlay debug state`,
  });
  overlay.insert('표시 이벤트 로그', {
    anchor: /^[ \t]*isShowing = true;/m,
    snippet: OVERLAY_MARK_SHOW,
    marker: `nkMark("show"); // ${PATCH_ID}`,
  });
  overlay.insert('숨김 이벤트 로그', {
    anchor: /^[ \t]*isShowing = false;/m,
    snippet: OVERLAY_MARK_HIDE,
    marker: `nkMark("hide"); // ${PATCH_ID}`,
  });
  overlay.insert('권한 차단 로그', {
    anchor: /requestOverlayPermission\(\);\s*\n\s*return;/,
    snippet: OVERLAY_MARK_BLOCKED,
    marker: `nkMark("blocked:no-overlay-permission"); // ${PATCH_ID}`,
    position: 'before',
  });
  overlay.insert('JS 상태/빌드 메서드', {
    anchor: /\}\s*$/,
    snippet: OVERLAY_METHODS,
    marker: `// ${PATCH_ID}: overlay + build state bridge`,
    position: 'before',
    last: true,
  });

  // 3) MainActivity
  main.insert('등록 로그', {
    anchor: 'webView.addJavascriptInterface(overlayManager, "AndroidOverlay");',
    snippet: MAIN_LOG,
    marker: `// ${PATCH_ID}`,
  });

  const patches = [build, overlay, main];

  // 4) index.html (선택)
  if (opts.web) {
    const web = new FilePatch(path.join(opts.root, 'index.html'), { label: 'index.html' });
    web.insert('배지 빌드 표시', {
      anchor: /stateBadge\.textContent = canDraw \? [^;]+;/,
      snippet: WEB_BADGE,
      marker: `/* ${PATCH_ID} */`,
    });
    web.insert('nkOverlayDebug()', {
      anchor: /\n[ \t]*function hasAndroidNativeOverlay\(\) \{/,
      snippet: WEB_DEBUG_FN,
      marker: `/* ${PATCH_ID}: 콘솔에서`,
      position: 'before',
    });
    patches.push(web);
  } else {
    log.debug('index.html 건너뜀 (--web 옵션으로 포함)');
  }

  for (const p of patches) p.validateJava();
  return patches;
}

// ---------------------------------------------------------------- main ------
function main() {
  const mode = opts.restore ? 'restore' : opts.check ? 'check' : opts.dryRun ? 'dry-run' : 'apply';
  log.info(`${PATCH_ID} | 모드=${mode} | 루트=${opts.root}${opts.web ? ' | web 포함' : ''}`);

  if (opts.restore) { restoreBackup(opts.restore); return 0; }

  const patches = planPatches();
  const changed = patches.filter((p) => p.changed);

  console.log('');
  log.info('요약');
  for (const p of patches) {
    const applied = p.steps.filter((s) => s.status === 'applied').length;
    const skipped = p.steps.length - applied;
    log.info(`  ${p.changed ? '✎' : '='} ${rel(p.file).padEnd(70)} 적용 ${applied} / 건너뜀 ${skipped}${p.changed ? ' | ' + p.diffStat() : ''}`);
  }

  if (!changed.length) { log.ok('모든 패치가 이미 적용되어 있습니다.'); return 0; }

  if (opts.check) {
    // 빌드 시각/커밋 정보만 다른 OverlayBuildState 는 미적용으로 보지 않음
    const pending = changed.filter((p) => !(p.label === 'OverlayBuildState.java' && p.exists));
    if (!pending.length) { log.ok('패치 적용 상태 정상 (빌드 정보 파일만 갱신 대상)'); return 0; }
    log.warn(`미적용 파일 ${pending.length}개 — check 모드라 쓰지 않습니다.`); return 2;
  }
  if (false) { log.warn(`미적용 파일 ${changed.length}개 — check 모드라 쓰지 않습니다.`); return 2; }
  if (opts.dryRun) { log.info(`dry-run: ${changed.length}개 파일이 바뀔 예정이며 실제로 쓰지 않았습니다.`); return 0; }

  if (opts.backup) backupFiles(changed);
  else log.warn('백업 생략 (--no-backup)');

  const written = [];
  try {
    for (const p of changed) { atomicWrite(p.file, p.source); written.push(p); log.ok(`저장 ${rel(p.file)}`); }
  } catch (e) {
    log.err(`쓰기 실패: ${e.message} — 이미 쓴 파일 ${written.length}개를 되돌립니다.`);
    for (const p of written) {
      if (p.exists) fs.writeFileSync(p.file, p.original, 'utf8'); else fs.rmSync(p.file, { force: true });
    }
    throw e;
  }

  log.ok(`완료: ${changed.length}개 파일 패치. Logcat 필터: adb logcat -s ${LOG_TAG}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  if (e instanceof PatchError) {
    log.err(e.message);
    log.err('아무 파일도 변경하지 않았습니다.');
  } else {
    log.err(e.stack || String(e));
  }
  process.exitCode = 1;
}
