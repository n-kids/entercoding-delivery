(() => {
  'use strict';
  if (window.__returnExtraStatuses) return;
  window.__returnExtraStatuses = true;
  const style = document.createElement('style');
  style.textContent = `
  #pkList .return-status-panel{display:flex;flex-wrap:wrap;gap:6px;padding:10px 0;border-bottom:1px solid #2d3b50;margin-top:0}
  #pkList .return-status-panel span{font-size:11px;font-weight:600;line-height:1.5;padding:4px 8px;border-radius:7px;background:#26364b;color:#cbd5e1;border:1px solid #3b4b63}
  #pkList .return-status-panel [data-tone=primary]{background:#26375c;color:#c6d4ff;border-color:#455d8a}
  #pkList .return-status-panel [data-tone=ok]{background:#183c32;color:#9be0bd;border-color:#32604c}
  #pkList .return-status-panel [data-tone=warn]{background:#3b321e;color:#efce88;border-color:#675632}
  #pkList .return-status-panel [data-tone=error]{background:#412833;color:#f1bac5;border-color:#70404f}
  @media(max-width:639px){#pkList .return-status-panel{padding:8px 0;gap:5px}#pkList .return-status-panel span{padding:4px 7px}}
  `;
  document.head.append(style);
  const box = document.getElementById('pkList');
  if (!box) return;
  const signatures = new WeakMap();
  function derive(p, today) {
    let fqs = [];
    try { fqs = normalizeFieldQuantities(p.fieldQuantities, !!p.done); } catch (_) {}
    const total = fqs.reduce((n,q) => n + Math.max(0,Number(q.qty)||0),0);
    const done = fqs.reduce((n,q) => n + Math.min(Math.max(0,Number(q.qty)||0),Math.max(0,Number(q.done)||0)),0);
    const type = p.type === '반품' ? '반품' : p.type === '회수' ? '회수' : '회수·반품';
    const badges = [];
    let primary;
    if (p.done) primary = type + ' 완료';
    else if (total > 0 && done >= total) primary = '수량 처리 완료 · 최종 확인 대기';
    else if (done > 0) primary = '일부 ' + type + ' · 잔여 수량 있음';
    else primary = type + ' 대기';
    badges.push({text:primary,tone:p.done?'ok':'primary'});
    if (!p.done) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(p.due || '')) {
        if (p.due < today) badges.push({text:'기한 경과',tone:'error'});
        else if (p.due === today) badges.push({text:'오늘 예정',tone:'warn'});
        else if (typeof pkDueState === 'function' && pkDueState(p) === 'soon') badges.push({text:'기한 임박 · 2일 이내',tone:'warn'});
      } else badges.push({text:'기한 미지정',tone:''});
      try { if (!hasCoords(pkCoords(p))) badges.push({text:'위치 미등록',tone:'warn'}); } catch (_) {}
      if (!String(p.assignee || '').trim()) badges.push({text:'담당자 미지정',tone:''});
      if (!total && !(Number(p.qty)>0)) badges.push({text:'수량 확인 필요',tone:'warn'});
    }
    if (p.worksTaskId && p.worksSyncPending) badges.push({text:'웍스 반영 대기',tone:'warn'});
    else if (p.worksTaskId && p.worksClosedRemote) badges.push({text:'웍스 완료 기록 있음',tone:''});
    return badges;
  }
  function update() {
    if (typeof PICKUPS === 'undefined') return;
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    box.querySelectorAll('[data-pk-card]').forEach(card => {
      const p = PICKUPS.find(p => String(p.id) === card.getAttribute('data-pk-card'));
      if (!p) return;
      let extra = false;
      try { extra = pkGroupOf(p) === 'extra'; } catch (_) {}
      if (extra) return;
      const badges = derive(p,today), signature = JSON.stringify(badges);
      if (signatures.get(card) === signature && card.querySelector('.return-status-panel')) return;
      signatures.set(card,signature);
      let panel = card.querySelector('.return-status-panel');
      if (!panel) { panel = document.createElement('div'); panel.className = 'return-status-panel'; panel.setAttribute('aria-label','회수 반품 진행 상태 및 확인사항'); const existing = card.querySelector('.pk-ui-statusrow'); if (existing) existing.after(panel); else card.prepend(panel); }
      panel.replaceChildren(...badges.map(b => { const span = document.createElement('span'); span.textContent = b.text; span.dataset.tone = b.tone; return span; }));
    });
  }
  const observer = new MutationObserver(update);
  observer.observe(box,{childList:true});
  setInterval(() => { if (document.visibilityState !== 'hidden') update(); },1500);
  document.addEventListener('visibilitychange',update);
  update();
})();
