(() => {
  'use strict';
  if (window.__pickupCardDesignV2) return;
  window.__pickupCardDesignV2 = true;
  const style = document.createElement('style');
  style.textContent = `
  #pkList{gap:14px;align-items:stretch;min-width:0}
  #pkList [data-pk-card]:not(.dc-card){display:flex;flex-direction:column;gap:14px;padding:18px;border:1px solid #33465f!important;border-radius:18px;background:#132136!important;box-shadow:0 4px 16px #02061720;opacity:1!important;min-width:0;overflow:hidden}
  #pkList [data-pk-card]:not(.dc-card)> *{margin-top:0!important}
  #pkList [data-pk-card]:not(.dc-card)[data-ui-complete=true]{background:#13282b!important;border-color:#365c52!important}
  #pkList [data-pk-card]:not(.dc-card) h3{font-size:20px;line-height:1.45;letter-spacing:-.025em;overflow-wrap:anywhere;text-decoration:none}
  #pkList [data-pk-card]:not(.dc-card) p{line-height:1.65;overflow-wrap:anywhere}
  #pkList .pk-ui-metadata{gap:6px!important}
  #pkList .pk-ui-metadata>span{border-radius:7px;font-size:11px;font-weight:600;padding:3px 7px;box-shadow:none}
  #pkList .pk-ui-heading{padding:2px 0 6px}
  #pkList .pk-ui-heading>p{margin-top:7px}
  #pkList .pk-ui-nav{margin-top:auto!important;padding-top:10px;border-top:1px solid #29394f}
  #pkList .pk-ui-nav>a,#pkList .pk-ui-nav>button{display:flex;align-items:center;justify-content:center;width:100%;min-height:46px;padding:11px 12px;border-radius:10px;background:#5578df!important;color:#fff!important;font-size:12px;font-weight:700;line-height:1.45;text-align:center;border:1px solid transparent;box-shadow:none!important}
  #pkList .pk-ui-nav>button{background:#3a311d!important;color:#f7d58b!important;border-color:#756134}
  #pkList .pk-ui-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr);gap:8px}
  #pkList .pk-ui-actions button{min-height:44px;padding:9px 7px;border-radius:10px;border:1px solid #354b68;background:#1b2b41;color:#bfcee2;font-size:12px;font-weight:600;line-height:1.4;box-shadow:none}
  #pkList .pk-ui-actions [data-pk-done]{background:#25463d!important;border:1px solid #456c5d!important;color:#b7e8d3!important}
  #pkList button,#pkList a{transition:background .15s,border-color .15s;animation:none!important;min-width:0}
  #pkList button:focus-visible,#pkList a:focus-visible{outline:2px solid #b3c8ff;outline-offset:2px}
  .pk-ui-statusrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:11px;border-bottom:1px solid #29394f}
  .pk-ui-status{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;background:#27364b;color:#cbd6e6;border-radius:8px;padding:5px 8px}
  .pk-ui-status[data-tone=done]{background:#1b4036;color:#9be1bd}
  .pk-ui-status[data-tone=late]{background:#422331;color:#f7b4c4}
  .pk-ui-status[data-tone=progress]{background:#3c3422;color:#f1d391}
  .pk-ui-progress{font-size:11px;color:#aab9cf;text-align:right}
  #pickupView input,#pickupView select{border-radius:10px}
  @media(max-width:639px){
    #pkList{gap:12px}
    #pkList [data-pk-card]:not(.dc-card){padding:14px;gap:12px;border-radius:16px}
    #pkList [data-pk-card]:not(.dc-card) h3{font-size:19px}
    #pkFilterBar{gap:6px}
    #pkFilterBar button{min-height:40px}
  }
  @media(prefers-reduced-motion:reduce){#pkList *{animation:none!important;transition:none!important}}
  `;
  document.head.append(style);
  const box = document.getElementById('pkList');
  if (!box) return;
  function decorate() {
    box.querySelectorAll('[data-pk-card]').forEach(card => {
      // 통일된 .dc-card 마크업은 이미 납품 카드와 동일한 4단 구조로 렌더링됨
      if (card.classList.contains('dc-card')) return;
      const id = card.getAttribute('data-pk-card');
      const task = typeof PICKUPS !== 'undefined' ? PICKUPS.find(p => String(p.id) === id) : null;
      if (!task) return;
      const isExtra = typeof pkGroupOf === 'function' ? pkGroupOf(task) === 'extra' : false;
      const due = typeof pkDueState === 'function' ? pkDueState(task) : '';
      let quantities = [];
      try { quantities = normalizeFieldQuantities(task.fieldQuantities, !!task.done); } catch (_) {}
      const target = quantities.reduce((n, q) => n + Math.max(0, Number(q.qty) || 0), 0);
      const handled = quantities.reduce((n, q) => n + Math.min(Math.max(0,Number(q.qty)||0),Math.max(0,Number(q.done)||0)),0);
      const inProgress = !task.done && handled > 0;
      let label = task.done ? (isExtra ? '납품 완료' : '처리 완료') : inProgress ? '처리 중' : isExtra ? '납품 대기' : '회수·반품 대기';
      const tone = task.done ? 'done' : due === 'over' ? 'late' : inProgress ? 'progress' : 'pending';
      if (!task.done && due === 'over') label += ' · 기한 경과';
      let row = card.querySelector('.pk-ui-statusrow');
      if (!row) {
        row = document.createElement('div'); row.className = 'pk-ui-statusrow';
        row.innerHTML = '<span class="pk-ui-status"></span><span class="pk-ui-progress"></span>';
        card.prepend(row);
      }
      row.firstElementChild.textContent = label; row.firstElementChild.dataset.tone = tone;
      row.lastElementChild.textContent = task.worksTaskId && task.worksSyncPending ? '웍스 반영 대기' : target > 0 ? `처리 수량 ${handled}/${target}` : '수량 미등록';
      card.dataset.uiComplete = String(!!task.done);
      const metadata = row.nextElementSibling;
      if (metadata) metadata.classList.add('pk-ui-metadata');
      const heading = card.querySelector('div[data-pk-detail]');
      if (heading) heading.classList.add('pk-ui-heading');
      const nav = card.querySelector('a[data-pk-navi]');
      const geo = card.querySelector('button[data-pk-geo]');
      if (nav) { nav.textContent = '길안내 시작'; nav.parentElement.classList.add('pk-ui-nav'); }
      else if (geo) { geo.textContent = '위치 찾기'; geo.parentElement.classList.add('pk-ui-nav'); }
      const detail = card.querySelector('button[data-pk-detail]');
      const edit = card.querySelector('button[data-pk-edit]');
      const done = card.querySelector('button[data-pk-done]');
      if (detail) { detail.textContent = '상세 보기'; detail.parentElement.classList.add('pk-ui-actions'); }
      if (edit) edit.textContent = '내용 수정';
      if (done) done.textContent = task.done ? '완료 취소' : isExtra ? '납품 완료' : '처리 완료';
    });
  }
  const observer = new MutationObserver(() => {
    observer.disconnect();
    try { decorate(); } finally { observer.observe(box, {childList:true, subtree:true}); }
  });
  decorate();
  observer.observe(box, {childList:true, subtree:true});
})();
