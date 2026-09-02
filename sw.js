/* ═══════════════════════════════════════════════
   PRIONSENLIGNE — Service Worker (version dans la constante VERSION ci-dessous)
   Stratégies de cache adaptées à chaque type de ressource pour
   optimiser perf 3G/4G (Afrique francophone notamment).

   - Précache : assets critiques (HTML, CSS, JS, icônes) au install
   - Pages HTML : stale-while-revalidate (instant + revalidation BG)
   - Assets same-origin : stale-while-revalidate
   - Drapeaux flagcdn + fonts CDN : cache-first (immutable)
   - API /api/* : network-first (fraîcheur des données)
═══════════════════════════════════════════════ */

// ⚠️ À chaque bump de VERSION, penser à aligner le « ?v=NNN » des balises
//    <script>/<link> dans app.html et index.html (cache-busting : l'HTML,
//    toujours frais (network-first), pointe ainsi vers des JS/CSS frais —
//    plus jamais de mélange de versions en cache).
const VERSION       = 'v221';
const STATIC_CACHE  = `pel-static-${VERSION}`;
const RUNTIME_CACHE = `pel-runtime-${VERSION}`;

const PRECACHE = [
  '/',
  '/index.html',
  '/agenda',
  '/app.html',
  '/css/landing.css',
  '/css/style.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/bible.js',
  '/js/bible-themes.js',
  '/icons/icon.svg',
  '/icons/icon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/manifest.json',
];

// ─── Install : précache des assets critiques ─────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate : purge des anciens caches ─────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Stratégies de cache ─────────────────────────────────────────

// Stale-while-revalidate : sert le cache (rapide) + revalide en arrière-plan.
// Idéal pour HTML/CSS/JS — le user voit instantanément le contenu, et la
// prochaine ouverture aura la version fraîche.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(res => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  return cached || networkPromise || Promise.reject(new Error('offline'));
}

// Cache-first : sert le cache si dispo, sinon réseau puis cache.
// Idéal pour assets immuables (drapeaux flagcdn, fonts).
async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    return cached || Promise.reject(err);
  }
}

// Network-first : tente réseau d'abord, fallback cache.
// Idéal pour /api/* (données dynamiques : Nominis bio, intentions, etc.).
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// ─── Fetch routing ───────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isApi        = isSameOrigin && url.pathname.startsWith('/api/');
  const isFlagCdn    = url.hostname === 'flagcdn.com';
  const isFontCdn    = (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdnjs.cloudflare.com'
  );

  // Endpoints internes Vercel (Web Analytics) : jamais interceptés/cachés,
  // sinon les pixels de mesure seraient servis depuis le cache.
  if (isSameOrigin && url.pathname.startsWith('/_vercel/')) return;

  // Requête de navigation (document HTML) : on détecte via request.mode ou Accept.
  const isNavigation = e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') || '').includes('text/html');

  // 1. API → network-first (données fraîches, fallback cache si offline)
  if (isApi) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // 2. Drapeaux + fonts CDN → cache-first (immuables, jamais re-fetch)
  if (isFlagCdn || isFontCdn) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // 3. Pages HTML (navigations) → network-first.
  //    CRUCIAL : la CSP est livrée en header HTTP du document. Servir une page
  //    HTML "stale" depuis le cache renverrait une ANCIENNE CSP (ex: sans
  //    youtube.com), bloquant l'embed KTO après mise à jour. Network-first
  //    garantit que les headers (donc la CSP) sont toujours à jour, avec
  //    fallback cache uniquement hors-ligne.
  if (isSameOrigin && isNavigation) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // 4. Autres assets same-origin (CSS, JS, images) → stale-while-revalidate
  if (isSameOrigin) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  // 4. Cross-origin streams audio (Radio Maria, Galilée…) → network direct
  // Pas de cache : ce sont des flux continus.
});

// ─── Push notifications (Web Push API) ───────────────────────────
// Reçu d'un push depuis le serveur (cron Vercel) : affiche la notification.
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {}
  const title = data.title || 'PrionsEnLigne';
  const opts = {
    body:     data.body  || 'Un office commence bientôt.',
    icon:     '/icons/icon-192.png',
    badge:    '/icons/icon-32.png',
    tag:      data.tag   || 'pel-office',
    renotify: true,
    requireInteraction: false,
    data:     { url: data.url || '/agenda' },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// Clic sur une notification : focus la fenêtre existante ou ouvre l'agenda
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || '/agenda';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      // Refocus la première fenêtre PEL ouverte si elle existe
      if (client.url && client.url.includes(self.location.origin)) {
        await client.focus();
        try { client.postMessage({ type: 'push-click', url: targetUrl }); } catch (_) {}
        return;
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
