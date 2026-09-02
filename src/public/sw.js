// Service Worker for LAZ Digital Offline Support
// v2 — strategi network-first. Versi lama memakai cache-first
// (`return cached || networked`), sehingga styles.css dan app.js yang sudah
// diperbarui tetap disajikan dari cache lama sampai user hard-refresh.
const CACHE_NAME = 'laz-digital-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/public.html',
  '/js/utils/qrcode.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(e => console.log('SW cache partial', e));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
  self.clients.claim();
});

// Network-first: selalu ambil versi terbaru, cache hanya dipakai kalau offline.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.status === 200 && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
