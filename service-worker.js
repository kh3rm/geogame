const CACHE_NAME = 'geocritter-lens-v0.9.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './src/app.js',
  './src/config.js',
  './src/creatures.js',
  './src/db.js',
  './src/backup.js',
  './src/encounter.js',
  './src/geo.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((name) => name === CACHE_NAME ? null : caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // Same-origin app files: cache-first, then network.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }))
    );
    return;
  }

  // Third-party libraries and map tiles: network-first. Avoid forcing offline support
  // for external content during this early prototype.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
