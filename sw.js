// Offline cache. Bump VERSION whenever you change any file so phones pick up the update.
const VERSION = 'survey-v2';
const FILES = ['./', './index.html', './css/style.css', './js/app.js', './js/grid.js',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-192-maskable.png', './icons/icon-512-maskable.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// network first (always latest when online), fall back to cache when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
