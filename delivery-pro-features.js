(() => {
  'use strict';
  if (window.__nkProFeaturesInstalled) return;
  window.__nkProFeaturesInstalled = true;

  const MASTER_KEY = 'nk_school_master_v1';
  const COURSE_KEY = 'nk_today_course_v1';
  const PHOTO_KEY = 'nk_delivery_photos_v1';
  const MY_DRIVER_KEY = 'nk_my_driver_v1';
  const ORDER_QUEUE_KEY = 'nk_order_sync_queue_v1';
  const DAY_LOG_KEY = 'nk_daily_result_log_v1';
  const PHOTO_KEEP_DAYS = 30;
  const PHOTO_MAX_COUNT = 36;

  const bridge = () => window.__nkBridge || {};
  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])));
  const getSchools = () => (bridge().getSchools ? bridge().getSchools() : (typeof SCHOOLS !== 'undefined' ? SCHOOLS : []));
  const getPickups = () => (bridge().getPickups ? bridge().getPickups() : (typeof PICKUPS !== 'undefined' && Array.isArray(PICKUPS) ? PICKUPS : []));
  const getCompleted = () => (bridge().getCompletedMap ? bridge().getCompletedMap() : (typeof completedMap !== 'undefined' ? completedMap : {}));
  const getCustomCoords = () => (bridge().getCustomCoords ? bridge().getCustomCoords() : (typeof customCoords !== 'undefined' ? customCoords : {}));
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const dayKeyOf = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const shiftDay = (key, delta) => {
    const [y, m, d] = key.split('-').map(Number);
    return dayKeyOf(new Date(y, m - 1, d + delta).getTime());
  };
  const fmtHm = (ms) => {
    if (!ms) return '';
    try { return new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  };
  const toast = (msg) => { if (typeof showToast === 'function') showToast(msg); };
  const haversine = (lat1, lng1, lat2, lng2) => {
    if (typeof computeHaversineMeters === 'function') return computeHaversineMeters(lat1, lng1, lat2, lng2);
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const fmtDist = (m) => (m == null || !isFinite(m) ? '' : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
  const normSchoolKey = (name) => String(name || '')
    .replace(/\s+/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/^(고양시립|김포시립|파주시립|시립|국공립|구립|사립|법인|직장)/, '')
    .replace(/(병설유치원|유치원|어린이집)$/, '')
    .toLowerCase();

  // ---- CSS ----
  const style = document.createElement('style');
  style.id = 'nk-pro-features-css';
  style.textContent = `
    #nkProToolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:10px}
    #nkProToolbar button,#nkProToolbar select{min-height:36px;padding:5px 10px;border-radius:10px;font-size:12px;font-weight:800;border:1px solid #354b69;background:#132136;color:#e2e8f0;white-space:nowrap}
    #nkProToolbar button.active{background:#4f46e5;border-color:#818cf8;color:#fff}
    #nkProToolbar button.star-on{background:#854d0e;border-color:#facc15;color:#fef08a}
    #nkProToolbar select{background:#0e1b2e;color:#e2e8f0;font-weight:700}
    #nkRevisitBanner{display:none;flex-direction:column;gap:8px;margin-bottom:10px;padding:11px 13px;border-radius:14px;background:linear-gradient(135deg,#3b1d2e,#1e1b33);border:1.5px solid #f43f5e;color:#ffe4e6}
    #nkRevisitBanner.open{display:flex}
    #nkRevisitBanner .rv-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;font-size:13px;font-weight:900}
    #nkRevisitBanner .rv-chips{display:flex;flex-wrap:wrap;gap:6px}
    #nkRevisitBanner .rv-chip{padding:4px 9px;border-radius:8px;background:rgba(244,63,94,.22);border:1px solid rgba(251,113,133,.5);color:#fff1f2;font-size:11px;font-weight:800}
    #nkDetourBanner{display:none;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;padding:10px 12px;border-radius:13px;background:#1e1b4b;border:1.5px solid #818cf8;color:#e0e7ff;font-size:12px;font-weight:700}
    #nkDetourBanner.open{display:flex;flex-wrap:wrap}
    .nk-pro-badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
    .nk-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:7px;font-size:11px;font-weight:800;line-height:1.35}
    .nk-badge-am{background:#451a03;color:#fde68a;border:1px solid #f59e0b}
    .nk-badge-urgent{background:#7f1d1d;color:#fecaca;border:1px solid #f87171;animation:nkPulse 1.4s infinite}
    .nk-badge-pm{background:#0c4a6e;color:#bae6fd;border:1px solid #38bdf8}
    .nk-badge-avoid{background:#4c0519;color:#fda4af;border:1px solid #fb7185}
    .nk-badge-driver{background:#1e293b;color:#cbd5e1;border:1px solid #475569}
    .nk-badge-photo{background:#312e81;color:#c7d2fe;border:1px solid #818cf8;cursor:pointer}
    .nk-badge-course{background:#172554;color:#93c5fd;border:1px solid #3b82f6;cursor:pointer}
    .nk-badge-course.on{background:#713f12;color:#fef08a;border-color:#facc15}
    .nk-badge-sms{background:#064e3b;color:#a7f3d0;border:1px solid #10b981;cursor:pointer}
    @keyframes nkPulse{0%,100%{opacity:1}50%{opacity:.55}}
    .nk-pro-dialog{width:min(760px,calc(100% - 20px));max-height:92dvh;overflow:auto;padding:18px;border-radius:20px;border:1px solid #445874;background:#0f1b2d;color:#f1f5f9}
    .nk-pro-dialog::backdrop{background:rgba(2,6,23,.78);backdrop-filter:blur(3px)}
    .nk-pro-dialog h2{font-size:18px;font-weight:900;margin:0 0 4px}
    .nk-pro-dialog .sub{font-size:12px;color:#94a3b8;margin:0 0 12px}
    .nk-pro-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
    .nk-pro-close{min-width:34px;min-height:34px;border-radius:99px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;font-weight:900}
    .nk-pill-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
    .nk-pill-bar button{min-height:34px;padding:4px 10px;border-radius:9px;font-size:12px;font-weight:800;background:#17253b;color:#cbd5e1;border:1px solid #334b6b}
    .nk-pill-bar button[aria-pressed=true],.nk-pill-bar button.on{background:#2563eb;color:#fff;border-color:#60a5fa}
    #nkOverviewMapCanvas{width:100%;height:min(58dvh,460px);border-radius:14px;border:1px solid #334155;background:#0b1322;z-index:1}
    .nk-map-pin{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;font-size:12px;font-weight:900;color:#fff;border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.45)}
    .nk-map-pin.am{border-color:#facc15;box-shadow:0 0 0 2px #f59e0b,0 3px 10px rgba(0,0,0,.5)}
    .nk-map-pin.done{opacity:.55;background:#475569!important}
    .nk-route-item{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:12px;background:#16243a;border:1px solid #2b3f5e;margin-bottom:7px}
    .nk-route-item.am{border-color:#f59e0b}
    .nk-route-num{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:999px;font-size:12px;font-weight:900;background:#2563eb;color:#fff;margin-right:6px}
    .nk-route-actions{display:flex;gap:5px;flex-shrink:0}
    .nk-route-actions button{min-height:34px;padding:4px 9px;border-radius:8px;font-size:11px;font-weight:800;border:1px solid #3b5272;background:#1e314b;color:#e2e8f0}
    .nk-route-actions .navi{background:#03C75A;color:#022c22;border-color:#03C75A}
    .nk-route-actions .done{background:#10b981;color:#022c22;border-color:#10b981}
    .nk-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:10px}
    .nk-photo-card{border-radius:12px;overflow:hidden;border:1px solid #334155;background:#16243a;display:flex;flex-direction:column}
    .nk-photo-card img{width:100%;height:110px;object-fit:cover;cursor:zoom-in}
    .nk-photo-card .meta{padding:6px 8px;font-size:11px;color:#cbd5e1;display:flex;flex-direction:column;gap:4px}
    .nk-photo-card .acts{display:flex;gap:4px}
    .nk-photo-card .acts button{flex:1;padding:4px;border-radius:7px;font-size:11px;font-weight:700;background:#24354e;color:#e2e8f0;border:1px solid #3d5270}
    .nk-kpi-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}
    @media(min-width:560px){.nk-kpi-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
    .nk-kpi{padding:11px;border-radius:13px;background:#16243a;border:1px solid #2d4261}
    .nk-kpi small{display:block;font-size:11px;color:#94a3b8;font-weight:700}
    .nk-kpi b{display:block;font-size:20px;font-weight:900;color:#fff;margin-top:2px}
    .nk-bar-row{display:grid;grid-template-columns:76px 1fr 78px;align-items:center;gap:8px;font-size:11px;margin-bottom:5px}
    .nk-bar-track{height:14px;border-radius:7px;background:#18263b;overflow:hidden}
    .nk-bar-fill{height:100%;border-radius:7px;background:linear-gradient(90deg,#38bdf8,#10b981)}
    .nk-sms-tpl{width:100%;text-align:left;padding:9px 11px;border-radius:10px;background:#16243a;border:1px solid #334b6b;color:#e2e8f0;font-size:12px;font-weight:700;margin-bottom:6px}
    .nk-sms-tpl:hover,.nk-sms-tpl.on{border-color:#10b981;background:#0f2e28}
    .nk-master-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px;border-radius:11px;background:#16243a;border:1px solid #2b3f5e;margin-bottom:6px;font-size:12px}
  `;
  document.head.appendChild(style);

  // =========================================================================
  // STATE: 오늘 코스 / 담당자 필터 / 재방문 필터 / 원 마스터 / 증빙 사진 / 주문앱 큐
  // =========================================================================
  let filterCourseOnly = false;
  let filterRevisitOnly = false;
  let filterAssignee = '';
  let myDriverName = '';
  try { myDriverName = localStorage.getItem(MY_DRIVER_KEY) || ''; } catch (e) {}

  function loadCourseData() {
    try {
      const v = JSON.parse(localStorage.getItem(COURSE_KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }
  function getTodayCourseSet() {
    const data = loadCourseData();
    const arr = Array.isArray(data[todayStr()]) ? data[todayStr()] : [];
    return new Set(arr.map(x => Number(x)));
  }
  function saveTodayCourseSet(set) {
    const tKey = todayStr();
    const data = loadCourseData();
    const cutoff = shiftDay(tKey, -7);
    Object.keys(data).forEach(k => { if (k < cutoff) delete data[k]; });
    const arr = [...set].filter(x => isFinite(x)).sort((a, b) => a - b);
    if (arr.length) data[tKey] = arr;
    else delete data[tKey];
    try {
      const next = JSON.stringify(data);
      if (next !== localStorage.getItem(COURSE_KEY)) {
        localStorage.setItem(COURSE_KEY, next);
        if (typeof scheduleSync === 'function') scheduleSync();
      }
    } catch (e) {}
  }

  // ---- Feature #9: 원 마스터 DB ----
  function loadMasterDb() {
    try {
      const v = JSON.parse(localStorage.getItem(MASTER_KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }
  function saveMasterDb(db, opts = {}) {
    try {
      const prev = localStorage.getItem(MASTER_KEY);
      const next = JSON.stringify(db);
      if (next === prev) return false;
      localStorage.setItem(MASTER_KEY, next);
      if (!opts.skipSync && typeof scheduleSync === 'function') scheduleSync();
      return true;
    } catch (e) { return false; }
  }
  const validLatLng = (lat, lng) =>
    lat !== null && lat !== undefined && lat !== '' &&
    lng !== null && lng !== undefined && lng !== '' &&
    isFinite(Number(lat)) && isFinite(Number(lng)) &&
    (Number(lat) !== 0 || Number(lng) !== 0);

  function recordSchoolsToMaster(list, opts = {}) {
    if (!Array.isArray(list) || !list.length) return;
    const db = loadMasterDb();
    let changed = false;
    const customC = getCustomCoords();
    list.forEach(s => {
      if (!s || !s.name) return;
      const key = normSchoolKey(s.name);
      if (!key) return;
      const cur = db[key] || { name: s.name };
      const c = (typeof getSchoolCoords === 'function' ? getSchoolCoords(s) : null) || customC[s.id] || null;
      const hasC = !!(c && validLatLng(c.lat, c.lng));
      const curHasC = validLatLng(cur.lat, cur.lng);
      const f = s.fieldOps || {};
      const next = {
        name: s.name || cur.name,
        address: (s.address && String(s.address).trim()) ? String(s.address).trim() : (cur.address || ''),
        phone: (s.phone && String(s.phone).trim()) ? String(s.phone).trim() : (cur.phone || ''),
        lat: hasC ? Number(c.lat) : (curHasC ? Number(cur.lat) : null),
        lng: hasC ? Number(c.lng) : (curHasC ? Number(cur.lng) : null),
        memo: (f.memo && String(f.memo).trim()) ? String(f.memo).trim() : (cur.memo || ''),
        visitWindow: (f.visitWindow && String(f.visitWindow).trim()) ? String(f.visitWindow).trim() : (cur.visitWindow || ''),
        avoidWindow: (f.avoidWindow && String(f.avoidWindow).trim()) ? String(f.avoidWindow).trim() : (cur.avoidWindow || ''),
        assignee: (s.assignee && String(s.assignee).trim()) ? String(s.assignee).trim() : (cur.assignee || ''),
        updatedAt: cur.updatedAt || 0
      };
      const same = cur.name === next.name && cur.address === next.address && cur.phone === next.phone &&
        cur.lat === next.lat && cur.lng === next.lng && cur.memo === next.memo &&
        cur.visitWindow === next.visitWindow && cur.avoidWindow === next.avoidWindow && cur.assignee === next.assignee;
      if (!same) {
        next.updatedAt = Date.now();
        db[key] = next;
        changed = true;
      }
    });
    if (changed) saveMasterDb(db, opts);
  }
  function hydrateSchoolFromMaster(s) {
    if (!s || !s.name) return false;
    const db = loadMasterDb();
    const rec = db[normSchoolKey(s.name)];
    if (!rec) return false;
    let applied = false;
    if ((!s.address || !String(s.address).trim()) && rec.address) { s.address = rec.address; applied = true; }
    if ((!s.phone || !String(s.phone).trim()) && rec.phone) { s.phone = rec.phone; applied = true; }
    if (!validLatLng(s.lat, s.lng) && validLatLng(rec.lat, rec.lng)) {
      s.lat = Number(rec.lat); s.lng = Number(rec.lng); applied = true;
    }
    if ((!s.assignee || !String(s.assignee).trim()) && rec.assignee) { s.assignee = rec.assignee; applied = true; }
    const f = s.fieldOps || {};
    let fChanged = false;
    if ((!f.memo || !String(f.memo).trim()) && rec.memo) { f.memo = rec.memo; fChanged = true; }
    if ((!f.visitWindow || !String(f.visitWindow).trim()) && rec.visitWindow) { f.visitWindow = rec.visitWindow; fChanged = true; }
    if ((!f.avoidWindow || !String(f.avoidWindow).trim()) && rec.avoidWindow) { f.avoidWindow = rec.avoidWindow; fChanged = true; }
    if (fChanged) { s.fieldOps = { ...f, updatedAt: Date.now() }; applied = true; }
    return applied;
  }
  window.nkRecordSchoolsToMaster = recordSchoolsToMaster;
  window.nkHydrateSchoolFromMaster = hydrateSchoolFromMaster;

  // ---- Feature #4: 현장 증빙 사진 저장/동기화 ----
  function loadPhotoStore() {
    try {
      const v = JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }
  function savePhotoStore(store, opts = {}) {
    const cutoff = shiftDay(todayStr(), -PHOTO_KEEP_DAYS);
    const allEntries = [];
    Object.keys(store).forEach(k => {
      const day = k.split(':')[0];
      if (day < cutoff) { delete store[k]; return; }
      const arr = Array.isArray(store[k]) ? store[k] : [];
      arr.forEach(item => allEntries.push({ k, item }));
    });
    if (allEntries.length > PHOTO_MAX_COUNT) {
      allEntries.sort((a, b) => (a.item.at || 0) - (b.item.at || 0));
      const drop = allEntries.slice(0, allEntries.length - PHOTO_MAX_COUNT);
      drop.forEach(({ k, item }) => {
        store[k] = (store[k] || []).filter(x => x.id !== item.id);
        if (!store[k].length) delete store[k];
      });
    }
    try {
      const prev = localStorage.getItem(PHOTO_KEY);
      const next = JSON.stringify(store);
      if (next === prev) return false;
      localStorage.setItem(PHOTO_KEY, next);
      if (!opts.skipSync && typeof scheduleSync === 'function') scheduleSync();
      return true;
    } catch (e) {
      toast('기기 저장 공간이 부족합니다. 오래된 증빙 사진을 정리해 주세요.');
      return false;
    }
  }
  function photosForSchool(schoolId, dayKey) {
    const store = loadPhotoStore();
    const out = [];
    Object.entries(store).forEach(([k, arr]) => {
      const [dk, sid] = k.split(':');
      if (String(sid) !== String(schoolId)) return;
      if (dayKey && dk !== dayKey) return;
      if (Array.isArray(arr)) arr.forEach(it => out.push({ ...it, dayKey: dk, storeKey: k }));
    });
    return out.sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  window.nkGetSchoolPhotoCount = (schoolId, dayKey) => photosForSchool(schoolId, dayKey).length;
  function photosForDay(dayKey) {
    const store = loadPhotoStore();
    const out = [];
    Object.entries(store).forEach(([k, arr]) => {
      const [dk, sid] = k.split(':');
      if (dk !== dayKey) return;
      if (Array.isArray(arr)) arr.forEach(it => out.push({ ...it, dayKey: dk, schoolId: sid, storeKey: k }));
    });
    return out.sort((a, b) => (a.at || 0) - (b.at || 0));
  }
  function compressImageFile(file, maxDim = 800, quality = 0.65) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('이미지 형식을 지원하지 않습니다.'));
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
            else { w = Math.round(w * (maxDim / h)); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, w);
          canvas.height = Math.max(1, h);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- Supabase ec_records 메타 동기화 훅 ----
  window.nkSyncCollectMeta = function (m) {
    const master = loadMasterDb();
    if (Object.keys(master).length) m['meta|schoolMaster'] = master;

    const course = loadCourseData();
    const tKey = todayStr();
    if (Array.isArray(course[tKey]) && course[tKey].length) {
      m['meta|todayCourse:' + tKey] = course[tKey];
    }

    const photos = loadPhotoStore();
    Object.entries(photos).forEach(([k, arr]) => {
      if (Array.isArray(arr) && arr.length) {
        m['meta|photo:' + k] = arr.slice(-2);
      }
    });
  };

  window.nkSyncApplyMeta = function (m) {
    // 1. Master DB merge (newest updatedAt wins per school key)
    if (m['meta|schoolMaster'] && typeof m['meta|schoolMaster'] === 'object') {
      const local = loadMasterDb();
      const remote = m['meta|schoolMaster'];
      let changed = false;
      Object.entries(remote).forEach(([k, rv]) => {
        if (!rv || typeof rv !== 'object') return;
        const lv = local[k];
        if (!lv || (rv.updatedAt || 0) > (lv.updatedAt || 0)) {
          local[k] = rv;
          changed = true;
        }
      });
      if (changed) saveMasterDb(local, { skipSync: true });
    }
    // 2. Today course
    const tKey = todayStr();
    const rk = 'meta|todayCourse:' + tKey;
    if (Array.isArray(m[rk])) {
      const course = loadCourseData();
      course[tKey] = m[rk].map(Number).filter(isFinite);
      try { localStorage.setItem(COURSE_KEY, JSON.stringify(course)); } catch (e) {}
    }
    // 3. Proof photos merge
    const localPhotos = loadPhotoStore();
    let pChanged = false;
    Object.keys(m).forEach(k => {
      if (k.indexOf('meta|photo:') !== 0) return;
      const pk = k.slice('meta|photo:'.length);
      const rArr = Array.isArray(m[k]) ? m[k] : [];
      if (!rArr.length) return;
      const lArr = Array.isArray(localPhotos[pk]) ? localPhotos[pk] : [];
      const byId = new Map(lArr.map(x => [x.id, x]));
      rArr.forEach(x => {
        if (x && x.id && !byId.has(x.id)) {
          byId.set(x.id, x);
          pChanged = true;
        }
      });
      localPhotos[pk] = [...byId.values()].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-3);
    });
    if (pChanged) savePhotoStore(localPhotos, { skipSync: true });
  };

  // =========================================================================
  // Feature #5: 방문 시간대 / 주의 시간 판정 로직
  // =========================================================================
  function parseTimeRanges(str) {
    const out = [];
    const s = String(str || '');
    const re = /(\d{1,2})\s*[:시]\s*(\d{0,2})\s*(?:~|-|부터)\s*(\d{1,2})\s*[:시]\s*(\d{0,2})/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const sMin = parseInt(m[1], 10) * 60 + parseInt(m[2] || '0', 10);
      const eMin = parseInt(m[3], 10) * 60 + parseInt(m[4] || '0', 10);
      if (eMin > sMin) out.push([sMin, eMin]);
    }
    return out;
  }
  function parseDeadlineMinutes(vw) {
    const s = String(vw || '').trim();
    if (!s || s === '상관없음') return null;
    const endMatch = s.match(/(?:~|-)\s*(\d{1,2})\s*[:시]\s*(\d{0,2})/);
    if (endMatch) return parseInt(endMatch[1], 10) * 60 + parseInt(endMatch[2] || '0', 10);
    const beforeMatch = s.match(/(\d{1,2})\s*[:시]\s*(\d{0,2})\s*(?:전|이전|마감)/);
    if (beforeMatch) return parseInt(beforeMatch[1], 10) * 60 + parseInt(beforeMatch[2] || '0', 10);
    if (s.includes('오전')) return 11 * 60 + 30;
    return null;
  }
  function evaluateTimeAlerts(school, nowDate = new Date()) {
    const f = (school && school.fieldOps) || {};
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    const vw = String(f.visitWindow || '').trim();
    const aw = String(f.avoidWindow || '').trim();
    const deadlineMin = parseDeadlineMinutes(vw);
    const isUrgent = deadlineMin !== null && nowMin < deadlineMin && (deadlineMin - nowMin) <= 45;
    const isPastDeadline = deadlineMin !== null && nowMin >= deadlineMin && nowMin < 18 * 60;
    const avoidRanges = parseTimeRanges(aw);
    const inAvoidNow = avoidRanges.some(([a, b]) => nowMin >= a && nowMin <= b);
    return { vw, aw, deadlineMin, isUrgent, isPastDeadline, inAvoidNow };
  }
  window.nkEvaluateTimeAlerts = evaluateTimeAlerts;

  // =========================================================================
  // Feature #7: 담당자(기사) 목록 & 필터
  // =========================================================================
  function getKnownAssignees() {
    const set = new Set();
    if (myDriverName) set.add(myDriverName);
    (bridge().getWorksMembers ? bridge().getWorksMembers() : []).forEach(m => {
      if (m && m.name) set.add(String(m.name).trim());
    });
    getSchools().forEach(s => { if (s && s.assignee) set.add(String(s.assignee).trim()); });
    getPickups().forEach(p => {
      if (p && p.assignee) {
        String(p.assignee).split(/[,，/·]+/).map(x => x.trim()).filter(Boolean).forEach(x => set.add(x));
      }
    });
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'));
  }
  window.nkGetKnownAssignees = getKnownAssignees;

  function isRevisitDueSchool(s) {
    const comp = getCompleted();
    if (comp[s.id]) return false;
    const f = s.fieldOps || {};
    const rd = String(f.revisitDate || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(rd) && rd <= todayStr();
  }

  window.nkProFilterSchool = function (s) {
    if (filterCourseOnly) {
      const cSet = getTodayCourseSet();
      if (cSet.size > 0 && !cSet.has(Number(s.id))) return false;
    }
    if (filterRevisitOnly && !isRevisitDueSchool(s)) return false;
    if (filterAssignee === '__none__') {
      if (s.assignee && String(s.assignee).trim()) return false;
    } else if (filterAssignee) {
      if (String(s.assignee || '').trim() !== filterAssignee) return false;
    }
    return true;
  };

  window.nkOverlayAllowSchool = function (s) {
    if (filterCourseOnly) {
      const cSet = getTodayCourseSet();
      if (cSet.size > 0 && !cSet.has(Number(s.id))) return false;
    }
    if (filterAssignee && filterAssignee !== '__none__') {
      if (String(s.assignee || '').trim() !== filterAssignee) return false;
    }
    return true;
  };

  // =========================================================================
  // Feature #8: 납품 완료 → 주문앱(nk_orders) 역방향 반영 큐 & 전송
  // =========================================================================
  function loadOrderQueue() {
    try { return JSON.parse(localStorage.getItem(ORDER_QUEUE_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function saveOrderQueue(q) {
    try { localStorage.setItem(ORDER_QUEUE_KEY, JSON.stringify(q.slice(-40))); } catch (e) {}
  }
  async function flushOrderSyncQueue() {
    if (typeof worksApi !== 'function' || !bridge().getSyncUser?.() || navigator.onLine === false) return;
    const q = loadOrderQueue();
    if (!q.length) return;
    const remain = [];
    for (const item of q) {
      try {
        await worksApi('/app/orders/delivered', 'POST', item);
      } catch (e) {
        remain.push(item);
      }
    }
    saveOrderQueue(remain);
  }
  async function notifyOrderAppDelivered(school, isDone) {
    if (!school) return;
    const orderIds = Array.isArray(school.appOrders) ? school.appOrders : [];
    const payload = {
      orderIds,
      schoolName: school.name || '',
      completedAt: (school.fieldOps && school.fieldOps.completedAt) || Date.now(),
      assignee: school.assignee || myDriverName || '',
      note: (school.fieldOps && school.fieldOps.memo) ? String(school.fieldOps.memo).slice(0, 80) : '',
      undone: !isDone
    };
    if (typeof worksApi !== 'function' || !bridge().getSyncUser?.() || navigator.onLine === false) {
      if (orderIds.length) {
        const q = loadOrderQueue().filter(x => x.schoolName !== payload.schoolName);
        q.push(payload);
        saveOrderQueue(q);
      }
      return;
    }
    try {
      const res = await worksApi('/app/orders/delivered', 'POST', payload);
      if (res && res.updated > 0) {
        toast(`🔗 주문앱에 [${school.name}] ${isDone ? '직납 완료' : '완료 취소'}가 반영되었습니다.`);
      }
    } catch (e) {
      if (orderIds.length) {
        const q = loadOrderQueue().filter(x => x.schoolName !== payload.schoolName);
        q.push(payload);
        saveOrderQueue(q);
      }
    }
  }
  window.nkNotifyOrderAppDelivered = notifyOrderAppDelivered;

  window.nkOnSchoolCompleted = function (school, isDone, prevDone) {
    if (typeof window.nkSyncTodayLog === 'function') {
      try { window.nkSyncTodayLog(); } catch (e) {}
    }
    recordSchoolsToMaster([school], { skipSync: true });
    if (isDone !== prevDone) {
      notifyOrderAppDelivered(school, isDone);
    }
  };

  window.nkOnSaveState = function () {
    recordSchoolsToMaster(getSchools(), { skipSync: true });
    refreshRevisitBanner();
  };

  window.addEventListener('online', () => { flushOrderSyncQueue(); });

  // =========================================================================
  // UI 1: 메인 화면 툴바 + 재방문 배너 + 근처 끼워넣기 배너 + 헤더 도구 버튼
  // =========================================================================
  const deliveryView = document.getElementById('deliveryView');
  const schoolListEl = document.getElementById('schoolList');

  const revisitBanner = document.createElement('section');
  revisitBanner.id = 'nkRevisitBanner';
  revisitBanner.setAttribute('aria-label', '오늘 재방문 예정 알림');

  const detourBanner = document.createElement('section');
  detourBanner.id = 'nkDetourBanner';
  detourBanner.setAttribute('aria-label', '근처 미완료 회수·추가 알림');

  const proToolbar = document.createElement('div');
  proToolbar.id = 'nkProToolbar';
  proToolbar.innerHTML = `
    <button id="nkOpenOverviewMapBtn" type="button">🗺️ 전체 지도</button>
    <button id="nkOpenUnifiedRouteBtn" type="button">🧭 통합 동선</button>
    <button id="nkToggleCourseFilterBtn" type="button">⭐ 오늘 코스 (0)</button>
    <button id="nkOpenCoursePickerBtn" type="button">☑️ 코스 선택</button>
    <select id="nkDeliveryAssigneeFilter" aria-label="담당 기사 필터">
      <option value="">👤 전체 기사</option>
    </select>
    <button id="nkToggleMyDriverBtn" type="button">🙋 내 담당</button>
    <button id="nkOpenAssigneeMgrBtn" type="button">👥 기사 배정</button>
    <button id="nkOpenStatsQuickBtn" type="button">📊 통계</button>
  `;

  if (deliveryView && schoolListEl) {
    const anchor = document.getElementById('nkDeliverySearchWrap') || schoolListEl;
    anchor.before(revisitBanner);
    revisitBanner.after(detourBanner);
    anchor.after(proToolbar);
  }

  // 헤더 설정·도구 패널에도 원 마스터·통계·전체 지도 바로가기 추가
  const headerReportBtn = document.getElementById('openDailyReportBtn');
  if (headerReportBtn && headerReportBtn.parentElement) {
    const addToolBtn = (id, label, cls, onClick) => {
      if (document.getElementById(id)) return;
      const b = document.createElement('button');
      b.id = id;
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', onClick);
      headerReportBtn.after(b);
    };
    const baseCls = 'px-2.5 py-2 rounded-xl text-xs font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 transition text-left sm:text-center';
    addToolBtn('nkHeaderMasterBtn', '📚 원 마스터 관리', baseCls, () => openMasterDialog());
    addToolBtn('nkHeaderStatsBtn', '📊 주간·월간 실적', 'px-2.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 transition text-left sm:text-center', () => openStatsDialog());
    addToolBtn('nkHeaderMapBtn', '🗺️ 전체 동선 지도', baseCls, () => openOverviewMapDialog());
  }

  // =========================================================================
  // Feature #6: 재방문 예정일 자동 리마인더 배너
  // =========================================================================
  function refreshRevisitBanner() {
    if (!revisitBanner) return;
    const tKey = todayStr();
    const dueSchools = getSchools().filter(isRevisitDueSchool);
    const duePickups = getPickups().filter(p => {
      if (!p || p.done) return false;
      const rd = String(p.fieldRevisitDate || '').trim();
      const due = String(p.due || '').trim();
      return (/^\d{4}-\d{2}-\d{2}$/.test(rd) && rd <= tKey) || (/^\d{4}-\d{2}-\d{2}$/.test(due) && due < tKey);
    });
    const total = dueSchools.length + duePickups.length;
    if (!total) {
      revisitBanner.classList.remove('open');
      if (filterRevisitOnly) { filterRevisitOnly = false; }
      return;
    }
    revisitBanner.classList.add('open');
    const chips = [
      ...dueSchools.map(s => `<button type="button" class="rv-chip" data-rv-school="${s.id}">🏫 ${esc(s.name)} (${esc(s.fieldOps.revisitDate)})</button>`),
      ...duePickups.slice(0, 6).map(p => `<button type="button" class="rv-chip" data-rv-pickup="${esc(p.id)}">↩️ ${esc(p.school || p.title)} (${esc(p.fieldRevisitDate || p.due)})</button>`)
    ].join('');
    revisitBanner.innerHTML = `
      <div class="rv-head">
        <span>🔁 오늘 재방문·기한 도래 ${total}건 (납품 ${dueSchools.length} · 회수/추가 ${duePickups.length})</span>
        <button type="button" id="nkToggleRevisitFilterBtn" style="padding:4px 10px;border-radius:8px;font-size:11px;font-weight:900;background:${filterRevisitOnly ? '#f43f5e' : '#331526'};color:#fff;border:1px solid #fb7185">${filterRevisitOnly ? '✓ 재방문 필터 켜짐 (해제)' : '재방문 원만 보기'}</button>
      </div>
      <div class="rv-chips">${chips}</div>
    `;
  }
  revisitBanner.addEventListener('click', (e) => {
    if (e.target.closest('#nkToggleRevisitFilterBtn')) {
      filterRevisitOnly = !filterRevisitOnly;
      refreshRevisitBanner();
      if (typeof renderList === 'function') renderList();
      return;
    }
    const sbBtn = e.target.closest('[data-rv-school]');
    if (sbBtn && typeof openArrivalModal === 'function') {
      openArrivalModal(Number(sbBtn.getAttribute('data-rv-school')), false);
      return;
    }
    const pbBtn = e.target.closest('[data-rv-pickup]');
    if (pbBtn && typeof openPkDetail === 'function') {
      openPkDetail(pbBtn.getAttribute('data-rv-pickup'));
    }
  });

  // =========================================================================
  // Feature #2B: 근처 1.5km 미완료 회수·추가 "끼워넣기 알림"
  // =========================================================================
  window.nkCheckNearbyDetour = function (schoolId) {
    const s = getSchools().find(x => x.id === Number(schoolId));
    if (!s || typeof getSchoolCoords !== 'function') { detourBanner.classList.remove('open'); return; }
    const sc = getSchoolCoords(s);
    if (!sc || typeof hasCoords !== 'function' || !hasCoords(sc)) { detourBanner.classList.remove('open'); return; }
    const pos = bridge().getUserPos ? bridge().getUserPos() : null;
    const mid = pos ? { lat: (pos.lat + sc.lat) / 2, lng: (pos.lng + sc.lng) / 2 } : null;
    const nearby = [];
    getPickups().forEach(p => {
      if (!p || p.done) return;
      if (typeof window.isPickupHiddenInPopupToday === 'function' && window.isPickupHiddenInPopupToday(p)) return;
      if (p.schoolId && Number(p.schoolId) === s.id) return;
      const pc = typeof pkCoords === 'function' ? pkCoords(p) : null;
      if (!pc || !hasCoords(pc)) return;
      const dToDest = haversine(sc.lat, sc.lng, pc.lat, pc.lng);
      const dToMid = mid ? haversine(mid.lat, mid.lng, pc.lat, pc.lng) : Infinity;
      const minD = Math.min(dToDest, dToMid);
      if (minD <= 1500) nearby.push({ p, dist: minD });
    });
    nearby.sort((a, b) => a.dist - b.dist);
    if (!nearby.length) {
      detourBanner.classList.remove('open');
      return;
    }
    detourBanner.classList.add('open');
    const summary = nearby.slice(0, 3).map(x => `[${x.p.type}] ${x.p.school || x.p.title} (${fmtDist(x.dist)})`).join(' · ');
    detourBanner.innerHTML = `
      <span>📍 <strong>${esc(s.name)}</strong> 가는 길 1.5km 내 미완료 회수·추가 ${nearby.length}건: ${esc(summary)}</span>
      <div style="display:flex;gap:6px">
        <button type="button" id="nkDetourOpenRouteBtn" style="padding:4px 9px;border-radius:8px;background:#4f46e5;color:#fff;font-size:11px;font-weight:800">통합 동선 보기</button>
        <button type="button" id="nkDetourDismissBtn" style="padding:4px 8px;border-radius:8px;background:#1e293b;color:#cbd5e1;font-size:11px;font-weight:800">닫기</button>
      </div>
    `;
    toast(`📍 가는 길 1.5km 내에 미완료 회수·추가 ${nearby.length}건이 있습니다!`);
  };
  detourBanner.addEventListener('click', (e) => {
    if (e.target.closest('#nkDetourOpenRouteBtn')) openUnifiedRouteDialog();
    if (e.target.closest('#nkDetourDismissBtn')) detourBanner.classList.remove('open');
  });

  // =========================================================================
  // 툴바 동기화 + 카드 데코레이션 (Feature #2, #4, #5, #7, #8)
  // =========================================================================
  function syncToolbarState() {
    const cSet = getTodayCourseSet();
    const courseBtn = document.getElementById('nkToggleCourseFilterBtn');
    if (courseBtn) {
      courseBtn.textContent = `⭐ 오늘 코스 (${cSet.size})`;
      courseBtn.classList.toggle('star-on', filterCourseOnly);
    }
    const sel = document.getElementById('nkDeliveryAssigneeFilter');
    if (sel) {
      const names = getKnownAssignees();
      const opts = [
        '<option value="">👤 전체 기사</option>',
        ...names.map(n => `<option value="${esc(n)}">👤 ${esc(n)}</option>`),
        '<option value="__none__">👤 미배정</option>'
      ].join('');
      if (sel.innerHTML !== opts) sel.innerHTML = opts;
      sel.value = filterAssignee;
    }
    const myBtn = document.getElementById('nkToggleMyDriverBtn');
    if (myBtn) {
      const on = !!(myDriverName && filterAssignee === myDriverName);
      myBtn.textContent = myDriverName ? `🙋 내 담당 (${myDriverName})` : '🙋 내 담당 설정';
      myBtn.classList.toggle('active', on);
    }
  }

  window.nkDecorateDeliveryUi = function () {
    syncToolbarState();
    refreshRevisitBanner();
    const cSet = getTodayCourseSet();
    const comp = getCompleted();
    const byId = new Map(getSchools().map(s => [String(s.id), s]));
    const now = new Date();

    document.querySelectorAll('#schoolList [data-school-card]').forEach(card => {
      const sid = card.getAttribute('data-school-card');
      const s = byId.get(sid);
      if (!s) return;
      const identity = card.querySelector('.dc-identity');
      if (!identity) return;
      let row = card.querySelector('.nk-pro-badges');
      if (!row) {
        row = document.createElement('div');
        row.className = 'nk-pro-badges';
        identity.appendChild(row);
      }
      const isDone = !!comp[s.id];
      const alerts = evaluateTimeAlerts(s, now);
      const photos = photosForSchool(s.id);
      const inCourse = cSet.has(Number(s.id));
      const parts = [];

      parts.push(`<button type="button" class="nk-badge nk-badge-course ${inCourse ? 'on' : ''}" data-pro-course="${s.id}">${inCourse ? '★ 오늘 코스' : '☆ 오늘'}</button>`);
      if (s.assignee) parts.push(`<span class="nk-badge nk-badge-driver">👤 ${esc(s.assignee)}</span>`);
      if (alerts.vw && alerts.vw !== '상관없음') {
        if (!isDone && (alerts.isUrgent || alerts.isPastDeadline)) {
          parts.push(`<span class="nk-badge nk-badge-urgent">⏰ ${alerts.isPastDeadline ? '시간 경과' : '마감 임박'} · ${esc(alerts.vw)}</span>`);
        } else {
          const cls = alerts.vw.includes('오후') ? 'nk-badge-pm' : 'nk-badge-am';
          parts.push(`<span class="nk-badge ${cls}">⏰ ${esc(alerts.vw)}</span>`);
        }
      }
      if (!isDone && alerts.inAvoidNow) {
        parts.push(`<span class="nk-badge nk-badge-avoid">⚠️ 지금 주의시간 (${esc(alerts.aw)})</span>`);
      } else if (alerts.aw) {
        parts.push(`<span class="nk-badge nk-badge-driver">🚫 ${esc(alerts.aw)}</span>`);
      }
      if (photos.length) {
        parts.push(`<button type="button" class="nk-badge nk-badge-photo" data-pro-photo="${s.id}">📷 사진 ${photos.length}</button>`);
      }
      const cleanedPhone = String(s.phone || '').replace(/[^0-9+*#,]/g, '');
      if (cleanedPhone) {
        parts.push(`<button type="button" class="nk-badge nk-badge-sms" data-pro-sms="${s.id}">📩 문자</button>`);
      }
      row.innerHTML = parts.join('');
    });
  };

  // 카드 내 프로 배지 클릭 위임
  document.getElementById('schoolList')?.addEventListener('click', (e) => {
    const cBtn = e.target.closest('[data-pro-course]');
    if (cBtn) {
      e.stopPropagation();
      const id = Number(cBtn.getAttribute('data-pro-course'));
      const set = getTodayCourseSet();
      if (set.has(id)) set.delete(id); else set.add(id);
      saveTodayCourseSet(set);
      if (typeof renderList === 'function') renderList();
      if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
      return;
    }
    const pBtn = e.target.closest('[data-pro-photo]');
    if (pBtn) {
      e.stopPropagation();
      openPhotoModal(Number(pBtn.getAttribute('data-pro-photo')));
      return;
    }
    const sBtn = e.target.closest('[data-pro-sms]');
    if (sBtn) {
      e.stopPropagation();
      openSmsModal(Number(sBtn.getAttribute('data-pro-sms')));
    }
  });

  // 도착/상세 모달(#arrivalModal)에 📷 증빙 사진 + 📩 문자 템플릿 + 시간대 경고 주입
  window.nkOnArrivalModalOpen = function (school) {
    if (!school) return;
    const memoBtn = document.getElementById('modalMemoEditBtn');
    const bar = memoBtn && memoBtn.parentElement;
    if (bar) {
      let smsBtn = document.getElementById('nkModalSmsBtn');
      if (!smsBtn) {
        smsBtn = document.createElement('button');
        smsBtn.id = 'nkModalSmsBtn';
        smsBtn.type = 'button';
        smsBtn.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-sky-500/20 text-sky-200 border border-sky-500/40';
        bar.appendChild(smsBtn);
      }
      const hasPhone = !!String(school.phone || '').replace(/[^0-9+*#,]/g, '');
      smsBtn.textContent = '📩 문자 템플릿';
      smsBtn.classList.toggle('hidden', !hasPhone);
      smsBtn.onclick = () => openSmsModal(school.id);

      let photoBtn = document.getElementById('nkModalPhotoBtn');
      if (!photoBtn) {
        photoBtn = document.createElement('button');
        photoBtn.id = 'nkModalPhotoBtn';
        photoBtn.type = 'button';
        photoBtn.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-indigo-500/20 text-indigo-200 border border-indigo-500/40';
        bar.appendChild(photoBtn);
      }
      const pCount = photosForSchool(school.id).length;
      photoBtn.textContent = pCount ? `📷 증빙사진 (${pCount})` : '📷 사진 남기기';
      photoBtn.onclick = () => openPhotoModal(school.id);
    }

    const memoBox = document.getElementById('modalFieldMemoBox');
    if (memoBox) {
      const f = school.fieldOps || {};
      const alerts = evaluateTimeAlerts(school);
      const extras = [];
      if (school.assignee) extras.push(`👤 담당: ${school.assignee}`);
      if (alerts.vw && alerts.vw !== '상관없음') extras.push(`⏰ ${alerts.vw}${alerts.isUrgent ? ' (마감 임박!)' : ''}`);
      if (alerts.inAvoidNow) extras.push(`⚠️ 현재 주의 시간대 (${alerts.aw})`);
      else if (alerts.aw) extras.push(`🚫 피할 시간: ${alerts.aw}`);
      if (extras.length) {
        const curText = memoBox.textContent.trim();
        const prefix = extras.join(' · ');
        if (!curText.includes(extras[0])) {
          memoBox.textContent = curText ? `${prefix} · ${curText}` : prefix;
          memoBox.classList.remove('hidden');
        }
      }
    }
  };

  // =========================================================================
  // Feature #2: 통합 최단 동선 계산 엔진 (정규 납품 + 회수·반품 + 추가 납품)
  // =========================================================================
  function buildUnifiedStops(opts = {}) {
    const comp = getCompleted();
    const cSet = getTodayCourseSet();
    const useCourse = opts.courseOnly ?? filterCourseOnly;
    const assignee = opts.assignee ?? filterAssignee;
    const includeDone = !!opts.includeDone;

    const stops = [];
    const schoolStopMap = new Map();

    getSchools().forEach(s => {
      const isDone = !!comp[s.id];
      if (!includeDone && isDone) return;
      if (useCourse && cSet.size > 0 && !cSet.has(Number(s.id))) return;
      if (assignee === '__none__' && s.assignee) return;
      if (assignee && assignee !== '__none__' && String(s.assignee || '').trim() !== assignee) return;
      const c = typeof getSchoolCoords === 'function' ? getSchoolCoords(s) : null;
      const ok = c && typeof hasCoords === 'function' && hasCoords(c);
      const vw = String((s.fieldOps && s.fieldOps.visitWindow) || '');
      const prio = vw.includes('오전') ? 0 : vw.includes('오후') ? 2 : 1;
      const stop = {
        key: 's:' + s.id,
        kind: 'delivery',
        school: s,
        pickups: [],
        name: s.name,
        address: s.address || '',
        lat: ok ? Number(c.lat) : null,
        lng: ok ? Number(c.lng) : null,
        done: isDone,
        prio,
        qtyText: typeof totalLabel === 'function' ? totalLabel(s) : '',
        visitWindow: vw,
        memo: (s.fieldOps && s.fieldOps.memo) || ''
      };
      stops.push(stop);
      schoolStopMap.set(Number(s.id), stop);
    });

    const pickupGroupMap = new Map();
    getPickups().forEach(p => {
      if (!p) return;
      const isDone = !!p.done;
      if (!includeDone && isDone) return;
      if (assignee && assignee !== '__none__' && p.assignee && !String(p.assignee).includes(assignee)) return;
      if (p.schoolId && schoolStopMap.has(Number(p.schoolId))) {
        schoolStopMap.get(Number(p.schoolId)).pickups.push(p);
        return;
      }
      const isExtra = typeof pkGroupOf === 'function' ? pkGroupOf(p) === 'extra' : false;
      const gk = (p.schoolId ? 'sid:' + p.schoolId : 'nm:' + normSchoolKey(p.school || p.title || p.id)) + ':' + (isExtra ? 'ex' : 'rt');
      if (!pickupGroupMap.has(gk)) {
        const pc = typeof pkCoords === 'function' ? pkCoords(p) : null;
        const ok = pc && typeof hasCoords === 'function' && hasCoords(pc);
        pickupGroupMap.set(gk, {
          key: 'p:' + p.id,
          kind: isExtra ? 'extra' : 'return',
          school: null,
          pickups: [],
          name: p.school || p.title || '할 일',
          address: p.address || '',
          lat: ok ? Number(pc.lat) : null,
          lng: ok ? Number(pc.lng) : null,
          done: isDone,
          prio: 1,
          qtyText: '',
          visitWindow: '',
          memo: p.memo || ''
        });
      }
      const grp = pickupGroupMap.get(gk);
      grp.pickups.push(p);
      if (!isDone) grp.done = false;
    });
    pickupGroupMap.forEach(g => {
      g.qtyText = g.pickups.map(p => `[${p.type}] ${p.items || p.title || ''}`).join(' / ');
      stops.push(g);
    });

    const withCoords = stops.filter(x => !x.done && x.lat !== null && x.lng !== null);
    const rest = stops.filter(x => x.done || x.lat === null || x.lng === null);
    const pos = bridge().getUserPos ? bridge().getUserPos() : null;

    const ordered = [];
    let cur = pos;
    [0, 1, 2].forEach(prio => {
      const rem = withCoords.filter(x => x.prio === prio);
      if (!rem.length) return;
      const seg = [];
      if (!cur) {
        const first = rem.shift();
        seg.push(first);
        cur = { lat: first.lat, lng: first.lng };
      }
      while (rem.length) {
        let bestI = 0, bestD = Infinity;
        for (let i = 0; i < rem.length; i++) {
          const d = haversine(cur.lat, cur.lng, rem[i].lat, rem[i].lng);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        const nx = rem.splice(bestI, 1)[0];
        seg.push(nx);
        cur = { lat: nx.lat, lng: nx.lng };
      }
      // 2-opt
      if (seg.length >= 4) {
        let improved = true, guard = 0;
        while (improved && guard < 25) {
          improved = false; guard++;
          for (let i = 0; i < seg.length - 2; i++) {
            for (let j = i + 2; j < seg.length - 1; j++) {
              const d1 = haversine(seg[i].lat, seg[i].lng, seg[i + 1].lat, seg[i + 1].lng) +
                         haversine(seg[j].lat, seg[j].lng, seg[j + 1].lat, seg[j + 1].lng);
              const d2 = haversine(seg[i].lat, seg[i].lng, seg[j].lat, seg[j].lng) +
                         haversine(seg[i + 1].lat, seg[i + 1].lng, seg[j + 1].lat, seg[j + 1].lng);
              if (d2 + 20 < d1) {
                const rev = seg.slice(i + 1, j + 1).reverse();
                seg.splice(i + 1, j - i, ...rev);
                improved = true;
              }
            }
          }
        }
      }
      ordered.push(...seg);
    });

    let totalMeters = 0;
    let prev = pos;
    ordered.forEach((st, idx) => {
      st.seq = idx + 1;
      st.legMeters = prev ? haversine(prev.lat, prev.lng, st.lat, st.lng) : 0;
      totalMeters += st.legMeters;
      prev = { lat: st.lat, lng: st.lng };
    });

    return { ordered, rest, all: [...ordered, ...rest], totalMeters };
  }
  window.nkBuildUnifiedStops = buildUnifiedStops;

  // =========================================================================
  // Feature #1: 전체 동선 지도 모달 (#nkOverviewMapDialog)
  // =========================================================================
  const mapDlg = document.createElement('dialog');
  mapDlg.id = 'nkOverviewMapDialog';
  mapDlg.className = 'nk-pro-dialog';
  mapDlg.innerHTML = `
    <div class="nk-pro-head">
      <div>
        <h2>🗺️ 전체 동선 지도 (납품 · 회수 · 추가)</h2>
        <p class="sub" id="nkOverviewMapMeta" style="margin:0">좌표가 등록된 모든 방문지를 추천 동선 순서대로 표시합니다.</p>
      </div>
      <button type="button" class="nk-pro-close" data-close-dlg>✕</button>
    </div>
    <div class="nk-pill-bar" id="nkMapFilterBar">
      <button type="button" data-mf="all" aria-pressed="true">전체</button>
      <button type="button" data-mf="delivery" aria-pressed="false">📦 정규 납품</button>
      <button type="button" data-mf="return" aria-pressed="false">↩️ 회수·반품</button>
      <button type="button" data-mf="extra" aria-pressed="false">➕ 추가 납품</button>
      <button type="button" id="nkMapHideDoneBtn" aria-pressed="true">완료 숨김</button>
      <button type="button" id="nkMapFitBtn">🎯 전체 맞춤</button>
    </div>
    <div id="nkOverviewMapCanvas"></div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:11px;color:#94a3b8">
      <span>🔵 정규 납품 (노란 테두리=오전필수)</span>
      <span>🔴 회수·반품</span>
      <span>🟣 추가 납품</span>
      <span>⚪ 완료</span>
    </div>
  `;
  document.body.appendChild(mapDlg);

  let ovMap = null, ovLayer = null, ovMapFilter = 'all', ovHideDone = true;

  async function renderOverviewMap() {
    const canvas = document.getElementById('nkOverviewMapCanvas');
    if (!canvas) return;
    try {
      await bridge().loadScriptOnce('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => !!window.L);
    } catch (e) {
      canvas.innerHTML = '<div style="padding:20px;color:#fda4af;font-size:13px">지도를 불러오지 못했습니다. 인터넷 연결을 확인하거나 온라인에서 1회 실행 후 다시 열어주세요.</div>';
      return;
    }
    if (!window.L) return;
    if (!ovMap) {
      ovMap = window.L.map(canvas, { zoomControl: true }).setView([37.62, 126.72], 11);
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(ovMap);
      ovLayer = window.L.layerGroup().addTo(ovMap);
    }
    ovLayer.clearLayers();

    const { ordered, all, totalMeters } = buildUnifiedStops({ includeDone: !ovHideDone });
    const visible = all.filter(st => {
      if (st.lat === null || st.lng === null) return false;
      if (ovHideDone && st.done) return false;
      if (ovMapFilter === 'delivery') return st.kind === 'delivery';
      if (ovMapFilter === 'return') return st.kind === 'return' || (st.pickups || []).some(p => (typeof pkGroupOf === 'function' ? pkGroupOf(p) !== 'extra' : true));
      if (ovMapFilter === 'extra') return st.kind === 'extra' || (st.pickups || []).some(p => (typeof pkGroupOf === 'function' ? pkGroupOf(p) === 'extra' : false));
      return true;
    });

    const bounds = [];
    const pos = bridge().getUserPos ? bridge().getUserPos() : null;
    if (pos) {
      window.L.circleMarker([pos.lat, pos.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#06b6d4', fillOpacity: 1 })
        .bindPopup('<strong>📍 내 현재 위치</strong>').addTo(ovLayer);
      bounds.push([pos.lat, pos.lng]);
    }

    // 추천 동선 경로선
    const routePts = ordered.filter(st => visible.includes(st)).map(st => [st.lat, st.lng]);
    if (pos && routePts.length) routePts.unshift([pos.lat, pos.lng]);
    if (routePts.length >= 2) {
      window.L.polyline(routePts, { color: '#60a5fa', weight: 3, opacity: 0.75, dashArray: '6 6' }).addTo(ovLayer);
    }

    visible.forEach(st => {
      const bg = st.kind === 'delivery' ? '#2563eb' : st.kind === 'extra' ? '#7c3aed' : '#e11d48';
      const label = st.done ? '✓' : (st.seq ? String(st.seq) : (st.kind === 'delivery' ? '납' : st.kind === 'extra' ? '+' : '회'));
      const cls = `nk-map-pin${st.prio === 0 && !st.done ? ' am' : ''}${st.done ? ' done' : ''}`;
      const icon = window.L.divIcon({ className: '', html: `<div class="${cls}" style="background:${bg}">${label}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      const marker = window.L.marker([st.lat, st.lng], { icon }).addTo(ovLayer);
      const pkBadge = st.kind === 'delivery' && st.pickups.length ? `<div style="color:#be123c;font-weight:700;margin-top:2px">↩️ 함께 처리할 회수·추가 ${st.pickups.length}건</div>` : '';
      const vwBadge = st.visitWindow ? `<div style="color:#b45309;font-weight:700;margin-top:2px">⏰ ${esc(st.visitWindow)}</div>` : '';
      const popupHtml = `
        <div style="min-width:190px;font-family:sans-serif;font-size:12px;line-height:1.45">
          <div style="font-weight:900;font-size:14px">${st.seq ? `${st.seq}. ` : ''}${esc(st.name)}</div>
          <div style="color:#475569;margin-top:2px">${esc(st.qtyText)}</div>
          ${vwBadge}${pkBadge}
          ${st.memo ? `<div style="color:#0369a1;margin-top:2px">📝 ${esc(st.memo)}</div>` : ''}
          <div style="display:flex;gap:5px;margin-top:8px">
            <button type="button" data-map-navi="${esc(st.key)}" style="flex:1;padding:6px;border-radius:7px;background:#03C75A;color:#022c22;font-weight:900;border:0;cursor:pointer">🟢 길안내</button>
            <button type="button" data-map-detail="${esc(st.key)}" style="padding:6px 8px;border-radius:7px;background:#1e293b;color:#fff;font-weight:700;border:0;cursor:pointer">상세</button>
            ${!st.done ? `<button type="button" data-map-done="${esc(st.key)}" style="padding:6px 8px;border-radius:7px;background:#10b981;color:#022c22;font-weight:900;border:0;cursor:pointer">✓ 완료</button>` : ''}
          </div>
        </div>`;
      marker.bindPopup(popupHtml);
      bounds.push([st.lat, st.lng]);
    });

    document.getElementById('nkOverviewMapMeta').textContent =
      `표시 중 ${visible.length}곳 · 미완료 추천 동선 약 ${(totalMeters / 1000).toFixed(1)}km${filterCourseOnly ? ' (오늘 코스 적용)' : ''}${filterAssignee ? ` (담당: ${filterAssignee})` : ''}`;

    setTimeout(() => {
      ovMap.invalidateSize();
      if (bounds.length >= 2) ovMap.fitBounds(bounds, { padding: [28, 28] });
      else if (bounds.length === 1) ovMap.setView(bounds[0], 14);
    }, 80);
  }

  function openOverviewMapDialog() {
    mapDlg.showModal();
    renderOverviewMap();
  }
  window.nkOpenOverviewMap = openOverviewMapDialog;

  mapDlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-dlg]')) { mapDlg.close(); return; }
    const mf = e.target.closest('[data-mf]');
    if (mf) {
      ovMapFilter = mf.getAttribute('data-mf');
      mapDlg.querySelectorAll('[data-mf]').forEach(b => b.setAttribute('aria-pressed', String(b === mf)));
      renderOverviewMap();
      return;
    }
    if (e.target.closest('#nkMapHideDoneBtn')) {
      ovHideDone = !ovHideDone;
      const b = document.getElementById('nkMapHideDoneBtn');
      b.setAttribute('aria-pressed', String(ovHideDone));
      b.textContent = ovHideDone ? '완료 숨김' : '완료 포함';
      renderOverviewMap();
      return;
    }
    if (e.target.closest('#nkMapFitBtn')) { renderOverviewMap(); return; }

    const navKey = e.target.closest('[data-map-navi]')?.getAttribute('data-map-navi');
    if (navKey) {
      if (navKey.startsWith('s:')) {
        const s = getSchools().find(x => x.id === Number(navKey.slice(2)));
        if (s && bridge().openNaviToSchool) { mapDlg.close(); bridge().openNaviToSchool(s); }
      } else if (navKey.startsWith('p:')) {
        const p = getPickups().find(x => String(x.id) === navKey.slice(2));
        if (p && bridge().openNaviToPickup) { mapDlg.close(); bridge().openNaviToPickup(p); }
      }
      return;
    }
    const detKey = e.target.closest('[data-map-detail]')?.getAttribute('data-map-detail');
    if (detKey) {
      mapDlg.close();
      if (detKey.startsWith('s:') && typeof openArrivalModal === 'function') openArrivalModal(Number(detKey.slice(2)), false);
      else if (detKey.startsWith('p:') && typeof openPkDetail === 'function') openPkDetail(detKey.slice(2));
      return;
    }
    const doneKey = e.target.closest('[data-map-done]')?.getAttribute('data-map-done');
    if (doneKey) {
      if (doneKey.startsWith('s:') && typeof markSchoolCompletion === 'function') {
        markSchoolCompletion(Number(doneKey.slice(2)), true);
        if (typeof renderList === 'function') renderList();
      } else if (doneKey.startsWith('p:') && typeof pkToggleDone === 'function') {
        pkToggleDone(doneKey.slice(2));
      }
      renderOverviewMap();
    }
  });

  // =========================================================================
  // Feature #2A: 통합 최단 동선 시트 (#nkUnifiedRouteDialog) + 오늘 코스 선택 (#nkCourseDialog)
  // =========================================================================
  const routeDlg = document.createElement('dialog');
  routeDlg.id = 'nkUnifiedRouteDialog';
  routeDlg.className = 'nk-pro-dialog';
  routeDlg.innerHTML = `
    <div class="nk-pro-head">
      <div>
        <h2>🧭 통합 최단 동선 (정규 + 회수 + 추가)</h2>
        <p class="sub" id="nkUnifiedRouteMeta" style="margin:0"></p>
      </div>
      <button type="button" class="nk-pro-close" data-close-dlg>✕</button>
    </div>
    <div class="nk-pill-bar">
      <button type="button" id="nkRouteOpenMapBtn" class="on">🗺️ 지도로 보기</button>
      <button type="button" id="nkRouteSaveOrderBtn">✓ 정규 원 순서에 반영</button>
    </div>
    <div id="nkUnifiedRouteList"></div>
  `;
  document.body.appendChild(routeDlg);

  let lastUnifiedStops = [];
  function renderUnifiedRoute() {
    const { ordered, rest, totalMeters } = buildUnifiedStops({ includeDone: false });
    lastUnifiedStops = ordered;
    document.getElementById('nkUnifiedRouteMeta').textContent =
      `미완료 ${ordered.length}곳 (좌표 미등록 ${rest.length}곳) · 예상 총 직선거리 약 ${(totalMeters / 1000).toFixed(1)}km · 오전 필수 원 우선 배치`;
    const listEl = document.getElementById('nkUnifiedRouteList');
    if (!ordered.length && !rest.length) {
      listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:24px">현재 조건에 해당하는 미완료 방문지가 없습니다.</p>';
      return;
    }
    const rowHtml = (st, idx) => {
      const kindTag = st.kind === 'delivery'
        ? (st.pickups.length ? `📦 정규 + ↩️ ${st.pickups.length}건` : '📦 정규 납품')
        : st.kind === 'extra' ? '➕ 추가 납품' : '↩️ 회수·반품';
      return `
        <div class="nk-route-item ${st.prio === 0 ? 'am' : ''}">
          <div style="min-width:0;flex:1">
            <div style="font-weight:900;font-size:14px">
              <span class="nk-route-num" style="background:${st.kind === 'delivery' ? '#2563eb' : st.kind === 'extra' ? '#7c3aed' : '#e11d48'}">${st.seq || '·'}</span>
              ${esc(st.name)}
              ${st.legMeters ? `<small style="color:#93c5fd;font-weight:700;margin-left:4px">+${fmtDist(st.legMeters)}</small>` : ''}
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:3px">${kindTag} · ${esc(st.qtyText)}</div>
            ${st.visitWindow ? `<div style="font-size:11px;color:#fcd34d;font-weight:700;margin-top:2px">⏰ ${esc(st.visitWindow)}</div>` : ''}
            ${st.memo ? `<div style="font-size:11px;color:#7dd3fc;margin-top:2px">📝 ${esc(st.memo)}</div>` : ''}
          </div>
          <div class="nk-route-actions">
            <button type="button" class="navi" data-ur-navi="${esc(st.key)}">🟢 내비</button>
            <button type="button" class="done" data-ur-done="${esc(st.key)}">✓ 완료</button>
          </div>
        </div>`;
    };
    listEl.innerHTML = ordered.map(rowHtml).join('') +
      (rest.length ? `<div style="font-size:11px;color:#94a3b8;margin:10px 0 6px;font-weight:700">좌표 미등록 (${rest.length}곳)</div>` + rest.map(rowHtml).join('') : '');
  }
  function openUnifiedRouteDialog() {
    renderUnifiedRoute();
    routeDlg.showModal();
  }
  routeDlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-dlg]')) { routeDlg.close(); return; }
    if (e.target.closest('#nkRouteOpenMapBtn')) { routeDlg.close(); openOverviewMapDialog(); return; }
    if (e.target.closest('#nkRouteSaveOrderBtn')) {
      const rank = new Map();
      let seq = 1;
      lastUnifiedStops.forEach(st => { if (st.school) rank.set(st.school.id, seq++); });
      if (!rank.size) { toast('반영할 정규 납품 원이 없습니다.'); return; }
      const schools = getSchools();
      let tail = seq;
      schools.forEach(s => { s.order = rank.has(s.id) ? rank.get(s.id) : tail++; });
      schools.sort((a, b) => a.order - b.order);
      if (typeof saveState === 'function') saveState();
      if (typeof renderList === 'function') renderList();
      toast('✓ 통합 동선 순서를 정규 납품 기본 순서로 저장했습니다.');
      return;
    }
    const nk = e.target.closest('[data-ur-navi]')?.getAttribute('data-ur-navi');
    if (nk) {
      routeDlg.close();
      if (nk.startsWith('s:')) bridge().openNaviToSchool?.(getSchools().find(x => x.id === Number(nk.slice(2))));
      else if (nk.startsWith('p:')) bridge().openNaviToPickup?.(getPickups().find(x => String(x.id) === nk.slice(2)));
      return;
    }
    const dk = e.target.closest('[data-ur-done]')?.getAttribute('data-ur-done');
    if (dk) {
      if (dk.startsWith('s:') && typeof markSchoolCompletion === 'function') {
        markSchoolCompletion(Number(dk.slice(2)), true);
        if (typeof renderList === 'function') renderList();
      } else if (dk.startsWith('p:') && typeof pkToggleDone === 'function') {
        pkToggleDone(dk.slice(2));
      }
      renderUnifiedRoute();
    }
  });

  // 오늘 방문 코스 선택 모달 (#nkCourseDialog)
  const courseDlg = document.createElement('dialog');
  courseDlg.id = 'nkCourseDialog';
  courseDlg.className = 'nk-pro-dialog';
  courseDlg.innerHTML = `
    <div class="nk-pro-head">
      <div>
        <h2>⭐ 오늘 방문 코스 선택</h2>
        <p class="sub" style="margin:0">오늘 출발할 원만 골라두면 동선·지도·미니창을 선택한 원 중심으로 볼 수 있습니다.</p>
      </div>
      <button type="button" class="nk-pro-close" data-close-dlg>✕</button>
    </div>
    <div class="nk-pill-bar" id="nkCourseRegionQuick"></div>
    <div id="nkCourseCheckList" style="max-height:50dvh;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;margin-bottom:12px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button type="button" id="nkCourseClearBtn" style="padding:9px 14px;border-radius:10px;background:#334155;color:#e2e8f0;font-weight:800">전체 해제</button>
      <button type="button" id="nkCourseSaveBtn" style="padding:9px 18px;border-radius:10px;background:#f59e0b;color:#020617;font-weight:900">✓ 오늘 코스 적용</button>
    </div>
  `;
  document.body.appendChild(courseDlg);

  let tempCourseSet = new Set();
  function renderCourseModal() {
    const schools = getSchools();
    const comp = getCompleted();
    const regions = [...new Set(schools.map(s => s.regionGroup || '기타'))];
    document.getElementById('nkCourseRegionQuick').innerHTML =
      `<button type="button" data-cr-all="1">미완료 전체 선택</button>` +
      regions.map(r => `<button type="button" data-cr-region="${esc(r)}">+ ${esc(r)} 전체</button>`).join('');
    document.getElementById('nkCourseCheckList').innerHTML = schools.map(s => {
      const checked = tempCourseSet.has(Number(s.id));
      const done = !!comp[s.id];
      return `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:${checked ? '#1e3a5f' : '#16243a'};border:1px solid ${checked ? '#60a5fa' : '#2b3f5e'};cursor:pointer;opacity:${done ? '.5' : '1'}">
        <input type="checkbox" data-cid="${s.id}" ${checked ? 'checked' : ''} style="width:17px;height:17px">
        <span style="font-size:12px;font-weight:700;line-height:1.3">${esc(s.name)}<br><small style="color:#94a3b8">${esc(s.regionGroup || '')} ${esc(s.subRegion || '')}${done ? ' · 완료' : ''}</small></span>
      </label>`;
    }).join('');
  }
  function openCourseDialog() {
    tempCourseSet = getTodayCourseSet();
    renderCourseModal();
    courseDlg.showModal();
  }
  courseDlg.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-cid]');
    if (!cb) return;
    const id = Number(cb.getAttribute('data-cid'));
    if (cb.checked) tempCourseSet.add(id); else tempCourseSet.delete(id);
    renderCourseModal();
  });
  courseDlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-dlg]')) { courseDlg.close(); return; }
    if (e.target.closest('[data-cr-all]')) {
      const comp = getCompleted();
      getSchools().forEach(s => { if (!comp[s.id]) tempCourseSet.add(Number(s.id)); });
      renderCourseModal();
      return;
    }
    const rb = e.target.closest('[data-cr-region]');
    if (rb) {
      const reg = rb.getAttribute('data-cr-region');
      const comp = getCompleted();
      getSchools().forEach(s => { if ((s.regionGroup || '기타') === reg && !comp[s.id]) tempCourseSet.add(Number(s.id)); });
      renderCourseModal();
      return;
    }
    if (e.target.closest('#nkCourseClearBtn')) { tempCourseSet.clear(); renderCourseModal(); return; }
    if (e.target.closest('#nkCourseSaveBtn')) {
      saveTodayCourseSet(tempCourseSet);
      filterCourseOnly = tempCourseSet.size > 0;
      courseDlg.close();
      if (typeof renderList === 'function') renderList();
      if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
      toast(tempCourseSet.size ? `⭐ 오늘 방문 코스 ${tempCourseSet.size}곳을 설정했습니다.` : '오늘 방문 코스를 해제했습니다.');
    }
  });

  // =========================================================================
  // Feature #4: 현장 증빙 사진 모달 (#nkPhotoDialog) & 보고서 썸네일
  // =========================================================================
  const photoDlg = document.createElement('dialog');
  photoDlg.id = 'nkPhotoDialog';
  photoDlg.className = 'nk-pro-dialog';
  photoDlg.innerHTML = `
    <div class="nk-pro-head">
      <div>
        <h2 id="nkPhotoDlgTitle">📷 납품 증빙 사진</h2>
        <p class="sub" style="margin:0">경비실·교무실·현관 전달 사진을 압축 저장하며 공유 계정의 다른 기기와 동기화됩니다.</p>
      </div>
      <button type="button" class="nk-pro-close" data-close-dlg>✕</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px">
      <input id="nkPhotoCaptionInput" type="text" placeholder="사진 메모 (예: 경비실 맡김, 2층 교무실)" style="flex:1;min-width:160px;padding:9px 11px;border-radius:10px;border:1px solid #3f5573;background:#0c1728;color:#fff;font-size:13px">
      <label style="display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:10px;background:#4f46e5;color:#fff;font-size:13px;font-weight:900;cursor:pointer">
        📷 촬영 · 앨범 선택
        <input id="nkPhotoFileInput" type="file" accept="image/*" capture="environment" style="display:none">
      </label>
    </div>
    <div class="nk-pill-bar" id="nkPhotoQuickCaptions">
      <button type="button" data-pcap="경비실 보관 완료">경비실 보관</button>
      <button type="button" data-pcap="교무실 전달 완료">교무실 전달</button>
      <button type="button" data-pcap="현관 앞 안전 보관">현관 앞</button>
      <button type="button" data-pcap="회수 물품 확인">회수 확인</button>
    </div>
    <div id="nkPhotoList" class="nk-photo-grid"></div>
  `;
  document.body.appendChild(photoDlg);

  let activePhotoSchoolId = null;
  function renderPhotoModal() {
    const s = getSchools().find(x => x.id === Number(activePhotoSchoolId));
    document.getElementById('nkPhotoDlgTitle').textContent = s ? `📷 ${s.name} · 납품 증빙 사진` : '📷 납품 증빙 사진';
    const list = photosForSchool(activePhotoSchoolId);
    const box = document.getElementById('nkPhotoList');
    if (!list.length) {
      box.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:24px;font-size:13px">저장된 증빙 사진이 없습니다. 위 버튼으로 촬영하거나 앨범에서 선택하세요.</div>';
      return;
    }
    box.innerHTML = list.map(p => `
      <div class="nk-photo-card">
        <img src="${p.dataUrl}" alt="${esc(p.caption || '증빙사진')}" data-ph-open="${esc(p.id)}">
        <div class="meta">
          <strong>${esc(p.caption || '납품 증빙')}</strong>
          <small style="color:#94a3b8">${esc(p.dayKey)} ${fmtHm(p.at)}</small>
          <div class="acts">
            <button type="button" data-ph-share="${esc(p.id)}" data-ph-key="${esc(p.storeKey)}">공유/저장</button>
            <button type="button" data-ph-del="${esc(p.id)}" data-ph-key="${esc(p.storeKey)}" style="color:#fda4af">삭제</button>
          </div>
        </div>
      </div>
    `).join('');
  }
  function openPhotoModal(schoolId) {
    activePhotoSchoolId = Number(schoolId);
    document.getElementById('nkPhotoCaptionInput').value = '';
    renderPhotoModal();
    photoDlg.showModal();
  }
  window.nkOpenPhotoModal = openPhotoModal;

  photoDlg.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close-dlg]')) { photoDlg.close(); return; }
    const qc = e.target.closest('[data-pcap]');
    if (qc) { document.getElementById('nkPhotoCaptionInput').value = qc.getAttribute('data-pcap'); return; }
    const delBtn = e.target.closest('[data-ph-del]');
    if (delBtn) {
      const id = delBtn.getAttribute('data-ph-del');
      const key = delBtn.getAttribute('data-ph-key');
      const store = loadPhotoStore();
      if (Array.isArray(store[key])) {
        store[key] = store[key].filter(x => x.id !== id);
        if (!store[key].length) delete store[key];
        savePhotoStore(store);
        renderPhotoModal();
        if (typeof renderList === 'function') renderList();
      }
      return;
    }
    const shareBtn = e.target.closest('[data-ph-share]');
    if (shareBtn) {
      const id = shareBtn.getAttribute('data-ph-share');
      const key = shareBtn.getAttribute('data-ph-key');
      const item = (loadPhotoStore()[key] || []).find(x => x.id === id);
      if (!item) return;
      try {
        const blob = await (await fetch(item.dataUrl)).blob();
        const file = new File([blob], `delivery_${key.replace(':', '_')}.jpg`, { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: item.schoolName || '납품 증빙', text: item.caption || '' });
          return;
        }
      } catch (err) {}
      const a = document.createElement('a');
      a.href = item.dataUrl;
      a.download = `delivery_${key.replace(':', '_')}.jpg`;
      a.click();
      return;
    }
    const img = e.target.closest('img[data-ph-open]');
    if (img) {
      const w = window.open('');
      if (w) w.document.write(`<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${img.src}" style="max-width:100%;max-height:100vh"></body>`);
    }
  });
  document.getElementById('nkPhotoFileInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || activePhotoSchoolId == null) return;
    try {
      const dataUrl = await compressImageFile(file, 760, 0.62);
      const s = getSchools().find(x => x.id === Number(activePhotoSchoolId));
      const store = loadPhotoStore();
      const k = `${todayStr()}:${activePhotoSchoolId}`;
      const arr = Array.isArray(store[k]) ? store[k] : [];
      arr.push({
        id: 'ph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        schoolName: s ? s.name : '',
        caption: document.getElementById('nkPhotoCaptionInput').value.trim() || '납품 증빙',
        dataUrl,
        at: Date.now()
      });
      store[k] = arr.slice(-3);
      if (savePhotoStore(store)) {
        renderPhotoModal();
        if (typeof renderList === 'function') renderList();
        const modalBtn = document.getElementById('nkModalPhotoBtn');
        if (modalBtn) modalBtn.textContent = `📷 증빙사진 (${photosForSchool(activePhotoSchoolId).length})`;
        if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
        toast('📷 납품 증빙 사진을 저장했습니다.');
      }
    } catch (err) {
      toast('사진 처리 실패: ' + (err.message || err));
    }
  });

  window.nkRenderReportPhotos = function (dayKey, container) {
    if (!container) return;
    const list = photosForDay(dayKey);
    if (!list.length) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = 'block';
    container.innerHTML = `
      <div style="font-size:12px;font-weight:800;color:#c7d2fe;margin-bottom:5px">📷 이날 저장된 증빙 사진 (${list.length}장)</div>
      <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px">
        ${list.map(p => `<div style="flex:0 0 92px;border-radius:9px;overflow:hidden;border:1px solid #334155;background:#16243a;text-align:center">
          <img src="${p.dataUrl}" alt="${esc(p.schoolName)}" style="width:92px;height:66px;object-fit:cover;cursor:pointer" onclick="window.nkOpenPhotoModal && window.nkOpenPhotoModal(${Number(p.schoolId)})">
          <div style="font-size:10px;padding:3px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#cbd5e1">${esc(p.schoolName || p.caption)}</div>
        </div>`).join('')}
      </div>`;
  };

  // =========================================================================
  // Feature #8B: 원클릭 문자 템플릿 모달 (#nkSmsDialog)
  // =========================================================================
  const smsDlg = document.createElement('dialog');
  smsDlg.id = 'nkSmsDialog';
  smsDlg.className = 'nk-pro-dialog';
  smsDlg.innerHTML = `
    <div class="nk-pro-head">
      <div>
        <h2 id="nkSmsTitle">📩 원클릭 문자 발송</h2>
        <p class="sub" id="nkSmsSub" style="margin:0"></p>
      </div>
      <button type="button" class="nk-pro-close" data-close-dlg>✕</button>
    </div>
    <div id="nkSmsTemplates"></div>
    <label for="nkSmsBodyInput" style="display:block;font-size:12px;font-weight:700;color:#cbd5e1;margin:8px 0 4px">발송 문구 (직접 수정 가능)</label>
    <textarea id="nkSmsBodyInput" rows="4" style="width:100%;padding:10px;border-radius:10px;border:1px solid #3f5573;background:#0c1728;color:#fff;font-size:14px"></textarea>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button type="button" id="nkSmsCopyBtn" style="flex:1;padding:10px;border-radius:10px;background:#334155;color:#fff;font-weight:800">📋 문구 복사</button>
      <button type="button" id="nkSmsSendBtn" style="flex:1.4;padding:10px;border-radius:10px;background:#10b981;color:#022c22;font-weight:900">📩 문자 앱 열기</button>
    </div>
  `;
  document.body.appendChild(smsDlg);

  let activeSmsPhone = '';
  function openSmsModal(schoolId) {
    const s = getSchools().find(x => x.id === Number(schoolId));
    if (!s) return;
    activeSmsPhone = String(s.phone || '').trim();
    const qty = typeof totalLabel === 'function' ? totalLabel(s) : '';
    const qPart = qty ? ` (${qty})` : '';
    const tpls = [
      { label: '🚗 10분 뒤 도착 예정', body: `[엔터코딩] 안녕하세요, ${s.name}입니다. 약 10분 뒤 교재 납품 방문 예정입니다.` },
      { label: '📦 교무실/원내 전달 완료', body: `[엔터코딩] ${s.name} 교재${qPart} 전달 완료했습니다. 감사합니다.` },
      { label: '🏢 경비실·현관 안전 보관', body: `[엔터코딩] ${s.name} 부재중이셔서 경비실(현관)에 교재${qPart} 안전하게 보관해 두었습니다.` },
      { label: '🔁 부재중 재방문 안내', body: `[엔터코딩] ${s.name} 방문드렸으나 부재중이셔서 추후 다시 방문드리겠습니다.` }
    ];
    document.getElementById('nkSmsTitle').textContent = `📩 ${s.name} · 문자 보내기`;
    document.getElementById('nkSmsSub').textContent = activeSmsPhone ? `수신 번호: ${activeSmsPhone}` : '등록된 전화번호가 없습니다 (복사 후 사용 가능)';
    const box = document.getElementById('nkSmsTemplates');
    box.innerHTML = tpls.map((t, i) => `<button type="button" class="nk-sms-tpl ${i === 0 ? 'on' : ''}" data-sms-idx="${i}"><strong>${esc(t.label)}</strong><div style="font-size:11px;color:#94a3b8;font-weight:500;margin-top:2px">${esc(t.body)}</div></button>`).join('');
    box._tpls = tpls;
    document.getElementById('nkSmsBodyInput').value = tpls[0].body;
    smsDlg.showModal();
  }
  window.nkOpenSmsModal = openSmsModal;

  smsDlg.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close-dlg]')) { smsDlg.close(); return; }
    const tb = e.target.closest('[data-sms-idx]');
    if (tb) {
      const box = document.getElementById('nkSmsTemplates');
      const idx = Number(tb.getAttribute('data-sms-idx'));
      box.querySelectorAll('.nk-sms-tpl').forEach(x => x.classList.toggle('on', x === tb));
      if (box._tpls && box._tpls[idx]) document.getElementById('nkSmsBodyInput').value = box._tpls[idx].body;
      return;
    }
    if (e.target.closest('#nkSmsCopyBtn')) {
      const body = document.getElementById('nkSmsBodyInput').value;
      try { await navigator.clipboard.writeText(body); toast('📋 문자 내용을 복사했습니다.'); } catch (err) { toast('복사에 실패했습니다.'); }
      return;
    }
    if (e.target.closest('#nkSmsSendBtn')) {
      const body = document.getElementById('nkSmsBodyInput').value.trim();
      if (!activeSmsPhone) { toast('등록된 전화번호가 없습니다. 먼저 메모·상태에서 전화번호를 입력해 주세요.'); return; }
      bridge().sendSmsDirect?.(activeSmsPhone, body);
      smsDlg.close();
    }
  });

  // =========================================================================
  // Feature #7: 담당 기사 일괄 배정 & 내 이름 설정 모달 (#nkAssigneeDialog)
  // =========================================================================
  const assignDlg = document.createElement('dialog');
  assignDlg.id = 'nkAssigneeDialog';
  assignDlg.className = 'nk-pro-dialog';
  assignDlg.innerHTML = `
    <div class="nk-pro-head">
      <div>
        <h2>👥 정규 납품 담당 기사 배정</h2>
        <p class="sub" style="margin:0">지역별 일괄 배정이나 원별 담당 기사를 지정하면 기기 간 실시간 공유됩니다.</p>
      </div>
      <button type="button" class="nk-pro-close" data-close-dlg>✕</button>
    </div>
    <div style="padding:10px 12px;border-radius:12px;background:#16243a;border:1px solid #2b4464;margin-bottom:10px">
      <div style="font-size:12px;font-weight:800;color:#93c5fd;margin-bottom:6px">🙋 이 기기의 '내 담당' 이름 설정</div>
      <div style="display:flex;gap:6px">
        <input id="nkMyDriverInput" type="text" list="nkProDriverDatalist" placeholder="내 이름 (예: 홍길동)" style="flex:1;padding:8px 10px;border-radius:9px;border:1px solid #3f5573;background:#0c1728;color:#fff;font-size:13px">
        <button type="button" id="nkSaveMyDriverBtn" style="padding:0 14px;border-radius:9px;background:#4f46e5;color:#fff;font-size:12px;font-weight:900">저장</button>
      </div>
      <datalist id="nkProDriverDatalist"></datalist>
    </div>
    <div style="padding:10px 12px;border-radius:12px;background:#16243a;border:1px solid #2b4464;margin-bottom:10px">
      <div style="font-size:12px;font-weight:800;color:#86efac;margin-bottom:6px">⚡ 지역별 일괄 배정</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        <select id="nkBulkRegionSel" style="flex:1;min-width:110px;padding:8px;border-radius:9px;border:1px solid #3f5573;background:#0c1728;color:#fff;font-size:13px"></select>
        <input id="nkBulkDriverInp" type="text" list="nkProDriverDatalist" placeholder="배정할 기사 이름 (비우면 해제)" style="flex:1.3;min-width:130px;padding:8px;border-radius:9px;border:1px solid #3f5573;background:#0c1728;color:#fff;font-size:13px">
        <button type="button" id="nkBulkAssignBtn" style="padding:8px 14px;border-radius:9px;background:#10b981;color:#022c22;font-size:12px;font-weight:900">일괄 적용</button>
      </div>
    </div>
    <div id="nkPerSchoolAssignList" style="max-height:42dvh;overflow:auto"></div>
  `;
  document.body.appendChild(assignDlg);

  function renderAssigneeDialog() {
    const schools = getSchools();
    const names = getKnownAssignees();
    document.getElementById('nkProDriverDatalist').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
    document.getElementById('nkMyDriverInput').value = myDriverName;
    const regions = [...new Set(schools.map(s => s.regionGroup || '기타'))];
    document.getElementById('nkBulkRegionSel').innerHTML = regions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    document.getElementById('nkPerSchoolAssignList').innerHTML = schools.map(s => `
      <div class="nk-master-row">
        <div><strong>${esc(s.name)}</strong> <small style="color:#94a3b8">${esc(s.regionGroup || '')} ${esc(s.subRegion || '')}</small></div>
        <input type="text" list="nkProDriverDatalist" data-as-sid="${s.id}" value="${esc(s.assignee || '')}" placeholder="미배정" style="width:120px;padding:6px 8px;border-radius:8px;border:1px solid #3f5573;background:#0c1728;color:#fff;font-size:12px">
      </div>
    `).join('');
  }
  function openAssigneeDialog() {
    if (bridge().getSyncUser?.() && !bridge().getWorksMembers?.().length) {
      bridge().loadWorksMembers?.().then(() => { if (assignDlg.open) renderAssigneeDialog(); syncToolbarState(); }).catch(() => {});
    }
    renderAssigneeDialog();
    assignDlg.showModal();
  }
  assignDlg.addEventListener('change', (e) => {
    const inp = e.target.closest('input[data-as-sid]');
    if (!inp) return;
    const s = getSchools().find(x => x.id === Number(inp.getAttribute('data-as-sid')));
    if (!s) return;
    s.assignee = inp.value.trim();
    recordSchoolsToMaster([s], { skipSync: true });
    if (typeof saveState === 'function') saveState();
    if (typeof renderList === 'function') renderList();
  });
  assignDlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-dlg]')) { assignDlg.close(); return; }
    if (e.target.closest('#nkSaveMyDriverBtn')) {
      myDriverName = document.getElementById('nkMyDriverInput').value.trim();
      try { localStorage.setItem(MY_DRIVER_KEY, myDriverName); } catch (err) {}
      syncToolbarState();
      toast(myDriverName ? `🙋 내 담당 이름을 [${myDriverName}]으로 저장했습니다.` : '내 담당 이름 설정을 지웠습니다.');
      return;
    }
    if (e.target.closest('#nkBulkAssignBtn')) {
      const reg = document.getElementById('nkBulkRegionSel').value;
      const who = document.getElementById('nkBulkDriverInp').value.trim();
      let cnt = 0;
      getSchools().forEach(s => {
        if ((s.regionGroup || '기타') === reg) { s.assignee = who; cnt++; }
      });
      recordSchoolsToMaster(getSchools(), { skipSync: true });
      if (typeof saveState === 'function') saveState();
      if (typeof renderList === 'function') renderList();
      renderAssigneeDialog();
      toast(`✓ [${reg}] ${cnt}곳의 담당자를 ${who ? `[${who}]` : '미배정'}으로 변경했습니다.`);
    }
  });

  // =========================================================================
  // Feature #9: 원 마스터 관리 모달 (#nkMasterDialog)
  // =========================================================================
  const masterDlg = document.createElement('dialog');
  masterDlg.id = 'nkMasterDialog';
  masterDlg.className = 'nk-pro-dialog';
  masterDlg.innerHTML = `
    <div class="nk-pro-head">
      <div>
        <h2>📚 원 마스터 정보 (납품표 교체 시 자동 유지)</h2>
        <p class="sub" id="nkMasterMeta" style="margin:0">저장된 정밀 GPS 좌표 · 주차/현관 메모 · 전화번호 · 방문 시간대를 매달 새 납품표에 자동 상속합니다.</p>
      </div>
      <button type="button" class="nk-pro-close" data-close-dlg>✕</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
      <input id="nkMasterSearchInp" type="search" placeholder="🔍 원 이름 · 메모 · 주소 검색" style="flex:1;min-width:160px;padding:8px 10px;border-radius:9px;border:1px solid #3f5573;background:#0c1728;color:#fff;font-size:13px">
      <button type="button" id="nkMasterSyncCurrentBtn" style="padding:8px 11px;border-radius:9px;background:#2563eb;color:#fff;font-size:12px;font-weight:800">📥 현재 목록 저장</button>
      <button type="button" id="nkMasterApplyCurrentBtn" style="padding:8px 11px;border-radius:9px;background:#059669;color:#fff;font-size:12px;font-weight:800">🔄 현재 목록에 채우기</button>
    </div>
    <div id="nkMasterList" style="max-height:52dvh;overflow:auto"></div>
  `;
  document.body.appendChild(masterDlg);

  function renderMasterDialog() {
    const db = loadMasterDb();
    const q = (document.getElementById('nkMasterSearchInp')?.value || '').trim().toLowerCase();
    const entries = Object.entries(db)
      .filter(([, v]) => !q || [v.name, v.address, v.phone, v.memo, v.visitWindow, v.assignee].filter(Boolean).join(' ').toLowerCase().includes(q))
      .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || '', 'ko'));
    document.getElementById('nkMasterMeta').textContent = `총 ${Object.keys(db).length}개 원 마스터 보관 중 · 기기 실시간 공유 연동됨`;
    const box = document.getElementById('nkMasterList');
    if (!entries.length) {
      box.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:24px">보관된 원 마스터 정보가 없습니다.</p>';
      return;
    }
    box.innerHTML = entries.map(([k, v]) => `
      <div class="nk-master-row">
        <div style="min-width:0;flex:1">
          <strong>${esc(v.name)}</strong> ${v.assignee ? `<span class="nk-badge nk-badge-driver">👤 ${esc(v.assignee)}</span>` : ''}
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">${esc(v.address || '주소 없음')}${isFinite(v.lat) ? ' · 📍좌표 저장됨' : ''}${v.phone ? ' · 📞 ' + esc(v.phone) : ''}</div>
          ${(v.visitWindow || v.memo) ? `<div style="font-size:11px;color:#7dd3fc;margin-top:2px">${v.visitWindow ? `⏰ ${esc(v.visitWindow)} · ` : ''}${esc(v.memo || '')}</div>` : ''}
        </div>
        <button type="button" data-mdel="${esc(k)}" style="padding:5px 9px;border-radius:8px;background:#3f1d2e;color:#fda4af;border:1px solid #881337;font-size:11px;font-weight:800">삭제</button>
      </div>
    `).join('');
  }
  function openMasterDialog() {
    recordSchoolsToMaster(getSchools());
    renderMasterDialog();
    masterDlg.showModal();
  }
  document.getElementById('nkMasterSearchInp').addEventListener('input', renderMasterDialog);
  masterDlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-dlg]')) { masterDlg.close(); return; }
    if (e.target.closest('#nkMasterSyncCurrentBtn')) {
      recordSchoolsToMaster(getSchools());
      renderMasterDialog();
      toast('✓ 현재 목록의 좌표·메모·전화·시간대를 원 마스터에 반영했습니다.');
      return;
    }
    if (e.target.closest('#nkMasterApplyCurrentBtn')) {
      let applied = 0;
      getSchools().forEach(s => { if (hydrateSchoolFromMaster(s)) applied++; });
      if (applied) {
        if (typeof saveState === 'function') saveState();
        if (typeof renderList === 'function') renderList();
      }
      toast(applied ? `✓ 원 마스터에서 ${applied}곳의 정보를 자동 채웠습니다.` : '새로 채울 빈 항목이 없습니다.');
      return;
    }
    const delK = e.target.closest('[data-mdel]')?.getAttribute('data-mdel');
    if (delK) {
      const db = loadMasterDb();
      delete db[delK];
      saveMasterDb(db);
      renderMasterDialog();
    }
  });

  // =========================================================================
  // Feature #10: 주간·월간 납품 실적 대시보드 & CSV/엑셀 내보내기 (#nkStatsDialog)
  // =========================================================================
  const statsDlg = document.createElement('dialog');
  statsDlg.id = 'nkStatsDialog';
  statsDlg.className = 'nk-pro-dialog';
  statsDlg.innerHTML = `
    <div class="nk-pro-head">
      <div>
        <h2>📊 주간·월간 납품 실적 대시보드</h2>
        <p class="sub" style="margin:0">납품 앱에서 직접 완료 처리한 일별 기록(최근 60일 · 기기 간 동기화)을 집계합니다.</p>
      </div>
      <button type="button" class="nk-pro-close" data-close-dlg>✕</button>
    </div>
    <div class="nk-pill-bar" id="nkStatsPeriodBar">
      <button type="button" data-sp="week" aria-pressed="true">이번 주</button>
      <button type="button" data-sp="7d" aria-pressed="false">최근 7일</button>
      <button type="button" data-sp="month" aria-pressed="false">이번 달</button>
      <button type="button" data-sp="30d" aria-pressed="false">최근 30일</button>
      <button type="button" data-sp="all" aria-pressed="false">전체 (60일)</button>
    </div>
    <div id="nkStatsKpis" class="nk-kpi-grid"></div>
    <div id="nkStatsChart" style="margin-bottom:12px"></div>
    <div id="nkStatsDrivers" style="margin-bottom:12px"></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">
      <button type="button" id="nkStatsCopyBtn" style="padding:9px 14px;border-radius:10px;background:#2563eb;color:#fff;font-size:12px;font-weight:800">📋 실적 요약 복사</button>
      <button type="button" id="nkStatsCsvBtn" style="padding:9px 16px;border-radius:10px;background:#10b981;color:#022c22;font-size:12px;font-weight:900">⬇️ 엑셀(CSV) 다운로드</button>
    </div>
  `;
  document.body.appendChild(statsDlg);

  let statsPeriod = 'week';
  let lastStatsResult = null;

  function computeStats(period) {
    if (typeof window.nkSyncTodayLog === 'function') { try { window.nkSyncTodayLog(); } catch (e) {} }
    let log = {};
    try { log = JSON.parse(localStorage.getItem(DAY_LOG_KEY) || '{}') || {}; } catch (e) {}
    const tKey = todayStr();
    const now = new Date();
    let fromKey = '0000-00-00';
    if (period === 'week') {
      const dow = (now.getDay() + 6) % 7; // Monday start
      fromKey = shiftDay(tKey, -dow);
    } else if (period === '7d') {
      fromKey = shiftDay(tKey, -6);
    } else if (period === 'month') {
      fromKey = tKey.slice(0, 8) + '01';
    } else if (period === '30d') {
      fromKey = shiftDay(tKey, -29);
    }

    const days = [];
    const driverMap = new Map();
    const csvRows = [['날짜', '구분', '원 이름', '품목/수량', '담당 기사', '완료 시각']];
    let totalSchools = 0, totalQty = 0, totalPickups = 0;

    Object.keys(log).sort().forEach(dk => {
      if (dk < fromKey || dk > tKey) return;
      const entry = log[dk] || {};
      const delivs = Object.values(entry.deliveries || {});
      const pks = Object.values(entry.pickups || {});
      const dCount = delivs.length;
      const dQty = delivs.reduce((a, x) => a + (Number(x.qty) || 0), 0);
      const pCount = pks.length;
      if (!dCount && !pCount) return;
      totalSchools += dCount;
      totalQty += dQty;
      totalPickups += pCount;
      days.push({ dk, dCount, dQty, pCount });

      delivs.forEach(d => {
        const who = (d.assignee && String(d.assignee).trim()) || '미지정';
        const cur = driverMap.get(who) || { schools: 0, qty: 0, pickups: 0 };
        cur.schools += 1; cur.qty += Number(d.qty) || 0;
        driverMap.set(who, cur);
        csvRows.push([dk, '정규 납품', d.name || '', `${Number(d.qty) || 0}개`, who, fmtHm(d.at)]);
      });
      pks.forEach(p => {
        const who = (p.assignee && String(p.assignee).trim()) || '미지정';
        const cur = driverMap.get(who) || { schools: 0, qty: 0, pickups: 0 };
        cur.pickups += 1;
        driverMap.set(who, cur);
        csvRows.push([dk, p.type || '회수·추가', p.school || '', p.items || '', who, fmtHm(p.at)]);
      });
    });

    const holdCount = getSchools().filter(s => {
      if (getCompleted()[s.id]) return false;
      const st = s.fieldOps && s.fieldOps.deliveryStatus;
      return st === '보류' || st === '재방문' || st === '부분 완료' || st === '연락필요';
    }).length;

    return { period, fromKey, toKey: tKey, days, totalSchools, totalQty, totalPickups, holdCount, drivers: [...driverMap.entries()].sort((a, b) => (b[1].schools + b[1].pickups) - (a[1].schools + a[1].pickups)), csvRows };
  }
  window.nkComputeStats = computeStats;

  function renderStatsDialog() {
    const r = computeStats(statsPeriod);
    lastStatsResult = r;
    document.getElementById('nkStatsKpis').innerHTML = `
      <div class="nk-kpi"><small>정규 납품 완료</small><b style="color:#34d399">${r.totalSchools}곳</b></div>
      <div class="nk-kpi"><small>총 납품 수량</small><b style="color:#fbbf24">${r.totalQty.toLocaleString()}개</b></div>
      <div class="nk-kpi"><small>회수·추가 완료</small><b style="color:#c084fc">${r.totalPickups}건</b></div>
      <div class="nk-kpi"><small>현재 보류·재방문</small><b style="color:#fb7185">${r.holdCount}곳</b></div>
    `;
    const chartBox = document.getElementById('nkStatsChart');
    if (!r.days.length) {
      chartBox.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:18px;font-size:13px">선택한 기간에 완료 기록이 없습니다.</p>';
    } else {
      const maxVal = Math.max(1, ...r.days.map(d => d.dCount + d.pCount));
      chartBox.innerHTML = '<div style="font-size:12px;font-weight:800;color:#cbd5e1;margin-bottom:6px">📅 일별 처리 추이</div>' +
        r.days.slice(-14).reverse().map(d => {
          const pct = Math.max(6, Math.round(((d.dCount + d.pCount) / maxVal) * 100));
          return `<div class="nk-bar-row">
            <span style="color:#94a3b8;font-weight:700">${esc(d.dk.slice(5))}</span>
            <div class="nk-bar-track"><div class="nk-bar-fill" style="width:${pct}%"></div></div>
            <span style="text-align:right;font-weight:800">${d.dCount}원/${d.pCount}건</span>
          </div>`;
        }).join('');
    }
    const drvBox = document.getElementById('nkStatsDrivers');
    if (r.drivers.length) {
      drvBox.innerHTML = '<div style="font-size:12px;font-weight:800;color:#cbd5e1;margin-bottom:6px">👤 담당자별 실적</div>' +
        r.drivers.map(([who, v]) => `<div class="nk-master-row"><strong>${esc(who)}</strong><span>정규 ${v.schools}곳 (${v.qty.toLocaleString()}개) · 회수/추가 ${v.pickups}건</span></div>`).join('');
    } else {
      drvBox.innerHTML = '';
    }
  }
  function openStatsDialog() {
    renderStatsDialog();
    statsDlg.showModal();
  }
  window.nkOpenStatsDialog = openStatsDialog;

  statsDlg.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close-dlg]')) { statsDlg.close(); return; }
    const sp = e.target.closest('[data-sp]');
    if (sp) {
      statsPeriod = sp.getAttribute('data-sp');
      statsDlg.querySelectorAll('[data-sp]').forEach(b => b.setAttribute('aria-pressed', String(b === sp)));
      renderStatsDialog();
      return;
    }
    if (e.target.closest('#nkStatsCopyBtn') && lastStatsResult) {
      const r = lastStatsResult;
      const lines = [
        `[엔터코딩 납품 실적 요약] ${r.fromKey === '0000-00-00' ? '최근 60일' : r.fromKey + ' ~ ' + r.toKey}`,
        `• 정규 납품 완료: ${r.totalSchools}곳 (총 ${r.totalQty}개)`,
        `• 회수·추가 처리 완료: ${r.totalPickups}건`,
        `• 현재 보류·재방문: ${r.holdCount}곳`,
        ...r.days.map(d => `- ${d.dk}: 납품 ${d.dCount}곳(${d.dQty}개) / 회수·추가 ${d.pCount}건`)
      ].join('\n');
      try { await navigator.clipboard.writeText(lines); toast('📋 실적 요약을 클립보드에 복사했습니다.'); } catch (err) { toast('복사에 실패했습니다.'); }
      return;
    }
    if (e.target.closest('#nkStatsCsvBtn') && lastStatsResult) {
      const cell = (v) => {
        let s = String(v ?? '');
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
      };
      const csv = '\uFEFF' + lastStatsResult.csvRows.map(row => row.map(cell).join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `엔터코딩_납품실적_${todayStr()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast('⬇️ 엑셀(CSV) 실적 파일을 저장했습니다.');
    }
  });

  // =========================================================================
  // 툴바 버튼 이벤트 연결 & 초기 실행
  // =========================================================================
  document.getElementById('nkOpenOverviewMapBtn')?.addEventListener('click', openOverviewMapDialog);
  document.getElementById('nkOpenUnifiedRouteBtn')?.addEventListener('click', openUnifiedRouteDialog);
  document.getElementById('nkToggleCourseFilterBtn')?.addEventListener('click', () => {
    const cSet = getTodayCourseSet();
    if (!filterCourseOnly && !cSet.size) { openCourseDialog(); return; }
    filterCourseOnly = !filterCourseOnly;
    if (typeof renderList === 'function') renderList();
    if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
  });
  document.getElementById('nkOpenCoursePickerBtn')?.addEventListener('click', openCourseDialog);
  document.getElementById('nkDeliveryAssigneeFilter')?.addEventListener('change', (e) => {
    filterAssignee = e.target.value;
    if (typeof renderList === 'function') renderList();
    if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
  });
  document.getElementById('nkToggleMyDriverBtn')?.addEventListener('click', () => {
    if (!myDriverName) { openAssigneeDialog(); return; }
    filterAssignee = (filterAssignee === myDriverName) ? '' : myDriverName;
    if (typeof renderList === 'function') renderList();
    if (typeof syncNativeAndDomOverlays === 'function') syncNativeAndDomOverlays();
  });
  document.getElementById('nkOpenAssigneeMgrBtn')?.addEventListener('click', openAssigneeDialog);
  document.getElementById('nkOpenStatsQuickBtn')?.addEventListener('click', openStatsDialog);

  window.nkOnProDataUpdated = function () {
    syncToolbarState();
    refreshRevisitBanner();
    if (mapDlg.open) renderOverviewMap();
    if (routeDlg.open) renderUnifiedRoute();
    if (statsDlg.open) renderStatsDialog();
    flushOrderSyncQueue();
  };

  // 초기 마스터 시드 & UI 장식
  try {
    recordSchoolsToMaster(getSchools(), { skipSync: true });
    window.nkDecorateDeliveryUi();
    setTimeout(() => { flushOrderSyncQueue(); }, 2500);
  } catch (e) {}
})();
