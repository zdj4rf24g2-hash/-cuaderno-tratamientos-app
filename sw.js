/* App Cuaderno de Tratamientos · V 2.0 */
const APP_CACHE = 'ct-app-shell-v2.0.0-20260520';
const RUNTIME_CACHE = 'ct-runtime-v2.0.0-20260520';
const PRECACHE = [
  './',
  './index.html?v=2.0.0',
  './styles.css?v=2.0.0',
  './app.js?v=2.0.0',
  './vendor-loader.js?v=2.0.0',
  './manifest.webmanifest?v=2.0.0',
  './icon-192.png?v=2.0.0',
  './icon-512.png?v=2.0.0',
  './apple-touch-icon.png?v=2.0.0'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('ct-') && key !== APP_CACHE && key !== RUNTIME_CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put('./index.html?v=2.0.0', copy));
          return response;
        })
        .catch(() => caches.match('./index.html?v=2.0.0'))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached => {
        const network = fetch(request)
          .then(response => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
  );
});
