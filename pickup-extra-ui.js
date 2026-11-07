(() => {
  'use strict';
  if (window.__pickupCardDesignV2) return;
  window.__pickupCardDesignV2 = true;
  const style = document.createElement('style');
  style.textContent = `
  #pkList{gap:16px;align-items:stretch;min-width:0}
  #pkList [data-pk-card]{display:flex;flex-direction:column;gap:14px;padding:20px;border:1px solid #2d3c52!important;border-radius:20px;background:#111d30!important;box-shadow:0 5px 18px #02061725;opacity:1!important;min-width:0;overflow:hidden}
  #pkList [data-pk-card]> *{margin-top:0!important}
  #pkList [data-pk-card][data-ui-complete=true]{background:#112529!important;border-color:#31584f!important}
  #pkList [data-pk-card] h3{font-size:21px;line-height:1.4;letter-spacing:-.025em;overflow-wrap:anywhere;text-decoration:none}
  #pkList [data-pk-card] p{line-height:1.65;overflow-wrap:anywhere}
  #pkList .pk-ui-metadata{gap:6px!important}
  #pkList .pk-ui-metadata>span{border-radius:7px;font-size:11px;font-weight:600;padding:3px 7px;box-shadow:none}
  #pkList .pk-ui-heading{padding:2px 0 6px}
  #pkList .pk-ui-heading>p{margin-top:7px}
  #pkList .pk-ui-nav{margin-top:auto!important;padding-top:10px;border-top:1px solid #29394f}
  #pkList .pk-ui-nav>a,#pkList .pk-ui-nav>button{display:flex;align-items:center;justify-content:center;width:100%;min-height:46px;padding:11px 12px;border-radius:11px;background:#5276df!important;color:#fff!important;font-size:13px;font-weight:700;line-height:1.4;text-align:center;border:1px solid transparent;box-shadow:none!important}
  #pkList .pk-ui-nav>button{background:#36331f!important;color:#f4d28b!important;border-color:#655630}
  #pkList .pk-ui-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr);gap:8px}
  #pkList .pk-ui-actions button{min-height:44px;padding:9px 7px;border-radius:10px;border:1px solid #34465f;background:#19283c;color:#c6d1e2;font-size:12px;font-weight:600;line-height:1.4;box-shadow:none}
  #pkList .pk-ui-actions [data-pk-done]{background:#213f38!important;border:1px solid #396657!important;color:#a7ebcf!important}
  #pkList button,#pkList a{transition:background .15s,border-color .15s;animation:none!important;min-width:0}
  #pkList button:focus-visible,#pkList a:focus-visible{outline:2px solid #b5c4ff;outline-offset:3px}
  .pk-ui-statusrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:11px;border-bottom:1px solid #29394f}
  .pk-ui-status{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;background:#26364b;color:#d1dbea;border-radius:8px;padding:6px 10px}
  .pk-ui-status:before{content:'';width:6px;height:6px;background:currentColor;border-radius:50%;flex-shrink:0}
  .pk-ui-status[data-tone=done]{background:#1a4036;color:#91e0bd}
  .pk-ui-status[data-tone=late]{background:#412730;color:#f3b4be}
  .pk-ui-status[data-tone=progress]{background:#39331f;color:#f1d18a}
  .pk-ui-progress{font-size:11px;color:#9caec6;text-align:right}
  #pickupView>section:first-child{background:#142136!important;border:1px solid #35465f!important;border-radius:18px;box-shadow:none!important}
  #pickupView input,#pickupView select{border-radius:10px}
  @media(max-width:639px){
    #pickupView{padding-bottom:calc(32px + env(safe-area-inset-bottom,0px))}
    #pkList{gap:12px}
    #pkList [data-pk-card]{padding:14px;gap:12px;border-radius:17px}
    #pkList [data-pk-card] h3{font-size:20px}
    #pkList .pk-ui-actions{gap:6px}
    #pkList .pk-ui-actions button{font-size:11px;min-height:44px;padding:9px 5px}
    #pkList .pk-ui-nav>a,#pkList .pk-ui-nav>button{min-height:48px;font-size:12px}
    #pickupView>section:first-child{padding:14px!important}
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
