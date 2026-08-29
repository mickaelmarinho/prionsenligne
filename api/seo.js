/*
  Vercel Serverless Function — /api/seo
  Génère des PAGES HTML INDEXABLES (server-rendered) pour le SEO, avec le
  contenu réel du jour rendu côté serveur — crawlable par Google sans JS.

  Routes (via rewrites vercel.json) :
    /saint-du-jour     → /api/seo?p=saint
    /evangile-du-jour  → /api/seo?p=evangile

  Chaque page :
    - <title> + meta description dynamiques (le saint / l'évangile du jour)
    - Open Graph + Twitter cards
    - Données structurées schema.org (Article)
    - Contenu lisible (H1, texte) SANS dépendre du JS
    - Lien clair vers l'application (/agenda)
    - Cross-links internes (maillage SEO)
    - Canonical + cache CDN 6h

  But : capter le trafic récurrent "saint du jour" / "évangile du jour"
  (volume de recherche quotidien massif), porte d'entrée vers l'app.
*/

import { SAINTS, SAINTS_BY_SLUG } from '../lib/saints.js';

const SITE = 'https://prionsenligne.fr';

// QR code (SVG inline) pointant vers https://prionsenligne.fr — pour l'affiche
// paroisse imprimable. Généré avec la lib qrcode (viewBox 33×33, crispEdges).
const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h33v33H0z"/><path stroke="#000000" d="M4 4.5h7m2 0h1m3 0h1m2 0h1m1 0h7M4 5.5h1m5 0h1m3 0h1m1 0h1m2 0h1m2 0h1m5 0h1M4 6.5h1m1 0h3m1 0h1m1 0h5m1 0h3m1 0h1m1 0h3m1 0h1M4 7.5h1m1 0h3m1 0h1m1 0h1m1 0h1m2 0h2m3 0h1m1 0h3m1 0h1M4 8.5h1m1 0h3m1 0h1m1 0h4m4 0h1m1 0h1m1 0h3m1 0h1M4 9.5h1m5 0h1m1 0h1m1 0h1m2 0h3m2 0h1m5 0h1M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M12 11.5h4m2 0h1m1 0h1M4 12.5h1m1 0h5m2 0h1m2 0h3m3 0h5M4 13.5h1m3 0h2m6 0h2m2 0h2m1 0h1m3 0h1M4 14.5h1m1 0h6m4 0h5m1 0h1m2 0h1m1 0h2M7 15.5h1m3 0h6m2 0h2m7 0h1M5 16.5h1m2 0h1m1 0h3m1 0h1m2 0h3m1 0h4m1 0h3M4 17.5h2m1 0h1m1 0h1m1 0h1m2 0h1m1 0h1m3 0h1m2 0h1m1 0h1m1 0h1M4 18.5h1m3 0h1m1 0h3m5 0h3m2 0h3m1 0h2M4 19.5h1m1 0h1m1 0h2m1 0h1m1 0h2m1 0h1m1 0h1m2 0h4m3 0h1M4 20.5h1m1 0h1m3 0h2m4 0h2m1 0h6m1 0h1M12 21.5h1m4 0h1m2 0h1m3 0h2M4 22.5h7m3 0h5m1 0h1m1 0h1m1 0h1m1 0h3M4 23.5h1m5 0h1m1 0h4m4 0h1m3 0h2m2 0h1M4 24.5h1m1 0h3m1 0h1m1 0h2m1 0h10m1 0h1M4 25.5h1m1 0h3m1 0h1m1 0h1m3 0h1m2 0h4m1 0h5M4 26.5h1m1 0h3m1 0h1m1 0h3m1 0h3m1 0h1m4 0h2m1 0h1M4 27.5h1m5 0h1m2 0h1m1 0h2m2 0h3m1 0h3m2 0h1M4 28.5h7m1 0h1m1 0h1m2 0h2m2 0h1m1 0h6"/></svg>';

// Libellés pays pour les pages saints
const COUNTRY_LABELS = {
  fr: 'France', be: 'Belgique', ch: 'Suisse', ca: 'Québec / Canada',
  ci: 'Côte d\'Ivoire', cd: 'Congo (RDC)', rw: 'Rwanda', ht: 'Haïti',
  universel: 'Saint universel',
};

const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const DAYS   = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

// Date courante en Europe/Paris (pas l'UTC du serveur)
function parisNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t)?.value;
  const y = parseInt(g('year'), 10), m = parseInt(g('month'), 10), d = parseInt(g('day'), 10);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, dow };
}

function frDate({ y, m, d, dow }) {
  return `${DAYS[dow]} ${d} ${MONTHS[m - 1]} ${y}`;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Récupération du saint du jour (Nominis) ─────────────────────
async function fetchSaint({ y, m, d }) {
  const url = `https://nominis.cef.fr/json/saintdujour.php?jour=${d}&mois=${m}&annee=${y}`;
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'PrionsEnLigne SEO (+https://prionsenligne.fr)' } });
    if (!r.ok) return null;
    const data = await r.json();
    const s = data?.response?.saintdujour;
    if (!s || !s.nom) return null;
    return {
      nom: s.nom,
      description: stripHtml(s.description),
      contenu: stripHtml(s.contenu).slice(0, 1400),
      lien: (s.lien || '').replace(':80', ''),
    };
  } catch (_) { return null; }
}

// ─── Récupération de l'évangile du jour (AELF) ───────────────────
async function fetchGospel({ y, m, d }) {
  const mm = String(m).padStart(2, '0'), dd = String(d).padStart(2, '0');
  const url = `https://api.aelf.org/v1/messes/${y}/${mm}/${dd}/france`;
  try {
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json', 'Accept-Language': 'fr-FR,fr;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Referer': 'https://www.aelf.org/',
      },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const messe = data?.messes?.[0];
    if (!messe) return null;
    const lectures = messe.lectures || [];
    // Tolérant : 'evangile', 'évangile', 'evangile_long', etc.
    const ev = lectures.find(l => (l.type || '').toLowerCase().includes('vangile'))
            || lectures[lectures.length - 1]; // fallback : dernière lecture = évangile en pratique
    if (!ev) return null;
    return {
      titre: stripHtml(ev.titre || 'Évangile'),
      ref: stripHtml(ev.ref || ''),
      intro: stripHtml(ev.intro_lue || ''),
      contenu: stripHtml(ev.contenu || '').slice(0, 2000),
      fete: stripHtml(messe.nom || ''),
    };
  } catch (_) { return null; }
}

