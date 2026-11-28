(() => {
  'use strict';
  if (window.__nkFieldSkillsInstalled) return;
  window.__nkFieldSkillsInstalled = true;

  const COURSE_KEY = 'nk_today_course_v1';
  const LOAD_CHECK_KEY = 'nk_vehicle_load_check_v1';

  const bridge = () => window.__nkBridge || {};
  const esc = (v) => (typeof escapeHtml === 'function'
    ? escapeHtml(v)
    : String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])));
  const toast = (msg) => { if (typeof showToast === 'function') showToast(msg); };
  const todayKey = () => {
    if (typeof window.nkLocalTodayKey === 'function') return window.nkLocalTodayKey();
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const getSchools = () => (bridge().getSchools ? bridge().getSchools() : (typeof SCHOOLS !== 'undefined' ? SCHOOLS : []));
  const getPickups = () => (bridge().getPickups ? bridge().getPickups() : (typeof PICKUPS !== 'undefined' && Array.isArray(PICKUPS) ? PICKUPS : []));
  const getCompleted = () => (bridge().getCompletedMap ? bridge().getCompletedMap() : (typeof completedMap !== 'undefined' ? completedMap : {}));

  function getTodayCourseSet() {
    try {
      const data = JSON.parse(localStorage.getItem(COURSE_KEY) || '{}');
      const arr = Array.isArray(data && data[todayKey()]) ? data[todayKey()] : [];
      return new Set(arr.map(x => Number(x)).filter(Number.isFinite));
    } catch (e) {
      return new Set();
    }
  }

  function loadCheckMap() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOAD_CHECK_KEY) || '{}');
      const t = todayKey();
      return (raw && typeof raw[t] === 'object' && raw[t]) ? raw[t] : {};
    } catch (e) {
      return {};
    }
  }

  function saveCheckMap(map) {
    try {
      const raw = JSON.parse(localStorage.getItem(LOAD_CHECK_KEY) || '{}');
      const t = todayKey();
      const cleaned = {};
      Object.keys(raw || {}).sort().slice(-6).forEach(k => { cleaned[k] = raw[k]; });
      cleaned[t] = map;
      localStorage.setItem(LOAD_CHECK_KEY, JSON.stringify(cleaned));
    } catch (e) {}
  }

  // =========================================================================
  // STYLES (Dark + Sunlight High-Contrast Mode)
  // =========================================================================
  const style = document.createElement('style');
  style.id = 'nkFieldSkillsStyle';
  style.textContent = `
    #nkProToolbar .nk-skill-go {
      background: linear-gradient(135deg, #059669, #10b981) !important;
      color: #ffffff !important;
      border-color: #34d399 !important;
    }
    #nkProToolbar .nk-skill-load {
      background: #1e293b;
      color: #bae6fd;
      border-color: #0284c7;
    }
    #nkProToolbar .nk-skill-voice {
      background: #1e1b4b;
      color: #c7d2fe;
      border-color: #6366f1;
    }
    #nkProToolbar .nk-skill-voice.is-on {
      background: #dc2626 !important;
      color: #ffffff !important;
      border-color: #fca5a5 !important;
      animation: nkSkillPulse 1.3s infinite;
    }
    #nkProToolbar .nk-skill-restore {
      background: #78350f !important;
      color: #fef3c7 !important;
      border-color: #f59e0b !important;
    }
    body.nk-theme-sunlight #nkProToolbar .nk-skill-load {
      background: #e0f2fe;
      color: #0369a1;
      border-color: #38bdf8;
    }
    body.nk-theme-sunlight #nkProToolbar .nk-skill-voice {
      background: #e0e7ff;
      color: #3730a3;
      border-color: #818cf8;
    }
    body.nk-theme-sunlight #nkProToolbar .nk-skill-restore {
      background: #fef3c7 !important;
      color: #92400e !important;
      border-color: #d97706 !important;
    }
    .fh-chip.fh-chip-go {
      background: linear-gradient(135deg, #059669, #10b981) !important;
      color: #ffffff !important;
      border-color: #34d399 !important;
    }
    .fh-chip.fh-chip-restore {
      background: rgba(180, 83, 9, 0.35) !important;
      color: #fde68a !important;
      border-color: #f59e0b !important;
    }
    body.nk-theme-sunlight .fh-chip.fh-chip-restore {
      background: #fef3c7 !important;
      color: #92400e !important;
      border-color: #d97706 !important;
    }
    .fh-chip.fh-chip-voice.on {
      background: #dc2626 !important;
      color: #ffffff !important;
      border-color: #fca5a5 !important;
      animation: nkSkillPulse 1.3s infinite;
    }
    @keyframes nkSkillPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
      50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
    }

    /* Field Skills Dialogs */
    dialog.nk-skill-dlg {
      width: min(94vw, 620px);
      max-height: 90dvh;
      padding: 0;
      border-radius: 20px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #f8fafc;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
      overflow: hidden;
    }
    dialog.nk-skill-dlg::backdrop {
      background: rgba(2, 6, 23, 0.78);
      backdrop-filter: blur(4px);
    }
    .nk-sd-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid #1e293b;
      background: #111c33;
    }
    .nk-sd-head h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 900;
    }
    .nk-sd-close {
      padding: 6px 11px;
      border-radius: 10px;
      border: 1px solid #475569;
      background: #1e293b;
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .nk-sd-body {
      padding: 14px 16px 18px;
      overflow-y: auto;
      max-height: calc(90dvh - 60px);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .nk-sd-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }
    .nk-sd-pill {
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid #334155;
      background: #1e293b;
      color: #cbd5e1;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .nk-sd-pill.active {
      background: #2563eb;
      color: #ffffff;
      border-color: #60a5fa;
    }
    .nk-sd-pill.amber {
      background: #92400e;
      color: #fef3c7;
      border-color: #f59e0b;
    }
    .nk-sd-pill.green {
      background: #059669;
      color: #ffffff;
      border-color: #34d399;
    }
    .nk-load-hero {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 14px;
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(16,185,129,.18), rgba(14,165,233,.14));
      border: 1px solid rgba(52,211,153,.4);
    }
    .nk-load-big {
      font-size: 28px;
      font-weight: 900;
      line-height: 1.1;
      color: #6ee7b7;
    }
    .nk-load-sub {
      font-size: 12px;
      color: #cbd5e1;
      margin-top: 3px;
      font-weight: 700;
    }
    .nk-load-steps {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .nk-load-step-box {
      padding: 10px 6px;
      border-radius: 12px;
      background: #172033;
      border: 1px solid #334155;
      text-align: center;
    }
    .nk-load-step-box span { display: block; font-size: 11px; color: #94a3b8; font-weight: 700; }
    .nk-load-step-box strong { display: block; font-size: 21px; font-weight: 900; color: #f8fafc; margin: 2px 0; }
    .nk-load-step-box small { display: block; font-size: 11px; color: #fcd34d; font-weight: 800; }
    .nk-load-sec-title {
      font-size: 12px;
      font-weight: 900;
      color: #93c5fd;
      letter-spacing: 0.02em;
      margin: 2px 0 -4px;
    }
    .nk-load-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .nk-load-tag {
      padding: 6px 10px;
      border-radius: 10px;
      background: #1e293b;
      border: 1px solid #334155;
      font-size: 12px;
      font-weight: 800;
      color: #e2e8f0;
    }
    .nk-load-tag strong { color: #34d399; }
    .nk-load-filter-box {
      padding: 10px 12px;
      border-radius: 14px;
      background: #111c33;
      border: 1px solid #334155;
    }
    .nk-load-filter-chip {
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid #334155;
      background: #1e293b;
      color: #cbd5e1;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.12s;
    }
    .nk-load-filter-chip strong { color: #34d399; margin-left: 2px; }
    .nk-load-filter-chip.is-selected {
      background: #2563eb;
      color: #ffffff;
      border-color: #60a5fa;
    }
    .nk-load-filter-chip.is-selected strong { color: #fde68a; }
    .nk-load-filter-chip.is-extra.is-selected {
      background: #7c3aed;
      border-color: #a78bfa;
    }
    .nk-load-step-btn {
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, transform 0.1s;
    }
    .nk-load-step-btn.is-selected {
      border-color: #60a5fa !important;
      background: rgba(37, 99, 235, 0.28) !important;
      box-shadow: 0 0 0 1px #60a5fa inset;
    }
    .nk-load-card {
      display: flex;
      flex-direction: column;
      gap: 9px;
      padding: 12px;
      border-radius: 14px;
      border: 1px solid #334155;
      background: #172033;
      transition: border-color 0.15s, opacity 0.15s;
    }
    .nk-load-card.checked {
      opacity: 0.65;
      border-color: #059669;
      background: rgba(6, 78, 59, 0.25);
    }
    .nk-load-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .nk-load-card-title-wrap {
      display: flex;
      align-items: center;
      gap: 9px;
      flex: 1;
      min-width: 0;
      cursor: pointer;
    }
    .nk-load-card input[type="checkbox"] {
      width: 20px;
      height: 20px;
      accent-color: #10b981;
      flex: none;
    }
    .nk-load-stop-stat {
      flex: none;
      padding: 3px 8px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 900;
      background: #0f172a;
      color: #cbd5e1;
      border: 1px solid #334155;
    }
    .nk-load-stop-stat.done {
      background: rgba(16, 185, 129, 0.2);
      color: #6ee7b7;
      border-color: #10b981;
    }
    .nk-load-item-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
      gap: 6px;
    }
    .nk-load-item-row {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 8px 9px;
      border-radius: 10px;
      border: 1px solid #334155;
      background: #0f172a;
      cursor: pointer;
      font-size: 12px;
      font-weight: 800;
      color: #fde68a;
    }
    .nk-load-item-row.is-teacher { color: #bae6fd; }
    .nk-load-item-row.is-extra { color: #ddd6fe; }
    .nk-load-item-row.is-on {
      border-color: #10b981;
      background: rgba(16, 185, 129, 0.14);
      color: #94a3b8;
      text-decoration: line-through;
    }
    .nk-load-item-row input[type="checkbox"] {
      width: 18px;
      height: 18px;
    }
    .nk-load-item-lbl {
      flex: 1;
      min-width: 0;
      line-height: 1.25;
    }
    .nk-load-item-qty {
      flex: none;
      font-size: 13px;
      font-weight: 900;
      color: #ffffff;
    }
    .nk-load-item-row.is-on .nk-load-item-qty { color: #94a3b8; }
    .nk-load-order-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 900;
      background: #1d4ed8;
      color: #dbeafe;
      margin-right: 6px;
    }
    .nk-load-card.is-extra .nk-load-order-badge {
      background: #7c3aed;
      color: #ede9fe;
    }
    .nk-load-items-line {
      font-size: 13.5px;
      font-weight: 900;
      color: #fde68a;
      margin-top: 4px;
      line-height: 1.35;
    }
    .nk-restore-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 11px 12px;
      border-radius: 14px;
      border: 1px solid #475569;
      background: #172033;
    }
    .nk-restore-btn {
      flex: none;
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid #34d399;
      background: #059669;
      color: #ffffff;
      font-size: 12px;
      font-weight: 900;
      cursor: pointer;
    }

    /* Voice Memo Mic Button */
    .nk-mic-inline-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid #6366f1;
      background: #312e81;
      color: #e0e7ff;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
      vertical-align: middle;
    }
    .nk-mic-inline-btn.recording {
      background: #dc2626 !important;
      color: #ffffff !important;
      border-color: #fca5a5 !important;
      animation: nkSkillPulse 1.1s infinite;
    }

    /* Hands-Free Voice Command Floating Bar */
    #nkVoiceCmdBar {
      position: fixed;
      left: 50%;
      bottom: max(14px, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      z-index: 950;
      width: min(94vw, 460px);
      padding: 10px 12px;
      border-radius: 16px;
      border: 1.5px solid #f87171;
      background: rgba(15, 23, 42, 0.96);
      color: #f8fafc;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
      display: none;
      flex-direction: column;
      gap: 6px;
    }
    #nkVoiceCmdBar.open { display: flex; }
    .nk-vc-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12.5px;
      font-weight: 900;
    }
    .nk-vc-dot {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: #ef4444;
      margin-right: 6px;
      animation: nkSkillPulse 1.1s infinite;
    }
    .nk-vc-heard {
      font-size: 12px;
      color: #fde68a;
      font-weight: 800;
      min-height: 16px;
    }
    .nk-vc-hints {
      font-size: 10.5px;
      color: #94a3b8;
      line-height: 1.35;
    }
    .nk-vc-stop {
      padding: 5px 10px;
      border-radius: 9px;
      border: 1px solid #f87171;
      background: #991b1b;
      color: #fecaca;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
    }

    /* Sunlight Light Theme Overrides */
    body.nk-theme-sunlight dialog.nk-skill-dlg {
      background: #ffffff;
      color: #0f172a;
      border-color: #cbd5e1;
    }
    body.nk-theme-sunlight .nk-sd-head {
      background: #f8fafc;
      border-bottom-color: #e2e8f0;
    }
    body.nk-theme-sunlight .nk-sd-close {
      background: #e2e8f0;
      color: #0f172a;
      border-color: #94a3b8;
    }
    body.nk-theme-sunlight .nk-sd-pill {
      background: #f1f5f9;
      color: #1e293b;
      border-color: #cbd5e1;
    }
    body.nk-theme-sunlight .nk-load-hero {
      background: #ecfdf5;
      border-color: #10b981;
    }
    body.nk-theme-sunlight .nk-load-big { color: #047857; }
    body.nk-theme-sunlight .nk-load-sub { color: #334155; }
    body.nk-theme-sunlight .nk-load-step-box,
    body.nk-theme-sunlight .nk-load-card,
    body.nk-theme-sunlight .nk-restore-card,
    body.nk-theme-sunlight .nk-load-tag,
    body.nk-theme-sunlight .nk-load-filter-box {
      background: #f8fafc;
      border-color: #cbd5e1;
      color: #0f172a;
    }
    body.nk-theme-sunlight .nk-load-filter-chip {
      background: #ffffff;
      border-color: #cbd5e1;
      color: #1e293b;
    }
    body.nk-theme-sunlight .nk-load-filter-chip strong { color: #047857; }
    body.nk-theme-sunlight .nk-load-filter-chip.is-selected {
      background: #2563eb;
      color: #ffffff;
      border-color: #1d4ed8;
    }
    body.nk-theme-sunlight .nk-load-filter-chip.is-selected strong { color: #fef08a; }
    body.nk-theme-sunlight .nk-load-item-row {
      background: #ffffff;
      border-color: #cbd5e1;
      color: #92400e;
    }
    body.nk-theme-sunlight .nk-load-item-row.is-teacher { color: #0369a1; }
    body.nk-theme-sunlight .nk-load-item-row.is-extra { color: #6d28d9; }
    body.nk-theme-sunlight .nk-load-item-row .nk-load-item-qty { color: #0f172a; }
    body.nk-theme-sunlight .nk-load-item-row.is-on {
      background: #ecfdf5;
      border-color: #10b981;
      color: #64748b;
    }
    body.nk-theme-sunlight .nk-load-stop-stat {
      background: #e2e8f0;
      color: #1e293b;
      border-color: #cbd5e1;
    }
    body.nk-theme-sunlight .nk-load-stop-stat.done {
      background: #d1fae5;
      color: #065f46;
      border-color: #10b981;
    }
    body.nk-theme-sunlight .nk-load-step-box strong { color: #0f172a; }
    body.nk-theme-sunlight .nk-load-step-box small { color: #b45309; }
    body.nk-theme-sunlight .nk-load-items-line { color: #b45309; }
    body.nk-theme-sunlight .nk-load-sec-title { color: #1d4ed8; }
    body.nk-theme-sunlight .nk-mic-inline-btn {
      background: #e0e7ff;
      color: #3730a3;
      border-color: #6366f1;
    }
    body.nk-theme-sunlight #nkVoiceCmdBar {
      background: rgba(255, 255, 255, 0.98);
      color: #0f172a;
    }
    body.nk-theme-sunlight .nk-vc-heard { color: #b45309; }
    body.nk-theme-sunlight .nk-vc-hints { color: #475569; }
  `;
  document.head.appendChild(style);

  // =========================================================================
  // SKILL #2: 오늘 숨긴 원(보류·재방문) 1탭 복구 로직 + 모달
  // =========================================================================
  function getHiddenTodaySummary() {
    const schools = getSchools().filter(s => typeof window.isSchoolHiddenInPopupToday === 'function' && window.isSchoolHiddenInPopupToday(s));
    const pickups = getPickups().filter(p => p && !p.done && !(typeof pkIsHiddenDup === 'function' && pkIsHiddenDup(p)) && typeof window.isPickupHiddenInPopupToday === 'function' && window.isPickupHiddenInPopupToday(p));
    return { schools, pickups, total: schools.length + pickups.length };
  }

  function restoreHiddenStop(kind, id, opts = {}) {
    const t = todayKey();
    if (kind === 'school') {
      const s = getSchools().find(x => Number(x.id) === Number(id));
      if (!s) return false;
      const f = s.fieldOps || {};
      const nextRevisit = (f.revisitDate && f.revisitDate > t) ? '' : (f.revisitDate || '');
      s.fieldOps = {
        ...f,
        deliveryStatus: '대기',
        popupHiddenDate: '',
        revisitDate: nextRevisit,
        updatedAt: Date.now()
      };
      if (typeof saveState === 'function') saveState();
      if (!opts.silent) {
        if (typeof renderList === 'function') renderList();
        if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
        if (typeof updateBgMediaAndPip === 'function') updateBgMediaAndPip();
        toast(`🔓 [${s.name}] 팝업창에 다시 표시됩니다.`);
      }
      return s.name;
    }
    if (kind === 'pickup') {
      const p = getPickups().find(x => String(x.id) === String(id));
      if (!p) return false;
      p.popupHiddenDate = '';
      if (typeof window.nkIsHoldOrRevisitStatus === 'function' && window.nkIsHoldOrRevisitStatus(p.fieldStatus)) {
        p.fieldStatus = '';
      }
      if (p.manualWorkflow && typeof window.nkIsHoldOrRevisitStatus === 'function' && window.nkIsHoldOrRevisitStatus(p.manualWorkflow.status)) {
        delete p.manualWorkflow;
      } else if (p.manualWorkflow) {
        p.manualWorkflow = { ...p.manualWorkflow, popupHiddenDate: '' };
      }
      if (p.fieldRevisitDate && p.fieldRevisitDate > t) p.fieldRevisitDate = '';
      p.statusUpdatedAt = Date.now();
      if (typeof savePickups === 'function') savePickups();
      if (!opts.silent) {
        if (typeof renderPickups === 'function') renderPickups();
        if (typeof renderList === 'function') renderList();
        if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
        if (typeof updateBgMediaAndPip === 'function') updateBgMediaAndPip();
        toast(`🔓 [${p.school || p.title || '업무'}] 팝업창에 다시 표시됩니다.`);
      }
      return p.school || p.title || '업무';
    }
    return false;
  }

  function restoreLastHiddenToday() {
    const { schools, pickups } = getHiddenTodaySummary();
    const all = [
      ...schools.map(s => ({ kind: 'school', id: s.id, ts: Number((s.fieldOps && s.fieldOps.updatedAt) || 0) })),
      ...pickups.map(p => ({ kind: 'pickup', id: p.id, ts: Number(p.statusUpdatedAt || (p.manualWorkflow && Date.parse(p.manualWorkflow.updatedAt)) || 0) }))
    ];
    if (!all.length) {
      toast('오늘 숨겨진 보류·재방문 대상이 없습니다.');
      return false;
    }
    all.sort((a, b) => b.ts - a.ts);
    const pick = all[0];
    const name = restoreHiddenStop(pick.kind, pick.id);
    syncSkillChips();
    return name;
  }

  function restoreAllHiddenToday() {
    const { schools, pickups, total } = getHiddenTodaySummary();
    if (!total) {
      toast('복구할 숨김 항목이 없습니다.');
      return 0;
    }
    schools.forEach(s => restoreHiddenStop('school', s.id, { silent: true }));
    pickups.forEach(p => restoreHiddenStop('pickup', p.id, { silent: true }));
    if (typeof renderPickups === 'function') renderPickups();
    if (typeof renderList === 'function') renderList();
    if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
    if (typeof updateBgMediaAndPip === 'function') updateBgMediaAndPip();
    syncSkillChips();
    toast(`🔓 오늘 숨긴 ${total}건을 모두 팝업에 복구했습니다.`);
    return total;
  }

  const restoreDlg = document.createElement('dialog');
  restoreDlg.id = 'nkRestoreHiddenDialog';
  restoreDlg.className = 'nk-skill-dlg';
  restoreDlg.innerHTML = `
    <div class="nk-sd-head">
      <h3>🔓 오늘 팝업 숨김 복구</h3>
      <button type="button" class="nk-sd-close" data-close-restore="1">닫기</button>
    </div>
    <div class="nk-sd-body" id="nkRestoreHiddenBody"></div>
  `;
  document.body.appendChild(restoreDlg);

  function renderRestoreHiddenDialog() {
    const body = document.getElementById('nkRestoreHiddenBody');
    if (!body) return;
    const { schools, pickups, total } = getHiddenTodaySummary();
    if (!total) {
      body.innerHTML = `<div style="text-align:center;padding:24px 10px;font-size:13px;opacity:0.8">오늘 보류·재방문으로 숨겨진 항목이 없습니다.</div>`;
      return;
    }
    const rows = [];
    schools.forEach(s => {
      const f = s.fieldOps || {};
      const sub = [f.deliveryStatus, f.reason, f.revisitDate ? `재방문 ${f.revisitDate}` : ''].filter(Boolean).join(' · ');
      rows.push(`
        <div class="nk-restore-card">
          <div style="min-width:0;flex:1">
            <div style="font-size:14px;font-weight:900">${s.order}. ${esc(s.name)} <span style="font-size:11px;opacity:0.75">(${esc(s.subRegion || '')})</span></div>
            <div style="font-size:12px;opacity:0.82;margin-top:2px">${esc(sub || '오늘 팝업 숨김')}</div>
          </div>
          <button type="button" class="nk-restore-btn" data-restore-kind="school" data-restore-id="${s.id}">🔓 복구</button>
        </div>
      `);
    });
    pickups.forEach(p => {
      const wf = p.manualWorkflow || {};
      const st = wf.status === 'hold' ? '보류' : wf.status === 'revisit' ? '재방문' : (p.fieldStatus || '보류');
      const sub = [p.type || '회수', st, p.items || p.title || '', p.fieldRevisitDate ? `재방문 ${p.fieldRevisitDate}` : ''].filter(Boolean).join(' · ');
      rows.push(`
        <div class="nk-restore-card">
          <div style="min-width:0;flex:1">
            <div style="font-size:14px;font-weight:900">↩️ ${esc(p.school || p.title || '회수·추가 업무')}</div>
            <div style="font-size:12px;opacity:0.82;margin-top:2px">${esc(sub)}</div>
          </div>
          <button type="button" class="nk-restore-btn" data-restore-kind="pickup" data-restore-id="${esc(p.id)}">🔓 복구</button>
        </div>
      `);
    });
    body.innerHTML = `
      <div style="font-size:12px;opacity:0.85">실수로 보류·재방문을 누른 원이나 업무를 1탭으로 팝업창에 바로 되돌립니다.</div>
      ${rows.join('')}
      <div class="nk-sd-row" style="margin-top:4px;justify-content:flex-end">
        <button type="button" class="nk-sd-pill amber" data-restore-all="1">🔓 전체 복구 (${total}건)</button>
      </div>
    `;
  }

  function openRestoreHiddenDialog() {
    renderRestoreHiddenDialog();
    if (typeof restoreDlg.showModal === 'function') restoreDlg.showModal();
    else restoreDlg.setAttribute('open', '');
  }

  restoreDlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-restore]')) { restoreDlg.close(); return; }
    const one = e.target.closest('[data-restore-kind]');
    if (one) {
      restoreHiddenStop(one.getAttribute('data-restore-kind'), one.getAttribute('data-restore-id'));
      syncSkillChips();
      const left = getHiddenTodaySummary().total;
      if (!left) restoreDlg.close();
      else renderRestoreHiddenDialog();
      return;
    }
    if (e.target.closest('[data-restore-all]')) {
      restoreAllHiddenToday();
      restoreDlg.close();
    }
  });

  // =========================================================================
  // SKILL #1: 🚀 출발 모드 (1탭: GPS + 화면유지 + 미니팝업 + 첫 목적지 길안내)
  // =========================================================================
  async function startDepartureMode() {
    const b = bridge();
    if (b.startGps) {
      try { b.startGps(); } catch (e) {}
    } else if (typeof startGpsTracking === 'function') {
      try { startGpsTracking(); } catch (e) {}
    }
    if (b.enableWakeLock) {
      try { await b.enableWakeLock(); } catch (e) {}
    }
    if (b.startBgKeepAlive) {
      try { b.startBgKeepAlive(true); } catch (e) {}
    } else if (typeof startBgKeepAlive === 'function') {
      try { startBgKeepAlive(true); } catch (e) {}
    }

    const target = b.getOverlayTarget ? b.getOverlayTarget() : (typeof getBestPipTarget === 'function' ? getBestPipTarget() : null);
    if (!target) {
      toast('🎉 오늘 남은 납품·회수 목적지가 없습니다!');
      return false;
    }

    if (target.kind === 'delivery' && target.school) {
      if (typeof setNaviLockedSchool === 'function') setNaviLockedSchool(target.school.id, { skipRender: true });
      if (typeof speakSchoolQuantity === 'function') {
        try { speakSchoolQuantity(target.school); } catch (e) {}
      }
    } else if (target.kind === 'pickup' && target.pickupGroup && target.pickupGroup.items && target.pickupGroup.items[0]) {
      if (typeof setNaviLockedPickup === 'function') setNaviLockedPickup(target.pickupGroup.items[0].id, { skipRender: true });
    }

    let overlayOk = true;
    if (b.openOverlayForDeparture) {
      try { overlayOk = b.openOverlayForDeparture() !== false; } catch (e) {}
    } else if (typeof openPopupModeWithScreenOff === 'function') {
      try { openPopupModeWithScreenOff(); } catch (e) {}
    }

    if (!overlayOk) {
      // Android overlay permission prompt opened; do not immediately jump to Naver Navi
      return false;
    }

    const label = target.kind === 'delivery'
      ? target.school.name
      : (target.pickupGroup && target.pickupGroup.name) || '목적지';
    toast(`🚀 출발 모드 시작! [${label}] 미니팝업 + 길안내를 실행합니다.`);

    setTimeout(() => {
      if (target.kind === 'delivery' && target.school && b.openNaviToSchool) {
        b.openNaviToSchool(target.school);
      } else if (target.kind === 'pickup' && target.pickupGroup && target.pickupGroup.items && target.pickupGroup.items[0] && b.openNaviToPickup) {
        b.openNaviToPickup(target.pickupGroup.items[0]);
      }
    }, 280);
    return true;
  }

  // =========================================================================
  // SKILL #4: 🎙️ 음성 메모 입력 + 핸즈프리 주행 음성 명령
  // =========================================================================
  const SpeechRecCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  // 4A) 음성 메모 입력 (메모창·사유창·회수메모창에 🎙️ 마이크 버튼 자동 부착)
  let memoRec = null;
  let memoRecBtn = null;

  function stopMemoDictation() {
    if (memoRec) {
      try { memoRec.stop(); } catch (e) {}
      memoRec = null;
    }
    if (memoRecBtn) {
      memoRecBtn.classList.remove('recording');
      memoRecBtn.textContent = '🎙️ 음성 입력';
      memoRecBtn = null;
    }
  }

  function startMemoDictation(targetEl, btnEl) {
    if (!SpeechRecCtor) {
      toast('이 브라우저에서는 음성 인식을 지원하지 않습니다. 키보드 마이크 버튼을 이용해 주세요.');
      return;
    }
    if (memoRec && memoRecBtn === btnEl) {
      stopMemoDictation();
      return;
    }
    if (voiceCmdActive) stopVoiceCommandMode(true);
    stopMemoDictation();

    const baseVal = String(targetEl.value || '').trim();
    const rec = new SpeechRecCtor();
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    memoRec = rec;
    memoRecBtn = btnEl;
    btnEl.classList.add('recording');
    btnEl.textContent = '🔴 듣는 중...';

    let finalText = '';
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const chunk = ev.results[i][0] ? ev.results[i][0].transcript : '';
        if (ev.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      const spoken = (finalText + interim).trim();
      if (spoken) {
        targetEl.value = baseVal ? `${baseVal} ${spoken}` : spoken;
        targetEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    rec.onerror = (ev) => {
      const code = ev && ev.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        toast('마이크 권한이 거부되었습니다. 기기 설정에서 마이크 권한을 허용해 주세요.');
      } else if (code !== 'no-speech' && code !== 'aborted') {
        toast('음성 인식 중 오류가 발생했습니다. 다시 시도해 주세요.');
      }
      stopMemoDictation();
    };
    rec.onend = () => {
      if (finalText.trim()) toast(`🎙️ 음성 메모 입력 완료: "${finalText.trim().slice(0, 26)}"`);
      stopMemoDictation();
    };

    try {
      rec.start();
    } catch (e) {
      stopMemoDictation();
      toast('음성 인식을 시작할 수 없습니다.');
    }
  }

  function attachVoiceButtonToField(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field || field.dataset.nkVoiceAttached === '1') return;
    field.dataset.nkVoiceAttached = '1';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nk-mic-inline-btn';
    btn.textContent = '🎙️ 음성 입력';
    btn.title = '말해서 바로 메모 입력';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startMemoDictation(field, btn);
    });

    const label = document.querySelector(`label[for="${fieldId}"]`) || field.closest('label');
    if (label && label !== field) {
      if (label.contains(field)) {
        field.before(btn);
      } else {
        label.appendChild(btn);
      }
    } else {
      field.before(btn);
    }

    const dlg = field.closest('dialog');
    if (dlg && dlg.dataset.nkVoiceCloseHook !== '1') {
      dlg.dataset.nkVoiceCloseHook = '1';
      dlg.addEventListener('close', stopMemoDictation);
    }
  }

  function scanVoiceMemoFields() {
    ['nkMemoInput', 'nkMemoReasonInput', 'rwNote', 'opsMemo', 'opsReason'].forEach(attachVoiceButtonToField);
  }

  // 4B) 핸즈프리 음성 명령 모드
  let voiceCmdActive = false;
  let voiceCmdRec = null;
  let voiceCmdRestartTimer = null;
  let voicePendingCompleteUntil = 0;
  let voicePendingCompleteName = '';

  const voiceBar = document.createElement('div');
  voiceBar.id = 'nkVoiceCmdBar';
  voiceBar.setAttribute('role', 'status');
  voiceBar.innerHTML = `
    <div class="nk-vc-top">
      <span><span class="nk-vc-dot"></span>🎙️ 핸즈프리 음성 명령 듣는 중</span>
      <button type="button" class="nk-vc-stop" id="nkVoiceCmdStopBtn">⏹ 끄기</button>
    </div>
    <div class="nk-vc-heard" id="nkVoiceCmdHeard">명령을 말씀해 주세요...</div>
    <div class="nk-vc-hints">말하기: "읽어줘" · "다음" · "보류" · "재방문" · "길안내" · "복구" · "완료"→"확인" · "종료"</div>
  `;
  document.body.appendChild(voiceBar);

  function setVoiceHeardText(txt) {
    const el = document.getElementById('nkVoiceCmdHeard');
    if (el) el.textContent = txt;
  }

  function speakVoiceFeedback(text) {
    if (typeof speakDeliveryText === 'function') {
      try { speakDeliveryText(text, { force: true }); } catch (e) {}
    }
  }

  function handleVoiceCommandPhrase(rawText) {
    const clean = String(rawText || '').trim();
    if (!clean) return false;
    const norm = clean.replace(/\s+/g, '');
    setVoiceHeardText(`🗣️ "${clean}"`);

    const now = Date.now();
    // 2단계 완료 확인 대기 중
    if (voicePendingCompleteUntil > now) {
      if (/^(확인|네|예|응|맞아|완료확인|처리해)/.test(norm) || norm.includes('완료확인')) {
        voicePendingCompleteUntil = 0;
        const doneName = voicePendingCompleteName;
        voicePendingCompleteName = '';
        if (typeof window.onNativeOverlayCompleteTarget === 'function') {
          window.onNativeOverlayCompleteTarget();
        }
        toast(`✅ 음성 확인 완료: ${doneName || '현재 목적지'}`);
        return true;
      }
      if (/(취소|아니|그만)/.test(norm)) {
        voicePendingCompleteUntil = 0;
        voicePendingCompleteName = '';
        toast('음성 완료 요청을 취소했습니다.');
        speakVoiceFeedback('완료 요청을 취소했습니다.');
        return true;
      }
    }

    if (/(음성종료|명령종료|음성꺼|꺼줘|종료|중지|그만)/.test(norm)) {
      stopVoiceCommandMode(false);
      return true;
    }
    if (/(수량|읽어|몇개|알려|안내|다시)/.test(norm)) {
      if (typeof window.onNativeOverlaySpeakTarget === 'function') window.onNativeOverlaySpeakTarget();
      return true;
    }
    if (/(다음|넘겨|스킵|패스)/.test(norm)) {
      if (typeof window.onNativeOverlayNextTarget === 'function') window.onNativeOverlayNextTarget();
      const next = bridge().getOverlayTarget ? bridge().getOverlayTarget() : null;
      const nm = next ? (next.kind === 'delivery' ? next.school?.name : next.pickupGroup?.name) : '';
      if (nm) speakVoiceFeedback(`다음 목적지 ${nm}입니다.`);
      return true;
    }
    if (norm.includes('보류')) {
      if (typeof window.onNativeOverlayQuickStatus === 'function') window.onNativeOverlayQuickStatus('보류');
      speakVoiceFeedback('보류 처리하고 오늘 팝업에서 숨겼습니다.');
      syncSkillChips();
      return true;
    }
    if (/(재방문|부재)/.test(norm)) {
      if (typeof window.onNativeOverlayQuickStatus === 'function') window.onNativeOverlayQuickStatus('재방문');
      speakVoiceFeedback('재방문 처리하고 오늘 팝업에서 숨겼습니다.');
      syncSkillChips();
      return true;
    }
    if (/(길안내|내비|네비|출발)/.test(norm)) {
      const cur = bridge().getOverlayTarget ? bridge().getOverlayTarget() : null;
      if (cur && cur.kind === 'delivery' && cur.school && bridge().openNaviToSchool) {
        bridge().openNaviToSchool(cur.school);
        speakVoiceFeedback(`${cur.school.name} 길안내를 시작합니다.`);
      } else if (cur && cur.kind === 'pickup' && cur.pickupGroup?.items?.[0] && bridge().openNaviToPickup) {
        bridge().openNaviToPickup(cur.pickupGroup.items[0]);
        speakVoiceFeedback(`${cur.pickupGroup.name} 길안내를 시작합니다.`);
      } else {
        toast('길안내할 목적지가 없습니다.');
      }
      return true;
    }
    if (/(복구|되돌려|숨김해제)/.test(norm)) {
      const restored = restoreLastHiddenToday();
      if (restored) speakVoiceFeedback(`${restored} 팝업 표시를 복구했습니다.`);
      return true;
    }
    if (norm.includes('완료')) {
      const cur = bridge().getOverlayTarget ? bridge().getOverlayTarget() : null;
      const nm = cur ? (cur.kind === 'delivery' ? cur.school?.name : cur.pickupGroup?.name) : '';
      if (!nm) {
        toast('완료할 목적지가 없습니다.');
        return true;
      }
      voicePendingCompleteUntil = Date.now() + 7000;
      voicePendingCompleteName = nm;
      setVoiceHeardText(`⚠️ "${nm}" 완료할까요? 7초 안에 "확인"이라고 말하세요`);
      speakVoiceFeedback(`${nm} 납품 완료할까요? 7초 안에 확인이라고 말해주세요.`);
      return true;
    }
    return false;
  }

  function scheduleVoiceCmdRestart(delayMs) {
    clearTimeout(voiceCmdRestartTimer);
    if (!voiceCmdActive) return;
    voiceCmdRestartTimer = setTimeout(() => {
      if (voiceCmdActive) startVoiceCmdRecognizer();
    }, delayMs);
  }

  function startVoiceCmdRecognizer() {
    if (!voiceCmdActive || !SpeechRecCtor) return;
    if (voiceCmdRec) {
      try { voiceCmdRec.abort(); } catch (e) {}
      voiceCmdRec = null;
    }
    const rec = new SpeechRecCtor();
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    voiceCmdRec = rec;

    let matched = false;
    rec.onresult = (ev) => {
      let interim = '';
      let finalStr = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const txt = ev.results[i][0] ? ev.results[i][0].transcript : '';
        if (ev.results[i].isFinal) finalStr += txt;
        else interim += txt;
      }
      if (interim && !finalStr) setVoiceHeardText(`🎧 ${interim}`);
      if (finalStr.trim() && !matched) {
        matched = handleVoiceCommandPhrase(finalStr.trim());
      }
    };
    rec.onerror = (ev) => {
      const code = ev && ev.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        toast('마이크 권한이 필요해 음성 명령을 종료합니다.');
        stopVoiceCommandMode(true);
        return;
      }
      if (voiceCmdActive) scheduleVoiceCmdRestart(code === 'no-speech' ? 450 : 1200);
    };
    rec.onend = () => {
      voiceCmdRec = null;
      if (voiceCmdActive) {
        // Give TTS a short window if a command just spoke
        scheduleVoiceCmdRestart(matched ? 1800 : 350);
      }
    };
    try {
      rec.start();
    } catch (e) {
      if (voiceCmdActive) scheduleVoiceCmdRestart(1000);
    }
  }

  function startVoiceCommandMode() {
    if (!SpeechRecCtor) {
      toast('이 브라우저/앱 환경에서는 핸즈프리 음성 인식을 지원하지 않습니다.');
      return false;
    }
    stopMemoDictation();
    voiceCmdActive = true;
    voicePendingCompleteUntil = 0;
    voiceBar.classList.add('open');
    setVoiceHeardText('명령을 말씀해 주세요... (예: 읽어줘, 다음, 보류)');
    syncSkillChips();
    startVoiceCmdRecognizer();
    toast('🎙️ 핸즈프리 음성 명령이 켜졌습니다.');
    return true;
  }

  function stopVoiceCommandMode(silent) {
    voiceCmdActive = false;
    voicePendingCompleteUntil = 0;
    voicePendingCompleteName = '';
    clearTimeout(voiceCmdRestartTimer);
    if (voiceCmdRec) {
      try { voiceCmdRec.abort(); } catch (e) {}
      voiceCmdRec = null;
    }
    voiceBar.classList.remove('open');
    syncSkillChips();
    if (!silent) toast('⏹ 핸즈프리 음성 명령을 종료했습니다.');
  }

  function toggleVoiceCommandMode() {
    if (voiceCmdActive) stopVoiceCommandMode(false);
    else startVoiceCommandMode();
  }

  document.getElementById('nkVoiceCmdStopBtn')?.addEventListener('click', () => stopVoiceCommandMode(false));

  // =========================================================================
  // SKILL #5: 📦 출발 전 "차량 적재 요약" 원터치 시트
  // =========================================================================
  const loadDlg = document.createElement('dialog');
  loadDlg.id = 'nkLoadSummaryDialog';
  loadDlg.className = 'nk-skill-dlg';
  loadDlg.innerHTML = `
    <div class="nk-sd-head">
      <h3>📦 출발 전 차량 적재 요약</h3>
      <button type="button" class="nk-sd-close" data-close-load="1">닫기</button>
    </div>
    <div class="nk-sd-body" id="nkLoadSummaryBody"></div>
  `;
  document.body.appendChild(loadDlg);

  const loadState = {
    scope: 'auto', // 'course' | 'all' | 'auto'
    excludeHidden: true,
    reverseOrder: true,
    selectedKeys: new Set(),  // 'prod:<name>' | 'extra:<name>' (empty = all)
    selectedSteps: new Set(), // 1 | 2 | 3 | 4 (empty = all)
    roleFilter: 'all'         // 'all' | 'student' | 'teacher'
  };

  function isLoadItemChecked(checks, it) {
    if (!checks || !it) return false;
    if (Object.prototype.hasOwnProperty.call(checks, it.itemCheckKey)) {
      return !!checks[it.itemCheckKey];
    }
    return !!(it.legacyParentKey && checks[it.legacyParentKey]);
  }

  function hasActiveLoadFilter() {
    return loadState.selectedKeys.size > 0 || loadState.selectedSteps.size > 0 || loadState.roleFilter !== 'all';
  }

  function matchesLoadFilter(it) {
    if (loadState.selectedKeys.size > 0 && !loadState.selectedKeys.has(it.filterKey)) return false;
    if (loadState.selectedSteps.size > 0) {
      if (it.role === 'extra') {
        if (!loadState.selectedKeys.has(it.filterKey)) return false;
      } else if (!loadState.selectedSteps.has(it.step)) {
        return false;
      }
    }
    if (loadState.roleFilter === 'student' && it.role !== 'student') return false;
    if (loadState.roleFilter === 'teacher' && it.role !== 'teacher') return false;
    return true;
  }

  function collectLoadSummaryData() {
    const comp = getCompleted();
    const cSet = getTodayCourseSet();
    const useCourse = (loadState.scope === 'course') || (loadState.scope === 'auto' && cSet.size > 0);
    const isHidS = (s) => loadState.excludeHidden && typeof window.isSchoolHiddenInPopupToday === 'function' && window.isSchoolHiddenInPopupToday(s);
    const isHidP = (p) => loadState.excludeHidden && typeof window.isPickupHiddenInPopupToday === 'function' && window.isPickupHiddenInPopupToday(p);

    let schools = getSchools().filter(s => !comp[s.id] && !isHidS(s));
    if (useCourse && cSet.size > 0) {
      schools = schools.filter(s => cSet.has(Number(s.id)));
    }

    const rankMap = typeof window.nkGetRouteRank === 'function' ? window.nkGetRouteRank(schools) : null;
    schools = [...schools].sort((a, b) => {
      if (rankMap && rankMap.has(a.id) && rankMap.has(b.id)) return rankMap.get(a.id) - rankMap.get(b.id);
      return (a.order || 0) - (b.order || 0);
    });

    const availableProducts = new Map(); // filterKey -> { filterKey, name, q:[0,0,0,0], t:[0,0,0,0], total }
    const availableExtras = new Map();   // filterKey -> { filterKey, name, total }
    const stepSums = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const teacherSums = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const allStepSums = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const allTeacherSums = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let grandBoxTotal = 0;

    const recordAvailable = (it) => {
      if (it.role === 'extra') {
        const cur = availableExtras.get(it.filterKey) || { filterKey: it.filterKey, name: it.productName, total: 0 };
        cur.total += it.qty;
        availableExtras.set(it.filterKey, cur);
      } else {
        const cur = availableProducts.get(it.filterKey) || { filterKey: it.filterKey, name: it.productName, q: [0, 0, 0, 0], t: [0, 0, 0, 0], total: 0 };
        if (it.role === 'student') {
          cur.q[it.step - 1] += it.qty;
          allStepSums[it.step] += it.qty;
        } else if (it.role === 'teacher') {
          cur.t[it.step - 1] += it.qty;
          allTeacherSums[it.step] += it.qty;
        }
        cur.total += it.qty;
        availableProducts.set(it.filterKey, cur);
      }
    };

    const rawStops = [];

    schools.forEach((s, visitIdx) => {
      const fDel = (s.fieldOps && s.fieldOps.delivered) || {};
      const rem = (keys, raw) => {
        const total = Math.max(0, Number(raw) || 0);
        let done = 0;
        for (const k of keys) {
          if (fDel[k] !== undefined && fDel[k] !== null) {
            done = Math.max(0, Number(fDel[k]) || 0);
            break;
          }
        }
        return Math.max(0, total - done);
      };

      const stopItems = [];
      const mainProdName = String(s.product || '정규 교재').trim() || '정규 교재';
      for (let n = 1; n <= 4; n++) {
        const qv = rem([`q${n}`], s[`q${n}`]);
        if (qv > 0) {
          stopItems.push({
            itemCheckKey: `s:${s.id}:q${n}`,
            legacyParentKey: `s:${s.id}`,
            filterKey: `prod:${mainProdName}`,
            productName: mainProdName,
            step: n,
            role: 'student',
            label: `${mainProdName} ${n}단계`,
            qty: qv
          });
        }
        const tv = rem([`t${n}`], s[`t${n}`]);
        if (tv > 0) {
          stopItems.push({
            itemCheckKey: `s:${s.id}:t${n}`,
            legacyParentKey: `s:${s.id}`,
            filterKey: `prod:${mainProdName}`,
            productName: mainProdName,
            step: n,
            role: 'teacher',
            label: `${mainProdName} ${n}단계 교사용`,
            qty: tv
          });
        }
      }

      const more = Array.isArray(s.moreProducts) ? s.moreProducts : [];
      more.forEach((mp, mi) => {
        const mpName = String(mp.name || '추가 상품').trim() || '추가 상품';
        const pIdx = mi + 1;
        for (let n = 1; n <= 4; n++) {
          const mqv = rem([`p${pIdx}:q${n}`, `mp${mi}_q${n}`], mp[`q${n}`]);
          if (mqv > 0) {
            stopItems.push({
              itemCheckKey: `s:${s.id}:p${pIdx}:q${n}`,
              legacyParentKey: `s:${s.id}`,
              filterKey: `prod:${mpName}`,
              productName: mpName,
              step: n,
              role: 'student',
              label: `${mpName} ${n}단계`,
              qty: mqv
            });
          }
          const mtv = rem([`p${pIdx}:t${n}`, `mp${mi}_t${n}`], mp[`t${n}`]);
          if (mtv > 0) {
            stopItems.push({
              itemCheckKey: `s:${s.id}:p${pIdx}:t${n}`,
              legacyParentKey: `s:${s.id}`,
              filterKey: `prod:${mpName}`,
              productName: mpName,
              step: n,
              role: 'teacher',
              label: `${mpName} ${n}단계 교사용`,
              qty: mtv
            });
          }
        }
      });

      const normExtras = typeof normalizeExtras === 'function' ? normalizeExtras(s.extras) : (Array.isArray(s.extras) ? s.extras : []);
      normExtras.forEach((ex, ei) => {
        const exName = String(ex.name || '추가교구').trim() || '추가교구';
        const eq = rem([`x:${exName}`, `ex${ei}`], ex.qty || 1);
        if (eq > 0) {
          stopItems.push({
            itemCheckKey: `s:${s.id}:x:${exName}`,
            legacyParentKey: `s:${s.id}`,
            filterKey: `extra:${exName}`,
            productName: exName,
            step: null,
            role: 'extra',
            label: `➕ ${exName}`,
            qty: eq
          });
        }
      });

      stopItems.forEach(recordAvailable);
      rawStops.push({
        checkKey: 's:' + s.id,
        visitOrder: visitIdx + 1,
        isExtra: false,
        name: s.name,
        sub: `${s.regionGroup || ''} ${s.subRegion || ''}`.trim(),
        allItems: stopItems
      });
    });

    const allPickups = getPickups().filter(p => p && !p.done && !(typeof pkIsHiddenDup === 'function' && pkIsHiddenDup(p)) && !isHidP(p));
    const returnPickups = [];
    let extraIdx = 0;
    allPickups.forEach(p => {
      const gMode = typeof pkGroupOf === 'function' ? pkGroupOf(p) : 'return';
      if (gMode === 'extra') {
        if (useCourse && cSet.size > 0 && p.schoolId && !cSet.has(Number(p.schoolId))) return;
        const fqs = typeof normalizeFieldQuantities === 'function' ? normalizeFieldQuantities(p.fieldQuantities, false) : [];
        const pItems = [];
        if (fqs.length) {
          fqs.forEach((q, qi) => {
            const rq = Math.max(0, (Number(q.qty) || 0) - (Number(q.done) || 0));
            if (rq > 0) {
              const lbl = String(q.label || '추가납품').trim();
              pItems.push({
                itemCheckKey: `p:${p.id}:${qi}`,
                legacyParentKey: `p:${p.id}`,
                filterKey: `extra:${lbl}`,
                productName: lbl,
                step: null,
                role: 'extra',
                label: `➕ ${lbl}`,
                qty: rq
              });
            }
          });
        } else {
          const pQty = Math.max(0, Number(p.qty) || 0);
          const lbl = String(p.items || p.title || p.type || '추가납품').trim();
          pItems.push({
            itemCheckKey: `p:${p.id}:0`,
            legacyParentKey: `p:${p.id}`,
            filterKey: `extra:${lbl}`,
            productName: lbl,
            step: null,
            role: 'extra',
            label: `➕ ${lbl}`,
            qty: pQty > 0 ? pQty : 1,
            qtyUnknown: !(pQty > 0)
          });
        }
        pItems.forEach(recordAvailable);
        extraIdx += 1;
        rawStops.push({
          checkKey: 'p:' + p.id,
          visitOrder: schools.length + extraIdx,
          isExtra: true,
          name: p.school || p.title || '추가 납품',
          sub: p.type || '추가납품',
          allItems: pItems
        });
      } else {
        returnPickups.push(p);
      }
    });

    // Drop stale selectedKeys no longer present in current scope
    const validKeys = new Set([...availableProducts.keys(), ...availableExtras.keys()]);
    [...loadState.selectedKeys].forEach(k => { if (!validKeys.has(k)) loadState.selectedKeys.delete(k); });

    const filteredActive = hasActiveLoadFilter();
    const stopRows = [];
    const filteredProductMap = new Map();
    const filteredExtrasMap = new Map();

    rawStops.forEach(st => {
      const visibleItems = st.allItems.filter(matchesLoadFilter);
      if (filteredActive && !visibleItems.length) return;
      if (!filteredActive && !st.allItems.length) {
        // Keep school with 0 numeric qty only when no item filter is active
        stopRows.push({
          ...st,
          items: [],
          summary: '수량 확인 필요',
          qty: 0
        });
        return;
      }
      const itemsToUse = filteredActive ? visibleItems : st.allItems;
      let stopQty = 0;
      itemsToUse.forEach(it => {
        const q = it.qtyUnknown ? 0 : it.qty;
        stopQty += q;
        grandBoxTotal += q;
        if (it.role === 'student') {
          stepSums[it.step] += q;
          const pr = filteredProductMap.get(it.productName) || { name: it.productName, q: [0, 0, 0, 0], t: [0, 0, 0, 0], total: 0 };
          pr.q[it.step - 1] += q;
          pr.total += q;
          filteredProductMap.set(it.productName, pr);
        } else if (it.role === 'teacher') {
          teacherSums[it.step] += q;
          const pr = filteredProductMap.get(it.productName) || { name: it.productName, q: [0, 0, 0, 0], t: [0, 0, 0, 0], total: 0 };
          pr.t[it.step - 1] += q;
          pr.total += q;
          filteredProductMap.set(it.productName, pr);
        } else {
          filteredExtrasMap.set(it.productName, (filteredExtrasMap.get(it.productName) || 0) + q);
        }
      });
      stopRows.push({
        ...st,
        items: itemsToUse,
        summary: itemsToUse.map(it => `${it.label} ${it.qtyUnknown ? '' : it.qty + '개'}`.trim()).join(' · '),
        qty: stopQty
      });
    });

    const orderedStops = loadState.reverseOrder ? [...stopRows].reverse() : stopRows;
    const allVisibleItems = orderedStops.flatMap(r => r.items);

    return {
      useCourse,
      courseCount: cSet.size,
      filteredActive,
      stepSums,
      teacherSums,
      allStepSums,
      allTeacherSums,
      availableProducts: [...availableProducts.values()],
      availableExtras: [...availableExtras.values()],
      products: [...filteredProductMap.values()],
      extras: [...filteredExtrasMap.entries()],
      grandBoxTotal,
      stopRows: orderedStops,
      allVisibleItems,
      totalStops: orderedStops.length,
      returnPickups
    };
  }

  function buildLoadPlainText(data) {
    const lines = [];
    const filterTag = data.filteredActive ? ' · 선택 품목 필터' : '';
    lines.push(`[차량 적재 요약 · ${todayKey()}] (${data.useCourse ? '오늘 코스' : '전체 미완료'}${filterTag} · ${data.totalStops}곳 · 총 ${data.grandBoxTotal}개)`);
    const stepStr = [1, 2, 3, 4]
      .filter(n => data.stepSums[n] > 0 || data.teacherSums[n] > 0)
      .map(n => `${n}단계 ${data.stepSums[n]}${data.teacherSums[n] ? `(교사 ${data.teacherSums[n]})` : ''}`)
      .join(' / ');
    if (stepStr) lines.push(`■ 단계 합계: ${stepStr}`);
    if (data.extras.length) {
      lines.push(`■ 추가 교구·납품: ${data.extras.map(([k, v]) => `${k} ${v}`).join(', ')}`);
    }
    lines.push(`■ 적재 순서 (${loadState.reverseOrder ? '방문 역순 · 마지막 원 먼저' : '방문 정순'}):`);
    data.stopRows.forEach((r, idx) => {
      lines.push(`${idx + 1}. ${r.name} — ${r.summary}`);
    });
    if (data.returnPickups.length) {
      lines.push(`■ 현장 회수·반품 참고 (${data.returnPickups.length}건, 싣지 않음):`);
      data.returnPickups.slice(0, 10).forEach(p => lines.push(`- ${p.school || ''}: ${p.items || p.title || ''}`));
    }
    return lines.join('\n');
  }

  function renderLoadSummaryDialog() {
    const body = document.getElementById('nkLoadSummaryBody');
    if (!body) return;
    const data = collectLoadSummaryData();
    const checks = loadCheckMap();
    const totalItemCnt = data.allVisibleItems.length;
    const checkedItemCnt = data.allVisibleItems.filter(it => isLoadItemChecked(checks, it)).length;
    const doneStopsCnt = data.stopRows.filter(r => r.items.length > 0 && r.items.every(it => isLoadItemChecked(checks, it))).length;
    const pct = totalItemCnt ? Math.round((checkedItemCnt / totalItemCnt) * 100) : 0;

    // Multi-select clickable item filter chips (products + extras)
    const prodChipHtml = data.availableProducts.map(pr => {
      const sel = loadState.selectedKeys.has(pr.filterKey);
      return `<button type="button" class="nk-load-filter-chip ${sel ? 'is-selected' : ''}" data-load-item-key="${esc(pr.filterKey)}" aria-pressed="${sel}">${sel ? '✓ ' : ''}📚 ${esc(pr.name)} <strong>${pr.total}</strong></button>`;
    }).join('');
    const extraChipHtml = data.availableExtras.map(ex => {
      const sel = loadState.selectedKeys.has(ex.filterKey);
      return `<button type="button" class="nk-load-filter-chip is-extra ${sel ? 'is-selected' : ''}" data-load-item-key="${esc(ex.filterKey)}" aria-pressed="${sel}">${sel ? '✓ ' : ''}➕ ${esc(ex.name)} <strong>${ex.total}</strong></button>`;
    }).join('');

    const cardsHtml = data.stopRows.length
      ? data.stopRows.map((r, idx) => {
          const itemCnt = r.items.length;
          const ckCnt = r.items.filter(it => isLoadItemChecked(checks, it)).length;
          const allCk = itemCnt > 0 && ckCnt === itemCnt;
          const badgeTxt = loadState.reverseOrder
            ? `${idx + 1}번 적재 (방문 ${r.visitOrder}번)`
            : `방문 ${r.visitOrder}번`;
          const itemRowsHtml = r.items.length
            ? `<div class="nk-load-item-grid">${r.items.map(it => {
                const on = isLoadItemChecked(checks, it);
                const roleCls = it.role === 'teacher' ? 'is-teacher' : (it.role === 'extra' ? 'is-extra' : '');
                return `
                  <label class="nk-load-item-row ${on ? 'is-on' : ''} ${roleCls}">
                    <input type="checkbox" data-load-item-ck="${esc(it.itemCheckKey)}" data-load-parent-key="${esc(it.legacyParentKey)}" ${on ? 'checked' : ''}>
                    <span class="nk-load-item-lbl">${esc(it.label)}</span>
                    <strong class="nk-load-item-qty">${it.qtyUnknown ? '확인' : it.qty + '개'}</strong>
                  </label>
                `;
              }).join('')}</div>`
            : `<div class="nk-load-items-line">${esc(r.summary)}</div>`;

          return `
            <div class="nk-load-card ${allCk ? 'checked' : ''} ${r.isExtra ? 'is-extra' : ''}" data-load-stop-card="${esc(r.checkKey)}">
              <div class="nk-load-card-head">
                <label class="nk-load-card-title-wrap">
                  <input type="checkbox" data-load-stop-ck="${esc(r.checkKey)}" ${allCk ? 'checked' : ''}>
                  <div style="min-width:0;flex:1">
                    <span class="nk-load-order-badge">${esc(badgeTxt)}</span>
                    <strong style="font-size:14.5px">${r.isExtra ? '➕ ' : ''}${esc(r.name)}</strong>
                    ${r.sub ? `<span style="font-size:11px;opacity:.7;margin-left:4px">${esc(r.sub)}</span>` : ''}
                  </div>
                </label>
                <span class="nk-load-stop-stat ${allCk ? 'done' : ''}">${ckCnt}/${itemCnt}</span>
              </div>
              ${itemRowsHtml}
            </div>
          `;
        }).join('')
      : `<div style="text-align:center;padding:22px 10px;font-size:13px;opacity:.75">선택한 조건에 해당하는 적재 품목이 없습니다.</div>`;

    const retHtml = data.returnPickups.length
      ? `<div class="nk-load-sec-title" style="color:#fda4af">↩️ 현장 회수·반품 참고 (${data.returnPickups.length}건 · 실을 물건 아님)</div>
         <div class="nk-load-tags">${data.returnPickups.map(p => `<div class="nk-load-tag">${esc(p.school || '')} · ${esc(p.type || '회수')}: ${esc(p.items || p.title || '')}</div>`).join('')}</div>`
      : '';

    body.innerHTML = `
      <div class="nk-sd-row">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button type="button" class="nk-sd-pill ${data.useCourse ? 'active' : ''}" data-load-scope="course" ${data.courseCount ? '' : 'disabled style="opacity:.45"'}>⭐ 오늘 코스 (${data.courseCount}곳)</button>
          <button type="button" class="nk-sd-pill ${!data.useCourse ? 'active' : ''}" data-load-scope="all">📋 전체 미완료</button>
        </div>
        <label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:800;cursor:pointer">
          <input type="checkbox" id="nkLoadExcludeHiddenCk" ${loadState.excludeHidden ? 'checked' : ''} style="width:16px;height:16px;accent-color:#f59e0b">
          보류·재방문 제외
        </label>
      </div>

      <div class="nk-load-filter-box">
        <div class="nk-sd-row" style="margin-bottom:6px">
          <span class="nk-load-sec-title" style="margin:0">🎯 적재할 품목 선택 (원하는 품목만 탭 · 다중 선택)</span>
          ${data.filteredActive ? `<button type="button" class="nk-sd-pill amber" style="padding:4px 9px;font-size:11px" data-load-clear-filter="1">✕ 전체 품목 보기</button>` : ''}
        </div>
        <div class="nk-load-tags">
          <button type="button" class="nk-load-filter-chip ${!data.filteredActive ? 'is-selected' : ''}" data-load-clear-filter="1">전체 품목</button>
          ${prodChipHtml}
          ${extraChipHtml}
        </div>
        <div class="nk-sd-row" style="margin-top:8px;gap:6px">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button type="button" class="nk-sd-pill ${loadState.roleFilter === 'all' ? 'active' : ''}" style="padding:5px 9px;font-size:11px" data-load-role="all">학생·교사 전체</button>
            <button type="button" class="nk-sd-pill ${loadState.roleFilter === 'student' ? 'active' : ''}" style="padding:5px 9px;font-size:11px" data-load-role="student">🎒 학생용만</button>
            <button type="button" class="nk-sd-pill ${loadState.roleFilter === 'teacher' ? 'active' : ''}" style="padding:5px 9px;font-size:11px" data-load-role="teacher">👩‍🏫 교사용만</button>
          </div>
          <span style="font-size:11px;opacity:.75">아래 단계 박스도 탭해 필터</span>
        </div>
      </div>

      <div class="nk-load-hero">
        <div>
          <div class="nk-load-big">총 ${data.grandBoxTotal.toLocaleString()}개</div>
          <div class="nk-load-sub">${data.filteredActive ? '선택 품목 ' : ''}${data.totalStops}곳 · 품목 상차 ${checkedItemCnt}/${totalItemCnt} (${pct}% · ${doneStopsCnt}곳 완료)</div>
        </div>
        <button type="button" class="nk-sd-pill green" data-load-copy="1">📋 상차표 복사</button>
      </div>

      <div class="nk-load-steps">
        ${[1, 2, 3, 4].map(n => {
          const stepSel = loadState.selectedSteps.has(n);
          return `
            <button type="button" class="nk-load-step-box nk-load-step-btn ${stepSel ? 'is-selected' : ''}" data-load-step="${n}" aria-pressed="${stepSel}">
              <span>${stepSel ? '✓ ' : ''}${n}단계</span>
              <strong>${data.stepSums[n]}</strong>
              <small>교사 ${data.teacherSums[n]}</small>
            </button>
          `;
        }).join('')}
      </div>

      <div class="nk-sd-row" style="margin-top:2px">
        <button type="button" class="nk-sd-pill ${loadState.reverseOrder ? 'amber' : ''}" data-load-toggle-order="1">
          ${loadState.reverseOrder ? '📦 방문 역순 (마지막 원 먼저 적재) ⇄' : '🚚 방문 정순 보기 ⇄'}
        </button>
        <div style="display:flex;gap:6px">
          <button type="button" class="nk-sd-pill green" data-load-check-all="1">✓ ${data.filteredActive ? '선택 품목' : '전체'} 체크</button>
          <button type="button" class="nk-sd-pill" data-load-reset="1">↺ ${data.filteredActive ? '선택 해제' : '초기화'}</button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">${cardsHtml}</div>
      ${retHtml}
    `;
  }

  function openLoadSummaryDialog() {
    renderLoadSummaryDialog();
    if (typeof loadDlg.showModal === 'function') loadDlg.showModal();
    else loadDlg.setAttribute('open', '');
  }

  function expandLegacyParentIfNeeded(map, parentKey, allStopItems) {
    if (!parentKey || !map[parentKey]) return;
    (allStopItems || []).forEach(it => {
      if (!Object.prototype.hasOwnProperty.call(map, it.itemCheckKey)) {
        map[it.itemCheckKey] = true;
      }
    });
    delete map[parentKey];
  }

  loadDlg.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close-load]')) { loadDlg.close(); return; }
    const sc = e.target.closest('[data-load-scope]');
    if (sc && !sc.disabled) {
      loadState.scope = sc.getAttribute('data-load-scope');
      renderLoadSummaryDialog();
      return;
    }
    const itemChip = e.target.closest('[data-load-item-key]');
    if (itemChip) {
      const k = itemChip.getAttribute('data-load-item-key');
      if (loadState.selectedKeys.has(k)) loadState.selectedKeys.delete(k);
      else loadState.selectedKeys.add(k);
      renderLoadSummaryDialog();
      return;
    }
    const stepBtn = e.target.closest('[data-load-step]');
    if (stepBtn) {
      const n = Number(stepBtn.getAttribute('data-load-step'));
      if (loadState.selectedSteps.has(n)) loadState.selectedSteps.delete(n);
      else loadState.selectedSteps.add(n);
      renderLoadSummaryDialog();
      return;
    }
    const roleBtn = e.target.closest('[data-load-role]');
    if (roleBtn) {
      loadState.roleFilter = roleBtn.getAttribute('data-load-role') || 'all';
      renderLoadSummaryDialog();
      return;
    }
    if (e.target.closest('[data-load-clear-filter]')) {
      loadState.selectedKeys.clear();
      loadState.selectedSteps.clear();
      loadState.roleFilter = 'all';
      renderLoadSummaryDialog();
      return;
    }
    if (e.target.closest('[data-load-toggle-order]')) {
      loadState.reverseOrder = !loadState.reverseOrder;
      renderLoadSummaryDialog();
      return;
    }
    if (e.target.closest('[data-load-check-all]')) {
      const data = collectLoadSummaryData();
      const map = loadCheckMap();
      data.allVisibleItems.forEach(it => { map[it.itemCheckKey] = true; });
      saveCheckMap(map);
      renderLoadSummaryDialog();
      toast(`✅ ${data.filteredActive ? '선택한 ' : ''}${data.allVisibleItems.length}개 품목을 상차 완료로 체크했습니다.`);
      return;
    }
    if (e.target.closest('[data-load-reset]')) {
      const data = collectLoadSummaryData();
      if (data.filteredActive) {
        const map = loadCheckMap();
        data.stopRows.forEach(st => expandLegacyParentIfNeeded(map, st.checkKey, st.allItems));
        data.allVisibleItems.forEach(it => { delete map[it.itemCheckKey]; });
        saveCheckMap(map);
        renderLoadSummaryDialog();
        toast(`선택한 ${data.allVisibleItems.length}개 품목의 상차 체크를 해제했습니다.`);
      } else {
        saveCheckMap({});
        renderLoadSummaryDialog();
        toast('상차 체크를 초기화했습니다.');
      }
      return;
    }
    if (e.target.closest('[data-load-copy]')) {
      const txt = buildLoadPlainText(collectLoadSummaryData());
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(txt);
        } else if (typeof fallbackCopyTextToClipboard === 'function') {
          fallbackCopyTextToClipboard(txt);
        }
        toast('📋 차량 적재 요약표를 클립보드에 복사했습니다.');
      } catch (err) {
        if (typeof fallbackCopyTextToClipboard === 'function') fallbackCopyTextToClipboard(txt);
        toast('📋 차량 적재 요약표를 복사했습니다.');
      }
    }
  });

  loadDlg.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'nkLoadExcludeHiddenCk') {
      loadState.excludeHidden = !!e.target.checked;
      renderLoadSummaryDialog();
      return;
    }
    const itemCk = e.target && e.target.getAttribute && e.target.getAttribute('data-load-item-ck');
    if (itemCk) {
      const parentKey = e.target.getAttribute('data-load-parent-key') || '';
      const map = loadCheckMap();
      if (parentKey && map[parentKey]) {
        const data = collectLoadSummaryData();
        const st = data.stopRows.find(r => r.checkKey === parentKey);
        expandLegacyParentIfNeeded(map, parentKey, st ? st.allItems : []);
      }
      if (e.target.checked) map[itemCk] = true;
      else delete map[itemCk];
      saveCheckMap(map);
      renderLoadSummaryDialog();
      return;
    }
    const stopCk = e.target && e.target.getAttribute && e.target.getAttribute('data-load-stop-ck');
    if (stopCk) {
      const data = collectLoadSummaryData();
      const st = data.stopRows.find(r => r.checkKey === stopCk);
      if (st) {
        const map = loadCheckMap();
        expandLegacyParentIfNeeded(map, st.checkKey, st.allItems);
        st.items.forEach(it => {
          if (e.target.checked) map[it.itemCheckKey] = true;
          else delete map[it.itemCheckKey];
        });
        saveCheckMap(map);
        renderLoadSummaryDialog();
      }
    }
  });

  // =========================================================================
  // TOOLBAR INTEGRATION & LIVE SYNC
  // =========================================================================
  function ensureToolbarSkillButtons() {
    const tb = document.getElementById('nkProToolbar');
    if (!tb || document.getElementById('nkDepartureModeBtn')) return;

    const depBtn = document.createElement('button');
    depBtn.id = 'nkDepartureModeBtn';
    depBtn.type = 'button';
    depBtn.className = 'nk-skill-go';
    depBtn.textContent = '🚀 1탭 출발';
    depBtn.title = 'GPS 켜기 + 화면유지 + 미니팝업 + 첫 목적지 길안내를 한 번에 시작';
    depBtn.addEventListener('click', () => startDepartureMode());

    const loadBtn = document.createElement('button');
    loadBtn.id = 'nkLoadSummaryBtn';
    loadBtn.type = 'button';
    loadBtn.className = 'nk-skill-load';
    loadBtn.textContent = '📦 적재 요약';
    loadBtn.title = '출발 전 단계별·품목별 총합 및 방문 역순 상차 체크';
    loadBtn.addEventListener('click', () => openLoadSummaryDialog());

    const voiceBtn = document.createElement('button');
    voiceBtn.id = 'nkVoiceCmdBtn';
    voiceBtn.type = 'button';
    voiceBtn.className = 'nk-skill-voice';
    voiceBtn.textContent = '🎙️ 음성 명령';
    voiceBtn.title = '주행 중 핸즈프리 음성 명령 (읽어줘·다음·보류·재방문·길안내)';
    voiceBtn.addEventListener('click', () => toggleVoiceCommandMode());

    const restoreBtn = document.createElement('button');
    restoreBtn.id = 'nkRestoreHiddenChipBtn';
    restoreBtn.type = 'button';
    restoreBtn.className = 'nk-skill-restore';
    restoreBtn.style.display = 'none';
    restoreBtn.textContent = '🔓 숨김 0건 복구';
    restoreBtn.addEventListener('click', () => openRestoreHiddenDialog());

    tb.prepend(restoreBtn);
    tb.prepend(voiceBtn);
    tb.prepend(loadBtn);
    tb.prepend(depBtn);
  }

  function syncSkillChips() {
    ensureToolbarSkillButtons();
    const hiddenTotal = getHiddenTodaySummary().total;
    const rBtn = document.getElementById('nkRestoreHiddenChipBtn');
    if (rBtn) {
      rBtn.style.display = hiddenTotal > 0 ? '' : 'none';
      rBtn.textContent = `🔓 숨김 ${hiddenTotal}건 복구`;
    }
    const vBtn = document.getElementById('nkVoiceCmdBtn');
    if (vBtn) {
      vBtn.classList.toggle('is-on', voiceCmdActive);
      vBtn.textContent = voiceCmdActive ? '🔴 음성 듣는 중' : '🎙️ 음성 명령';
    }
    const fhVoice = document.querySelector('#nkFocusHero [data-fh-skill="voice"]');
    if (fhVoice) {
      fhVoice.classList.toggle('on', voiceCmdActive);
      fhVoice.textContent = voiceCmdActive ? '🔴 음성 듣는 중' : '🎙️ 음성 명령';
    }
    const fhRestore = document.querySelector('#nkFocusHero [data-fh-skill="restore"]');
    if (fhRestore) {
      fhRestore.style.display = hiddenTotal > 0 ? '' : 'none';
      fhRestore.textContent = `🔓 숨김 ${hiddenTotal}건 복구`;
    }
  }

  // Expose public API for Focus Hero, overlays, and unit tests
  window.nkFieldSkills = {
    startDepartureMode,
    getHiddenTodaySummary,
    openRestoreHiddenDialog,
    restoreHiddenStop,
    restoreLastHiddenToday,
    restoreAllHiddenToday,
    toggleVoiceCommandMode,
    stopVoiceCommandMode,
    isVoiceCommandActive: () => voiceCmdActive,
    handleVoiceCommandPhrase,
    openLoadSummaryDialog,
    collectLoadSummaryData,
    buildLoadPlainText,
    setLoadFilter: ({ keys, steps, role } = {}) => {
      if (Array.isArray(keys)) { loadState.selectedKeys.clear(); keys.forEach(k => loadState.selectedKeys.add(k)); }
      if (Array.isArray(steps)) { loadState.selectedSteps.clear(); steps.forEach(n => loadState.selectedSteps.add(Number(n))); }
      if (typeof role === 'string') loadState.roleFilter = role;
    },
    clearLoadFilter: () => {
      loadState.selectedKeys.clear();
      loadState.selectedSteps.clear();
      loadState.roleFilter = 'all';
    },
    isLoadItemChecked,
    getLoadCheckMap: loadCheckMap,
    saveLoadCheckMap: saveCheckMap,
    syncSkillChips
  };

  // Hook into existing render lifecycle cleanly
  const prevDecorate = window.nkDecorateDeliveryUi;
  window.nkDecorateDeliveryUi = function (filtered) {
    if (typeof prevDecorate === 'function') {
      try { prevDecorate(filtered); } catch (e) {}
    }
    syncSkillChips();
    scanVoiceMemoFields();
  };

  // Observe dynamic dialogs (e.g. opsPanel, returnWorkflowDialog) to attach voice memo buttons
  const obs = new MutationObserver(() => {
    scanVoiceMemoFields();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Initial pass
  ensureToolbarSkillButtons();
  syncSkillChips();
  scanVoiceMemoFields();
  setTimeout(() => {
    ensureToolbarSkillButtons();
    syncSkillChips();
    scanVoiceMemoFields();
  }, 500);
})();
