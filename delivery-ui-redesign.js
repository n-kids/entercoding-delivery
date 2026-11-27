(() => {
  'use strict';
  if (window.__nkUiRedesignInstalled) return;
  window.__nkUiRedesignInstalled = true;

  const THEME_KEY = 'nk_ui_theme_v1';     // 'dark' | 'sunlight'
  const COMPACT_KEY = 'nk_ui_compact_v1'; // '0' | '1'

  const bridge = () => window.__nkBridge || {};
  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])));
  const getSchools = () => (bridge().getSchools ? bridge().getSchools() : (typeof SCHOOLS !== 'undefined' ? SCHOOLS : []));
  const getPickups = () => (bridge().getPickups ? bridge().getPickups() : (typeof PICKUPS !== 'undefined' && Array.isArray(PICKUPS) ? PICKUPS : []));
  const getCompleted = () => (bridge().getCompletedMap ? bridge().getCompletedMap() : (typeof completedMap !== 'undefined' ? completedMap : {}));

  let uiTheme = 'dark';
  let uiCompact = false;
  let lastFilteredSchools = [];
  let showStepTotals = false;
  let showManualArea = false;
  let showLegacyNavi = false;
  let showExtraControls = false;

  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'sunlight' || savedTheme === 'dark') uiTheme = savedTheme;
    uiCompact = localStorage.getItem(COMPACT_KEY) === '1';
  } catch (e) {}

  // =========================================================================
  // 1. MASTER REDESIGN STYLESHEET (Driving Focus + Compact + Sunlight Light)
  // =========================================================================
  const style = document.createElement('style');
  style.id = 'nk-ui-redesign-css';
  style.textContent = `
    /* ---- Slim Sticky Top Bar ---- */
    body.nk-redesign header {
      position: sticky;
      top: 0;
      z-index: 36;
      padding: 8px 12px !important;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      background: rgba(15, 23, 42, 0.94) !important;
    }
    body.nk-redesign header > div { gap: 6px !important; }
    body.nk-redesign #gpsStatusText {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px !important;
    }
    body.nk-redesign #opsSaveStatus { display: none !important; }
    body.nk-redesign .nk-hdr-quick {
      padding: 7px 10px;
      border-radius: 11px;
      font-size: 12px;
      font-weight: 800;
      border: 1px solid #334155;
      background: #1e293b;
      color: #f1f5f9;
      white-space: nowrap;
      line-height: 1.2;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    body.nk-redesign .nk-hdr-mini {
      background: #f59e0b !important;
      color: #020617 !important;
      border-color: #fbbf24 !important;
      font-weight: 900 !important;
    }
    body.nk-redesign .nk-hdr-quick.is-on {
      background: #2563eb;
      border-color: #60a5fa;
      color: #fff;
    }

    /* ---- Top Clutter Diet (-78% scroll to first card) ---- */
    body.nk-redesign #deliveryView > section:has(#naviLockStatusBox) { display: none; }
    body.nk-redesign.nk-show-legacy-navi #deliveryView > section:has(#naviLockStatusBox) { display: block; }
    body.nk-redesign #deliveryView > section:has(#quickAreaBar) { display: none; }
    body.nk-redesign.nk-show-manual-area #deliveryView > section:has(#quickAreaBar) { display: block; }
    body.nk-redesign #deliveryView > section:has(#statCompleted) > div.grid { display: none; }
    body.nk-redesign.nk-show-step-totals #deliveryView > section:has(#statCompleted) > div.grid { display: grid; }
    body.nk-redesign #deliveryView > section:has(#statCompleted) {
      padding: 10px 12px !important;
      border-radius: 16px !important;
    }
    body.nk-redesign #deliveryView > section:has(#statCompleted) > div:has(#regionTabs) {
      padding-top: 0 !important;
      border-top: 0 !important;
      gap: 8px !important;
    }
    body.nk-redesign #deliveryView > section:has(#statCompleted) > div:has(#regionTabs) > div:has(#radiusSelect) {
      display: none;
    }
    body.nk-redesign.nk-show-extra-controls #deliveryView > section:has(#statCompleted) > div:has(#regionTabs) > div:has(#radiusSelect) {
      display: flex;
      padding-top: 6px;
      border-top: 1px solid rgba(51, 65, 85, 0.55);
    }
    body.nk-redesign #nearestBanner { display: none !important; }
    body.nk-redesign #deliveryActionToolbar { display: none !important; }
    body.nk-redesign #deliveryPersistenceStatus,
    body.nk-redesign #pkPersistenceStatus { display: none !important; }

    /* Hide redundant top tabs on mobile/tablet where bottom 4-tab bar handles navigation */
    @media (max-width: 1023px) {
      body.nk-redesign #viewTabs { display: none !important; }
    }

    /* ---- Focus Hero Card (Progress + Next Stop) ---- */
    #nkFocusHero {
      background: linear-gradient(135deg, rgba(6, 78, 59, 0.88) 0%, rgba(15, 23, 42, 0.96) 100%);
      border: 1.5px solid rgba(16, 185, 129, 0.6);
      border-radius: 18px;
      padding: 12px 14px;
      box-shadow: 0 10px 26px -10px rgba(2, 6, 23, 0.65);
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    #nkFocusHero .fh-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      font-weight: 800;
      color: #e2e8f0;
    }
    #nkFocusHero .fh-track {
      width: 100%;
      height: 7px;
      border-radius: 999px;
      background: rgba(2, 6, 23, 0.45);
      overflow: hidden;
    }
    #nkFocusHero .fh-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #34d399, #10b981);
      transition: width 0.25s ease;
    }
    #nkFocusHero .fh-main {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    #nkFocusHero .fh-info { min-width: 0; flex: 1; }
    #nkFocusHero .fh-kicker {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      font-size: 11px;
      font-weight: 800;
    }
    #nkFocusHero .fh-pill {
      padding: 2px 7px;
      border-radius: 6px;
      background: #f59e0b;
      color: #020617;
      font-weight: 900;
    }
    #nkFocusHero .fh-name {
      font-size: 17px;
      font-weight: 900;
      color: #fff;
      line-height: 1.25;
      margin-top: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #nkFocusHero .fh-sub {
      font-size: 12px;
      color: #cbd5e1;
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #nkFocusHero .fh-actions {
      display: flex;
      gap: 6px;
      shrink: 0;
    }
    #nkFocusHero .fh-btn-navi {
      min-height: 44px;
      padding: 0 13px;
      border-radius: 12px;
      background: #03C75A;
      color: #022c22;
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
    }
    #nkFocusHero .fh-btn-done {
      min-height: 44px;
      padding: 0 12px;
      border-radius: 12px;
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid rgba(52, 211, 153, 0.55);
      color: #a7f3d0;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }
    #nkFocusHero .fh-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-top: 2px;
    }
    #nkFocusHero .fh-chip {
      padding: 4px 9px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 800;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.3);
      color: #cbd5e1;
    }
    #nkFocusHero .fh-chip.on {
      background: #2563eb;
      border-color: #60a5fa;
      color: #fff;
    }

    /* ---- Sleek Single-Row Search & Pro Strip ---- */
    body.nk-redesign #nkDeliverySearchWrap {
      margin-bottom: 6px !important;
      flex-wrap: nowrap !important;
    }
    body.nk-redesign #nkOpenReportQuickBtn { display: none !important; }
    body.nk-redesign #nkProToolbar {
      flex-wrap: nowrap !important;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      margin-bottom: 6px !important;
      padding-bottom: 2px;
    }
    body.nk-redesign #nkProToolbar::-webkit-scrollbar { display: none; }
    body.nk-redesign #nkProToolbar > * { flex-shrink: 0; }
    body.nk-redesign #nkOpenStatsQuickBtn,
    body.nk-redesign #nkOpenAssigneeMgrBtn,
    body.nk-redesign #nkOpenCoursePickerBtn { display: none; }

    /* ---- Pickup / Extra Sub-tab Switcher (Mobile/Tablet) ---- */
    #nkPickupModeSwitch {
      display: none;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      padding: 4px;
      border-radius: 14px;
      background: #0f172a;
      border: 1px solid #1e293b;
    }
    @media (max-width: 1023px) {
      body.nk-redesign #nkPickupModeSwitch { display: grid; }
    }
    #nkPickupModeSwitch button {
      min-height: 40px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 900;
      color: #94a3b8;
      background: transparent;
      transition: background 0.15s, color 0.15s;
    }
    #nkPickupModeSwitch button.is-active {
      background: #f59e0b;
      color: #020617;
    }

    /* ---- Card Cleanup: 2 Primary Buttons + ••• Sheet Trigger ---- */
    body.nk-redesign #schoolList .dc-card {
      padding: 14px 15px !important;
      border-radius: 18px !important;
    }
    body.nk-redesign #schoolList .dc-state-row {
      padding-bottom: 8px !important;
    }
    body.nk-redesign #schoolList .dc-identity {
      padding: 9px 0 8px !important;
    }
    body.nk-redesign #schoolList .dc-actions {
      padding-top: 10px !important;
    }
    body.nk-redesign #schoolList .dc-primary-actions {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.1fr) 46px !important;
      gap: 7px !important;
    }
    body.nk-redesign #schoolList .dc-navigate {
      background: #03C75A !important;
      color: #022c22 !important;
      font-weight: 900 !important;
    }
    body.nk-redesign #schoolList .dc-complete {
      background: #10b981 !important;
      border-color: #34d399 !important;
      color: #022c22 !important;
      font-weight: 900 !important;
    }
    body.nk-redesign #schoolList .dc-card[data-delivery-state=done] .dc-complete {
      background: #334155 !important;
      border-color: #475569 !important;
      color: #e2e8f0 !important;
    }
    .nk-card-more-btn {
      min-height: 46px;
      border-radius: 10px;
      background: #1e293b;
      border: 1px solid #3b4f6e;
      color: #e2e8f0;
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 1px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    @media (max-width: 767px) {
      body.nk-redesign #schoolList .dc-secondary-actions { display: none !important; }
    }

    /* ---- C안 Compact Card Mode ---- */
    .nk-compact-steps {
      display: none;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 4px;
    }
    .nk-compact-steps span {
      padding: 3px 8px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 800;
      background: #1e2d45;
      color: #fcd34d;
      border: 1px solid #354b6d;
    }
    body.nk-redesign.nk-ui-compact #schoolList .dc-card {
      padding: 11px 13px !important;
    }
    body.nk-redesign.nk-ui-compact #schoolList .dc-state-row {
      padding-bottom: 6px !important;
    }
    body.nk-redesign.nk-ui-compact #schoolList .dc-identity {
      padding: 6px 0 !important;
    }
    body.nk-redesign.nk-ui-compact #schoolList .dc-step-grid,
    body.nk-redesign.nk-ui-compact #schoolList .dc-product-table,
    body.nk-redesign.nk-ui-compact #schoolList .dc-address,
    body.nk-redesign.nk-ui-compact #schoolList .dc-product {
      display: none !important;
    }
    body.nk-redesign.nk-ui-compact #schoolList .nk-compact-steps {
      display: flex !important;
    }
    body.nk-redesign.nk-ui-compact #schoolList .dc-name h3 {
      font-size: 17px !important;
    }
    body.nk-redesign.nk-ui-compact #schoolList .dc-button,
    body.nk-redesign.nk-ui-compact .nk-card-more-btn {
      min-height: 40px !important;
      padding: 7px 6px !important;
    }

    /* ---- Bottom Sheet Styling for #arrivalModal on Mobile ---- */
    @media (max-width: 639px) {
      body.nk-redesign #arrivalModal {
        align-items: flex-end !important;
        padding: 0 !important;
      }
      body.nk-redesign #arrivalModal > div {
        border-radius: 26px 26px 0 0 !important;
        max-height: 90dvh !important;
        margin-bottom: 0 !important;
      }
    }

    /* ---- Thumb-Zone 4-Tab Bottom Navigation ---- */
    body.nk-redesign #mobileBottomDelivery,
    body.nk-redesign #mobileBottomPickup { display: none !important; }
    @media (max-width: 1023px) {
      body.nk-redesign #mobileBottomBar {
        display: block !important;
        padding: 6px 8px max(8px, env(safe-area-inset-bottom)) !important;
        background: rgba(11, 19, 34, 0.97) !important;
        border-top: 1px solid #263650 !important;
        box-shadow: 0 -8px 24px rgba(2, 6, 23, 0.45);
      }
      body.nk-redesign { padding-bottom: 84px !important; }
    }
    #nkBottomNavGrid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
      max-width: 560px;
      margin: 0 auto;
    }
    #nkBottomNavGrid button {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: 50px;
      padding: 5px 4px;
      border-radius: 13px;
      font-size: 11px;
      font-weight: 800;
      color: #94a3b8;
      background: transparent;
      transition: background 0.15s, color 0.15s;
    }
    #nkBottomNavGrid button .bn-ico { font-size: 18px; line-height: 1.1; }
    #nkBottomNavGrid button.is-active {
      background: rgba(59, 130, 246, 0.22);
      color: #93c5fd;
    }
    #nkBottomNavGrid .bn-badge {
      position: absolute;
      top: 3px;
      right: calc(50% - 22px);
      min-width: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: #f43f5e;
      color: #fff;
      font-size: 10px;
      font-weight: 900;
      line-height: 17px;
      text-align: center;
    }

    /* ---- Unified Report & Tools Bottom Sheet (#nkToolsSheet) ---- */
    #nkToolsSheet {
      width: min(560px, 100%);
      max-height: 88dvh;
      margin: auto auto 0 auto;
      padding: 18px 16px max(18px, env(safe-area-inset-bottom));
      border-radius: 24px 24px 0 0;
      border: 1px solid #3b5070;
      border-bottom: 0;
      background: #0f1b2e;
      color: #f1f5f9;
      overflow: auto;
    }
    @media (min-width: 640px) {
      #nkToolsSheet {
        margin: auto;
        border-radius: 22px;
        border-bottom: 1px solid #3b5070;
      }
    }
    #nkToolsSheet::backdrop { background: rgba(2, 6, 23, 0.72); backdrop-filter: blur(3px); }
    #nkToolsSheet .ts-handle { width: 42px; height: 4px; border-radius: 99px; background: #475569; margin: 0 auto 12px; }
    #nkToolsSheet .ts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
    #nkToolsSheet .ts-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 46px;
      padding: 10px 12px;
      border-radius: 13px;
      background: #17263d;
      border: 1px solid #2e4363;
      color: #e2e8f0;
      font-size: 12.5px;
      font-weight: 800;
      text-align: left;
    }
    #nkToolsSheet .ts-btn.primary { background: #03C75A; border-color: #03C75A; color: #022c22; font-weight: 900; justify-content: center; }
    #nkToolsSheet .ts-btn.accent { background: #2563eb; border-color: #60a5fa; color: #fff; justify-content: center; }
    #nkToolsSheet .ts-status {
      padding: 10px 12px;
      border-radius: 12px;
      background: #0b1424;
      border: 1px solid #263854;
      font-size: 11.5px;
      color: #94a3b8;
      line-height: 1.5;
      margin-top: 10px;
    }

    /* =====================================================================
       B안: 주간 햇빛 고대비(라이트) 모드 (body.nk-theme-sunlight)
       ===================================================================== */
    body.nk-redesign.nk-theme-sunlight {
      background: #eef2f7 !important;
      color: #0f172a !important;
    }
    body.nk-redesign.nk-theme-sunlight header {
      background: rgba(255, 255, 255, 0.96) !important;
      border-color: #cbd5e1 !important;
      color: #0f172a !important;
    }
    body.nk-redesign.nk-theme-sunlight header h1,
    body.nk-redesign.nk-theme-sunlight header h2 { color: #0f172a !important; }
    body.nk-redesign.nk-theme-sunlight #gpsStatusText { color: #475569 !important; }
    body.nk-redesign.nk-theme-sunlight .nk-hdr-quick,
    body.nk-redesign.nk-theme-sunlight #headerMenuBtn {
      background: #e2e8f0 !important;
      color: #0f172a !important;
      border-color: #cbd5e1 !important;
    }
    body.nk-redesign.nk-theme-sunlight .nk-hdr-quick.is-on {
      background: #2563eb !important;
      color: #fff !important;
      border-color: #1d4ed8 !important;
    }
    body.nk-redesign.nk-theme-sunlight #headerTools {
      background: #ffffff !important;
      border-color: #cbd5e1 !important;
      color: #0f172a !important;
    }
    body.nk-redesign.nk-theme-sunlight #headerTools button {
      background: #f1f5f9 !important;
      color: #0f172a !important;
      border-color: #cbd5e1 !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkFocusHero {
      background: linear-gradient(135deg, #ecfdf5 0%, #dbeafe 100%) !important;
      border-color: #059669 !important;
      box-shadow: 0 8px 22px -10px rgba(15, 23, 42, 0.18) !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkFocusHero .fh-top,
    body.nk-redesign.nk-theme-sunlight #nkFocusHero .fh-name { color: #0f172a !important; }
    body.nk-redesign.nk-theme-sunlight #nkFocusHero .fh-sub { color: #334155 !important; }
    body.nk-redesign.nk-theme-sunlight #nkFocusHero .fh-track { background: rgba(15, 23, 42, 0.14) !important; }
    body.nk-redesign.nk-theme-sunlight #nkFocusHero .fh-btn-done {
      background: #059669 !important;
      border-color: #047857 !important;
      color: #ffffff !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkFocusHero .fh-chip {
      background: #ffffff !important;
      border-color: #cbd5e1 !important;
      color: #1e293b !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkFocusHero .fh-chip.on {
      background: #2563eb !important;
      color: #fff !important;
      border-color: #1d4ed8 !important;
    }
    body.nk-redesign.nk-theme-sunlight #deliveryView > section:has(#statCompleted),
    body.nk-redesign.nk-theme-sunlight #pkHeroSection,
    body.nk-redesign.nk-theme-sunlight #pkFilterPanel,
    body.nk-redesign.nk-theme-sunlight #pickupActionToolbar,
    body.nk-redesign.nk-theme-sunlight #viewTabs,
    body.nk-redesign.nk-theme-sunlight #nkPickupModeSwitch {
      background: #ffffff !important;
      border-color: #cbd5e1 !important;
      color: #0f172a !important;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06) !important;
    }
    body.nk-redesign.nk-theme-sunlight #pkHeading,
    body.nk-redesign.nk-theme-sunlight #pkToolbarHeading { color: #0f172a !important; }
    body.nk-redesign.nk-theme-sunlight #pkSubText,
    body.nk-redesign.nk-theme-sunlight #pkWorksInfo { color: #475569 !important; }
    body.nk-redesign.nk-theme-sunlight #nkDeliverySearchInput,
    body.nk-redesign.nk-theme-sunlight #nkPickupSearchInput,
    body.nk-redesign.nk-theme-sunlight #nkProToolbar select,
    body.nk-redesign.nk-theme-sunlight #pkFilterPanel select {
      background: #ffffff !important;
      color: #0f172a !important;
      border-color: #cbd5e1 !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkProToolbar button,
    body.nk-redesign.nk-theme-sunlight #regionTabs button {
      background: #ffffff !important;
      color: #0f172a !important;
      border-color: #cbd5e1 !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkProToolbar button.active,
    body.nk-redesign.nk-theme-sunlight #regionTabs button.bg-amber-500 {
      background: #2563eb !important;
      color: #ffffff !important;
      border-color: #1d4ed8 !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkProToolbar button.star-on {
      background: #fef08a !important;
      color: #713f12 !important;
      border-color: #eab308 !important;
    }
    body.nk-redesign.nk-theme-sunlight #schoolList .dc-card,
    body.nk-redesign.nk-theme-sunlight #pkList .dc-card {
      background: #ffffff !important;
      border-color: #cbd5e1 !important;
      color: #0f172a !important;
      box-shadow: 0 3px 12px rgba(15, 23, 42, 0.08) !important;
    }
    body.nk-redesign.nk-theme-sunlight #schoolList .dc-card[data-delivery-state=done],
    body.nk-redesign.nk-theme-sunlight #pkList .dc-card[data-delivery-state=done] {
      background: #f0fdf4 !important;
      border-color: #86efac !important;
    }
    body.nk-redesign.nk-theme-sunlight #schoolList .dc-name h3,
    body.nk-redesign.nk-theme-sunlight #pkList .dc-name h3,
    body.nk-redesign.nk-theme-sunlight .dc-quantity-heading strong { color: #0f172a !important; }
    body.nk-redesign.nk-theme-sunlight .dc-meta,
    body.nk-redesign.nk-theme-sunlight .dc-address,
    body.nk-redesign.nk-theme-sunlight .dc-product,
    body.nk-redesign.nk-theme-sunlight .dc-progress { color: #475569 !important; }
    body.nk-redesign.nk-theme-sunlight .dc-state-row,
    body.nk-redesign.nk-theme-sunlight #pkList .dc-actions { border-color: #e2e8f0 !important; }
    body.nk-redesign.nk-theme-sunlight .dc-state {
      background: #e2e8f0 !important;
      color: #1e293b !important;
    }
    body.nk-redesign.nk-theme-sunlight .dc-state-done {
      background: #dcfce7 !important;
      color: #166534 !important;
    }
    body.nk-redesign.nk-theme-sunlight .dc-step {
      background: #fef3c7 !important;
      border-color: #f59e0b !important;
    }
    body.nk-redesign.nk-theme-sunlight .dc-step strong { color: #92400e !important; }
    body.nk-redesign.nk-theme-sunlight .dc-step span,
    body.nk-redesign.nk-theme-sunlight .dc-step small { color: #78350f !important; }
    body.nk-redesign.nk-theme-sunlight .dc-step-empty {
      background: #f8fafc !important;
      border-color: #e2e8f0 !important;
    }
    body.nk-redesign.nk-theme-sunlight .dc-step-empty strong,
    body.nk-redesign.nk-theme-sunlight .dc-step-empty span,
    body.nk-redesign.nk-theme-sunlight .dc-step-empty small { color: #94a3b8 !important; }
    body.nk-redesign.nk-theme-sunlight .nk-compact-steps span {
      background: #fef3c7 !important;
      color: #92400e !important;
      border-color: #f59e0b !important;
    }
    body.nk-redesign.nk-theme-sunlight .nk-card-more-btn,
    body.nk-redesign.nk-theme-sunlight #schoolList .dc-secondary,
    body.nk-redesign.nk-theme-sunlight #pkList .dc-secondary,
    body.nk-redesign.nk-theme-sunlight #schoolList .dc-edit {
      background: #f1f5f9 !important;
      color: #0f172a !important;
      border-color: #cbd5e1 !important;
    }
    body.nk-redesign.nk-theme-sunlight .dc-memo-line {
      background: #eff6ff !important;
      color: #1e40af !important;
      border-color: #93c5fd !important;
    }
    body.nk-redesign.nk-theme-sunlight .nk-badge-driver {
      background: #e2e8f0 !important;
      color: #1e293b !important;
      border-color: #cbd5e1 !important;
    }
    body.nk-redesign.nk-theme-sunlight .nk-badge-course {
      background: #eff6ff !important;
      color: #1d4ed8 !important;
      border-color: #93c5fd !important;
    }
    body.nk-redesign.nk-theme-sunlight .nk-badge-course.on {
      background: #fef08a !important;
      color: #713f12 !important;
      border-color: #eab308 !important;
    }
    body.nk-redesign.nk-theme-sunlight .nk-badge-sms {
      background: #dcfce7 !important;
      color: #166534 !important;
      border-color: #86efac !important;
    }
    body.nk-redesign.nk-theme-sunlight .nk-badge-photo {
      background: #e0e7ff !important;
      color: #3730a3 !important;
      border-color: #818cf8 !important;
    }
    body.nk-redesign.nk-theme-sunlight .nk-badge-am {
      background: #fef3c7 !important;
      color: #92400e !important;
      border-color: #f59e0b !important;
    }
    body.nk-redesign.nk-theme-sunlight #mobileBottomBar {
      background: rgba(255, 255, 255, 0.98) !important;
      border-top-color: #cbd5e1 !important;
      box-shadow: 0 -6px 20px rgba(15, 23, 42, 0.1) !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkBottomNavGrid button { color: #475569 !important; }
    body.nk-redesign.nk-theme-sunlight #nkBottomNavGrid button.is-active {
      background: #dbeafe !important;
      color: #1d4ed8 !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkToolsSheet {
      background: #ffffff !important;
      color: #0f172a !important;
      border-color: #cbd5e1 !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkToolsSheet .ts-btn {
      background: #f8fafc !important;
      border-color: #cbd5e1 !important;
      color: #0f172a !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkToolsSheet .ts-btn.primary {
      background: #03C75A !important;
      color: #022c22 !important;
      border-color: #03C75A !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkToolsSheet .ts-btn.accent {
      background: #2563eb !important;
      color: #fff !important;
      border-color: #1d4ed8 !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkToolsSheet .ts-status {
      background: #f1f5f9 !important;
      border-color: #cbd5e1 !important;
      color: #334155 !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkRevisitBanner {
      background: #fff1f2 !important;
      color: #881337 !important;
      border-color: #fb7185 !important;
    }
    body.nk-redesign.nk-theme-sunlight #nkRevisitBanner .rv-chip {
      background: #ffe4e6 !important;
      color: #9f1239 !important;
      border-color: #fda4af !important;
    }
  `;
  document.head.appendChild(style);
  document.body.classList.add('nk-redesign');

  // =========================================================================
  // 2. THEME & COMPACT MODE ENGINE (Sunlight High-Contrast + Compact Cards)
  // =========================================================================
  function applyUiModes() {
    const isSun = uiTheme === 'sunlight';
    document.body.classList.toggle('nk-theme-sunlight', isSun);
    document.body.classList.toggle('nk-ui-compact', uiCompact);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', isSun ? '#eef2f7' : '#0f172a');

    // Sync floating overlays with main app theme when auto-sync is enabled
    let ovThemeSync = true;
    try { ovThemeSync = localStorage.getItem('nk_overlay_theme_sync') !== '0'; } catch (e) {}
    if (ovThemeSync) {
      const domOv = document.getElementById('domFloatingOverlay');
      if (domOv) domOv.classList.toggle('nk-dom-light', isSun);
    }

    const tBtn = document.getElementById('nkHdrThemeBtn');
    if (tBtn) {
      tBtn.textContent = isSun ? '🌙' : '☀️';
      tBtn.title = isSun ? '야간 다크 모드로 전환' : '주간 햇빛 고대비 모드로 전환';
    }
    const cBtn = document.getElementById('nkHdrCompactBtn');
    if (cBtn) {
      cBtn.classList.toggle('is-on', uiCompact);
      cBtn.title = uiCompact ? '표준 카드로 보기' : '컴팩트 1줄 카드로 보기';
    }
    const tsTheme = document.getElementById('nkTsThemeBtn');
    if (tsTheme) tsTheme.textContent = isSun ? '🌙 야간 다크로 전환' : '☀️ 주간 햇빛 고대비';
    const tsCompact = document.getElementById('nkTsCompactBtn');
    if (tsCompact) tsCompact.textContent = uiCompact ? '📋 표준 카드로 보기' : '▦ 컴팩트 카드로 보기';
    if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
  }
  function toggleTheme() {
    uiTheme = uiTheme === 'sunlight' ? 'dark' : 'sunlight';
    try { localStorage.setItem(THEME_KEY, uiTheme); } catch (e) {}
    applyUiModes();
    if (typeof showToast === 'function') {
      showToast(uiTheme === 'sunlight' ? '☀️ 주간 햇빛 고대비 모드를 켰습니다.' : '🌙 야간 운전 다크 모드로 전환했습니다.');
    }
  }
  function toggleCompact() {
    uiCompact = !uiCompact;
    try { localStorage.setItem(COMPACT_KEY, uiCompact ? '1' : '0'); } catch (e) {}
    applyUiModes();
    if (typeof showToast === 'function') {
      showToast(uiCompact ? '▦ 컴팩트 카드 모드로 전환했습니다.' : '📋 표준 카드 모드로 전환했습니다.');
    }
  }
  window.nkToggleUiTheme = toggleTheme;
  window.nkToggleUiCompact = toggleCompact;

  // =========================================================================
  // 3. HEADER QUICK CONTROLS (☀️ 주간모드 · ▦ 컴팩트 · 🪟 미니창 · 📊 도구)
  // =========================================================================
  const menuBtn = document.getElementById('headerMenuBtn');
  if (menuBtn && menuBtn.parentElement && !document.getElementById('nkHdrThemeBtn')) {
    const mkHdrBtn = (id, text, cls, onClick) => {
      const b = document.createElement('button');
      b.id = id;
      b.type = 'button';
      b.className = 'nk-hdr-quick ' + (cls || '');
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    };
    const themeBtn = mkHdrBtn('nkHdrThemeBtn', '☀️', '', toggleTheme);
    const compactBtn = mkHdrBtn('nkHdrCompactBtn', '▦', '', toggleCompact);
    const miniBtn = mkHdrBtn('nkHdrMiniBtn', '🪟 미니창', 'nk-hdr-mini', () => {
      const pip = document.getElementById('togglePipHudBtn') || document.getElementById('bannerPipHudBtn');
      if (pip) pip.click();
    });
    const toolsBtn = mkHdrBtn('nkHdrToolsSheetBtn', '📊 도구', 'hidden lg:inline-flex', () => openToolsSheet());
    menuBtn.before(themeBtn, compactBtn, miniBtn, toolsBtn);
  }

  // =========================================================================
  // 4. FOCUS HERO CARD (#nkFocusHero) + PICKUP SUB-TAB SWITCHER
  // =========================================================================
  const deliveryView = document.getElementById('deliveryView');
  const focusHero = document.createElement('section');
  focusHero.id = 'nkFocusHero';
  focusHero.setAttribute('aria-label', '오늘 납품 진행률 및 다음 목적지');
  if (deliveryView) deliveryView.prepend(focusHero);

  const pickupView = document.getElementById('pickupView');
  const pkModeSwitch = document.createElement('div');
  pkModeSwitch.id = 'nkPickupModeSwitch';
  pkModeSwitch.innerHTML = `
    <button type="button" data-pksw="pickup">↩️ 회수·반품 <span id="nkSwPkCnt">0</span></button>
    <button type="button" data-pksw="extra">➕ 추가 납품 <span id="nkSwExCnt">0</span></button>
  `;
  if (pickupView) pickupView.prepend(pkModeSwitch);
  pkModeSwitch.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pksw]');
    if (!b) return;
    bridge().setView?.(b.getAttribute('data-pksw'));
  });

  // Search bar compact quick sort + options button
  const searchWrap = document.getElementById('nkDeliverySearchWrap');
  if (searchWrap && !document.getElementById('nkQuickSortCycleBtn')) {
    const sortBtn = document.createElement('button');
    sortBtn.id = 'nkQuickSortCycleBtn';
    sortBtn.type = 'button';
    sortBtn.className = 'nk-hdr-quick';
    sortBtn.textContent = '🧭 동선순';
    sortBtn.addEventListener('click', () => {
      const cur = bridge().getSortMode ? bridge().getSortMode() : 'order';
      if (cur === 'route') document.getElementById('sortByDistanceBtn')?.click();
      else if (cur === 'distance') document.getElementById('resetOrderBtn')?.click();
      else document.getElementById('sortByRouteBtn')?.click();
      syncQuickSortLabel();
    });
    const optBtn = document.createElement('button');
    optBtn.id = 'nkToggleExtraControlsBtn';
    optBtn.type = 'button';
    optBtn.className = 'nk-hdr-quick';
    optBtn.textContent = '⚙️';
    optBtn.title = '반경·정렬·초기화 옵션 펼치기';
    optBtn.addEventListener('click', () => {
      showExtraControls = !showExtraControls;
      document.body.classList.toggle('nk-show-extra-controls', showExtraControls);
      optBtn.classList.toggle('is-on', showExtraControls);
    });
    searchWrap.append(sortBtn, optBtn);
  }
  function syncQuickSortLabel() {
    const b = document.getElementById('nkQuickSortCycleBtn');
    if (!b) return;
    const mode = bridge().getSortMode ? bridge().getSortMode() : 'order';
    b.textContent = mode === 'route' ? '🧭 동선순' : mode === 'distance' ? '↕ 거리순' : '📋 표순';
    b.classList.toggle('is-on', mode === 'route' || mode === 'distance');
  }

  function renderFocusHero(filtered) {
    if (!focusHero) return;
    const schools = getSchools();
    const comp = getCompleted();
    const totalCount = schools.length;
    const doneCount = schools.filter(s => !!comp[s.id]).length;
    const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
    const remainQty = schools.filter(s => !comp[s.id]).reduce((acc, s) => acc + (bridge().grandTotal ? bridge().grandTotal(s) : 0), 0);

    const lock = bridge().getNaviLock ? bridge().getNaviLock() : {};
    const isHid = (s) => typeof window.isSchoolHiddenInPopupToday === 'function' && window.isSchoolHiddenInPopupToday(s);
    const lockedSchool = lock.schoolId != null ? schools.find(s => s.id === Number(lock.schoolId) && !comp[s.id] && !isHid(s)) : null;
    const pool = (Array.isArray(filtered) && filtered.length ? filtered : schools).filter(s => !comp[s.id]);
    const activePool = pool.filter(s => !isHid(s));
    const next = lockedSchool || activePool[0] || schools.find(s => !comp[s.id] && !isHid(s)) || pool[0] || schools.find(s => !comp[s.id]) || null;

    let nextHtml = '<div style="font-size:14px;font-weight:900;color:#34d399;text-align:center;padding:4px 0">🎉 모든 정규 납품이 완료되었습니다!</div>';
    if (next) {
      const distVal = bridge().distanceToSchool ? bridge().distanceToSchool(next) : null;
      const distTxt = distVal !== null && bridge().formatDistance ? bridge().formatDistance(distVal) : (next.subRegion || '');
      const qty = bridge().grandTotal ? bridge().grandTotal(next) : 0;
      const pendingPk = typeof pendingPickupsForSchool === 'function' ? pendingPickupsForSchool(next).length : 0;
      const alerts = typeof window.nkEvaluateTimeAlerts === 'function' ? window.nkEvaluateTimeAlerts(next) : {};
      const memoTxt = (next.fieldOps && next.fieldOps.memo) ? next.fieldOps.memo : (next.address || '');
      nextHtml = `
        <div class="fh-main">
          <div class="fh-info" data-fh-open="${next.id}" style="cursor:pointer">
            <div class="fh-kicker">
              <span class="fh-pill">${lockedSchool ? '🧭 길안내 중' : '다음 목적지'}</span>
              ${distTxt ? `<span style="color:#34d399">${esc(distTxt)}</span>` : ''}
              ${alerts.isUrgent ? '<span style="color:#fda4af">⏰ 마감임박</span>' : ''}
              ${pendingPk ? `<span style="color:#f472b6">↩️ 회수·추가 ${pendingPk}건</span>` : ''}
            </div>
            <div class="fh-name">${next.order}. ${esc(next.name)} · 총 ${qty}개</div>
            <div class="fh-sub">${esc(memoTxt)}</div>
          </div>
          <div class="fh-actions">
            <button type="button" class="fh-btn-navi" data-fh-navi="${next.id}">🟢 출발</button>
            <button type="button" class="fh-btn-done" data-fh-done="${next.id}">✓ 완료</button>
          </div>
        </div>
      `;
    }

    focusHero.innerHTML = `
      <div class="fh-top">
        <span>오늘 진행 <strong>${doneCount}/${totalCount}곳</strong> (${pct}%)</span>
        <span>남은 교재 <strong>${remainQty.toLocaleString()}개</strong></span>
      </div>
      <div class="fh-track"><div class="fh-fill" style="width:${pct}%"></div></div>
      ${nextHtml}
      <div class="fh-chips">
        <button type="button" class="fh-chip ${showStepTotals ? 'on' : ''}" data-fh-toggle="steps">📊 단계별 합계</button>
        <button type="button" class="fh-chip ${showManualArea ? 'on' : ''}" data-fh-toggle="area">📍 수동 동네 선택</button>
        <button type="button" class="fh-chip ${showLegacyNavi ? 'on' : ''}" data-fh-toggle="navi">🚗 대형 HUD</button>
        ${lockedSchool ? '<button type="button" class="fh-chip" data-fh-unlock="1" style="border-color:#fb7185;color:#fda4af">🔓 고정 해제</button>' : ''}
      </div>
    `;
  }

  focusHero.addEventListener('click', (e) => {
    const openEl = e.target.closest('[data-fh-open]');
    if (openEl && typeof openArrivalModal === 'function') {
      openArrivalModal(Number(openEl.getAttribute('data-fh-open')), false);
      return;
    }
    const navBtn = e.target.closest('[data-fh-navi]');
    if (navBtn) {
      const s = getSchools().find(x => x.id === Number(navBtn.getAttribute('data-fh-navi')));
      if (s && bridge().openNaviToSchool) bridge().openNaviToSchool(s);
      return;
    }
    const doneBtn = e.target.closest('[data-fh-done]');
    if (doneBtn) {
      const id = Number(doneBtn.getAttribute('data-fh-done'));
      if (typeof confirmCompleteWithPendingPickups === 'function' && !confirmCompleteWithPendingPickups(id, doneBtn)) return;
      if (typeof markSchoolCompletion === 'function') {
        markSchoolCompletion(id, true);
        if (typeof renderList === 'function') renderList();
      }
      return;
    }
    if (e.target.closest('[data-fh-unlock]')) {
      bridge().clearNaviLock?.(false);
      renderFocusHero(lastFilteredSchools);
      return;
    }
    const tgl = e.target.closest('[data-fh-toggle]')?.getAttribute('data-fh-toggle');
    if (tgl === 'steps') {
      showStepTotals = !showStepTotals;
      document.body.classList.toggle('nk-show-step-totals', showStepTotals);
      renderFocusHero(lastFilteredSchools);
    } else if (tgl === 'area') {
      showManualArea = !showManualArea;
      document.body.classList.toggle('nk-show-manual-area', showManualArea);
      renderFocusHero(lastFilteredSchools);
    } else if (tgl === 'navi') {
      showLegacyNavi = !showLegacyNavi;
      document.body.classList.toggle('nk-show-legacy-navi', showLegacyNavi);
      renderFocusHero(lastFilteredSchools);
    }
  });

  // =========================================================================
  // 5. CARD COMPACT STRIP + ••• DETAIL SHEET BUTTON + ARRIVAL MODAL COORD BTN
  // =========================================================================
  function enhanceSchoolCards(filtered) {
    const byId = new Map(getSchools().map(s => [String(s.id), s]));
    document.querySelectorAll('#schoolList [data-school-card]').forEach(card => {
      const sid = card.getAttribute('data-school-card');
      const s = byId.get(sid);
      if (!s) return;

      // Add ••• button right next to Navigate & Complete buttons
      const prim = card.querySelector('.dc-primary-actions');
      if (prim && !prim.querySelector('.nk-card-more-btn')) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'nk-card-more-btn';
        more.setAttribute('aria-label', `${s.name} 상세·전화·문자·사진·좌표`);
        more.title = '상세·전화·문자·사진·좌표';
        more.textContent = '•••';
        more.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (typeof openArrivalModal === 'function') openArrivalModal(s.id, false);
        });
        prim.appendChild(more);
      }

      // Add compact 1-line step pills for C안 compact mode
      const qtyBox = card.querySelector('.dc-quantities');
      if (qtyBox && !qtyBox.querySelector('.nk-compact-steps')) {
        const parts = bridge().stepLabelParts ? bridge().stepLabelParts(s) : [];
        const strip = document.createElement('div');
        strip.className = 'nk-compact-steps';
        strip.innerHTML = (parts.length ? parts : ['수량 확인']).map(p => `<span>${esc(p)}</span>`).join('');
        qtyBox.appendChild(strip);
      }
    });
    lastFilteredSchools = Array.isArray(filtered) ? filtered : getSchools();
    renderFocusHero(lastFilteredSchools);
    syncQuickSortLabel();
    syncBottomNavState();
  }

  // Chain cleanly onto nkDecorateDeliveryUi & nkOnArrivalModalOpen
  const prevDecorate = window.nkDecorateDeliveryUi;
  window.nkDecorateDeliveryUi = function (filtered) {
    if (typeof prevDecorate === 'function') prevDecorate(filtered);
    enhanceSchoolCards(filtered);
  };

  const prevArrivalOpen = window.nkOnArrivalModalOpen;
  window.nkOnArrivalModalOpen = function (school) {
    if (typeof prevArrivalOpen === 'function') prevArrivalOpen(school);
    if (!school) return;
    const memoBtn = document.getElementById('modalMemoEditBtn');
    const bar = memoBtn && memoBtn.parentElement;
    if (bar && !document.getElementById('nkModalCalibBtn')) {
      const calBtn = document.createElement('button');
      calBtn.id = 'nkModalCalibBtn';
      calBtn.type = 'button';
      calBtn.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-amber-200 border border-slate-700';
      calBtn.textContent = '📍 위치 저장';
      calBtn.addEventListener('click', () => {
        const cardBtn = document.querySelector(`#schoolList [data-action="calibrate"][data-id="${school.id}"]`);
        if (cardBtn) cardBtn.click();
        else if (typeof openGeoModal === 'function') openGeoModal(school.id, { autoSearch: true });
      });
      bar.appendChild(calBtn);
    }
  };

  // =========================================================================
  // 6. THUMB-ZONE 4-TAB BOTTOM NAVIGATION + TOOLS HUB SHEET (#nkToolsSheet)
  // =========================================================================
  const mobileBar = document.getElementById('mobileBottomBar');
  if (mobileBar && !document.getElementById('nkBottomNavGrid')) {
    const grid = document.createElement('div');
    grid.id = 'nkBottomNavGrid';
    grid.innerHTML = `
      <button type="button" data-bn="delivery"><span class="bn-ico">📦</span><span>납품</span></button>
      <button type="button" data-bn="map"><span class="bn-ico">🗺️</span><span>동선지도</span></button>
      <button type="button" data-bn="pickup"><span class="bn-ico">↩️</span><span>회수·추가</span><span id="nkBnPkBadge" class="bn-badge" style="display:none">0</span></button>
      <button type="button" data-bn="tools"><span class="bn-ico">📊</span><span>보고·도구</span></button>
    `;
    mobileBar.appendChild(grid);
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bn]');
      if (!b) return;
      const tab = b.getAttribute('data-bn');
      if (tab === 'delivery') bridge().setView?.('delivery');
      else if (tab === 'map') window.nkOpenOverviewMap?.();
      else if (tab === 'pickup') {
        const vs = bridge().getViewState ? bridge().getViewState() : {};
        bridge().setView?.(vs.pkMode === 'extra' ? 'extra' : 'pickup');
      } else if (tab === 'tools') openToolsSheet();
      syncBottomNavState();
    });
  }

  function syncBottomNavState() {
    const vs = bridge().getViewState ? bridge().getViewState() : { currentView: 'delivery', pkMode: 'return' };
    const pickups = getPickups();
    let pkPending = 0, exPending = 0;
    pickups.forEach(p => {
      if (!p || p.done) return;
      if (typeof pkGroupOf === 'function' && pkGroupOf(p) === 'extra') exPending++;
      else pkPending++;
    });
    const totalPending = pkPending + exPending;
    const badge = document.getElementById('nkBnPkBadge');
    if (badge) {
      badge.textContent = String(totalPending);
      badge.style.display = totalPending > 0 ? '' : 'none';
    }
    const swPk = document.getElementById('nkSwPkCnt');
    const swEx = document.getElementById('nkSwExCnt');
    if (swPk) swPk.textContent = `(${pkPending})`;
    if (swEx) swEx.textContent = `(${exPending})`;
    pkModeSwitch.querySelectorAll('[data-pksw]').forEach(btn => {
      const k = btn.getAttribute('data-pksw');
      const on = (k === 'extra' && vs.pkMode === 'extra') || (k === 'pickup' && vs.pkMode !== 'extra');
      btn.classList.toggle('is-active', on);
    });
    document.querySelectorAll('#nkBottomNavGrid [data-bn]').forEach(btn => {
      const k = btn.getAttribute('data-bn');
      const on = (k === 'delivery' && vs.currentView !== 'pickup') || (k === 'pickup' && vs.currentView === 'pickup');
      btn.classList.toggle('is-active', on);
    });
  }
  window.nkOnViewChanged = function () { syncBottomNavState(); };

  // Unified Report & Tools Bottom Sheet
  const toolsSheet = document.createElement('dialog');
  toolsSheet.id = 'nkToolsSheet';
  toolsSheet.setAttribute('aria-label', '보고 및 현장 도구');
  toolsSheet.innerHTML = `
    <div class="ts-handle"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
      <h2 style="font-size:17px;font-weight:900;margin:0">📊 보고 · 현장 도구</h2>
      <button type="button" data-ts-close style="width:34px;height:34px;border-radius:99px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;font-weight:900">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button type="button" class="ts-btn primary" data-ts-act="report">📋 오늘 결과 요약 · 웍스 보고</button>
      <button type="button" class="ts-btn accent" data-ts-act="stats">📊 주간·월간 실적 (CSV)</button>
    </div>
    <div class="ts-grid">
      <button type="button" class="ts-btn" data-ts-act="route">🧭 통합 최단 동선</button>
      <button type="button" class="ts-btn" data-ts-act="map">🗺️ 전체 동선 지도</button>
      <button type="button" class="ts-btn" data-ts-act="course">⭐ 오늘 방문 코스</button>
      <button type="button" class="ts-btn" data-ts-act="assignee">👥 담당 기사 배정</button>
      <button type="button" class="ts-btn" data-ts-act="items">📦 품목별 적재 확인</button>
      <button type="button" class="ts-btn" data-ts-act="import">📥 납품표 불러오기</button>
      <button type="button" class="ts-btn" data-ts-act="edit">✏️ 원 추가 · 전체 관리</button>
      <button type="button" class="ts-btn" data-ts-act="master">📚 원 마스터 DB</button>
      <button type="button" class="ts-btn" data-ts-act="sync">☁️ 기기 실시간 공유</button>
      <button type="button" class="ts-btn" data-ts-act="settings">⚙️ 운행·음성·전체 설정</button>
      <button type="button" class="ts-btn" id="nkTsThemeBtn" data-ts-act="theme">☀️ 주간 햇빛 고대비</button>
      <button type="button" class="ts-btn" id="nkTsCompactBtn" data-ts-act="compact">▦ 컴팩트 카드로 보기</button>
    </div>
    <div id="nkTsSaveMirror" class="ts-status">저장 · 동기화 상태 확인 중...</div>
  `;
  document.body.appendChild(toolsSheet);

  function openToolsSheet() {
    applyUiModes();
    const loc = document.getElementById('psLocal')?.textContent || '';
    const cld = document.getElementById('psCloud')?.textContent || '';
    const mir = document.getElementById('nkTsSaveMirror');
    if (mir) mir.textContent = `기기 저장: ${loc || '확인됨'}  |  서버 동기화: ${cld || '대기 중'}`;
    toolsSheet.showModal();
  }
  window.nkOpenToolsSheet = openToolsSheet;

  toolsSheet.addEventListener('click', (e) => {
    if (e.target === toolsSheet || e.target.closest('[data-ts-close]')) { toolsSheet.close(); return; }
    const act = e.target.closest('[data-ts-act]')?.getAttribute('data-ts-act');
    if (!act) return;
    if (act === 'theme') { toggleTheme(); return; }
    if (act === 'compact') { toggleCompact(); return; }
    toolsSheet.close();
    if (act === 'report') window.nkOpenDailyReport?.();
    else if (act === 'stats') window.nkOpenStatsDialog?.();
    else if (act === 'route') document.getElementById('nkOpenUnifiedRouteBtn')?.click();
    else if (act === 'map') window.nkOpenOverviewMap?.();
    else if (act === 'course') document.getElementById('nkOpenCoursePickerBtn')?.click();
    else if (act === 'assignee') document.getElementById('nkOpenAssigneeMgrBtn')?.click();
    else if (act === 'items') document.getElementById('openItemsModalBtn')?.click();
    else if (act === 'import') document.getElementById('openImportModalBtn')?.click();
    else if (act === 'edit') document.getElementById('openEditModalBtn')?.click();
    else if (act === 'master') document.getElementById('nkHeaderMasterBtn')?.click();
    else if (act === 'sync') document.getElementById('openSyncModalBtn')?.click();
    else if (act === 'settings') {
      const hb = document.getElementById('headerMenuBtn');
      const ht = document.getElementById('headerTools');
      if (hb && ht && ht.classList.contains('hidden')) hb.click();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // Refresh pickup badges whenever #pkList changes
  const pkBox = document.getElementById('pkList');
  if (pkBox && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => syncBottomNavState()).observe(pkBox, { childList: true });
  }

  // Initial render
  applyUiModes();
  try { enhanceSchoolCards(getSchools()); } catch (e) {}
})();