// ─── Template HTML commun ────────────────────────────────────────
function pageShell({ title, desc, canonical, h1, sub, bodyHtml, jsonLd, otherLink }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>
  /* Accessibilité — reprend la taille de texte choisie dans l'application
     (bouton A+). Sans cela, une personne ayant agrandi le texte le voyait
     revenir en petit dès qu'elle ouvrait une de ces pages. Appliqué avant
     le rendu pour éviter tout saut visuel. */
  (function () {
    try {
      var s = parseFloat(localStorage.getItem('pel.textScale'));
      if (s && s > 1) document.documentElement.style.zoom = s;
    } catch (e) {}
  })();
</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/icons/icon-512.png">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#1a2744">
<link rel="icon" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root{--ink:#1e1c18;--cream:#f7f3ea;--navy:#1a2744;--gold:#c9a84c;--soft:#6b6357;--serif:'Cormorant Garamond',Georgia,serif}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Outfit',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--cream);line-height:1.6}
  .wrap{max-width:720px;margin:0 auto;padding:0 20px}
  header{background:var(--navy);color:#fff;padding:14px 0}
  header .wrap{display:flex;align-items:center;justify-content:space-between}
  .brand{font-family:var(--serif);font-size:19px;color:#fff;text-decoration:none;display:flex;align-items:center;gap:9px}
  .brand img{width:30px;height:30px;display:block}
  header .wrap{max-width:1100px}
  .open-app{background:var(--gold);color:var(--ink);font-weight:600;font-size:14px;padding:8px 16px;border-radius:999px;text-decoration:none}
  /* État connecté : pastille compte (initiale + prénom), comme dans l'app */
  .open-app.account{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);display:inline-flex;align-items:center;gap:8px;padding:5px 14px 5px 5px}
  .open-app.account .acc-ini{width:26px;height:26px;border-radius:50%;background:var(--gold);color:var(--navy);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;text-transform:uppercase}
  .open-app.account .acc-chev{opacity:.55;font-size:12px;margin-left:1px;transition:transform .15s}
  .open-app.account.open .acc-chev{transform:rotate(180deg)}
  /* Menu déroulant compte (ouvert EN PLACE sur la page, comme l'app) */
  .acc-menu{position:absolute;top:calc(100% + 14px);right:0;width:264px;background:#fff;border-radius:12px;box-shadow:0 14px 44px rgba(0,0,0,.28);padding:8px;z-index:1000;font-family:'Outfit',sans-serif}
  .acc-menu[hidden]{display:none}
  .acc-menu a,.acc-menu button{display:block;width:100%;text-align:left;background:none;border:none;font-family:inherit;font-size:14px;color:var(--ink);text-decoration:none;padding:9px 12px;border-radius:8px;cursor:pointer}
  .acc-menu a:hover,.acc-menu button:hover{background:rgba(201,168,76,.12)}
  .acc-menu-head{display:flex;align-items:center;gap:10px;padding:8px 12px 12px}
  .acc-ini-lg{width:34px;height:34px;border-radius:50%;background:var(--navy);color:var(--gold);display:flex;align-items:center;justify-content:center;font-weight:700;text-transform:uppercase;flex:0 0 auto}
  .acc-menu-id strong{display:block;font-size:14px;color:var(--navy)}
  .acc-menu-id small{font-size:12px;color:var(--soft);word-break:break-all}
  .acc-menu-sep{height:1px;background:#eee;margin:6px 4px}
  .acc-menu .acc-logout{color:#9a3b3b}
  main{padding:34px 0 10px}
  .eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:12px;color:var(--gold);font-weight:600;margin-bottom:6px}
  h1{font-family:var(--serif);font-size:38px;font-weight:600;line-height:1.15;margin:0 0 6px}
  .sub{color:var(--soft);font-size:15px;margin-bottom:22px}
  .card{background:#fff;border:1px solid #e7e0d2;border-left:3px solid var(--gold);border-radius:10px;padding:20px 22px;margin:18px 0}
  .card h2{font-family:var(--serif);font-weight:600;font-size:25px;margin:0 0 10px}
  .ref{color:var(--gold);font-weight:600;font-size:14px;margin-bottom:10px}
  p{margin:0 0 14px}
  .cta{display:inline-flex;align-items:center;gap:9px;background:var(--navy);color:#fff;font-weight:600;padding:13px 26px;border-radius:999px;text-decoration:none;margin:8px 0 26px}
  .links{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0;border-top:1px solid #e7e0d2;padding-top:20px}
  .links a{color:var(--navy);text-decoration:none;font-size:14px;background:#fff;border:1px solid #e7e0d2;padding:8px 14px;border-radius:8px}
  .links a:hover{border-color:var(--gold)}
  footer{color:var(--soft);font-size:12.5px;text-align:center;padding:26px 0 40px;line-height:1.7}
  footer a{color:var(--soft)}
  .src{font-size:12.5px;color:var(--soft);font-style:italic;margin-top:6px}
  main h2{font-family:var(--serif);font-weight:600;font-size:23px;margin:26px 0 8px;color:var(--navy)}
  .card h2{margin:0 0 10px;font-size:25px}
  .saint-list{list-style:none;padding:0;margin:0 0 8px}
  .saint-list li{padding:8px 0;border-bottom:1px solid #ece5d6;font-size:15px}
  .saint-list li:last-child{border-bottom:none}
  .saint-list a{color:var(--navy);text-decoration:none}
  .saint-list a:hover{color:var(--gold);text-decoration:underline}
  .muted{color:var(--soft);font-size:13px}
</style>
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
</head>
<body>
<header><div class="wrap">
  <a class="brand" href="/" aria-label="Accueil"><img src="/icons/icon.svg" alt="" width="30" height="30"></a>
  <a class="open-app" href="/agenda#login" id="seo-account">Se connecter</a>
</div></header>
<main><div class="wrap">
  <div class="eyebrow">${esc(sub)}</div>
  <h1>${esc(h1)}</h1>
  ${bodyHtml}
  <div class="links">
    <a href="/agenda">Agenda du jour</a>
    <a href="/saint-du-jour">Saint du jour</a>
    <a href="/evangile-du-jour">Évangile du jour</a>
    <a href="/saints">Tous les saints</a>
    <a href="/messe-en-direct">Messe en direct</a>
    <a href="/paroisses">Pour les paroisses</a>
    <a href="/">Accueil</a>
  </div>
</div></main>
<footer><div class="wrap">
  <p><strong>PrionsEnLigne</strong> — Prier ensemble, chaque jour. Gratuit, sans publicité.<br>
  Offices du bréviaire, messes en direct, chapelet numérique, Bible interactive, calendrier liturgique.</p>
  <p><a href="/">prionsenligne.fr</a> · Textes liturgiques : AELF · Saints : Nominis (CEF)</p>
</div></footer>
<script>
  /* Si l'utilisateur est déjà connecté (session Supabase en localStorage, même
     domaine), on remplace « Se connecter » par sa pastille compte — comme dans
     l'app. Tout reste côté client : aucune donnée n'est transmise. */
  (function () {
    try {
      var keys = Object.keys(localStorage).filter(function (k) { return /^sb-.*-auth-token$/.test(k); });
      if (!keys.length) return;
      var raw = localStorage.getItem(keys[0]); if (!raw) return;
      var s = JSON.parse(raw);
      var user = (s && (s.user || (s.currentSession && s.currentSession.user))) || null;
      if (!user) return;
      var name = (user.user_metadata && user.user_metadata.name) || (user.email ? user.email.split('@')[0] : '');
      if (!name) return;
      var email = user.email || '';
      var initial = (name.trim()[0] || '?');
      var btn = document.getElementById('seo-account');
      if (!btn) return;

      // « Se connecter » → pastille compte
      btn.setAttribute('href', '/agenda#menu'); // repli si JS désactivé
      btn.classList.add('account');
      btn.textContent = '';
      var ini = document.createElement('span'); ini.className = 'acc-ini'; ini.textContent = initial;
      btn.appendChild(ini);
      btn.appendChild(document.createTextNode(name));
      var chev = document.createElement('span'); chev.className = 'acc-chev'; chev.textContent = '▾';
      btn.appendChild(chev);

      // Menu déroulant ouvert EN PLACE (pas de détour par « Aujourd'hui »)
      var esc = function (t) { var d = document.createElement('div'); d.textContent = (t == null ? '' : t); return d.innerHTML; };
      var wrap = btn.parentNode; // header .wrap
      wrap.style.position = 'relative';
      var menu = document.createElement('div');
      menu.className = 'acc-menu'; menu.id = 'acc-menu'; menu.hidden = true;
      menu.innerHTML =
        '<div class="acc-menu-head"><span class="acc-ini-lg">' + esc(initial) + '</span>' +
        '<div class="acc-menu-id"><strong>Mon compte</strong><small>' + esc(email) + '</small></div></div>' +
        '<a href="/agenda">Aujourd’hui</a>' +
        '<a href="/agenda#semaine">Semaine</a>' +
        '<a href="/agenda#mois">Calendrier liturgique</a>' +
        '<a href="/agenda#bible">Bible</a>' +
        '<a href="/agenda#sources">Sources</a>' +
        '<div class="acc-menu-sep"></div>' +
        '<button type="button" class="acc-logout" id="seo-logout">Se déconnecter</button>' +
        '<div class="acc-menu-sep"></div>' +
        '<a href="/">Accueil &amp; présentation</a>' +
        '<a href="/paroisses">Pour les paroisses</a>' +
        '<a href="https://paypal.me/prionsenligne" target="_blank" rel="noopener">Soutenir le projet</a>';
      wrap.appendChild(menu);

      function closeMenu() { menu.hidden = true; btn.classList.remove('open'); }
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        menu.hidden = !menu.hidden;
        btn.classList.toggle('open', !menu.hidden);
      });
      document.addEventListener('click', function (e) {
        if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
      menu.querySelector('#seo-logout').addEventListener('click', function () {
        try { keys.forEach(function (k) { localStorage.removeItem(k); }); } catch (_) {}
        location.reload();
      });
    } catch (e) {}
  })();
</script>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>`;
}

// ─── KTO : ID de la vidéo YouTube en direct (API YouTube Data v3) ──
// Renvoie JSON { videoId, live }. La vidéo live démarre au point LIVE
// (avec rewind possible) — contrairement à un ID codé en dur (enregistrement).
const KTO_YT_CHANNEL = 'UCg0L6cPMNLv1gjsyzYqMG7g';
const KTO_FALLBACK_VIDEO = 'VN1_PRBoVHU'; // dernier direct connu (si pas de live / pas de clé)

async function ktoLiveVideoId() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { videoId: KTO_FALLBACK_VIDEO, live: false, source: 'no_key' };
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${KTO_YT_CHANNEL}&eventType=live&type=video&maxResults=1&key=${key}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return { videoId: KTO_FALLBACK_VIDEO, live: false, source: 'api_error' };
    const data = await r.json();
    const id = data?.items?.[0]?.id?.videoId;
    if (id) return { videoId: id, live: true, source: 'live' };
    return { videoId: KTO_FALLBACK_VIDEO, live: false, source: 'no_live' };
  } catch (_) {
    return { videoId: KTO_FALLBACK_VIDEO, live: false, source: 'exception' };
  }
}

export default async function handler(req, res) {
  const p = (req.query.p || '').toString();
  const now = parisNow();
  const dateLabel = frDate(now);

  // ── /api/seo?p=kto-live → JSON (avant le Content-Type HTML) ──
  if (p === 'kto-live') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Cache CDN 10 min : limite les appels API (quota YouTube) tout en
    // trouvant le direct dans les ~10 min suivant son lancement.
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
    const out = await ktoLiveVideoId();
    res.status(200).json(out);
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // CDN : page fraîche 6h, revalidation en arrière-plan 24h
  res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');

  // ── /saint-du-jour ──
  if (p === 'saint') {
    const saint = await fetchSaint(now);
    const canonical = `${SITE}/saint-du-jour`;
    const nom = saint?.nom || 'Saint du jour';
    const title = `${nom} — Saint du jour, ${dateLabel} | PrionsEnLigne`;
    const desc = saint
      ? `${nom} — saint fêté le ${dateLabel}. ${saint.description || saint.contenu.slice(0, 120)}`.slice(0, 300)
      : `Découvrez le saint fêté aujourd'hui, ${dateLabel}, et priez avec PrionsEnLigne.`;
    const bodyHtml = saint
      ? `<p class="sub">Saint fêté le ${esc(dateLabel)}</p>
         <div class="card">
           <h2>${esc(saint.nom)}</h2>
           ${saint.description ? `<p><strong>${esc(saint.description)}</strong></p>` : ''}
           ${saint.contenu ? `<p>${esc(saint.contenu)}…</p>` : ''}
           ${saint.lien ? `<p class="src">Biographie complète : <a href="${esc(saint.lien)}" rel="noopener">nominis.cef.fr</a></p>` : ''}
         </div>`
      : `<p>Le saint du jour pour le ${esc(dateLabel)} sera bientôt disponible. Ouvrez l'application pour le calendrier liturgique complet.</p>`;
    const jsonLd = saint ? JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article',
      headline: `${saint.nom} — Saint du jour`, datePublished: `${now.y}-${String(now.m).padStart(2,'0')}-${String(now.d).padStart(2,'0')}`,
      author: { '@type': 'Organization', name: 'PrionsEnLigne' },
      publisher: { '@type': 'Organization', name: 'PrionsEnLigne', logo: { '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png` } },
      description: desc, mainEntityOfPage: canonical,
    }) : '';
    res.status(200).send(pageShell({
      title, desc, canonical, h1: nom, sub: `Saint du jour · ${dateLabel}`,
      bodyHtml, jsonLd, otherLink: { href: '/evangile-du-jour', label: 'Évangile du jour' },
    }));
    return;
  }

  // ── /evangile-du-jour ──
  if (p === 'evangile') {
    const ev = await fetchGospel(now);
    const canonical = `${SITE}/evangile-du-jour`;
    const title = `Évangile du jour — ${dateLabel}${ev?.ref ? ' ('+ev.ref+')' : ''} | PrionsEnLigne`;
    const desc = ev
      ? `Évangile du ${dateLabel}${ev.ref ? ' — '+ev.ref : ''}. ${ev.contenu.slice(0, 160)}`.slice(0, 300)
      : `Lisez et méditez l'Évangile du jour, ${dateLabel}, avec PrionsEnLigne.`;
    const bodyHtml = ev
      ? `<p class="sub">Lecture du ${esc(dateLabel)}${ev.fete ? ' — '+esc(ev.fete) : ''}</p>
         <div class="card">
           ${ev.ref ? `<div class="ref">${esc(ev.ref)}</div>` : ''}
           <h2>${esc(ev.titre)}</h2>
           ${ev.intro ? `<p><em>${esc(ev.intro)}</em></p>` : ''}
           ${ev.contenu ? `<p>${esc(ev.contenu)}…</p>` : ''}
           <p class="src">Texte liturgique officiel : AELF — Association Épiscopale Liturgique Francophone.</p>
         </div>`
      : `<p>L'Évangile du jour pour le ${esc(dateLabel)} sera bientôt disponible. Ouvrez l'application pour les lectures complètes.</p>`;
    const jsonLd = ev ? JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article',
      headline: `Évangile du jour — ${ev.ref || dateLabel}`, datePublished: `${now.y}-${String(now.m).padStart(2,'0')}-${String(now.d).padStart(2,'0')}`,
      author: { '@type': 'Organization', name: 'AELF' },
      publisher: { '@type': 'Organization', name: 'PrionsEnLigne', logo: { '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png` } },
      description: desc, mainEntityOfPage: canonical,
    }) : '';
    res.status(200).send(pageShell({
      title, desc, canonical, h1: 'Évangile du jour', sub: `Évangile · ${dateLabel}`,
      bodyHtml, jsonLd, otherLink: { href: '/saint-du-jour', label: 'Saint du jour' },
    }));
    return;
  }

  // ── /saints (index / hub) ──
  if (p === 'saints') {
    const canonical = `${SITE}/saints`;
    const title = 'Saints de la francophonie — Vies, fêtes et prières | PrionsEnLigne';
    const desc = "Découvrez les grands saints du monde francophone : France, Belgique, Suisse, Québec, Afrique, Haïti. Vie, date de fête, patronage et prière pour chacun.";
    // Regroupe par région (libellé country)
    const groups = {};
    for (const s of SAINTS) {
      const key = COUNTRY_LABELS[s.country] || s.region;
      (groups[key] = groups[key] || []).push(s);
    }
    let listHtml = '';
    for (const [region, list] of Object.entries(groups)) {
      listHtml += `<h2>${esc(region)}</h2><ul class="saint-list">`;
      for (const s of list) {
        listHtml += `<li><a href="/saints/${esc(s.slug)}"><strong>${esc(s.name)}</strong></a> — fête le ${esc(s.feast)}${s.patron ? ` · <span class="muted">${esc(s.patron)}</span>` : ''}</li>`;
      }
      listHtml += `</ul>`;
    }
    const bodyHtml = `<p class="sub">${SAINTS.length} saints et figures mariales fortement vénérés dans la francophonie. Cliquez pour découvrir leur vie et prier avec eux.</p>${listHtml}`;
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: title, description: desc, url: canonical,
    });
    res.status(200).send(pageShell({
      title, desc, canonical, h1: 'Saints de la francophonie', sub: 'Vies & fêtes des saints',
      bodyHtml, jsonLd, otherLink: { href: '/saint-du-jour', label: 'Saint du jour' },
    }));
    return;
  }

  // ── /saints/[slug] (page individuelle) ──
  if (p === 'saint-page') {
    const slug = (req.query.s || '').toString();
    const saint = SAINTS_BY_SLUG[slug];
    if (!saint) {
      res.setHeader('Location', '/saints');
      res.status(302).end();
      return;
    }
    const canonical = `${SITE}/saints/${saint.slug}`;
    const region = COUNTRY_LABELS[saint.country] || saint.region;
    const title = `${saint.name} — vie, fête le ${saint.feast} | PrionsEnLigne`;
    const desc = `${saint.name}, fêté le ${saint.feast} (${region}). ${saint.patron}. ${saint.desc}`.slice(0, 300);
    const bodyHtml = `
      <p class="sub">Fête le ${esc(saint.feast)} · ${esc(region)}</p>
      <div class="card">
        <div class="ref">${esc(saint.patron)}</div>
        <h2>${esc(saint.name)}</h2>
        <p>${esc(saint.desc)}</p>
      </div>
      <p>Retrouvez ${esc(saint.name)} et tout le calendrier liturgique dans l'application PrionsEnLigne, avec les offices du jour, les messes en direct et le chapelet guidé.</p>`;
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Person',
      name: saint.name, description: saint.desc,
      url: canonical,
      subjectOf: { '@type': 'CreativeWork', name: `${saint.name} — vie et prière`, publisher: { '@type': 'Organization', name: 'PrionsEnLigne' } },
    });
    res.status(200).send(pageShell({
      title, desc, canonical, h1: saint.name, sub: `Saint · ${region}`,
      bodyHtml, jsonLd, otherLink: { href: '/saints', label: 'Tous les saints' },
    }));
    return;
  }

  // ── /messe-en-direct (evergreen) ──
  if (p === 'messe') {
    const canonical = `${SITE}/messe-en-direct`;
    const title = `Messe en direct aujourd'hui — radios & TV catholiques | PrionsEnLigne`;
    const desc = "Suivez la messe en direct chaque jour : Radio Maria, KTO, Lourdes, Notre-Dame de Paris, et de nombreux sanctuaires francophones (France, Belgique, Suisse, Québec). Horaires et accès gratuit.";
    const bodyHtml = `
      <p class="sub">Toutes les messes diffusées en direct, mises à jour chaque jour</p>
      <div class="card">
        <h2>Où suivre la messe en direct&nbsp;?</h2>
        <p>PrionsEnLigne réunit en un seul endroit les messes catholiques diffusées en direct à la radio et à la télévision, gratuitement et sans publicité. Chaque jour, l'agenda affiche les horaires précis et un accès direct au flux.</p>
        <p><strong>Principales sources de messes en direct&nbsp;:</strong></p>
        <ul class="saint-list">
          <li><strong>KTO</strong> — messe quotidienne de Notre-Dame de Paris (18h) et de Notre-Dame de la Garde à Marseille</li>
          <li><strong>Radio Maria France</strong> — messe et chapelet quotidiens, en lecture intégrée</li>
          <li><strong>Sanctuaire de Lourdes</strong> — messes et chapelet de la grotte</li>
          <li><strong>Sanctuaire Notre-Dame du Laus</strong>, <strong>Paroisse Notre-Dame de La Salette</strong> et autres paroisses</li>
          <li><strong>Francophonie&nbsp;:</strong> Radio Galilée, Radio Ville-Marie, Sel + Lumière (Québec), RCF Bruxelles (Belgique), RTS Religion (Suisse)</li>
        </ul>
        <p class="src">Rappel pastoral&nbsp;: suivre la messe à distance est une aide précieuse pour les malades, les personnes isolées ou la diaspora, mais ne remplace pas la participation physique à l'Eucharistie. Si vous le pouvez, rejoignez votre paroisse.</p>
      </div>`;
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: title, description: desc, url: canonical,
    });
    res.status(200).send(pageShell({
      title, desc, canonical, h1: 'Messe en direct', sub: 'Messes diffusées en direct',
      bodyHtml, jsonLd, otherLink: { href: '/agenda', label: 'Voir les horaires du jour' },
    }));
    return;
  }

  // ── /paroisses (argumentaire pour le clergé) ──
  // ── /fonds-ecran (fonds d'écran de prière à offrir) ──
  if (p === 'fonds-ecran') {
    const canonical = `${SITE}/fonds-ecran`;
    const title = "Fonds d'écran de prière à offrir — versets bibliques | PrionsEnLigne";
    const desc = "Six fonds d'écran gratuits pour téléphone, ornés d'un verset biblique (Psaume 23, Ave Maria, Isaïe 41…). À télécharger librement — style sobre et élégant, offert par PrionsEnLigne.";
    const WP = [
      ['sois-sans-crainte-isaie-41-10.jpg',               '« Sois sans crainte, je suis avec toi. »',             'Isaïe 41, 10'],
      ['que-ton-coeur-ne-se-trouble-point-jean-14-27.jpg', '« Que ton cœur ne se trouble point. »',                'Jean 14, 27'],
      ['le-seigneur-est-mon-berger-psaume-23.jpg',        '« Le Seigneur est mon berger, je ne manque de rien. »', 'Psaume 23'],
      ['tout-concourt-au-bien-romains-8-28.jpg',          '« Tout concourt au bien de ceux qui aiment Dieu. »',    'Romains 8, 28'],
      ['je-vous-salue-marie-ave-maria.jpg',               '« Je vous salue, Marie, pleine de grâce. »',           'Ave Maria'],
      ['demandez-et-vous-recevrez-matthieu-7-7.jpg',      '« Demandez et vous recevrez. »',                       'Matthieu 7, 7'],
    ];
    const cards = WP.map(([file, verse, ref]) => `
        <div class="wp-card">
          <a class="wp-thumb-link" href="/wallpapers/${file}" download="${file}" target="_blank" rel="noopener" aria-label="Télécharger le fond d'écran : ${esc(ref)}">
            <img class="wp-thumb" src="/wallpapers/${file}" alt="${esc(verse)} — ${esc(ref)}" loading="lazy" width="1170" height="2532">
          </a>
          <div class="wp-ref">${esc(verse)}<span class="wp-ref-src">${esc(ref)}</span></div>
          <a class="wp-dl" href="/wallpapers/${file}" download="${file}"><span>Télécharger</span></a>
        </div>`).join('');
    const bodyHtml = `
      <style>
        .wp-intro{font-size:15px;color:var(--soft);margin:-6px 0 24px;line-height:1.6}
        .wp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:22px;margin:6px 0}
        .wp-card{text-align:center}
        .wp-thumb-link{display:block}
        .wp-thumb{display:block;width:100%;height:auto;aspect-ratio:1170/2532;object-fit:cover;border-radius:12px;box-shadow:0 6px 22px rgba(26,39,68,.18);border:1px solid #e7e0d2}
        .wp-thumb-link:hover .wp-thumb{box-shadow:0 10px 30px rgba(26,39,68,.28);transform:translateY(-2px);transition:all .18s}
        .wp-ref{font-family:var(--serif);font-size:16px;color:var(--navy);margin:12px 0 10px;line-height:1.3}
        .wp-ref-src{display:block;font-family:'Outfit',sans-serif;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--gold);margin-top:5px}
        .wp-dl{display:inline-flex;align-items:center;gap:6px;background:var(--navy);color:#fff;font-size:13px;font-weight:600;padding:8px 18px;border-radius:999px;text-decoration:none}
        .wp-dl:hover{background:#16304f}
        .wp-hint{font-size:12.5px;color:var(--soft);text-align:center;margin:24px 0 8px;font-style:italic;line-height:1.6}
        .wp-shop{background:#fff;border:1px solid #e7e0d2;border-left:3px solid var(--gold);border-radius:10px;padding:18px 22px;margin:20px 0 4px;text-align:center}
        .wp-shop p{margin:0 0 12px}
      </style>
      <p class="wp-intro">Six fonds d'écran pour porter une parole d'Évangile sur votre téléphone, chaque fois que vous l'allumez. Offerts&nbsp;: téléchargez librement ceux qui vous parlent.</p>
      <div class="wp-grid">${cards}</div>
      <p class="wp-hint">📱 Sur téléphone&nbsp;: appui long sur l'image, puis «&nbsp;Enregistrer l'image&nbsp;».<br>💻 Sur ordinateur&nbsp;: le bouton «&nbsp;Télécharger&nbsp;» enregistre directement.</p>
      <div class="wp-shop">
        <p>Vous aimez ce style&nbsp;? Retrouvez nos <strong>affiches et carnets de prière à imprimer</strong> sur la boutique.</p>
        <p><a class="cta" href="https://www.etsy.com/shop/FatimaLightCo" target="_blank" rel="noopener">Voir la boutique</a></p>
      </div>`;
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: title, description: desc, url: canonical,
    });
    res.status(200).send(pageShell({
      title, desc, canonical, h1: "Fonds d'écran à offrir", sub: 'Un cadeau pour votre téléphone',
      bodyHtml, jsonLd,
    }));
    return;
  }

  /* ── Histoire du christianisme et de ses branches ──────────────────
     Page de fond : un seul sujet traité sérieusement vaut mieux que
     beaucoup d'articles courts. Le ton est descriptif et respectueux
     envers les autres confessions, conformément à la position de
     l'Église depuis Vatican II. Les courants traditionalistes sont
     distingués avec soin : être attaché à la messe ancienne, contester
     le concile, ou tenir le siège de Pierre pour vacant sont trois
     positions différentes, qu'on confond souvent. */
  if (p === 'histoire') {
    const canonical = `${SITE}/histoire-du-christianisme`;
    const title = "Histoire du christianisme et de ses branches — des origines aux sédévacantistes | PrionsEnLigne";
    const desc = "Comment le christianisme s'est divisé au fil des siècles : le schisme de 1054, la Réforme, l'anglicanisme, Vatican II, les traditionalistes et les sédévacantistes. Une frise claire pour comprendre qui croit quoi, et pourquoi.";

    // [année, titre, texte] — la frise principale
    const FRISE = [
      ['Vers l\'an 30',
       'Les origines',
       "Jésus de Nazareth est crucifié à Jérusalem sous Ponce Pilate. Ses disciples annoncent sa résurrection. À la Pentecôte, les apôtres commencent à prêcher : c'est le point de départ de l'Église. Paul de Tarse porte le message hors du monde juif, jusqu'à Rome."],
      ['I<sup>er</sup>–III<sup>e</sup> s.',
       'Une Église persécutée',
       "Les chrétiens sont une minorité illicite dans l'Empire romain, périodiquement persécutée. Les communautés s'organisent autour d'évêques ; celui de Rome, successeur de Pierre, jouit très tôt d'une autorité particulière."],
      ['313',
       'La liberté, puis les grands conciles',
       "L'empereur Constantin autorise le christianisme. Les conciles de Nicée (325) et de Constantinople (381) fixent la foi commune dans le Credo que l'on récite encore aujourd'hui. C'est aussi au IV<sup>e</sup> siècle que se stabilise la liste des livres de la Bible."],
      ['431 et 451',
       'Les premières séparations',
       "Les conciles d'Éphèse puis de Chalcédoine, portant sur la façon de dire que le Christ est vrai Dieu et vrai homme, laissent de côté des Églises entières d'Orient : l'Église assyrienne, et les Églises dites orthodoxes orientales (coptes d'Égypte, arméniens, syriaques, éthiopiens). Elles existent toujours. C'est la division chrétienne la plus ancienne, et la plus oubliée."],
      ['1054',
       'Le Grand Schisme d\'Orient',
       "Rome et Constantinople se séparent. Les motifs sont à la fois théologiques — l'autorité du pape sur toute l'Église, l'ajout du mot <em>Filioque</em> au Credo — et culturels : deux mondes, latin et grec, qui ne se comprenaient plus. Naissent d'un côté l'Église catholique, de l'autre les Églises orthodoxes."],
      ['1517',
       'La Réforme protestante',
       "Le moine allemand Martin Luther conteste notamment le commerce des indulgences. La rupture s'élargit vite à des questions de fond : l'Écriture seule plutôt que l'Écriture et la Tradition, la foi seule pour être sauvé, le refus de l'autorité du pape. Jean Calvin à Genève, Ulrich Zwingli à Zurich donnent naissance à d'autres courants. Les protestants retiennent 66 livres bibliques, en laissant de côté les sept livres deutérocanoniques que les catholiques conservent."],
      ['1534',
       'L\'anglicanisme',
       "En Angleterre, Henri VIII rompt avec Rome pour des raisons d'abord dynastiques et se déclare chef de l'Église d'Angleterre. L'anglicanisme gardera une position particulière, entre catholicisme et protestantisme."],
      ['1545–1563',
       'Le concile de Trente',
       "L'Église catholique répond : elle réaffirme sa doctrine, confirme les 73 livres de la Bible, réforme la formation des prêtres et la discipline. En 1570, saint Pie V fixe le missel qui restera en usage quatre siècles — la messe dite tridentine, ou messe en latin."],
      ['1870',
       'Vatican I',
       "Le concile définit l'infaillibilité pontificale : le pape ne peut se tromper lorsqu'il proclame solennellement une vérité de foi. Une minorité refuse cette définition et forme les Églises vieilles-catholiques."],
      ['1906',
       'Le pentecôtisme',
       "À Los Angeles, un réveil religieux donne naissance au pentecôtisme, centré sur l'expérience de l'Esprit Saint. Avec les courants évangéliques, c'est aujourd'hui la famille chrétienne qui croît le plus vite dans le monde, notamment en Afrique et en Amérique latine."],
      ['1962–1965',
       'Vatican II',
       "Le concile Vatican II ouvre l'Église au monde : la messe peut être célébrée dans la langue de chacun, le dialogue avec les autres confessions et religions est encouragé, la liberté religieuse est affirmée. En 1969, Paul VI promulgue un nouveau missel. Ce tournant est reçu par l'immense majorité des catholiques, mais il va provoquer les divisions qui suivent."],
      ['2007, puis 2021',
       'La messe ancienne, élargie puis restreinte',
       "Par <em>Summorum Pontificum</em> (2007), Benoît XVI autorise largement la célébration de la messe selon le missel de 1962. En 2021, par <em>Traditionis custodes</em>, François revient sur cette ouverture et en confie l'autorisation aux évêques, estimant qu'elle servait à contester le concile. Ce va-et-vient explique une bonne part des tensions actuelles."],
    ];

    /* Les raisonnements de part et d'autre. Sans eux, on sait ce que chacun
       tient mais pas pourquoi — et l'on ne peut pas se faire un avis. */
    const DEBATS = [
      ['La Fraternité Saint-Pie-X',
       "Le concile aurait rompu avec l'enseignement antérieur sur trois points : la liberté religieuse, l'œcuménisme et la collégialité des évêques. Devant ce qu'elle juge une crise, la Fraternité estime agir par nécessité pour préserver la foi et le sacerdoce, quitte à passer outre les autorisations romaines.",
       "Rome répond que le concile doit se lire dans la continuité de la Tradition, et non comme une rupture — c'est la thèse de Benoît XVI en 2005. Elle rappelle qu'aucune nécessité ne justifie de sacrer des évêques sans mandat pontifical, acte qui a entraîné les excommunications de 1988."],
      ['Le sédévacantisme',
       "Le raisonnement s'appuie sur une thèse ancienne : un pape qui tomberait dans l'hérésie perdrait sa charge. Jugeant les enseignements conciliaires contraires à la foi définie auparavant, les sédévacantistes en concluent que les papes qui les ont promulgués n'étaient pas de vrais papes, et que le siège est vide depuis lors.",
       "Trois objections lui sont opposées. D'abord, nul dans l'Église n'a autorité pour juger le pape — « le premier siège n'est jugé par personne ». Ensuite, l'acceptation paisible d'un pape par l'Église entière est tenue pour un signe certain de sa légitimité. Enfin, une vacance de plusieurs décennies, sans moyen d'élire un successeur, contredirait la promesse du Christ à son Église."],
    ];

    /* L'arbre des branches — vue d'ensemble avant le détail de la frise.
       Construit en HTML et non en image : le texte suit ainsi le réglage
       d'agrandissement du site, ce qu'une image ne ferait pas. */
    const ARBRE = [
      ['431 et 451', "Églises d'Orient", "Église assyrienne, puis coptes, arméniens, syriaques et Éthiopiens.", '≈ 60 à 80 millions', []],
      ['1054', 'Églises orthodoxes', "Constantinople et les Églises de tradition grecque et slave.", '≈ 220 millions', []],
      ['1517', 'Protestantisme', "Luthériens et réformés d'abord ; à partir de 1906, les évangéliques et pentecôtistes, aujourd'hui la famille qui croît le plus vite.", '≈ 900 millions', []],
      ['1534', 'Anglicanisme', "L'Église d'Angleterre, entre catholicisme et protestantisme.", '≈ 85 millions', []],
      ['1870', 'Vieux-catholiques', "Refus de l'infaillibilité pontificale définie à Vatican I.", "quelques centaines de milliers", []],
      ['après 1965', 'Courants traditionalistes', "Nés du refus de tout ou partie de Vatican II — trois situations bien distinctes :", '', [
        ['ok',  'Instituts en pleine communion', 'Saint-Pierre, Christ-Roi…'],
        ['mid', 'Fraternité Saint-Pie-X',        'situation canonique irrégulière'],
        ['out', 'Sédévacantisme',                'hors de la communion'],
      ]],
    ];

    // Ce qui demeure commun : sans cela, on ne voit que les fractures.
    const COMMUN = [
      ['Le baptême', "Reconnu réciproquement entre la plupart des confessions : un baptisé protestant qui devient catholique n'est pas rebaptisé."],
      ['Le Credo', "Le symbole de Nicée-Constantinople (325-381) est professé par les catholiques, les orthodoxes et la plupart des protestants."],
      ['Les Écritures', "Les quatre Évangiles et le Nouveau Testament sont communs à tous. Les écarts portent sur sept livres de l'Ancien Testament."],
      ['Le Notre Père', "La prière enseignée par le Christ lui-même, récitée dans toutes les confessions chrétiennes."],
    ];

    // Le vocabulaire, expliqué simplement
    const MOTS = [
      ['Schisme', "Rupture de communion entre chrétiens, sans nécessairement de désaccord sur la foi elle-même."],
      ['Hérésie', "Négation obstinée d'une vérité de foi que l'Église tient pour révélée."],
      ['Concile œcuménique', "Assemblée de tous les évêques du monde, convoquée par le pape, dont les décisions engagent l'Église entière."],
      ['Canon des Écritures', "La liste des livres reconnus comme inspirés. 73 pour les catholiques, 66 pour les protestants."],
      ['Magistère', "L'autorité d'enseignement de l'Église, exercée par le pape et les évêques."],
      ['Œcuménisme', "La recherche de l'unité entre chrétiens séparés, promue par l'Église catholique depuis Vatican II."],
      ['Sede vacante', "Locution latine — « le siège étant vacant ». Désigne normalement la période entre la mort d'un pape et l'élection du suivant."],
    ];

    /* De quoi vérifier par soi-même.
       Les sources sont groupées et étiquetées selon leur provenance : donner
       uniquement les documents romains reviendrait à ne fournir les pièces que
       d'un seul camp. Chacun expose ici sa position dans ses propres mots, et
       le lecteur sait d'où chaque texte parle. */
    const SOURCES = [
      ['Les textes officiels de l\'Église', 'off', [
        ['Les documents de Vatican II', "<em>Lumen gentium</em> sur l'Église, <em>Unitatis redintegratio</em> sur l'œcuménisme, <em>Dignitatis humanae</em> sur la liberté religieuse — les textes mêmes dont on débat.", 'https://www.vatican.va/archive/hist_councils/ii_vatican_council/index_fr.htm'],
        ['Le Catéchisme de l\'Église catholique', "Ce que l'Église enseigne aujourd'hui, notamment les paragraphes 811 à 870 sur l'unité de l'Église.", 'https://www.vatican.va/archive/FRA0013/_INDEX.HTM'],
        ['Benoît XVI, discours à la Curie (2005)', "Le texte où il oppose « herméneutique de la rupture » et « herméneutique de la réforme dans la continuité ».", 'https://www.vatican.va/content/benedict-xvi/fr/speeches/2005/december/documents/hf_ben_xvi_spe_20051222_roman-curia.html'],
        ['<em>Traditionis custodes</em> (2021)', "Le motu proprio du pape François sur l'usage du missel de 1962, et la lettre qui l'accompagne.", 'https://www.vatican.va/content/francesco/fr/motu_proprio/documents/20210716-motu-proprio-traditionis-custodes.html'],
      ]],
      ['La position traditionaliste, dans ses propres mots', 'trad', [
        ['La Porte Latine', "Le site officiel du district de France de la Fraternité Saint-Pie-X : ses prises de position sur le concile, la messe et sa situation canonique.", 'https://laportelatine.org/'],
        ['Les catéchismes antérieurs au concile', "Le Catéchisme du concile de Trente et celui de saint Pie X, toujours réédités, permettent de comparer soi-même l'enseignement d'avant et d'après. Sans lien&nbsp;: ce sont des livres, disponibles en librairie religieuse.", ''],
      ]],
      ['La position sédévacantiste, dans ses propres mots', 'sede', [
        ['Don Andrea Mancinella, <em>1962 — Révolution dans l\'Église</em>', "Sous-titré «&nbsp;brève chronique de l'occupation néo-moderniste de l'Église catholique&nbsp;», cet ouvrage expose la thèse sédévacantiste sous la forme d'une chronologie. Le titre annonce d'emblée sa position&nbsp;: c'est un livre de combat, non un travail neutre — comme le sont, symétriquement, bien des textes de l'autre bord.", ''],
      ]],
    ];

    // Les courants nés après Vatican II — trois positions à ne pas confondre
    const APRES = [
      ['En pleine communion avec Rome',
       'Les instituts traditionnels',
       "Fraternité Saint-Pierre (1988), Institut du Christ-Roi et d'autres célèbrent la messe ancienne tout en reconnaissant pleinement le pape et le concile. Ils sont catholiques sans réserve : être attaché à la liturgie traditionnelle n'a jamais signifié être en rupture.",
       'ok'],
      ['En situation irrégulière',
       'La Fraternité Saint-Pie-X',
       "Fondée en 1970 par M<sup>gr</sup> Marcel Lefebvre, elle refuse plusieurs orientations de Vatican II. En 1988, il sacre quatre évêques sans l'accord de Rome : les excommunications suivent, levées en 2009. La Fraternité reconnaît le pape comme pape, mais conteste son enseignement conciliaire. Sa situation canonique reste irrégulière, et des discussions se poursuivent avec le Saint-Siège.",
       'mid'],
      ['Hors de la communion',
       'Le sédévacantisme',
       "Le mot vient du latin <em>sede vacante</em>, « le siège étant vacant ». Ce courant très minoritaire, apparu dans les années 1970, tient que les papes qui ont suivi Pie&nbsp;XII ne sont pas de véritables papes, et que le siège de Pierre est donc vide. La conséquence est lourde : ils ne reconnaissent plus aucune autorité vivante dans l'Église. Ils se comptent en dizaines de milliers dans le monde, répartis en groupes eux-mêmes divisés. Cette position place ceux qui la tiennent hors de la communion catholique.",
       'out'],
    ];

    // Les grandes familles aujourd'hui (ordres de grandeur)
    const FAMILLES = [
      ['Catholiques', '≈ 1,4 milliard', 'En communion avec l\'évêque de Rome. 73 livres bibliques.'],
      ['Protestants', '≈ 900 millions', 'Luthériens, réformés, évangéliques, pentecôtistes, baptistes… une grande diversité.'],
      ['Orthodoxes', '≈ 220 millions', 'Églises de tradition grecque et slave, séparées de Rome depuis 1054.'],
      ['Anglicans', '≈ 85 millions', 'Communion anglicane, issue de la rupture de 1534.'],
      ['Orthodoxes orientaux', '≈ 60 millions', 'Coptes, arméniens, syriaques, éthiopiens — séparés dès le V<sup>e</sup> siècle.'],
    ];

    const friseHtml = FRISE.map(([an, titre, texte]) => `
        <li class="tl-e">
          <div class="tl-year">${an}</div>
          <h3 class="tl-title">${titre}</h3>
          <p class="tl-text">${texte}</p>
        </li>`).join('');

    const apresHtml = APRES.map(([statut, nom, texte, cls]) => `
        <article class="cur cur-${cls}">
          <div class="cur-status">${statut}</div>
          <h3 class="cur-name">${nom}</h3>
          <p class="cur-text">${texte}</p>
        </article>`).join('');

    const famHtml = FAMILLES.map(([nom, nb, note]) => `
        <tr><th scope="row">${nom}</th><td class="fam-n">${nb}</td><td class="fam-d">${note}</td></tr>`).join('');

    const debatsHtml = DEBATS.map(([nom, pour, contre]) => `
        <article class="deb">
          <h3 class="deb-name">${nom}</h3>
          <div class="deb-side deb-pour">
            <div class="deb-lbl">Ce qu'ils avancent</div>
            <p>${pour}</p>
          </div>
          <div class="deb-side deb-contre">
            <div class="deb-lbl">Ce que Rome répond</div>
            <p>${contre}</p>
          </div>
        </article>`).join('');

    const communHtml = COMMUN.map(([nom, txt]) => `
        <div class="com-item"><h3>${nom}</h3><p>${txt}</p></div>`).join('');

    const arbreHtml = ARBRE.map(([an, nom, txt, nb, sous]) => `
        <li class="br">
          <div class="br-date">${an}</div>
          <div class="br-card">
            <h3 class="br-nom">${nom}${nb ? `<span class="br-nb">${nb}</span>` : ''}</h3>
            <p class="br-txt">${txt}</p>
            ${sous.length ? `<ul class="br-sub">${sous.map(([c, n, d]) =>
              `<li class="br-s br-s-${c}"><strong>${n}</strong><span>${d}</span></li>`).join('')}</ul>` : ''}
          </div>
        </li>`).join('');

    const motsHtml = MOTS.map(([mot, def]) => `
        <div class="glo-item"><dt>${mot}</dt><dd>${def}</dd></div>`).join('');

    const srcHtml = SOURCES.map(([groupe, cls, items]) => `
        <section class="srcg srcg-${cls}">
          <h3 class="srcg-t">${groupe}</h3>
          <ul class="src">
            ${items.map(([nom, quoi, url]) => `<li>${
              url ? `<a href="${url}" target="_blank" rel="noopener">${nom}</a>` : `<span class="src-book">${nom}</span>`
            } — ${quoi}</li>`).join('')}
          </ul>
        </section>`).join('');

    const bodyHtml = `
      <style>
        .hx-lede{font-family:var(--serif);font-size:19px;line-height:1.6;color:var(--navy);margin:-4px 0 28px}
        .hx h2{font-family:var(--serif);font-size:26px;color:var(--navy);margin:38px 0 6px}
        .hx h2+.hx-note{margin:0 0 20px;color:var(--soft);font-size:14.5px}
        /* Frise */
        .tl{list-style:none;margin:22px 0 0;padding:0 0 0 26px;border-left:2px solid rgba(201,168,76,.4)}
        .tl-e{position:relative;padding:0 0 26px 8px}
        .tl-e::before{content:'';position:absolute;left:-33px;top:6px;width:11px;height:11px;border-radius:50%;background:var(--gold);border:2px solid var(--cream)}
        .tl-year{font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
        .tl-title{font-family:var(--serif);font-size:21px;color:var(--navy);margin:2px 0 6px}
        .tl-text{margin:0;font-size:16px;line-height:1.65}
        /* Courants d'après Vatican II */
        .cur{background:#fff;border:1px solid rgba(0,0,0,.07);border-left:4px solid var(--soft);border-radius:8px;padding:18px 20px;margin:0 0 14px}
        .cur-ok{border-left-color:#3a6448}
        .cur-mid{border-left-color:#9a6b18}
        .cur-out{border-left-color:#a03229}
        .cur-status{font-size:12.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--soft)}
        .cur-ok .cur-status{color:#3a6448}
        .cur-mid .cur-status{color:#9a6b18}
        .cur-out .cur-status{color:#a03229}
        .cur-name{font-family:var(--serif);font-size:21px;color:var(--navy);margin:3px 0 8px}
        .cur-text{margin:0;font-size:16px;line-height:1.65}
        /* Familles */
        .fam-wrap{overflow-x:auto}
        table.fam{border-collapse:collapse;width:100%;margin-top:14px;font-size:15.5px}
        table.fam th,table.fam td{text-align:left;padding:11px 12px;border-bottom:1px solid rgba(0,0,0,.08);vertical-align:top}
        table.fam th{font-weight:600;color:var(--navy);white-space:nowrap}
        .fam-n{white-space:nowrap;color:var(--gold);font-weight:600}
        .fam-d{color:var(--soft);font-size:14.5px}
        .hx-end{background:rgba(201,168,76,.1);border-radius:8px;padding:18px 20px;margin-top:34px;font-size:16px;line-height:1.65}
        .hx-end strong{color:var(--navy)}
        /* Arbre des branches — tronc vertical, branches vers la droite.
           En HTML : le texte suit le réglage d'agrandissement du site. */
        .arb{position:relative;margin:22px 0 0;padding:0}
        .arb-tronc{position:relative;padding:0 0 0 30px;list-style:none;margin:0;
          border-left:4px solid var(--navy)}
        .arb-node{position:relative;margin:0 0 6px;padding:10px 0 10px 6px;font-weight:600;color:var(--navy);font-size:16px}
        .arb-node::before{content:'';position:absolute;left:-40px;top:50%;transform:translateY(-50%);
          width:16px;height:16px;border-radius:50%;background:var(--navy);border:3px solid var(--cream)}
        .arb-node .arb-an{display:block;font-size:12.5px;font-weight:600;letter-spacing:.06em;
          text-transform:uppercase;color:var(--gold)}
        .br{position:relative;margin:0 0 14px;padding-left:6px;list-style:none}
        .br::before{content:'';position:absolute;left:-30px;top:26px;width:26px;height:3px;background:rgba(201,168,76,.75)}
        .br::after{content:'';position:absolute;left:-9px;top:21px;width:11px;height:11px;border-radius:50%;
          background:var(--gold);border:3px solid var(--cream)}
        .br-date{font-size:12.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);margin-bottom:3px}
        .br-card{background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:9px;padding:14px 16px}
        .br-nom{font-family:var(--serif);font-size:20px;color:var(--navy);margin:0 0 5px;
          display:flex;flex-wrap:wrap;align-items:baseline;gap:9px}
        .br-nb{font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;color:var(--gold);white-space:nowrap}
        .br-txt{margin:0;font-size:15.5px;line-height:1.55;color:var(--soft)}
        .br-sub{list-style:none;margin:11px 0 0;padding:0;display:grid;gap:7px}
        .br-s{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font-size:14.5px;
          padding-left:11px;border-left:3px solid var(--soft)}
        .br-s strong{color:var(--ink)}
        .br-s span{color:var(--soft)}
        .br-s-ok{border-left-color:#3a6448}
        .br-s-mid{border-left-color:#9a6b18}
        .br-s-out{border-left-color:#a03229}
        .arb-note{font-size:14.5px;line-height:1.6;color:var(--soft);font-style:italic;
          margin:16px 0 0;padding-left:14px;border-left:2px solid rgba(0,0,0,.12)}
        /* Ce qui unit */
        .com{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:16px}
        .com-item{background:#fff;border-radius:8px;padding:16px 18px;border:1px solid rgba(0,0,0,.06)}
        .com-item h3{font-family:var(--serif);font-size:19px;color:var(--navy);margin:0 0 5px}
        .com-item p{margin:0;font-size:15px;line-height:1.55;color:var(--soft)}
        /* Arguments et réponses */
        .deb{background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:10px;padding:18px 20px;margin:0 0 16px}
        .deb-name{font-family:var(--serif);font-size:21px;color:var(--navy);margin:0 0 12px}
        .deb-side{padding:12px 0}
        .deb-side+.deb-side{border-top:1px dashed rgba(0,0,0,.12)}
        .deb-lbl{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px}
        .deb-pour .deb-lbl{color:#9a6b18}
        .deb-contre .deb-lbl{color:#1a2744}
        .deb-side p{margin:0;font-size:16px;line-height:1.65}
        /* Glossaire */
        .glo{margin:16px 0 0}
        .glo-item{padding:11px 0;border-bottom:1px solid rgba(0,0,0,.07)}
        .glo-item:last-child{border-bottom:none}
        .glo dt{font-weight:600;color:var(--navy);font-size:16px}
        .glo dd{margin:3px 0 0;font-size:15.5px;line-height:1.55;color:var(--soft)}
        /* Sources, groupées par provenance */
        .srcg{margin-top:20px;padding-left:14px;border-left:3px solid rgba(0,0,0,.1)}
        .srcg-off{border-left-color:var(--navy)}
        .srcg-trad{border-left-color:#9a6b18}
        .srcg-sede{border-left-color:#a03229}
        .srcg-t{font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin:0 0 4px}
        .srcg-off .srcg-t{color:var(--navy)}
        .srcg-trad .srcg-t{color:#9a6b18}
        .srcg-sede .srcg-t{color:#a03229}
        .src{margin:8px 0 0;padding-left:20px}
        .src li{margin-bottom:11px;font-size:15.5px;line-height:1.6;color:var(--soft)}
        .src a{color:var(--navy);font-weight:600}
        .src-book{color:var(--ink);font-weight:600}
      </style>

      <div class="hx">
        <p class="hx-lede">
          Les chrétiens du monde entier lisent le même Évangile, et pourtant ils ne prient pas
          tous ensemble. Cette page raconte simplement pourquoi&nbsp;: où et quand les chemins
          se sont séparés, et ce que chacun croit aujourd'hui.
        </p>

        <h2>Ce que tous les chrétiens ont en commun</h2>
        <p class="hx-note">
          À ne pas perdre de vue avant de lire ce qui suit&nbsp;: les divisions portent sur
          beaucoup de choses, mais pas sur l'essentiel.
        </p>
        <div class="com">${communHtml}</div>

        <h2>L'arbre des branches</h2>
        <p class="hx-note">Qui vient de qui, d'un seul coup d'œil.</p>
        <div class="arb">
          <ul class="arb-tronc">
            <li class="arb-node"><span class="arb-an">I<sup>er</sup> siècle</span>L'Église des origines</li>
            ${arbreHtml}
            <li class="arb-node"><span class="arb-an">Aujourd'hui</span>Église catholique — ≈ 1,4 milliard</li>
          </ul>
        </div>
        <p class="arb-note">
          Ce schéma suit le point de vue catholique, celui de ce site&nbsp;: le tronc y figure
          l'Église de Rome, dont les autres se détachent. Les orthodoxes racontent la même
          histoire autrement — pour eux, c'est Rome qui s'est éloignée en 1054. Chaque Église
          se comprend comme la continuité de celle des origines.
        </p>

        <h2>Vingt siècles en quelques dates</h2>
        <p class="hx-note">Le détail des moments où l'histoire chrétienne a bifurqué.</p>
        <ul class="tl">${friseHtml}</ul>

        <h2>Après Vatican II&nbsp;: trois positions à ne pas confondre</h2>
        <p class="hx-note">
          On range souvent sous le même mot de «&nbsp;traditionalistes&nbsp;» des réalités très
          différentes. La distinction tient à un point précis&nbsp;: le rapport à l'autorité du pape.
        </p>
        ${apresHtml}

        <h2>Les arguments, de part et d'autre</h2>
        <p class="hx-note">
          Savoir ce que chacun soutient ne suffit pas pour juger&nbsp;: il faut connaître
          les raisons. Voici, sans les trancher, les arguments avancés et les réponses qui
          leur sont faites.
        </p>
        ${debatsHtml}

        <h2>Les grandes familles chrétiennes aujourd'hui</h2>
        <p class="hx-note">Ordres de grandeur — les estimations varient selon les sources.</p>
        <div class="fam-wrap">
          <table class="fam">
            <thead><tr><th scope="col">Famille</th><th scope="col">Fidèles</th><th scope="col">En bref</th></tr></thead>
            <tbody>${famHtml}</tbody>
          </table>
        </div>

        <h2>Le vocabulaire, en clair</h2>
        <p class="hx-note">Sept mots qui reviennent sans cesse, et que l'on emploie souvent de travers.</p>
        <dl class="glo">${motsHtml}</dl>

        <h2>Vérifier par vous-même</h2>
        <p class="hx-note">
          Cette page résume&nbsp;; ces textes font foi. Ne donner que les documents romains
          reviendrait à ne fournir les pièces que d'un seul camp&nbsp;: chaque courant est
          donc renvoyé à ses propres sources, et l'origine de chacune est indiquée.
          Les citer n'est pas les approuver — c'est vous laisser lire et juger.
        </p>
        ${srcHtml}

        <div class="hx-end">
          <strong>Et maintenant&nbsp;?</strong> Depuis Vatican II, l'Église catholique s'engage dans
          le dialogue œcuménique&nbsp;: reconnaître ce qui unit avant ce qui sépare, et travailler à
          l'unité voulue par le Christ. Les excommunications de 1054 ont été levées en 1965.
          Le chemin est long, mais il est ouvert.
        </div>
      </div>`;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: "Histoire du christianisme et de ses branches",
      description: desc,
      inLanguage: 'fr',
      mainEntityOfPage: canonical,
      publisher: { '@type': 'Organization', name: 'PrionsEnLigne', logo: { '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png` } },
    };

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(pageShell({
      title, desc, canonical,
      h1: 'Histoire du christianisme',
      sub: 'Des origines à aujourd\'hui — pourquoi les chrétiens se sont divisés',
      bodyHtml, jsonLd,
    }));
    return;
  }

  if (p === 'paroisses') {
    const canonical = `${SITE}/paroisses`;
    const title = 'PrionsEnLigne pour les paroisses — outil gratuit pour vos fidèles | PrionsEnLigne';
    const desc = "Un outil gratuit, sans publicité, pour accompagner les fidèles empêchés (malades, personnes âgées, isolés, diaspora) : offices, messes en direct, chapelet guidé, calendrier liturgique. Affiche imprimable avec QR code pour votre paroisse.";
    const bodyHtml = `
      <p class="sub">Chers prêtres, diacres et équipes paroissiales</p>
      <div class="card">
        <h2>Un service au service de votre paroisse</h2>
        <p>PrionsEnLigne est un outil <strong>entièrement gratuit, sans publicité et sans collecte de données</strong>, pensé pour <strong>compléter</strong> — et non remplacer — la vie paroissiale. Il aide les fidèles qui ne peuvent pas toujours se rendre à l'église à rester unis à la prière de l'Église.</p>
        <p><strong>Pour qui&nbsp;?</strong></p>
        <ul class="saint-list">
          <li>Les <strong>personnes âgées</strong> et à mobilité réduite</li>
          <li>Les <strong>malades</strong> et hospitalisés</li>
          <li>Les fidèles <strong>isolés</strong> ou en zone rurale</li>
          <li>La <strong>diaspora francophone</strong> (Afrique, Québec, Antilles…)</li>
        </ul>
        <p><strong>Ce qu'ils y trouvent&nbsp;:</strong> les offices du bréviaire (laudes, vêpres, complies), les messes en direct (radio &amp; TV catholiques), le chapelet numérique guidé à voix haute, la Bible et le calendrier liturgique des saints — le tout sur ordinateur, tablette ou téléphone.</p>
      </div>
      <div class="card">
        <h2>Notre engagement pastoral</h2>
        <p>Nous rappelons clairement, sur chaque messe diffusée, que <strong>la participation physique à l'Eucharistie est irremplaçable</strong>. Suivre une messe à distance est une aide précieuse pour les empêchés, jamais un substitut. Notre but&nbsp;: ramener vers la paroisse, pas en éloigner.</p>
      </div>
      <div class="card">
        <h2>Comment soutenir&nbsp;? C'est simple et gratuit</h2>
        <ul class="saint-list">
          <li><strong>Affichez le QR code</strong> au fond de l'église, au presbytère, à la sortie de la messe</li>
          <li><strong>Glissez l'adresse</strong> dans votre bulletin paroissial ou votre feuille de chants</li>
          <li><strong>Parlez-en</strong> aux personnes que vous visitez (malades, aînés)</li>
        </ul>
        <p>Une <strong>affiche A4 prête à imprimer</strong>, avec QR code, est à votre disposition&nbsp;:</p>
        <p><a class="cta" href="/affiche">🖨️ Voir &amp; imprimer l'affiche paroisse</a></p>
        <p class="src">Une question, un projet de collaboration&nbsp;? Écrivez-nous à contact@prionsenligne.fr — nous serons heureux d'échanger.</p>
      </div>`;
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: title, description: desc, url: canonical,
    });
    res.status(200).send(pageShell({
      title, desc, canonical, h1: 'PrionsEnLigne pour les paroisses', sub: 'Un outil gratuit au service du clergé',
      bodyHtml, jsonLd, otherLink: { href: '/affiche', label: 'Affiche à imprimer' },
    }));
    return;
  }

  // ── /affiche (poster A4 imprimable avec QR code) ──
  if (p === 'affiche') {
    const canonical = `${SITE}/affiche`;
    res.status(200).send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Affiche paroisse — à imprimer | PrionsEnLigne</title>
<meta name="description" content="Affiche A4 imprimable avec QR code pour faire connaître PrionsEnLigne dans votre paroisse.">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="noindex">
<style>
  :root{--ink:#1e1c18;--cream:#f7f3ea;--navy:#1a2744;--gold:#c9a84c;--soft:#6b6357}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,'Times New Roman',serif;background:#e9e6df;color:var(--ink);padding:24px;display:flex;flex-direction:column;align-items:center;gap:18px;overflow-x:hidden}
  .toolbar{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
  .toolbar button,.toolbar a{font-family:system-ui,sans-serif;font-size:14px;font-weight:600;padding:11px 22px;border-radius:999px;border:none;cursor:pointer;text-decoration:none}
  .btn-print{background:var(--navy);color:#fff}
  .btn-back{background:#fff;color:var(--navy);border:1px solid #ccc}
  .toolbar p{flex-basis:100%;text-align:center;font-family:system-ui,sans-serif;font-size:13px;color:var(--soft)}
  /* Feuille A4 — taille fixe réelle ; mise à l'échelle pour l'écran via JS
     (sinon les unités mm/px déborderaient sur mobile). */
  .sheet-wrap{width:100%;display:flex;justify-content:center;align-items:flex-start;overflow:hidden}
  .sheet{width:210mm;flex-shrink:0;aspect-ratio:210/297;background:var(--cream);box-shadow:0 6px 30px rgba(0,0,0,.18);
    transform-origin:top center;
    display:flex;flex-direction:column;align-items:center;text-align:center;padding:18mm 16mm;position:relative}
  .frame{position:absolute;inset:8mm;border:2px solid var(--gold)}
  .frame::after{content:"";position:absolute;inset:4mm;border:1px solid rgba(201,168,76,.5)}
  .cross{margin-top:6mm;width:64px;height:64px;position:relative}
  .cross b{position:absolute;background:var(--navy)}
  .cross .v{left:50%;top:0;width:10px;height:64px;transform:translateX(-50%)}
  .cross .h{left:50%;top:16px;width:38px;height:10px;transform:translateX(-50%)}
  .brand{font-size:34px;color:var(--navy);margin-top:8px;letter-spacing:.5px}
  .brand span{color:var(--gold)}
  .tagline{font-style:italic;color:var(--soft);font-size:18px;margin-top:4px}
  .hr{width:70px;height:3px;background:var(--gold);margin:16px 0}
  .lead{font-size:20px;line-height:1.5;color:var(--ink);max-width:150mm;margin-top:2mm}
  .lead strong{color:var(--navy)}
  .qr-wrap{margin:6mm 0 4mm;padding:5mm;background:#fff;border:1px solid #e0d9c8;border-radius:8px}
  .qr-wrap svg{width:46mm;height:46mm;display:block}
  .scan{font-family:system-ui,sans-serif;font-size:15px;color:var(--navy);font-weight:600}
  .url{font-family:system-ui,sans-serif;font-size:26px;color:var(--gold);font-weight:700;letter-spacing:.5px;margin-top:3mm}
  .features{font-size:15px;color:var(--soft);margin-top:5mm;line-height:1.7;max-width:150mm}
  .pastoral{margin-top:auto;font-size:13px;color:var(--soft);font-style:italic;max-width:150mm;line-height:1.5}
  .free{font-family:system-ui,sans-serif;display:inline-block;margin-top:4mm;background:rgba(201,168,76,.18);color:var(--navy);font-weight:600;font-size:13px;padding:5px 16px;border-radius:999px}
  @media print {
    body{background:#fff;padding:0;gap:0}
    .toolbar{display:none}
    .sheet-wrap{overflow:visible;height:auto!important}
    .sheet{box-shadow:none;width:100%;height:100%;transform:none!important}
  }
  @page{size:A4;margin:0}
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨️ Imprimer cette affiche</button>
    <a class="btn-back" href="/paroisses">← Retour</a>
    <p>Conseil : imprimez en A4, couleur, qualité normale. À afficher au fond de l'église ou au presbytère.</p>
  </div>
  <div class="sheet-wrap">
  <div class="sheet">
    <div class="frame"></div>
    <div class="cross"><b class="v"></b><b class="h"></b></div>
    <div class="brand">Prions<span>EnLigne</span></div>
    <div class="tagline">Prier ensemble, chaque jour</div>
    <div class="hr"></div>
    <p class="lead">Vous ne pouvez pas toujours vous rendre à l'église&nbsp;?<br>
      <strong>Restez unis à la prière de l'Église</strong>, où que vous soyez.</p>
    <div class="qr-wrap">${QR_SVG}</div>
    <div class="scan">Scannez avec l'appareil photo de votre téléphone</div>
    <div class="url">prionsenligne.fr</div>
    <div class="features">Offices du bréviaire · Messes en direct · Chapelet guidé à voix haute<br>
      Bible · Calendrier liturgique des saints</div>
    <span class="free">100&nbsp;% gratuit · sans publicité</span>
    <p class="pastoral">La participation physique à la messe reste irremplaçable. Cet outil accompagne ceux qui ne peuvent pas se déplacer (malades, personnes âgées, isolés) et invite chacun à rejoindre sa paroisse dès qu'il le peut.</p>
  </div>
  </div>
  <script>
    // Met la feuille A4 à l'échelle pour qu'elle tienne en largeur sur l'écran
    // (mobile surtout), tout en restant fidèle. L'impression la réinitialise.
    (function () {
      var wrap = document.querySelector('.sheet-wrap');
      var sheet = document.querySelector('.sheet');
      function fit() {
        sheet.style.transform = 'none';
        var natural = sheet.offsetWidth;        // largeur réelle (210mm en px)
        // On mesure la largeur disponible depuis le viewport (non pollué par le
        // débordement de la feuille non encore mise à l'échelle), moins le
        // padding horizontal du body.
        var bs = getComputedStyle(document.body);
        var padX = parseFloat(bs.paddingLeft) + parseFloat(bs.paddingRight);
        var avail = document.documentElement.clientWidth - padX;
        var s = Math.min(1, avail / natural);
        sheet.style.transform = 'scale(' + s + ')';
        // La hauteur du wrapper suit la feuille mise à l'échelle (le transform
        // ne réduit pas la boîte de mise en page).
        wrap.style.height = (sheet.offsetHeight * s) + 'px';
      }
      window.addEventListener('resize', fit);
      window.addEventListener('beforeprint', function () { wrap.style.height = 'auto'; sheet.style.transform = 'none'; });
      window.addEventListener('afterprint', fit);
      // Plusieurs passages : la 1re mesure peut tomber avant que la largeur du
      // viewport (mobile) soit stabilisée. On recalcule après le load, à la
      // frame suivante, et avec un court filet de sécurité.
      fit();
      window.addEventListener('load', fit);
      if (window.requestAnimationFrame) requestAnimationFrame(fit);
      setTimeout(fit, 250);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    })();
  </script>
</body>
</html>`);
    return;
  }

  // Route inconnue → redirige vers l'app
  res.setHeader('Location', '/agenda');
  res.status(302).end();
}
