/* ═══════════════════════════════════════════════
   PRIONSENLIGNE — Service Worker
   Cache les pages principales pour consultation hors-ligne
═══════════════════════════════════════════════ */

const CACHE_NAME = 'pel-v80';
const PRECACHE = [
  '/',
  '/index.html',
  '/agenda',
  '/app.html',
  '/css/landing.css',
  '/css/style.css',
  '/js/app.js',
  '/js/auth.js',
  '/icons/icon.svg',
  '/icons/icon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Stratégie : réseau d'abord, cache en fallback (hors-ligne)
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Met en cache les réponses réussies des fichiers statiques
        if (res.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
