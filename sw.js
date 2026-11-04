// 엔터코딩 원별 납품 GPS 알리미 - Service Worker (PWA 설치 · 오프라인 캐시 · 백그라운드 도착 시스템 알림)
const CACHE_NAME = 'entercoding-delivery-v5';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
    ])
  );
});

// Network-first for HTML/navigation, Stale-While-Revalidate for static icons/manifest
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});

// Message handler from index.html (Arrival / Pickup Notifications & Keep-Alive Ping)
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'SHOW_ARRIVAL_NOTIFICATION') {
    const title = data.title || '📍 원 근처 도착 · 납품수량 안내';
    const options = {
      body: data.body || '납품 수량을 확인해 주세요.',
      icon: data.icon || 'icon-192.png',
      badge: data.badge || 'icon-192.png',
      tag: data.tag || 'entercoding-arrival',
      renotify: true,
      requireInteraction: true,
      vibrate: [350, 120, 350, 120, 500],
      data: data.payload || {},
      actions: data.actions || [
        { action: 'open', title: '📦 수량 크게 보기' },
        { action: 'complete', title: '✓ 납품완료 체크' }
      ]
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// Web Push handler (when server push is sent while app is closed)
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: '📍 엔터코딩 납품 알리미', body: event.data ? event.data.text() : '도착 알림이 도착했습니다.' };
  }
  const title = payload.title || '📍 원 근처 도착 · 납품수량 안내';
  const options = {
    body: payload.body || '앱을 열어 납품 수량을 확인하세요.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: payload.tag || 'entercoding-push',
    renotify: true,
    requireInteraction: true,
    vibrate: [350, 120, 350, 120, 500],
    data: payload.data || {},
    actions: [
      { action: 'open', title: '📦 수량 크게 보기' },
      { action: 'complete', title: '✓ 납품완료 체크' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler (works over Naver Navigation or Lock Screen)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const action = event.action || 'open';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const msg = {
        type: action === 'complete' ? 'SW_COMPLETE_ITEM' : 'SW_OPEN_ITEM',
        schoolId: payload.schoolId || null,
        pickupIds: payload.pickupIds || null
      };
      try {
        if ('BroadcastChannel' in self) {
          const bc = new BroadcastChannel('entercoding_sw_channel');
          bc.postMessage(msg);
          bc.close();
        }
      } catch (e) {}

      for (const client of clientList) {
        try { client.postMessage(msg); } catch (e) {}
      }

      if (action === 'complete') {
        return self.registration.showNotification('✓ 완료 체크 반영됨', {
          body: (payload.schoolName || '선택한 원') + ' 완료 상태로 저장되었습니다.',
          icon: 'icon-192.png',
          badge: 'icon-192.png',
          tag: 'entercoding-done-toast',
          silent: true
        });
      }

      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./index.html');
      }
    })
  );
});