const CACHE = 'cardfeel-ghp-v1';
const PRECACHE = [
  './', './index.html', './styles.css', './app.js',
  './manifest.json', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './offline-ping.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : Promise.resolve())))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
