/* Parent Orientation Tracker — installable PWA shell + offline-friendly static assets */
const CACHE_VERSION = 'po-pwa-v3';

const PRECACHE_URLS = [
  '/',
  '/app.js',
  '/react-toastify-bundle.js',
  '/react-toastify-bundle.css',
  '/vendor/exceljs.min.js',
  '/vendor/FileSaver.min.js',
  '/manifest.webmanifest',
  '/pwa-icon.svg',
];

function shouldSkipRuntimeCache(pathname) {
  if (pathname.startsWith('/api/')) return true;
  if (pathname === '/Parent_Orientation_Tracker.xlsx') return true;
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
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
        const cached = await caches.match('/');
        return cached || new Response('You are offline. Open the app when you are back online.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
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
