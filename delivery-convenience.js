(() => {
  'use strict';
  if (window.__nkConvenienceInstalled) return;
  window.__nkConvenienceInstalled = true;

  const PRE_ALERT_KEY = 'entercoding_prealert_v1';
  let preAlertEnabled = true;
  try {
    const savedPre = localStorage.getItem(PRE_ALERT_KEY);
    if (savedPre !== null) preAlertEnabled = savedPre === '1';
  } catch (e) {}

  let searchQuery = '';
  let pkSearchQuery = '';
  let undoState = null;
  let undoTimer = null;
  const preAlertedSet = {};
  let lastRouteOrder = [];
  let lastRouteTotalMeters = 0;

  // ---- CSS ----
  const style = document.createElement('style');
  style.id = 'nk-convenience-css';
  style.textContent = `
    #nkDeliverySearchWrap,#nkPickupSearchWrap{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:10px}
    #nkDeliverySearchWrap .nk-search-box,#nkPickupSearchWrap .nk-search-box{position:relative;flex:1;min-width:190px;display:flex;align-items:center}
    #nkDeliverySearchInput,#nkPickupSearchInput{width:100%;min-height:40px;padding:8px 34px 8px 12px;border-radius:10px;border:1px solid #384c68;background:#0e1b2e;color:#f1f5f9;font-size:14px}
    #nkDeliverySearchInput::placeholder,#nkPickupSearchInput::placeholder{color:#8fa1bb}
    #nkDeliverySearchInput:focus,#nkPickupSearchInput:focus{outline:none;border-color:#f59e0b}
    .nk-clear-btn{position:absolute;right:6px;min-width:28px;min-height:28px;border-radius:7px;background:#26364c;color:#cbd5e1;font-size:12px;font-weight:700}
    .nk-report-btn{min-height:40px;padding:8px 12px;border-radius:10px;border:1px solid #2f6956;background:#16342c;color:#9de8c8;font-size:12px;font-weight:800;white-space:nowrap}
    #nkRouteBanner{display:none;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding:10px 12px;border-radius:12px;background:#172554;border:1px solid #3b82f6;color:#dbeafe;font-size:12px}
    #nkRouteBanner.open{display:flex}
    #nkRouteBanner button{min-height:36px;padding:6px 11px;border-radius:9px;font-size:11px;font-weight:800;background:#2563eb;color:#fff;border:1px solid #60a5fa}
    #nkUndoToast{position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:95;display:none;align-items:center;gap:10px;max-width:min(94vw,420px);padding:10px 12px;border-radius:14px;background:#1e293b;border:1.5px solid #f59e0b;box-shadow:0 12px 32px rgba(2,6,23,.65);color:#fef3c7;font-size:12px;font-weight:700}
    #nkUndoToast.open{display:flex}
    #nkUndoToast button{min-height:34px;padding:5px 11px;border-radius:9px;background:#f59e0b;color:#020617;font-weight:900;font-size:12px;white-space:nowrap}
    @media(min-width:640px){#nkUndoToast{bottom:20px}}
    .nk-dialog{width:min(500px,calc(100% - 24px));max-height:90dvh;overflow:auto;padding:20px;border-radius:20px;border:1px solid #445874;background:#132136;color:#eef2ff}
    .nk-dialog::backdrop{background:rgba(2,6,23,.75);backdrop-filter:blur(3px)}
    .nk-dialog h2{font-size:18px;font-weight:800;margin-bottom:4px}
    .nk-dialog .nk-sub{font-size:12px;color:#9fb0c8;margin-bottom:12px}
    .nk-dialog label{display:block;font-size:12px;font-weight:700;color:#cbd5e1;margin-top:10px}
    .nk-dialog input,.nk-dialog select,.nk-dialog textarea{width:100%;margin-top:4px;padding:9px 11px;border-radius:10px;border:1px solid #3f5573;background:#0c1728;color:#fff;font-size:15px}
    .nk-dialog textarea{min-height:76px;resize:vertical}
    .nk-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    .nk-chips button{min-height:32px;padding:4px 9px;border-radius:8px;font-size:11px;font-weight:700;background:#1f314a;color:#bae6fd;border:1px solid #36557c}
    .nk-status-pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    .nk-status-pills button{min-height:36px;padding:6px 10px;border-radius:9px;font-size:12px;font-weight:700;background:#1e2d44;color:#cbd5e1;border:1px solid #394e6c}
    .nk-status-pills button[aria-pressed=true]{background:#4f46e5;color:#fff;border-color:#818cf8}
    .nk-dlg-actions{display:flex;gap:8px;margin-top:16px}
    .nk-dlg-actions button,.nk-dlg-actions a{flex:1;min-height:42px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;font-size:13px;font-weight:800;text-decoration:none}
    .nk-btn-cancel{background:#25354b;color:#cbd5e1;border:1px solid #3e5370}
    .nk-btn-save{background:#10b981;color:#022c22}
    .nk-btn-copy{background:#3b82f6;color:#fff}
    .nk-btn-call{background:#064e3b;color:#a7f3d0;border:1px solid #10b981}
    .nk-pk-phone{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:7px;font-size:11px;font-weight:700;background:#16342c;border:1px solid #2f6956;color:#9de8c8;text-decoration:none;margin-top:5px}
  `;
  document.head.appendChild(style);

  // ---- 헬퍼 ----
  const bridge = () => window.__nkBridge || {};
  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? ''));
  const fmtHm = (ms) => {
    if (!ms) return '';
    try { return new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  };
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // ---- 1. 납품 탭 검색창 + 결과 요약 버튼 + 동선 배너 ----
  const regionTabsEl = document.getElementById('regionTabs');
  if (regionTabsEl && !document.getElementById('nkDeliverySearchWrap')) {
    const wrap = document.createElement('div');
    wrap.id = 'nkDeliverySearchWrap';
    wrap.innerHTML = `
      <div class="nk-search-box">
        <input id="nkDeliverySearchInput" type="search" placeholder="🔍 원 이름 · 동네 · 주소 · 품목 · 메모 검색" aria-label="납품 원 검색">
        <button id="nkDeliverySearchClear" type="button" class="nk-clear-btn hidden" aria-label="검색어 지우기">✕</button>
      </div>
      <button id="nkOpenReportQuickBtn" type="button" class="nk-report-btn">📋 오늘 결과 요약</button>
    `;
    regionTabsEl.parentElement.before(wrap);

    const routeBanner = document.createElement('div');
    routeBanner.id = 'nkRouteBanner';
    routeBanner.innerHTML = `
      <span id="nkRouteInfo">🧭 추천 동선</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button id="nkApplyRouteOrderBtn" type="button">✓ 이 순서를 기본 순서로 저장</button>
      </div>
    `;
    regionTabsEl.parentElement.after(routeBanner);

    const input = document.getElementById('nkDeliverySearchInput');
    const clearBtn = document.getElementById('nkDeliverySearchClear');
    input.addEventListener('input', () => {
      searchQuery = input.value.trim();
      clearBtn.classList.toggle('hidden', !searchQuery);
      if (typeof renderList === 'function') renderList();
    });
    clearBtn.addEventListener('click', () => {
      input.value = '';
      searchQuery = '';
      clearBtn.classList.add('hidden');
      if (typeof renderList === 'function') renderList();
      input.focus();
    });
    document.getElementById('nkOpenReportQuickBtn').addEventListener('click', () => {
      openDailyReportDialog();
    });
    document.getElementById('nkApplyRouteOrderBtn').addEventListener('click', () => {
      applyRouteOrderToSchools();
    });
  }

  window.nkFilterSchool = function (s) {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const fOps = s.fieldOps || {};
    const extras = typeof extrasToText === 'function' ? extrasToText(s.extras) : '';
    const hay = [
      s.name, s.regionGroup, s.subRegion, s.address, s.phone,
      s.product, extras, fOps.memo, fOps.reason, fOps.deliveryStatus
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  };

  // ---- 2. 회수·반품/추가 납품 탭 검색창 & 결과 요약 버튼 & 전화 링크 보강 ----
  const pkFilterBar = document.getElementById('pkFilterBar');
  if (pkFilterBar && !document.getElementById('nkPickupSearchWrap')) {
    const pWrap = document.createElement('div');
    pWrap.id = 'nkPickupSearchWrap';
    const isExtraInit = typeof pkMode !== 'undefined' && pkMode === 'extra';
    pWrap.innerHTML = `
      <div class="nk-search-box">
        <input id="nkPickupSearchInput" type="search" placeholder="${isExtraInit ? '🔍 추가 납품 원 이름 · 품목 · 담당자 · 메모 검색' : '🔍 회수·반품 원 이름 · 품목 · 담당자 · 메모 검색'}" aria-label="회수 추가납품 검색">
        <button id="nkPickupSearchClear" type="button" class="nk-clear-btn hidden" aria-label="검색어 지우기">✕</button>
      </div>
      <button id="nkPickupReportQuickBtn" type="button" class="nk-report-btn">📋 오늘 결과 요약</button>
    `;
    pkFilterBar.before(pWrap);
    const pInput = document.getElementById('nkPickupSearchInput');
    const pClear = document.getElementById('nkPickupSearchClear');
    pInput.addEventListener('input', () => {
      pkSearchQuery = pInput.value.trim().toLowerCase();
      pClear.classList.toggle('hidden', !pkSearchQuery);
      decoratePickupCards();
    });
    pClear.addEventListener('click', () => {
      pInput.value = '';
      pkSearchQuery = '';
      pClear.classList.add('hidden');
      decoratePickupCards();
      pInput.focus();
    });
    document.getElementById('nkPickupReportQuickBtn').addEventListener('click', () => {
      openDailyReportDialog();
    });
  }

  function decoratePickupCards() {
    const box = document.getElementById('pkList');
    if (!box || typeof PICKUPS === 'undefined') return;
    box.querySelectorAll('[data-pk-card]').forEach(card => {
      const id = card.getAttribute('data-pk-card');
      const p = PICKUPS.find(x => String(x.id) === String(id));
      if (!p) return;
      const linked = typeof pkLinkedSchool === 'function' ? pkLinkedSchool(p) : null;
      const phone = (linked && linked.phone) || p.phone || '';
      const cleaned = String(phone).replace(/[^0-9+*#,]/g, '');

      // 전화 칩 추가 (없을 때만 — 통일된 .dc-phone-chip 스타일 사용)
      if (cleaned && !card.querySelector('.dc-phone-chip, .nk-pk-phone')) {
        const contactRow = card.querySelector('.dc-contact-row') || (() => {
          const identity = card.querySelector('.dc-identity');
          if (!identity) return null;
          const row = document.createElement('div');
          row.className = 'dc-contact-row';
          const memoLine = identity.querySelector('.dc-memo-line');
          if (memoLine) memoLine.before(row); else identity.appendChild(row);
          return row;
        })();
        const targetHost = contactRow || card.querySelector('div[data-pk-detail]');
        if (targetHost) {
          const a = document.createElement('a');
          a.className = contactRow ? 'dc-phone-chip' : 'nk-pk-phone';
          a.href = 'tel:' + cleaned;
          a.textContent = '📞 ' + phone;
          a.addEventListener('click', e => e.stopPropagation());
          targetHost.appendChild(a);
        }
      }

      // 검색 필터 적용
      if (!pkSearchQuery) {
        card.style.display = '';
      } else {
        const hay = [
          linked && linked.name, p.school, p.type, p.items, p.title,
          p.assignee, p.memo, p.fieldReason, p.worksContent, p.address
        ].filter(Boolean).join(' ').toLowerCase();
        card.style.display = hay.includes(pkSearchQuery) ? '' : 'none';
      }
    });
  }

  const pkListEl = document.getElementById('pkList');
  if (pkListEl) {
    const pkObs = new MutationObserver(() => {
      pkObs.disconnect();
      try { decoratePickupCards(); } finally { pkObs.observe(pkListEl, { childList: true }); }
    });
    pkObs.observe(pkListEl, { childList: true });
    decoratePickupCards();
  }

  // 회수 상세 모달에도 전화 버튼 보강
  const pkDetailBox = document.getElementById('pkDetailBox');
  if (pkDetailBox) {
    const pkDetObs = new MutationObserver(() => {
      if (pkDetailBox.querySelector('[data-nk-pkd-phone]')) return;
      const doneBtn = pkDetailBox.querySelector('[data-pk-done]');
      if (!doneBtn || typeof PICKUPS === 'undefined') return;
      const pid = doneBtn.getAttribute('data-pk-done');
      const p = PICKUPS.find(x => String(x.id) === String(pid));
      if (!p) return;
      const linked = typeof pkLinkedSchool === 'function' ? pkLinkedSchool(p) : null;
      const phone = (linked && linked.phone) || p.phone || '';
      const cleaned = String(phone).replace(/[^0-9+*#,]/g, '');
      if (!cleaned) return;
      const titleEl = pkDetailBox.querySelector('#pkDtName');
      if (titleEl) {
        const a = document.createElement('a');
        a.setAttribute('data-nk-pkd-phone', '1');
        a.className = 'nk-pk-phone';
        a.href = 'tel:' + cleaned;
        a.textContent = '📞 ' + phone + ' (전화 걸기)';
        titleEl.after(a);
      }
    });
    pkDetObs.observe(pkDetailBox, { childList: true });
  }

  // ---- 3. 연쇄 동선 최적화 (Nearest Neighbor + 2-opt) ----
  function computeOptimizedRoute(list) {
    const pendingWithCoords = [];
    const others = [];
    list.forEach(s => {
      const c = typeof getSchoolCoords === 'function' ? getSchoolCoords(s) : null;
      if (!completedMap[s.id] && typeof hasCoords === 'function' && hasCoords(c)) {
        pendingWithCoords.push({ s, c });
      } else {
        others.push(s);
      }
    });
    others.sort((a, b) => (!!completedMap[a.id] - !!completedMap[b.id]) || (a.order - b.order));
    if (pendingWithCoords.length <= 1) {
      return { ordered: [...pendingWithCoords.map(x => x.s), ...others], totalMeters: 0, count: pendingWithCoords.length };
    }

    const pos = bridge().getUserPos ? bridge().getUserPos() : null;
    const distBetween = (c1, c2) => computeHaversineMeters(c1.lat, c1.lng, c2.lat, c2.lng);

    const remaining = [...pendingWithCoords];
    remaining.sort((a, b) => a.s.order - b.s.order);

    const route = [];
    let curCoord = pos;
    if (!curCoord) {
      const first = remaining.shift();
      route.push(first);
      curCoord = first.c;
    }

    while (remaining.length) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = distBetween(curCoord, remaining[i].c);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      route.push(next);
      curCoord = next.c;
    }

    // 2-opt 개선 (경로 교차 제거)
    if (route.length >= 4) {
      let improved = true;
      let guard = 0;
      while (improved && guard < 30) {
        improved = false;
        guard++;
        for (let i = 0; i < route.length - 2; i++) {
          for (let j = i + 2; j < route.length - 1; j++) {
            const a = route[i].c, b = route[i + 1].c;
            const c = route[j].c, d = route[j + 1].c;
            if (distBetween(a, c) + distBetween(b, d) + 20 < distBetween(a, b) + distBetween(c, d)) {
              const seg = route.slice(i + 1, j + 1).reverse();
              route.splice(i + 1, j - i, ...seg);
              improved = true;
            }
          }
        }
      }
    }

    let totalMeters = 0;
    if (pos && route.length) totalMeters += distBetween(pos, route[0].c);
    for (let i = 0; i < route.length - 1; i++) {
      totalMeters += distBetween(route[i].c, route[i + 1].c);
    }
    return {
      ordered: [...route.map(x => x.s), ...others],
      totalMeters,
      count: route.length
    };
  }

  window.nkGetRouteRank = function (filtered) {
    const res = computeOptimizedRoute(filtered);
    lastRouteOrder = res.ordered.map(s => s.id);
    lastRouteTotalMeters = res.totalMeters;
    const rank = new Map();
    res.ordered.forEach((s, idx) => rank.set(s.id, idx));
    const infoEl = document.getElementById('nkRouteInfo');
    const banner = document.getElementById('nkRouteBanner');
    if (banner && infoEl) {
      const mode = bridge().getSortMode ? bridge().getSortMode() : 'order';
      banner.classList.toggle('open', mode === 'route' && res.count > 0);
      if (mode === 'route' && res.count > 0) {
        const kmText = (res.totalMeters / 1000).toFixed(1);
        infoEl.textContent = `🧭 미완료 ${res.count}곳 추천 동선 · 예상 총 직선거리 약 ${kmText}km`;
      }
    }
    return rank;
  };

  window.nkUpdateSortButtons = function () {
    const mode = bridge().getSortMode ? bridge().getSortMode() : 'order';
    const banner = document.getElementById('nkRouteBanner');
    if (banner && mode !== 'route') banner.classList.remove('open');
    const routeBtn = document.getElementById('sortByRouteBtn');
    const distBtn = document.getElementById('sortByDistanceBtn');
    const resetBtn = document.getElementById('resetOrderBtn');
    if (routeBtn) routeBtn.style.outline = mode === 'route' ? '2px solid #818cf8' : '';
    if (distBtn) distBtn.style.outline = mode === 'distance' ? '2px solid #f59e0b' : '';
    if (resetBtn) resetBtn.style.outline = mode === 'order' ? '2px solid #64748b' : '';
  };

  window.nkShowRouteBanner = function () {
    const km = (lastRouteTotalMeters / 1000).toFixed(1);
    if (typeof showToast === 'function') {
      showToast(lastRouteOrder.length
        ? `🧭 미완료 원 기준 최단 연쇄 동선으로 정렬했습니다 (직선 약 ${km}km).`
        : '정렬할 미완료 원이 없습니다.');
    }
  };

  function applyRouteOrderToSchools() {
    if (!lastRouteOrder.length) return;
    const rank = new Map();
    lastRouteOrder.forEach((id, i) => rank.set(id, i + 1));
    SCHOOLS.sort((a, b) => a.order - b.order);
    let tail = lastRouteOrder.length + 1;
    SCHOOLS.forEach(s => {
      s.order = rank.has(s.id) ? rank.get(s.id) : tail++;
    });
    SCHOOLS.sort((a, b) => a.order - b.order);
    if (bridge().setSortMode) bridge().setSortMode('order');
    if (typeof saveState === 'function') saveState();
    if (typeof renderList === 'function') renderList();
    window.nkUpdateSortButtons();
    if (typeof showToast === 'function') showToast('✓ 추천 동선 순서를 기본 표 순서로 저장했습니다.');
  }

  window.nkGetLoadOrderedItems = function (indexed, reverse) {
    const res = computeOptimizedRoute(SCHOOLS);
    const rank = new Map();
    res.ordered.forEach((s, i) => rank.set(s.name, i));
    const sorted = [...indexed].sort((a, b) => {
      const ra = rank.has(a.r.school) ? rank.get(a.r.school) : 999999;
      const rb = rank.has(b.r.school) ? rank.get(b.r.school) : 999999;
      return (ra - rb) || (a.idx - b.idx);
    });
    if (reverse) sorted.reverse();
    return {
      items: sorted,
      label: reverse ? '추천 동선 역순 (마지막 원 안쪽 적재)' : '추천 동선 정순'
    };
  };

  // ---- 4. 완료 되돌리기 (Undo) ----
  const undoToast = document.createElement('div');
  undoToast.id = 'nkUndoToast';
  undoToast.setAttribute('role', 'status');
  undoToast.innerHTML = '<span id="nkUndoText">완료 처리됨</span><button id="nkUndoBtn" type="button">↩ 되돌리기</button>';
  document.body.appendChild(undoToast);

  function clearUndoState() {
    undoState = null;
    clearTimeout(undoTimer);
    undoToast.classList.remove('open');
    if (typeof syncNativeAndDomOverlays === 'function') {
      try { syncNativeAndDomOverlays(); } catch (e) {}
    }
  }

  window.nkGetUndoLabel = function () {
    if (!undoState || Date.now() > undoState.expiresAt) return '';
    return String(undoState.label || '');
  };

  window.nkRecordCompletionUndo = function (payload) {
    if (!payload) return;
    undoState = { ...payload, expiresAt: Date.now() + 6500 };
    document.getElementById('nkUndoText').textContent = `✅ ${payload.label} 완료됨`;
    undoToast.classList.add('open');
    clearTimeout(undoTimer);
    undoTimer = setTimeout(clearUndoState, 6500);
    if (typeof syncNativeAndDomOverlays === 'function') {
      try { syncNativeAndDomOverlays(); } catch (e) {}
    }
  };

  window.nkPerformUndo = function () {
    if (!undoState) {
      if (typeof showToast === 'function') showToast('되돌릴 최근 완료 기록이 없습니다.');
      return;
    }
    const st = undoState;
    undoState = null;
    clearTimeout(undoTimer);
    undoToast.classList.remove('open');

    if (st.kind === 'delivery') {
      const s = SCHOOLS.find(x => x.id === st.id);
      if (s) {
        completedMap[s.id] = !!st.prevDone;
        if (st.prevFieldOps) s.fieldOps = st.prevFieldOps;
        else if (s.fieldOps) {
          s.fieldOps = { ...s.fieldOps, deliveryStatus: '대기', completedAt: null, updatedAt: Date.now() };
        }
        if (typeof saveState === 'function') saveState();
        if (bridge().restoreNaviLock) bridge().restoreNaviLock(s.id, null);
        if (typeof renderList === 'function') renderList();
        if (typeof updateNaviLockBanner === 'function') updateNaviLockBanner();
        if (typeof updateBgMediaAndPip === 'function') updateBgMediaAndPip();
        if (typeof showToast === 'function') showToast(`↩ [${s.name}] 완료를 취소하고 미완료로 되돌렸습니다.`);
      }
      return;
    }

    if (st.kind === 'pickup' && typeof PICKUPS !== 'undefined') {
      const p = PICKUPS.find(x => String(x.id) === String(st.id));
      if (p) {
        p.done = !!st.prevDone;
        p.doneAt = null;
        if (st.prevFqs) p.fieldQuantities = st.prevFqs;
        if (p.worksTaskId) { p.worksSyncPending = true; p.worksClosedRemote = false; }
        if (typeof savePickups === 'function') savePickups();
        if (p.worksTaskId && typeof worksPushDone === 'function') worksPushDone(p);
        if (bridge().restoreNaviLock) bridge().restoreNaviLock(null, p.id);
        if (typeof renderPickups === 'function') renderPickups();
        if (typeof renderList === 'function') renderList();
        if (typeof updateBgMediaAndPip === 'function') updateBgMediaAndPip();
        if (typeof showToast === 'function') showToast(`↩ [${st.label}] 완료를 취소했습니다.`);
      }
      return;
    }

    if (st.kind === 'pickupGroup' && typeof PICKUPS !== 'undefined') {
      let firstPid = null;
      (st.items || []).forEach(prev => {
        const p = PICKUPS.find(x => String(x.id) === String(prev.id));
        if (!p) return;
        if (!firstPid) firstPid = p.id;
        p.done = !!prev.done;
        p.doneAt = prev.doneAt || null;
        if (prev.fqs) p.fieldQuantities = prev.fqs;
        if (p.worksTaskId) { p.worksSyncPending = true; p.worksClosedRemote = false; }
      });
      if (typeof savePickups === 'function') savePickups();
      (st.items || []).forEach(prev => {
        const p = PICKUPS.find(x => String(x.id) === String(prev.id));
        if (p && p.worksTaskId && typeof worksPushDone === 'function') worksPushDone(p);
      });
      if (firstPid && bridge().restoreNaviLock) bridge().restoreNaviLock(null, firstPid);
      if (typeof renderPickups === 'function') renderPickups();
      if (typeof renderList === 'function') renderList();
      if (typeof updateBgMediaAndPip === 'function') updateBgMediaAndPip();
      if (typeof showToast === 'function') showToast(`↩ [${st.label}] 완료를 취소했습니다.`);
    }
  };

  document.getElementById('nkUndoBtn').addEventListener('click', window.nkPerformUndo);

  // ---- 5. 원별 빠른 현장 메모 · 전화 · 상태 다이얼로그 ----
  const memoDlg = document.createElement('dialog');
  memoDlg.id = 'nkMemoDialog';
  memoDlg.className = 'nk-dialog';
  memoDlg.innerHTML = `
    <form method="dialog">
      <h2 id="nkMemoTitle">원 현장 메모 · 상태</h2>
      <p id="nkMemoSub" class="nk-sub"></p>
      <label>진행 상태</label>
      <div id="nkMemoStatusPills" class="nk-status-pills" role="group" aria-label="진행 상태">
        <button type="button" data-st="대기">대기</button>
        <button type="button" data-st="부분 완료">부분 완료</button>
        <button type="button" data-st="보류">⏸ 보류</button>
        <button type="button" data-st="재방문">🔁 재방문</button>
        <button type="button" data-st="연락필요">📞 연락필요</button>
      </div>
      <label for="nkMemoPhoneInput">원 전화번호</label>
      <input id="nkMemoPhoneInput" type="tel" placeholder="예: 031-987-2730">
      <label for="nkMemoInput">현장 메모 (주차 · 공동현관 비번 · 전달 장소)</label>
      <textarea id="nkMemoInput" placeholder="예: 정문 옆 주차, 공동현관 1234#, 2층 교무실"></textarea>
      <div class="nk-chips" id="nkMemoQuickChips">
        <button type="button" data-chip="정문 앞 주차">+ 정문 앞 주차</button>
        <button type="button" data-chip="지하주차장 이용">+ 지하주차장</button>
        <button type="button" data-chip="2층 교무실 전달">+ 교무실 전달</button>
        <button type="button" data-chip="경비실 맡김">+ 경비실</button>
        <button type="button" data-chip="원내 부재중">+ 부재중</button>
      </div>
      <label for="nkMemoReasonInput">미처리/재방문 사유 (선택)</label>
      <input id="nkMemoReasonInput" type="text" placeholder="예: 담당 선생님 외출, 내일 오전 재방문">
      <label for="nkMemoDateInput">재방문 예정일 (선택)</label>
      <input id="nkMemoDateInput" type="date">
      <div class="nk-dlg-actions">
        <button id="nkMemoCancelBtn" type="button" class="nk-btn-cancel">취소</button>
        <a id="nkMemoCallLink" href="tel:" class="nk-btn-call hidden">📞 전화</a>
        <button id="nkMemoSaveBtn" type="submit" class="nk-btn-save">저장</button>
      </div>
    </form>
  `;
  document.body.appendChild(memoDlg);

  let memoTargetId = null;
  let memoSelectedStatus = '대기';

  function syncMemoDialogPills() {
    memoDlg.querySelectorAll('#nkMemoStatusPills button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-st') === memoSelectedStatus));
    });
  }

  function syncMemoCallLink() {
    const raw = document.getElementById('nkMemoPhoneInput').value.trim();
    const cleaned = raw.replace(/[^0-9+*#,]/g, '');
    const a = document.getElementById('nkMemoCallLink');
    if (cleaned) {
      a.href = 'tel:' + cleaned;
      a.classList.remove('hidden');
    } else {
      a.classList.add('hidden');
    }
  }

  window.openQuickSchoolMemoModal = function (schoolId) {
    const s = SCHOOLS.find(x => x.id === Number(schoolId));
    if (!s) return;
    memoTargetId = s.id;
    const fOps = s.fieldOps || {};
    memoSelectedStatus = (completedMap[s.id] ? '완료' : fOps.deliveryStatus) || '대기';
    if (memoSelectedStatus === '완료') memoSelectedStatus = '대기';
    document.getElementById('nkMemoTitle').textContent = `${s.name} · 메모 및 상태`;
    document.getElementById('nkMemoSub').textContent = `[${s.regionGroup || ''} ${s.subRegion || ''}] ${s.address || ''}`;
    document.getElementById('nkMemoPhoneInput').value = s.phone || '';
    document.getElementById('nkMemoInput').value = fOps.memo || '';
    document.getElementById('nkMemoReasonInput').value = fOps.reason || '';
    document.getElementById('nkMemoDateInput').value = fOps.revisitDate || '';
    syncMemoDialogPills();
    syncMemoCallLink();
    memoDlg.showModal();
  };

  document.getElementById('nkMemoStatusPills').addEventListener('click', (e) => {
    const b = e.target.closest('[data-st]');
    if (!b) return;
    memoSelectedStatus = b.getAttribute('data-st');
    syncMemoDialogPills();
  });
  document.getElementById('nkMemoPhoneInput').addEventListener('input', syncMemoCallLink);
  document.getElementById('nkMemoQuickChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-chip]');
    if (!b) return;
    const inp = document.getElementById('nkMemoInput');
    const chip = b.getAttribute('data-chip');
    const cur = inp.value.trim();
    if (!cur.includes(chip)) {
      inp.value = cur ? `${cur} / ${chip}` : chip;
    }
  });
  document.getElementById('nkMemoCancelBtn').addEventListener('click', () => memoDlg.close());
  memoDlg.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const s = SCHOOLS.find(x => x.id === memoTargetId);
    if (!s) { memoDlg.close(); return; }
    s.phone = document.getElementById('nkMemoPhoneInput').value.trim();
    s.fieldOps = {
      ...(s.fieldOps || {}),
      deliveryStatus: completedMap[s.id] ? '완료' : memoSelectedStatus,
      memo: document.getElementById('nkMemoInput').value.trim(),
      reason: document.getElementById('nkMemoReasonInput').value.trim(),
      revisitDate: document.getElementById('nkMemoDateInput').value,
      updatedAt: Date.now()
    };
    if (typeof saveState === 'function') saveState();
    if (typeof renderList === 'function') renderList();
    if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
    const arrivalOpen = !document.getElementById('arrivalModal')?.classList.contains('hidden');
    if (arrivalOpen && typeof openArrivalModal === 'function') {
      const box = document.getElementById('modalFieldMemoBox');
      if (box) {
        const parts = [];
        if (s.fieldOps.deliveryStatus && s.fieldOps.deliveryStatus !== '대기' && !completedMap[s.id]) parts.push(`[${s.fieldOps.deliveryStatus}]`);
        if (s.fieldOps.memo) parts.push(`📝 ${s.fieldOps.memo}`);
        if (s.fieldOps.reason) parts.push(`사유: ${s.fieldOps.reason}`);
        if (s.fieldOps.revisitDate) parts.push(`재방문: ${s.fieldOps.revisitDate}`);
        box.textContent = parts.join(' · ');
        box.classList.toggle('hidden', !parts.length);
      }
    }
    memoDlg.close();
    if (typeof showToast === 'function') showToast(`[${s.name}] 현장 메모와 상태를 저장했습니다.`);
  });

  // ---- 6. 오늘 납품 결과 요약 보고서 ----
  const reportDlg = document.createElement('dialog');
  reportDlg.id = 'nkDailyReportDialog';
  reportDlg.className = 'nk-dialog';
  reportDlg.innerHTML = `
    <div>
      <h2>📋 오늘 납품·회수 결과 요약</h2>
      <p class="nk-sub">카카오톡이나 네이버 웍스에 바로 붙여넣어 일일 보고할 수 있습니다.</p>
      <textarea id="nkReportTextarea" rows="12" readonly style="min-height:240px;font-size:13px;line-height:1.55"></textarea>
      <div class="nk-dlg-actions">
        <button id="nkReportCloseBtn" type="button" class="nk-btn-cancel">닫기</button>
        <button id="nkReportCopyBtn" type="button" class="nk-btn-copy">📋 결과 복사하기</button>
      </div>
    </div>
  `;
  document.body.appendChild(reportDlg);

  function buildDailyReportText() {
    const tStr = todayStr();
    const doneSchools = SCHOOLS.filter(s => !!completedMap[s.id]);
    const pendingSchools = SCHOOLS.filter(s => !completedMap[s.id]);
    const doneQty = doneSchools.reduce((a, s) => a + (typeof grandTotal === 'function' ? grandTotal(s) : 0), 0);
    const totalQty = SCHOOLS.reduce((a, s) => a + (typeof grandTotal === 'function' ? grandTotal(s) : 0), 0);

    const lines = [];
    lines.push(`[엔터코딩 납품 결과 보고] ${tStr}`);
    lines.push(`• 정규 납품: ${doneSchools.length}/${SCHOOLS.length}곳 완료 (${doneQty}/${totalQty}개)`);
    if (doneSchools.length) {
      lines.push('');
      lines.push('■ 납품 완료 원');
      doneSchools.forEach((s, i) => {
        const tm = s.fieldOps && s.fieldOps.completedAt ? ` (${fmtHm(s.fieldOps.completedAt)})` : '';
        const q = typeof grandTotal === 'function' ? grandTotal(s) : 0;
        lines.push(`${i + 1}. ${s.name} · ${q}개${tm}`);
      });
    }
    if (pendingSchools.length) {
      lines.push('');
      lines.push('■ 미완료 / 보류·재방문 원');
      pendingSchools.forEach((s, i) => {
        const f = s.fieldOps || {};
        const st = f.deliveryStatus && f.deliveryStatus !== '대기' ? `[${f.deliveryStatus}] ` : '';
        const reason = f.reason ? ` - ${f.reason}` : '';
        const rev = f.revisitDate ? ` (재방문: ${f.revisitDate})` : '';
        const q = typeof grandTotal === 'function' ? grandTotal(s) : 0;
        lines.push(`${i + 1}. ${s.name} · ${q}개 ${st}${reason}${rev}`.trim());
      });
    }
    if (typeof PICKUPS !== 'undefined' && Array.isArray(PICKUPS) && PICKUPS.length) {
      const pkDoneToday = PICKUPS.filter(p => p.done && (!p.doneAt || new Date(p.doneAt).toDateString() === new Date().toDateString()));
      const pkPending = PICKUPS.filter(p => !p.done);
      lines.push('');
      lines.push(`• 회수·추가 업무: 완료 ${pkDoneToday.length}건 / 남은 할 일 ${pkPending.length}건`);
      if (pkDoneToday.length) {
        lines.push('■ 회수·반품·추가 처리 완료');
        pkDoneToday.forEach((p, i) => {
          const tm = p.doneAt ? ` (${fmtHm(p.doneAt)})` : '';
          lines.push(`${i + 1}. [${p.type}] ${p.school} · ${p.items || p.title || ''}${tm}`);
        });
      }
      if (pkPending.length) {
        lines.push('■ 남은 회수·반품·추가');
        pkPending.forEach((p, i) => {
          const st = p.fieldStatus && p.fieldStatus !== '대기' ? ` [${p.fieldStatus}]` : '';
          lines.push(`${i + 1}. [${p.type}] ${p.school} · ${p.items || p.title || ''}${st}`);
        });
      }
    }
    return lines.join('\n');
  }

  function openDailyReportDialog() {
    document.getElementById('nkReportTextarea').value = buildDailyReportText();
    reportDlg.showModal();
  }

  document.getElementById('openDailyReportBtn')?.addEventListener('click', openDailyReportDialog);
  document.getElementById('nkReportCloseBtn').addEventListener('click', () => reportDlg.close());
  document.getElementById('nkReportCopyBtn').addEventListener('click', async () => {
    const txt = document.getElementById('nkReportTextarea').value;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(txt);
        copied = true;
      }
    } catch (e) {}
    if (!copied) {
      const ta = document.getElementById('nkReportTextarea');
      ta.select();
      try { copied = document.execCommand('copy'); } catch (e) {}
    }
    if (typeof showToast === 'function') {
      showToast(copied ? '📋 오늘 납품 결과를 클립보드에 복사했습니다!' : '텍스트를 직접 선택해 복사해 주세요.');
    }
  });

  // ---- 7. 주행 중 1km 전방 사전 음성 예고 ----
  function updatePreAlertBtn() {
    const btn = document.getElementById('togglePreAlertBtn');
    if (!btn) return;
    btn.textContent = preAlertEnabled ? '🔔 1km 예고 켜짐' : '🔕 1km 예고 꺼짐';
    btn.className = preAlertEnabled
      ? 'px-2.5 py-2 rounded-xl text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/30 transition text-left sm:text-center'
      : 'px-2.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition text-left sm:text-center';
  }
  updatePreAlertBtn();

  document.getElementById('togglePreAlertBtn')?.addEventListener('click', () => {
    preAlertEnabled = !preAlertEnabled;
    try { localStorage.setItem(PRE_ALERT_KEY, preAlertEnabled ? '1' : '0'); } catch (e) {}
    updatePreAlertBtn();
    if (typeof showToast === 'function') {
      showToast(preAlertEnabled ? '원 전방 1km 접근 시 음성으로 미리 예고합니다.' : '1km 전방 예고를 껐습니다.');
    }
  });

  window.nkOnGpsPositionUpdated = function (lat, lng, accuracy, radiusMeters) {
    if (!preAlertEnabled || lat == null || lng == null) return;
    if (accuracy !== null && accuracy > 400) return;

    const preMin = Math.max(radiusMeters + 80, 380);
    const preMax = 1000;
    let candidate = null;
    let candidateDist = Infinity;

    SCHOOLS.forEach(s => {
      if (completedMap[s.id]) return;
      const d = typeof distanceToSchool === 'function' ? distanceToSchool(s) : null;
      if (d === null) return;
      if (d > 1500) { delete preAlertedSet[s.id]; return; }
      if (typeof autoShownSet !== 'undefined' && autoShownSet[s.id]) return;
      if (d > preMin && d <= preMax && !preAlertedSet[s.id] && d < candidateDist) {
        candidate = s;
        candidateDist = d;
      }
    });

    if (candidate) {
      preAlertedSet[candidate.id] = true;
      const total = typeof grandTotal === 'function' ? grandTotal(candidate) : 0;
      const distSay = candidateDist >= 950 ? '약 1킬로미터' : `약 ${Math.round(candidateDist / 50) * 50}미터`;
      const msg = `${distSay} 앞, ${candidate.name}. 총 ${total}개 납품 예정입니다.`;
      if (typeof showToast === 'function') showToast(`🔔 전방 예고: ${candidate.name} (${candidateDist}m 앞 · ${total}개)`);
      if (typeof speakDeliveryText === 'function') speakDeliveryText(msg);
    }
  };
})();
