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
