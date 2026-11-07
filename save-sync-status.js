(() => {
  'use strict';
  if (window.__deliverySaveStatusInstalled) return;
  window.__deliverySaveStatusInstalled = true;
  const style = document.createElement('style');
  style.textContent = `
  #deliveryPersistenceStatus{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:10px 0 14px;padding:12px 14px;background:#111e31;border:1px solid #304058;border-radius:14px;color:#cbd5e1;font-size:12px;line-height:1.6}
  #deliveryPersistenceStatus .ps-cell{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
  #deliveryPersistenceStatus .ps-label{color:#94a3b8}
  #deliveryPersistenceStatus [data-tone=ok]{color:#86dfbf}#deliveryPersistenceStatus [data-tone=warn]{color:#f4ce79}#deliveryPersistenceStatus [data-tone=error]{color:#f1a8b8}
  #deliveryPersistenceStatus .ps-note{width:100%;font-size:11px;color:#94a3b8}
  @media(max-width:639px){#deliveryPersistenceStatus{padding:10px 12px;gap:5px 12px;margin:8px 0 12px}.ps-cell{width:100%}}
  `;
  document.head.append(style);
  const panel = document.createElement('section');
  panel.id = 'deliveryPersistenceStatus';
  panel.setAttribute('aria-label', '원 정보 저장 및 공유 서버 동기화 상태');
  panel.innerHTML = '<div class="ps-cell"><span class="ps-label">기기 저장</span><span id="psLocal" role="status" aria-live="polite"></span></div><div class="ps-cell"><span class="ps-label">서버 동기화</span><span id="psCloud" role="status" aria-live="polite"></span></div><div id="psNote" class="ps-note"></div>';
  const anchor = document.getElementById('schoolList');
  if (!anchor) return;
  anchor.before(panel);
  let localResult = 'unknown', localAt = null, observedServerAt = null, serverVerified = false;
  function time(d) { return d.toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
  function write(id, text, tone) {
    const el = document.getElementById(id);
    if (el.textContent !== text) el.textContent = text;
    el.dataset.tone = tone || '';
  }
  function localMatches() {
    try {
      return localStorage.getItem(SCHOOLS_KEY) === JSON.stringify(SCHOOLS)
        && localStorage.getItem('entercoding_completed_v1') === JSON.stringify(completedMap)
        && localStorage.getItem('entercoding_coords_v1') === JSON.stringify(customCoords);
    } catch (_) { return false; }
  }
  if (typeof saveState === 'function') {
    const original = saveState;
    saveState = function(...args) {
      let result;
      try { result = original.apply(this, args); }
      catch (error) { localResult = 'error'; render(); throw error; }
      localResult = localMatches() ? 'saved' : 'error';
      if (localResult === 'saved') localAt = new Date();
      render();
      return result === undefined ? localResult === 'saved' : result;
    };
  }
  function render() {
    let matches = localMatches();
    write('psLocal', localResult === 'error' && !matches ? '저장 실패 · 다시 저장 필요'
      : matches ? (localAt ? '저장 완료 · ' + time(localAt) : '현재 원 정보 저장됨')
      : '현재 원 정보 저장 미확인', matches ? 'ok' : localResult === 'error' ? 'error' : 'warn');
    const logged = typeof syncUser !== 'undefined' && !!syncUser;
    const state = typeof syncState === 'undefined' ? 'off' : syncState;
    const last = typeof syncLastAt !== 'undefined' && syncLastAt ? +new Date(syncLastAt) : null;
    if (!logged) { observedServerAt = last; serverVerified = false; }
    else if (last !== null && last !== observedServerAt) { observedServerAt = last; serverVerified = true; }
    let pending = null;
    try {
      const cur = syncLocalRecords(), snap = syncSnap || {};
      pending = [...new Set([...Object.keys(cur), ...Object.keys(snap)])]
        .filter(k => (k in cur) ? stableStr(cur[k]) !== snap[k] : true).length;
    } catch (_) {}
    let text, tone = 'warn';
    if (!logged) text = '공유 로그인 필요 · 기기 전용';
    else if (navigator.onLine === false) text = '오프라인 · 동기화 대기';
    else if (typeof syncConflictResolve !== 'undefined' && syncConflictResolve) text = '데이터 충돌 · 공유 창에서 선택 필요';
    else if (typeof syncPushing !== 'undefined' && syncPushing || typeof syncPulling !== 'undefined' && syncPulling) text = '동기화 중';
    else if (state === 'error') { text = '연결 또는 동기화 오류 · 재시도 대기'; tone = 'error'; }
    else if (pending === null) text = '동기화 상태 확인 중';
    else if (pending > 0) text = '전송 대기 · ' + pending + '개 레코드';
    else if (serverVerified) { text = '동기화 완료 · ' + time(new Date(last)); tone = 'ok'; }
    else text = '서버 확인 대기';
    write('psCloud', text, tone);
    const note = !matches ? '기기 저장이 확인되지 않았습니다. 새로고침 전에 저장 결과를 확인하세요.'
      : !logged ? '원 정보는 이 기기에 저장됩니다. 공유하려면 기존 공유 로그인 버튼을 이용하세요.'
      : '기기 저장과 서버 동기화는 별개입니다. 완료는 현재 계정의 공유 데이터 기준이며 다른 기기의 수신 완료를 뜻하지 않습니다.';
    const el = document.getElementById('psNote'); if (el.textContent !== note) el.textContent = note;
  }
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  document.addEventListener('visibilitychange', render);
  setInterval(() => { if (document.visibilityState !== 'hidden') render(); }, 700);
  render();
})();
