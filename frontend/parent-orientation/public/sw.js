/* Parent Orientation Tracker — installable PWA shell + offline-friendly static assets */
const CACHE_VERSION = 'po-pwa-v25';

function getScopePath() {
  try {
    return new URL(self.registration.scope).pathname.replace(/\/+$/, '') || '';
  } catch {
    return '';
  }
}

function absUrl(rel) {
  const r = String(rel || '').replace(/^\/+/, '');
  const scopePath = getScopePath();
  if (!scopePath) return `/${r}`.replace(/\/+/g, '/');
  return `${scopePath}/${r}`.replace(/\/+/g, '/');
}

function shouldSkipRuntimeCache(pathname) {
  const scopePath = getScopePath();
  if (pathname.startsWith('/api/')) return true;
  if (scopePath && pathname.startsWith(`${scopePath}/api/`)) return true;
  if (pathname === '/Parent_Orientation_Tracker.xlsx') return true;
  if (scopePath && pathname === `${scopePath}/Parent_Orientation_Tracker.xlsx`) return true;
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const PRECACHE_URLS = [
        self.registration.scope,
        absUrl('app.js'),
        absUrl('react-toastify-bundle.js'),
        absUrl('react-toastify-bundle.css'),
        absUrl('vendor/exceljs.min.js'),
        absUrl('vendor/FileSaver.min.js'),
        absUrl('manifest.webmanifest'),
        absUrl('brand/favicon.svg'),
        absUrl('brand/logo.png'),
        absUrl('brand/logo-white.png'),
        absUrl('brand/logo-color.png'),
        absUrl('brand/wiz-auth-bg.svg'),
        absUrl('pwa-icon.svg'),
      ];
      const cache = await caches.open(CACHE_VERSION);
      for (const url of PRECACHE_URLS) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn('[po-sw] precache skip', url);
        }
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (shouldSkipRuntimeCache(url.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(self.registration.scope);
        return cached || new Response('You are offline. Open the app when you are back online.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
    );
    return;
  }

  const appJsPath = absUrl('app.js');
  if (url.pathname === appJsPath || url.pathname.endsWith('/app.js')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic' && !shouldSkipRuntimeCache(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
