(() => {
  'use strict';
  if (window.__mapViewWithoutAutoPopup) return;
  window.__mapViewWithoutAutoPopup = true;
  const navigationSelector = '[data-pk-navi],[data-pkd-navi],[data-dw-navi],[data-action="naver-speech"],#hudNaverAppLink,#modalNaverAppLink,#modalKakaoNavLink,[data-map-purpose="navigation"]';
  function isMapView(a) {
    if (a.matches(navigationSelector)) return false;
    const href = a.getAttribute('href') || '';
    const app = a.getAttribute('data-nmap') || '';
    if (/^(?:nmap:\/\/navigation|kakaomap:\/\/route)/i.test(href) || /^nmap:\/\/navigation/i.test(app)) return false;
    if (a.matches('[data-map-purpose="view"],#hudNaverWebLink,#modalNaverWebLink,#geoNaverCheck')) return true;
    if (a.hasAttribute('data-nmap')) return true;
    try {
      const url = new URL(href, location.href);
      if (!['map.naver.com','map.kakao.com','maps.kakao.com'].includes(url.hostname)) return false;
      if (/\/(?:directions|navigation|link\/to)(?:\/|$)/i.test(url.pathname)) return false;
      return true;
    } catch (_) { return false; }
  }
  window.addEventListener('click', e => {
    const target = e.target instanceof Element ? e.target : e.target?.parentElement;
    const a = target?.closest('a');
    if (!a || !isMapView(a)) return;
    // Stop card/detail/HUD click handlers, not the separate navigation handlers.
    e.stopImmediatePropagation();
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const app = a.getAttribute('data-nmap');
    const href = a.getAttribute('href');
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const native = !!(window.AndroidOverlay || window.DeliveryNative);
    if (app && href && (mobile || native) && typeof openNaverMapApp === 'function') {
      e.preventDefault();
      openNaverMapApp(app, href);
    }
    // Other map links keep their normal browser default action.
    // No popup, screen-off, target-lock, or keep-alive functions are called here.
  }, true);
})();
