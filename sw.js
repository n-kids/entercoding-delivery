// 납품알리미 Service Worker
// 앱 파일 캐시와 시스템 알림을 담당합니다.
// 원 정보·수량을 Service Worker가 직접 저장했다고 간주하지 않습니다.

const BUILD = 'integrated-20261107-r1';

const SCOPE = new URL(self.registration.scope);

const CACHE_PREFIX =
  'entercoding-delivery-' +
  encodeURIComponent(SCOPE.pathname) +
  '-';

const CACHE_NAME = CACHE_PREFIX + BUILD;

const REQUIRED_FILES = [
  'index.html',
  'manifest.webmanifest'
];

const OPTIONAL_FILES = [
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];

const appUrl = (name) => new URL(name, SCOPE).href;

async function cacheFile(cache, name) {
  const response = await fetch(appUrl(name), {
    cache: 'reload'
  });

  if (!response.ok) {
    throw new Error(`${name}: HTTP ${response.status}`);
  }

  await cache.put(appUrl(name), response);
}

// 필수 파일 준비 실패 시 설치를 성공으로 처리하지 않습니다.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    await Promise.all(
      REQUIRED_FILES.map((name) => cacheFile(cache, name))
    );

    const results = await Promise.allSettled(
      OPTIONAL_FILES.map((name) => cacheFile(cache, name))
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(
          '선택 캐시 파일을 준비하지 못했습니다:',
          OPTIONAL_FILES[index]
        );
      }
    });

    // 편집 중인 화면을 강제로 바꾸지 않기 위해
    // 여기서는 skipWaiting()을 호출하지 않습니다.
  })());
});

// 같은 앱·같은 경로에서 생성한 이전 캐시만 삭제합니다.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter((key) =>
          key.startsWith(CACHE_PREFIX) &&
          key !== CACHE_NAME
        )
        .map((key) => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

// HTML 및 정적 파일: 네트워크 우선, 실패 시 캐시 사용.
// API 요청·POST 요청·다른 출처 요청은 처리하지 않습니다.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== SCOPE.origin) return;
  if (!url.pathname.startsWith(SCOPE.pathname)) return;
  if (url.pathname.endsWith('/sw.js')) return;

  const navigation = request.mode === 'navigate';

  const staticAsset =
    /\.(?:html|js|mjs|css|webmanifest|svg|png|jpg|jpeg|webp|ico|woff2?)$/i
      .test(url.pathname);

  if (!navigation && !staticAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    async function fallback() {
      const exact = await cache.match(request);

      if (exact) return exact;

      if (navigation) {
        return cache.match(appUrl('index.html'));
      }

      return null;
    }

    try {
      const response = await fetch(request, {
        cache: 'no-cache'
      });

      if (response.ok) {
        await cache
          .put(request, response.clone())
          .catch(console.warn);

        return response;
      }

      // 서버 일시 장애 시 기존 정상 캐시가 있다면 사용합니다.
      if (response.status >= 500) {
        const cached = await fallback();

        if (cached) return cached;
      }

      // 404·403 등은 정상 파일로 캐시하지 않습니다.
      return response;
    } catch (error) {
      const cached = await fallback();

      if (cached) return cached;

      return new Response(
        navigation
          ? '오프라인입니다. 온라인에서 앱을 한 번 실행한 뒤 다시 시도하세요.'
          : 'Offline resource unavailable',
        {
          status: 503,
          headers: {
            'Content-Type': navigation
              ? 'text/html; charset=utf-8'
              : 'text/plain; charset=utf-8'
          }
        }
      );
    }
  })());
});

function notificationOptions(data) {
  return {
    body: data.body || '대상과 수량을 확인해 주세요.',
    icon: appUrl('icon-192.png'),
    badge: appUrl('icon-192.png'),
    tag: data.tag || 'entercoding-arrival',
    renotify: true,
    requireInteraction: true,
    vibrate: [350, 120, 350],
    data: data.payload || data.data || {},
    actions: [
      {
        action: 'open',
        title: '대상 보기'
      },
      {
        action: 'complete',
        title: '완료 처리 요청'
      }
    ]
  };
}

self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (data.type === 'SHOW_ARRIVAL_NOTIFICATION') {
    event.waitUntil(
      self.registration.showNotification(
        data.title || '도착·납품 안내',
        notificationOptions(data)
      )
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {
      body: event.data ? event.data.text() : ''
    };
  }

  if (!payload || typeof payload !== 'object') {
    payload = {};
  }

  event.waitUntil(
    self.registration.showNotification(
      payload.title || '납품 업무 안내',
      notificationOptions(payload)
    )
  );
});

// 한 개의 앱 창에 요청하고 저장 결과를 기다립니다.
// 여러 창에 동시에 완료 명령을 보내지 않습니다.
function requestClient(client, message) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();

    const timer = setTimeout(() => {
      channel.port1.close();

      resolve({
        ok: false,
        error: '앱의 저장 확인 응답이 없습니다.'
      });
    }, 6000);

    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();

      resolve(event.data || { ok: false });
    };

    try {
      client.postMessage(message, [channel.port2]);
    } catch (error) {
      clearTimeout(timer);
      channel.port1.close();

      resolve({
        ok: false,
        error: String(error)
      });
    }
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const payload = event.notification.data || {};
  const complete = event.action === 'complete';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    const clients = windows.filter((client) => {
      try {
        const url = new URL(client.url);

        return (
          url.origin === SCOPE.origin &&
          url.pathname.startsWith(SCOPE.pathname)
        );
      } catch (error) {
        return false;
      }
    });

    clients.sort((a, b) =>
      Number(b.visibilityState === 'visible') -
      Number(a.visibilityState === 'visible')
    );

    const message = {
      type: complete
        ? 'SW_COMPLETE_ITEM'
        : 'SW_OPEN_ITEM',

      schoolId: payload.schoolId ?? null,

      pickupIds: Array.isArray(payload.pickupIds)
        ? payload.pickupIds
        : null
    };

    if (clients.length) {
      const client = clients[0];
      const result = await requestClient(client, message);

      if (complete) {
        await self.registration.showNotification(
          result.ok
            ? '기기에 완료 저장됨'
            : '완료 저장을 확인하지 못했습니다.',
          {
            body: result.ok
              ? '기기 저장이 확인되었습니다. 서버·웍스 반영은 앱에서 별도로 확인하세요.'
              : (
                  result.error ||
                  '앱을 열어 완료 여부를 확인하세요.'
                ),
            tag: 'entercoding-completion-result',
            icon: appUrl('icon-192.png'),
            silent: true
          }
        );
      }

      if (!complete || !result.ok) {
        await client.focus();
      }

      return;
    }

    // 실행 중인 앱이 없으면 확인 화면만 엽니다.
    // 실제 저장 없이 완료 성공 알림을 표시하지 않습니다.
    const url = new URL('index.html', SCOPE);

    url.searchParams.set(
      'sw_mode',
      complete ? 'review' : 'open'
    );

    if (payload.schoolId != null) {
      url.searchParams.set(
        'schoolId',
        String(payload.schoolId)
      );
    }

    if (
      Array.isArray(payload.pickupIds) &&
      payload.pickupIds.length
    ) {
      url.searchParams.set(
        'pickupId',
        String(payload.pickupIds[0])
      );
    }

    await self.clients.openWindow(url.href);
  })());
});
