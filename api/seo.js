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
  /* Retour vers l app — cible tactile de 44 px comme partout ailleurs */
  .back-app{display:inline-flex;align-items:center;min-height:44px;padding:8px 14px;margin-left:auto;margin-right:10px;color:rgba(255,255,255,.9);font-size:14px;text-decoration:none;border-radius:999px;border:1px solid rgba(255,255,255,.22)}
  .back-app:hover{background:rgba(255,255,255,.1);color:#fff}
  @media (max-width:560px){
    .back-app{font-size:0;padding:8px 12px;border:none;margin-right:2px}
    .back-app::before{content:"← Retour";font-size:14px}
  }
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
  <!-- Retour explicite : le logo mène à la page de présentation, si bien que
       personne ne savait revenir à l'agenda depuis ces pages. Lien simple et
       toujours identique, plutôt qu'un retour « intelligent » imprévisible. -->
  <a class="back-app" href="/agenda">&larr; Retour à l'agenda</a>
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

  /* ── Comment prier une neuvaine ────────────────────────────────────
     Deuxième page-pilier. Sujet très cherché, et qui ramène le lecteur
     neuf jours de suite. Un point pastoral y est traité franchement :
     la neuvaine n'est pas une formule magique — c'est la dérive la plus
     courante sur ce thème, et la taire serait manquer à l'honnêteté. */
  if (p === 'neuvaine-guide') {
    const canonical = `${SITE}/comment-prier-une-neuvaine`;
    const title = "Comment prier une neuvaine — guide simple et complet | PrionsEnLigne";
    const desc = "Prier une neuvaine pas à pas : ce que c'est, comment s'y prendre, les grandes neuvaines de l'année et celles que l'on demande le plus. Que faire si l'on oublie un jour.";

    const ETAPES = [
      ['Choisir votre intention', "Une seule, et clairement formulée&nbsp;: une guérison, un travail, une réconciliation, une décision à prendre. Neuf jours sur une intention précise valent mieux que neuf jours de demandes vagues."],
      ['Choisir à qui vous vous adressez', "À l'Esprit Saint, à la Vierge Marie, ou à un saint dont l'histoire rejoint votre intention. La page vous en propose plus bas."],
      ['Fixer un moment', "Le même chaque jour si possible&nbsp;: au lever, à midi, avant de dormir. C'est la régularité qui porte la neuvaine, bien plus que la longueur de la prière."],
      ['Prier neuf jours de suite', "La même prière chaque jour, à laquelle on ajoute son intention. Beaucoup y joignent une dizaine de chapelet, une messe ou un petit sacrifice."],
      ['Terminer par l\'action de grâce', "Le neuvième jour, on remercie — quelle que soit la réponse reçue, et même si elle se fait attendre. C'est ce qui distingue la prière de la transaction."],
    ];

    const GRANDES = [
      ['À l\'Esprit Saint', "De l'Ascension à la Pentecôte", "La neuvaine originelle&nbsp;: celle des apôtres réunis au Cénacle avec Marie. La seule inscrite dans le calendrier liturgique lui-même."],
      ['De Noël', '16 au 24 décembre', "Les neuf jours qui préparent la Nativité, souvent priés en famille autour de la crèche."],
      ['De l\'Immaculée Conception', '30 novembre au 8 décembre', "Prépare la fête du 8 décembre, très suivie à Lyon et dans toute la francophonie."],
      ['À la Divine Miséricorde', 'Du Vendredi saint au samedi suivant', "Demandée par le Christ à sainte Faustine, elle s'achève au dimanche de la Miséricorde."],
      ['De l\'Assomption', '7 au 15 août', "Prépare la grande fête mariale du 15 août."],
      ['À Notre-Dame de Lourdes', '3 au 11 février', "Priée pour les malades, en union avec le sanctuaire."],
    ];

    // Chacun renvoie à sa fiche : le lecteur qui choisit un saint veut
    // souvent savoir qui il était avant de le prier neuf jours durant.
    const SAINTS = [
      ['Sainte Rita', 'sainte-rita-de-cascia', '22 mai', "Les causes difficiles et les situations qui semblent sans issue. La plus demandée de toutes."],
      ['Saint Jude', 'saint-jude-thaddee', '28 octobre', "Les causes désespérées, quand tout a déjà été tenté."],
      ['Saint Antoine de Padoue', 'saint-antoine-de-padoue', '13 juin', "Les objets perdus, mais aussi les décisions à prendre et les pauvres."],
      ['Sainte Thérèse de l\'Enfant-Jésus', 'sainte-therese-de-lisieux', '1<sup>er</sup> octobre', "La confiance et l'abandon. Sa neuvaine dite « aux roses » est très répandue."],
      ['Saint Joseph', 'saint-joseph', '19 mars', "Le travail, la famille, et la grâce d'une bonne mort."],
      ['Saint Padre Pio', 'saint-padre-pio', '23 septembre', "La souffrance, les malades et la confession."],
    ];

    const FAQ = [
      ['Faut-il commencer un jour précis&nbsp;?',
       "Non, sauf pour les neuvaines liées à une fête, qui se terminent la veille de celle-ci. Pour toutes les autres, on commence le jour où l'on décide de commencer."],
      ["Et si j'oublie un jour&nbsp;?",
       "Ce n'est pas grave et il n'y a rien à «&nbsp;annuler&nbsp;». Reprenez le lendemain, ou recommencez si vous préférez. Une neuvaine n'est pas un mécanisme qui se dérègle&nbsp;: c'est une prière."],
      ['Est-ce que ça marche&nbsp;?',
       "C'est la question qu'il faut se poser franchement. La neuvaine n'est pas une formule qui obligerait Dieu&nbsp;: la prière n'agit pas comme une mécanique, et croire qu'un nombre de jours produirait un résultat relèverait de la superstition, non de la foi. Ce que la neuvaine change à coup sûr, c'est celui qui prie&nbsp;: elle apprend la persévérance, et elle place l'intention devant Dieu jour après jour. La réponse, elle, lui appartient — et prend souvent une forme que l'on n'attendait pas."],
      ['Peut-on prier pour quelqu\'un d\'autre&nbsp;?',
       "Oui, et c'est même l'usage le plus fréquent&nbsp;: on prie pour un malade, un proche éloigné de la foi, un couple en difficulté. La personne n'a pas besoin d'être au courant."],
      ['Peut-on en prier plusieurs à la fois&nbsp;?',
       "Rien ne l'interdit, mais mieux vaut une neuvaine tenue jusqu'au bout que trois commencées et abandonnées."],
      ['Faut-il une prière particulière&nbsp;?',
       "Non. Un Notre Père, un Je vous salue Marie et votre intention formulée avec vos mots suffisent. Les textes propres à chaque saint sont une aide, jamais une obligation."],
    ];

    const etapesHtml = ETAPES.map(([nom, txt], i) => `
        <li class="et">
          <span class="et-n">${i + 1}</span>
          <div><h3 class="et-t">${nom}</h3><p class="et-d">${txt}</p></div>
        </li>`).join('');

    const grandesHtml = GRANDES.map(([nom, quand, txt]) => `
        <article class="nv">
          <div class="nv-quand">${quand}</div>
          <h3 class="nv-nom">Neuvaine ${nom.charAt(0).toLowerCase() + nom.slice(1)}</h3>
          <p class="nv-txt">${txt}</p>
        </article>`).join('');

    const saintsHtml = SAINTS.map(([nom, slug, fete, pour]) => `
        <tr>
          <th scope="row"><a href="/saints/${slug}">${nom}</a></th>
          <td class="st-f" data-lbl="Fête">${fete}</td>
          <td class="st-p" data-lbl="Invoqué pour">${pour}</td>
        </tr>`).join('');

    const faqHtml = FAQ.map(([q, r]) => `
        <div class="fq"><h3 class="fq-q">${q}</h3><p class="fq-r">${r}</p></div>`).join('');

    const bodyHtml = `
      <style>
        .cg-lede{font-family:var(--serif);font-size:19px;line-height:1.6;color:var(--navy);margin:-4px 0 26px}
        .cg h2{font-family:var(--serif);font-size:26px;color:var(--navy);margin:38px 0 6px}
        .cg-note{margin:0 0 18px;color:var(--soft);font-size:14.5px}
        .cg p{max-width:65ch}
        .et-list{list-style:none;margin:18px 0 0;padding:0}
        .et{display:flex;gap:14px;padding:0 0 18px}
        .et-n{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--navy);color:#fff;
          display:flex;align-items:center;justify-content:center;font-weight:600;font-size:15px}
        .et-t{font-family:var(--serif);font-size:20px;color:var(--navy);margin:2px 0 4px}
        .et-d{margin:0;font-size:16px;line-height:1.6}
        .nv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin-top:16px}
        .nv{background:#fff;border:1px solid rgba(0,0,0,.07);border-top:3px solid var(--gold);border-radius:9px;padding:16px 18px}
        .nv-quand{font-size:12.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--soft)}
        .nv-nom{font-family:var(--serif);font-size:19px;color:var(--navy);margin:3px 0 7px}
        .nv-txt{margin:0;font-size:15.5px;line-height:1.55;color:var(--soft)}
        .st-wrap{overflow-x:auto}
        table.st{border-collapse:collapse;width:100%;min-width:460px;margin-top:14px;font-size:15.5px}
        table.st th,table.st td{text-align:left;padding:11px 12px;border-bottom:1px solid rgba(0,0,0,.08);vertical-align:top}
        table.st th{font-weight:600;color:var(--navy);white-space:nowrap}
        table.st th a{color:var(--navy);text-decoration-thickness:1px;text-underline-offset:2px}
        .st-f{white-space:nowrap;color:var(--gold);font-weight:600}
        .st-p{color:var(--soft);font-size:15px}
        /* Sur téléphone, le tableau devenait plus large que l'écran : il
           fallait le faire glisser de côté pour lire « Invoqué pour ».
           Chaque saint devient donc un bloc, sans défilement latéral. */
        @media (max-width:640px){
          .st-wrap{overflow-x:visible}
          table.st,table.st tbody,table.st tr,table.st th,table.st td{display:block;width:auto;min-width:0}
          table.st thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
          table.st tr{background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:9px;padding:14px 16px;margin-bottom:12px}
          table.st th,table.st td{border-bottom:none;padding:0;white-space:normal}
          table.st th{font-family:var(--serif);font-size:19px;margin-bottom:3px}
          .st-f{font-size:13px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:6px}
          .st-p::before{content:attr(data-lbl) " : ";font-weight:600;color:var(--navy)}
        }
        .fq{padding:14px 0;border-bottom:1px solid rgba(0,0,0,.08)}
        .fq:last-of-type{border-bottom:none}
        .fq-q{font-family:var(--serif);font-size:19px;color:var(--navy);margin:0 0 5px}
        .fq-r{margin:0;font-size:16px;line-height:1.6;color:var(--soft)}
        .cg-tip{background:rgba(201,168,76,.1);border-radius:8px;padding:16px 20px;margin-top:22px;font-size:16px;line-height:1.6}
        .cg-tip strong{color:var(--navy)}
        .cg-cta{background:var(--navy);border-radius:12px;padding:24px 22px;margin:32px 0 0;text-align:center}
        .cg-cta h2{color:#fff;margin:0 0 8px;font-size:24px}
        .cg-cta p{color:rgba(255,255,255,.82);font-size:16px;margin:0 auto 18px;max-width:46ch}
        .cg-cta a{display:inline-flex;align-items:center;gap:9px;background:var(--gold);color:var(--navy);
          font-weight:600;font-size:16px;padding:13px 26px;border-radius:999px;text-decoration:none;min-height:44px}
        .cg-apres{font-size:14.5px;color:var(--soft);text-align:center;margin:16px 0 0;line-height:1.6}
        .cg-apres a{color:var(--navy)}
      </style>

      <div class="cg">
        <p class="cg-lede">
          Une neuvaine, c'est prier neuf jours de suite pour une même intention. Rien de
          compliqué, rien à savoir par cœur&nbsp;: il faut surtout de la constance — et
          c'est précisément ce qu'elle vient former en nous.
        </p>

        <h2>D'où viennent ces neuf jours</h2>
        <p>
          Le modèle est dans les Actes des Apôtres. Après l'Ascension, les apôtres retournent
          à Jérusalem et se retirent au Cénacle avec Marie, «&nbsp;assidus à la prière&nbsp;».
          Neuf jours plus tard, à la Pentecôte, l'Esprit Saint descend sur eux.
        </p>
        <p>
          Toutes les neuvaines reprennent cette attente de neuf jours. La forme s'est répandue
          au Moyen Âge, puis largement à partir du XVII<sup>e</sup> siècle.
        </p>

        <h2>Comment s'y prendre</h2>
        <p class="cg-note">Cinq étapes, et rien d'autre.</p>
        <ul class="et-list">${etapesHtml}</ul>

        <h2>Les grandes neuvaines de l'année</h2>
        <p class="cg-note">Celles qui préparent une fête, et se terminent donc à date fixe.</p>
        <div class="nv-grid">${grandesHtml}</div>

        <h2>Les saints le plus souvent invoqués</h2>
        <p class="cg-note">
          On s'adresse volontiers à un saint dont la vie fait écho à ce que l'on traverse.
          Rien n'oblige à choisir dans cette liste.
        </p>
        <div class="st-wrap">
          <table class="st">
            <thead><tr><th scope="col">Saint</th><th scope="col">Fête</th><th scope="col">Invoqué pour</th></tr></thead>
            <tbody>${saintsHtml}</tbody>
          </table>
        </div>

        <h2>Questions fréquentes</h2>
        <p class="cg-note">Y compris celle que l'on n'ose pas toujours poser.</p>
        ${faqHtml}

        <div class="cg-tip">
          <strong>Si vous débutez&nbsp;:</strong> choisissez une intention qui vous tient
          vraiment à cœur, et une prière courte. Trois minutes tenues neuf jours valent mieux
          qu'un quart d'heure abandonné au troisième.
        </div>

        <div class="cg-cta">
          <h2>Prier pendant votre neuvaine</h2>
          <p>
            Beaucoup joignent une dizaine de chapelet à leur prière quotidienne. Le chapelet
            guidé du site vous accompagne grain par grain, en mode tactile ou en audio.
          </p>
          <a href="/agenda#open-chapelet">Ouvrir le chapelet</a>
        </div>

        <p class="cg-apres">
          Certains aiment tenir un support écrit pendant les neuf jours&nbsp;:
          <a href="/comment-prier-le-chapelet">notre guide du chapelet</a> peut y aider, et
          des carnets de neuvaines à imprimer existent sur
          <a href="https://www.etsy.com/shop/FatimaLightCo" target="_blank" rel="noopener">la boutique</a>.
        </p>
      </div>`;

    const propre = s => String(s).replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').trim();
    const jsonLd = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'Comment prier une neuvaine',
        description: desc,
        inLanguage: 'fr',
        totalTime: 'P9D',
        step: ETAPES.map(([nom, txt], i) => ({
          '@type': 'HowToStep', position: i + 1, name: nom, text: propre(txt),
        })),
        mainEntityOfPage: canonical,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: 'fr',
        mainEntity: FAQ.map(([q, r]) => ({
          '@type': 'Question',
          name: propre(q),
          acceptedAnswer: { '@type': 'Answer', text: propre(r) },
        })),
      },
    ]);

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(pageShell({
      title, desc, canonical,
      h1: 'Comment prier une neuvaine',
      sub: 'Neuf jours pour une intention — un guide simple',
      bodyHtml, jsonLd,
    }));
    return;
  }

  /* ── Comment prier le chapelet ─────────────────────────────────────
     Page durable sur le sujet le plus cherché du domaine. Elle renvoie
     au chapelet numérique du site, sa fonction la plus aboutie.
     Les textes des prières reprennent exactement ceux de l'application
     (forme traditionnelle, au vouvoiement) : deux versions différentes
     sur le même site sèmeraient le doute. */
  if (p === 'chapelet-guide') {
    const canonical = `${SITE}/comment-prier-le-chapelet`;
    const title = "Comment prier le chapelet — guide simple et complet | PrionsEnLigne";
    const desc = "Apprendre à prier le chapelet pas à pas : le déroulement, les mystères de chaque jour, le texte des prières et le temps que cela prend. Guide clair, pour débuter ou reprendre.";

    const ETAPES = [
      ['Le signe de croix', "Sur le crucifix du chapelet. «&nbsp;Au nom du Père, et du Fils, et du Saint-Esprit. Amen.&nbsp;»"],
      ['Le Je crois en Dieu', "Toujours sur le crucifix. On professe sa foi avant d'entrer dans la prière."],
      ['Un Notre Père', "Sur le premier gros grain."],
      ['Trois Je vous salue Marie', "Sur les trois petits grains qui suivent. La tradition les offre pour la foi, l'espérance et la charité."],
      ['Un Gloire au Père', "Puis on arrive à la médaille : le chapelet proprement dit commence."],
      ['Les cinq dizaines', "Pour chacune&nbsp;: on annonce le mystère, on médite, puis un Notre Père, dix Je vous salue Marie sur les dix petits grains, et un Gloire au Père."],
      ['La conclusion', "Le Salve Regina, en tenant le crucifix, et un dernier signe de croix."],
    ];

    const MYSTERES = [
      ['Joyeux', 'Lundi et samedi', ["L'Annonciation", 'La Visitation', 'La Nativité', 'La Présentation de Jésus au Temple', 'Le Recouvrement de Jésus au Temple']],
      ['Lumineux', 'Jeudi', ['Le Baptême de Jésus dans le Jourdain', 'Les Noces de Cana', "L'annonce du Royaume", 'La Transfiguration', "L'institution de l'Eucharistie"]],
      ['Douloureux', 'Mardi et vendredi', ["L'Agonie au jardin des Oliviers", 'La Flagellation', "Le Couronnement d'épines", 'Le Portement de la Croix', 'La Crucifixion et la mort de Jésus']],
      ['Glorieux', 'Mercredi et dimanche', ['La Résurrection', "L'Ascension", 'La Pentecôte', "L'Assomption de la Vierge Marie", 'Le Couronnement de Marie au Ciel']],
    ];

    const PRIERES = [
      ['Notre Père', "Notre Père, qui êtes aux cieux, que votre Nom soit sanctifié, que votre règne vienne, que votre volonté soit faite sur la terre comme au ciel. Donnez-nous aujourd'hui notre pain de ce jour. Pardonnez-nous nos offenses, comme nous pardonnons aussi à ceux qui nous ont offensés. Et ne nous soumettez pas à la tentation, mais délivrez-nous du Mal. Amen."],
      ['Je vous salue, Marie', "Je vous salue, Marie pleine de grâces, le Seigneur est avec vous. Vous êtes bénie entre toutes les femmes et Jésus, le fruit de vos entrailles, est béni. Sainte Marie, Mère de Dieu, priez pour nous pauvres pécheurs, maintenant et à l'heure de notre mort. Amen."],
      ['Gloire au Père', "Gloire au Père, et au Fils, et au Saint-Esprit. Comme il était au commencement, maintenant et toujours, dans les siècles des siècles. Amen."],
      ['Salve Regina', "Salut, ô Reine, Mère de miséricorde, notre vie, notre douceur et notre espérance, salut. Enfants d'Ève, exilés, nous crions vers vous. Vers vous nous soupirons, gémissant et pleurant dans cette vallée de larmes. Ô vous, notre avocate, tournez vers nous vos regards miséricordieux. Et après cet exil, montrez-nous Jésus, le fruit béni de vos entrailles. Ô clémente, ô miséricordieuse, ô douce Vierge Marie."],
    ];

    /* Questions réellement tapées dans les moteurs de recherche par les
       personnes qui débutent. Elles valent mieux que du texte de remplissage :
       ce sont celles qui bloquent vraiment. */
    const FAQ = [
      ['Faut-il un chapelet béni&nbsp;?',
       "Non. Un chapelet béni est un sacramental, ce qui est précieux, mais nullement une condition. On peut prier avec n'importe quel chapelet — et même sans."],
      ['Peut-on prier sans chapelet&nbsp;?',
       "Oui, sur les doigts&nbsp;: chaque main compte cinq Je vous salue Marie, deux tours font une dizaine. Beaucoup prient ainsi dans les transports ou en marchant."],
      ['Peut-on le prier en voiture ou en marchant&nbsp;?',
       "Oui. Le chapelet accompagne bien une activité régulière qui ne demande pas de réfléchir. C'est même l'une des raisons de sa forme répétitive."],
      ['Et si je me distrais sans arrêt&nbsp;?',
       "C'est l'expérience de tout le monde, y compris des saints. On revient simplement au mystère, sans se troubler ni recommencer. La distraction subie n'ôte rien à la prière."],
      ['Faut-il faire les cinq dizaines d\'un coup&nbsp;?',
       "Non. On peut les répartir dans la journée&nbsp;: une le matin, une le soir. L'important est de revenir, pas de tenir un compte."],
      ['Peut-on le prier à plusieurs&nbsp;?',
       "Oui, et c'est l'usage le plus ancien&nbsp;: une personne dit la première moitié de la prière, les autres répondent la seconde."],
    ];

    const faqHtml = FAQ.map(([q, r]) => `
        <div class="fq"><h3 class="fq-q">${q}</h3><p class="fq-r">${r}</p></div>`).join('');

    const etapesHtml = ETAPES.map(([nom, txt], i) => `
        <li class="et">
          <span class="et-n">${i + 1}</span>
          <div><h3 class="et-t">${nom}</h3><p class="et-d">${txt}</p></div>
        </li>`).join('');

    const mystHtml = MYSTERES.map(([nom, jours, list]) => `
        <article class="my my-${nom.toLowerCase()}">
          <div class="my-jours">${jours}</div>
          <h3 class="my-nom">Mystères ${nom.toLowerCase()}</h3>
          <ol class="my-list">${list.map(m => `<li>${m}</li>`).join('')}</ol>
        </article>`).join('');

    const prieresHtml = PRIERES.map(([nom, txt]) => `
        <div class="pr"><h3 class="pr-nom">${nom}</h3><p class="pr-txt">${txt}</p></div>`).join('');

    const bodyHtml = `
      <style>
        .cg-lede{font-family:var(--serif);font-size:19px;line-height:1.6;color:var(--navy);margin:-4px 0 26px}
        .cg h2{font-family:var(--serif);font-size:26px;color:var(--navy);margin:38px 0 6px}
        .cg-note{margin:0 0 18px;color:var(--soft);font-size:14.5px}
        .cg p{max-width:65ch}
        /* Étapes */
        .et-list{list-style:none;margin:18px 0 0;padding:0}
        .et{display:flex;gap:14px;padding:0 0 18px}
        .et-n{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--navy);color:#fff;
          display:flex;align-items:center;justify-content:center;font-weight:600;font-size:15px}
        .et-t{font-family:var(--serif);font-size:20px;color:var(--navy);margin:2px 0 4px}
        .et-d{margin:0;font-size:16px;line-height:1.6}
        /* Mystères */
        .my-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin-top:16px}
        .my{background:#fff;border:1px solid rgba(0,0,0,.07);border-top:3px solid var(--gold);border-radius:9px;padding:16px 18px}
        .my-joyeux{border-top-color:#c9a84c}.my-lumineux{border-top-color:#4a7fb5}
        .my-douloureux{border-top-color:#a03229}.my-glorieux{border-top-color:#3a6448}
        .my-jours{font-size:12.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--soft)}
        .my-nom{font-family:var(--serif);font-size:20px;color:var(--navy);margin:3px 0 9px}
        .my-list{margin:0;padding-left:20px}
        .my-list li{font-size:15.5px;line-height:1.5;margin-bottom:5px}
        /* Prières */
        .pr{background:#fff;border-radius:9px;padding:15px 18px;margin-bottom:12px;border:1px solid rgba(0,0,0,.06)}
        .pr-nom{font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin:0 0 7px}
        .pr-txt{font-family:var(--serif);font-size:17.5px;line-height:1.6;margin:0}
        /* Encadré app */
        .cg-cta{background:var(--navy);border-radius:12px;padding:24px 22px;margin:32px 0 0;text-align:center}
        .cg-cta h2{color:#fff;margin:0 0 8px;font-size:24px}
        .cg-cta p{color:rgba(255,255,255,.82);font-size:16px;margin:0 auto 18px;max-width:46ch}
        .cg-cta a{display:inline-flex;align-items:center;gap:9px;background:var(--gold);color:var(--navy);
          font-weight:600;font-size:16px;padding:13px 26px;border-radius:999px;text-decoration:none;min-height:44px}
        .cg-tip{background:rgba(201,168,76,.1);border-radius:8px;padding:16px 20px;margin-top:22px;font-size:16px;line-height:1.6}
        .cg-tip strong{color:var(--navy)}
        /* Questions fréquentes */
        .fq{padding:14px 0;border-bottom:1px solid rgba(0,0,0,.08)}
        .fq:last-of-type{border-bottom:none}
        .fq-q{font-family:var(--serif);font-size:19px;color:var(--navy);margin:0 0 5px}
        .fq-r{margin:0;font-size:16px;line-height:1.6;color:var(--soft)}
      </style>

      <div class="cg">
        <p class="cg-lede">
          Le chapelet n'est pas une prière compliquée. C'est une prière répétitive et
          apaisante, où l'on médite la vie du Christ avec le regard de sa mère. Une
          vingtaine de minutes, et rien d'autre qu'un chapelet — ou vos dix doigts.
        </p>

        <h2>D'où vient cette prière</h2>
        <p>
          Le chapelet naît au Moyen Âge d'un usage tout simple&nbsp;: les fidèles qui ne
          savaient pas lire récitaient cent cinquante Je vous salue Marie, en écho aux cent
          cinquante psaumes que chantaient les moines. D'où son autre nom, le rosaire, et sa
          division en dizaines.
        </p>
        <p>
          La tradition en attribue la révélation à saint Dominique, au XIII<sup>e</sup> siècle&nbsp;;
          les historiens y voient plutôt une formation progressive sur plusieurs siècles. Sa forme
          actuelle est fixée par saint Pie&nbsp;V en 1569. À Fatima, en 1917, la Vierge en
          demande la récitation quotidienne. En 2002, Jean-Paul&nbsp;II ajoute les mystères
          lumineux, jusque-là absents&nbsp;: c'est pourquoi certains chapelets anciens n'en
          parlent pas.
        </p>

        <h2>Le déroulement, pas à pas</h2>
        <p class="cg-note">La suite complète, du signe de croix à la conclusion.</p>
        <ul class="et-list">${etapesHtml}</ul>
        <p class="cg-note" style="margin-top:14px">
          Comptez une vingtaine de minutes pour les cinq dizaines, un peu moins en priant seul.
        </p>

        <h2>Les mystères selon le jour</h2>
        <p class="cg-note">
          Chaque dizaine s'accompagne d'un épisode de la vie du Christ que l'on médite.
          Ils se répartissent sur la semaine — c'est l'usage courant, non une obligation.
        </p>
        <div class="my-grid">${mystHtml}</div>

        <h2>Le texte des prières</h2>
        <p class="cg-note">
          Dans la forme traditionnelle, celle du chapelet de ce site. La traduction
          liturgique en usage depuis 2013 dit «&nbsp;Notre Père, qui es aux cieux&nbsp;»
          et «&nbsp;ne nous laisse pas entrer en tentation&nbsp;»&nbsp;: les deux se prient.
        </p>
        ${prieresHtml}

        <h2>Questions fréquentes</h2>
        <p class="cg-note">Celles qui arrêtent le plus souvent quand on débute.</p>
        ${faqHtml}

        <div class="cg-tip">
          <strong>Si vous débutez&nbsp;:</strong> commencez par une seule dizaine. Mieux vaut
          une dizaine chaque jour que cinq une fois par mois. La régularité compte plus que
          la quantité — et l'on n'est pas obligé de tout savoir par cœur pour commencer.
        </div>

        <div class="cg-cta">
          <h2>Le chapelet guidé, sur ce site</h2>
          <p>
            Un vrai chapelet en image, qui avance grain par grain avec vous. En mode tactile
            ou en audio guidé, avec les mystères du jour déjà sélectionnés. En six langues.
          </p>
          <a href="/agenda#open-chapelet">Ouvrir le chapelet</a>
        </div>
      </div>`;

    // Deux balisages : le mode d'emploi et les questions fréquentes, que
    // Google peut afficher directement dans ses résultats.
    const propre = s => String(s).replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').trim();
    const jsonLd = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'Comment prier le chapelet',
        description: desc,
        inLanguage: 'fr',
        totalTime: 'PT20M',
        step: ETAPES.map(([nom, txt], i) => ({
          '@type': 'HowToStep', position: i + 1, name: nom, text: propre(txt),
        })),
        mainEntityOfPage: canonical,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: 'fr',
        mainEntity: FAQ.map(([q, r]) => ({
          '@type': 'Question',
          name: propre(q),
          acceptedAnswer: { '@type': 'Answer', text: propre(r) },
        })),
      },
    ]);

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(pageShell({
      title, desc, canonical,
      h1: 'Comment prier le chapelet',
      sub: 'Un guide simple, pour débuter ou pour reprendre',
      bodyHtml, jsonLd,
    }));
    return;
  }

  /* ── Le Notre Père ─────────────────────────────────────────────────
     Le texte le plus cherché du domaine, et de loin. Deux pièges à
     éviter : donner l'ancienne traduction (« ne nous soumets pas à la
     tentation », abandonnée en 2017), et esquiver la question de la
     doxologie finale, que les protestants disent et les catholiques
     placent ailleurs dans la messe. Les deux sont traitées de front. */
  if (p === 'notre-pere') {
    const canonical = `${SITE}/priere-notre-pere`;
    const title = "Le Notre Père — texte officiel, explication et origine | PrionsEnLigne";
    const desc = "Le texte exact du Notre Père dans la traduction liturgique en vigueur depuis 2017, l'explication de ses sept demandes, son origine dans l'Évangile, la version latine et pourquoi la finale « car c'est à toi qu'appartiennent… » n'en fait pas partie.";

    // Les sept demandes — l'ordre est celui de saint Matthieu.
    const DEMANDES = [
      ['Que ton nom soit sanctifié',
       "La première demande ne réclame rien pour soi. Sanctifier le nom de Dieu, c'est demander qu'il soit reconnu pour ce qu'il est — d'abord dans notre propre manière de vivre, car c'est par les croyants que ce nom est honoré ou déshonoré aux yeux des autres."],
      ['Que ton règne vienne',
       "Non pas un royaume terrestre, mais l'accomplissement de ce que le Christ a inauguré. On demande à la fois qu'il advienne à la fin des temps, et qu'il commence dès maintenant là où l'on se trouve."],
      ['Que ta volonté soit faite sur la terre comme au ciel',
       "La demande la plus exigeante&nbsp;: elle engage à renoncer à imposer la sienne. C'est la prière du Christ lui-même à Gethsémani, quelques heures avant sa Passion."],
      ['Donne-nous aujourd\'hui notre pain de ce jour',
       "Le pain matériel, sans détour&nbsp;: de quoi vivre aujourd'hui, pas de quoi être à l'abri pour dix ans. La tradition y lit aussi le pain eucharistique. Le mot grec employé par Matthieu, <i>epiousios</i>, n'apparaît nulle part ailleurs dans toute la littérature grecque&nbsp;; on le traduit par «&nbsp;de ce jour&nbsp;» faute de mieux."],
      ['Pardonne-nous nos offenses, comme nous pardonnons aussi à ceux qui nous ont offensés',
       "La seule demande assortie d'une condition, et le Christ y revient juste après pour insister. On ne demande pas un pardon gratuit&nbsp;: on demande à être pardonné dans la mesure où l'on pardonne soi-même."],
      ['Et ne nous laisse pas entrer en tentation',
       "Dieu ne tente personne&nbsp;: on lui demande de ne pas nous laisser franchir le pas quand l'épreuve se présente. C'est précisément ce que l'ancienne formule — «&nbsp;ne nous soumets pas à la tentation&nbsp;» — laissait entendre à tort, d'où le changement de 2017."],
      ['Mais délivre-nous du Mal',
       "Le texte grec permet de comprendre «&nbsp;du mal&nbsp;» ou «&nbsp;du Malin&nbsp;». La liturgie française met une majuscule&nbsp;: il ne s'agit pas des contrariétés de l'existence, mais de celui qui s'oppose au dessein de Dieu."],
    ];

    const FAQ = [
      ["Pourquoi le texte a-t-il changé en 2017&nbsp;?",
       "La sixième demande disait «&nbsp;ne nous soumets pas à la tentation&nbsp;», ce qui laissait croire que Dieu pourrait pousser au péché — le contraire de ce qu'enseigne l'Écriture. La traduction «&nbsp;ne nous laisse pas entrer en tentation&nbsp;» est entrée en vigueur le 3 décembre 2017, premier dimanche de l'Avent, dans toute la francophonie."],
      ["Faut-il dire «&nbsp;car c'est à toi qu'appartiennent le règne, la puissance et la gloire&nbsp;»&nbsp;?",
       "Cette finale, appelée doxologie, ne figure pas dans les plus anciens manuscrits de l'Évangile&nbsp;: elle a été ajoutée très tôt dans l'usage liturgique. Les Églises protestantes l'ont conservée dans la prière elle-même. Les catholiques la disent aussi, mais à la messe seulement, après une courte prière du prêtre qui la sépare du Notre Père. En dehors de la messe, on s'arrête donc à «&nbsp;délivre-nous du Mal&nbsp;»."],
      ["D'où vient cette prière&nbsp;?",
       "Du Christ lui-même, qui la donne à ses disciples. On la trouve deux fois dans les Évangiles&nbsp;: en Matthieu 6, 9-13, dans le Sermon sur la montagne, et en Luc 11, 2-4, sous une forme plus brève, en réponse à un disciple qui demandait&nbsp;: «&nbsp;Seigneur, apprends-nous à prier.&nbsp;»"],
      ["Pourquoi «&nbsp;notre&nbsp;» Père et non «&nbsp;mon&nbsp;» Père&nbsp;?",
       "Parce que la prière est au pluriel d'un bout à l'autre — donne-nous, pardonne-nous, délivre-nous. Même dit seul, on ne la prie jamais pour soi seul&nbsp;: c'est la prière de toute l'Église, et elle inclut nécessairement ceux qu'on aurait préféré laisser dehors."],
      ["Combien de fois faut-il le dire&nbsp;?",
       "Aucune règle. Il est dit une fois à chaque messe, une fois par dizaine de chapelet, et il ouvre plusieurs offices du bréviaire. Beaucoup le prient simplement au lever et au coucher."],
      ["Y a-t-il une posture particulière&nbsp;?",
       "Non. À la messe, l'usage varie selon les paroisses&nbsp;: mains ouvertes, mains jointes, parfois en se tenant par la main. Aucune de ces manières n'est prescrite ni interdite."],
      ["Peut-on le dire pour quelqu'un qui ne croit pas&nbsp;?",
       "Oui. Prier pour un proche éloigné de la foi est un usage très ancien, et le Notre Père est la forme la plus simple de cette prière."],
    ];

    const demandesHtml = DEMANDES.map(([nom, txt], i) => `
        <li class="et">
          <span class="et-n">${i + 1}</span>
          <div><h3 class="et-t">${nom}</h3><p class="et-d">${txt}</p></div>
        </li>`).join('');

    const faqHtml = FAQ.map(([q, r]) => `
        <div class="fq"><h3 class="fq-q">${q}</h3><p class="fq-r">${r}</p></div>`).join('');

    const bodyHtml = `
      <style>
        .cg-lede{font-family:var(--serif);font-size:19px;line-height:1.6;color:var(--navy);margin:-4px 0 26px}
        .cg h2{font-family:var(--serif);font-size:26px;color:var(--navy);margin:38px 0 6px}
        .cg-note{margin:0 0 18px;color:var(--soft);font-size:14.5px}
        .cg p{max-width:65ch}
        .np{background:#fff;border:1px solid rgba(0,0,0,.07);border-top:3px solid var(--gold);
          border-radius:10px;padding:26px 26px 24px;margin-top:16px}
        .np p{font-family:var(--serif);font-size:21px;line-height:1.7;color:var(--navy);margin:0;max-width:none}
        /* Sélecteur doublé : « .np p » l'emportait sinon, et la référence
           s'affichait dans la même typographie que la prière elle-même. */
        .np .np-src{margin-top:18px;padding-top:14px;border-top:1px solid rgba(0,0,0,.07);
          font-family:'Outfit',sans-serif;font-size:13px;line-height:1.5;color:var(--soft);letter-spacing:.02em}
        .np-lat{background:rgba(26,39,68,.04);border-radius:9px;padding:20px 22px;margin-top:14px}
        .np-lat p{font-family:var(--serif);font-style:italic;font-size:17.5px;line-height:1.65;color:var(--soft);margin:0}
        .et-list{list-style:none;margin:18px 0 0;padding:0}
        .et{display:flex;gap:14px;padding:0 0 18px}
        .et-n{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--navy);color:#fff;
          display:flex;align-items:center;justify-content:center;font-weight:600;font-size:15px}
        .et-t{font-family:var(--serif);font-size:20px;color:var(--navy);margin:2px 0 4px}
        .et-d{margin:0;font-size:16px;line-height:1.6}
        .fq{padding:14px 0;border-bottom:1px solid rgba(0,0,0,.08)}
        .fq:last-of-type{border-bottom:none}
        .fq-q{font-family:var(--serif);font-size:19px;color:var(--navy);margin:0 0 5px}
        .fq-r{margin:0;font-size:16px;line-height:1.6;color:var(--soft)}
        .cg-tip{background:rgba(201,168,76,.1);border-radius:8px;padding:16px 20px;margin-top:22px;font-size:16px;line-height:1.6}
        .cg-tip strong{color:var(--navy)}
        .cg-cta{background:var(--navy);border-radius:12px;padding:24px 22px;margin:32px 0 0;text-align:center}
        .cg-cta h2{color:#fff;margin:0 0 8px;font-size:24px}
        .cg-cta p{color:rgba(255,255,255,.82);font-size:16px;margin:0 auto 18px;max-width:46ch}
        .cg-cta a{display:inline-flex;align-items:center;gap:9px;background:var(--gold);color:var(--navy);
          font-weight:600;font-size:16px;padding:13px 26px;border-radius:999px;text-decoration:none;min-height:44px}
        .cg-apres{font-size:14.5px;color:var(--soft);text-align:center;margin:16px 0 0;line-height:1.6}
        .cg-apres a{color:var(--navy)}
      </style>

      <div class="cg">
        <p class="cg-lede">
          C'est la seule prière que le Christ ait lui-même enseignée, et la plus dite au monde.
          Voici son texte exact — celui en vigueur depuis 2017 —, ce que veut dire chacune de
          ses demandes, et d'où elle vient.
        </p>

        <h2>Le texte</h2>
        <p class="cg-note">Traduction liturgique officielle, en usage dans toute la francophonie.</p>
        <div class="np">
          <p>
            Notre Père, qui es aux cieux,<br>
            que ton nom soit sanctifié,<br>
            que ton règne vienne,<br>
            que ta volonté soit faite sur la terre comme au ciel.<br><br>
            Donne-nous aujourd'hui notre pain de ce jour.<br>
            Pardonne-nous nos offenses,<br>
            comme nous pardonnons aussi à ceux qui nous ont offensés.<br>
            Et ne nous laisse pas entrer en tentation,<br>
            mais délivre-nous du Mal.<br><br>
            Amen.
          </p>
          <p class="np-src">Matthieu 6, 9-13 — traduction liturgique de l'AELF, en vigueur depuis le 3 décembre 2017.</p>
        </div>

        <h2>En latin</h2>
        <p class="cg-note">Le <i>Pater noster</i>, encore chanté dans de nombreuses assemblées.</p>
        <div class="np-lat">
          <p>
            Pater noster, qui es in cælis, sanctificetur nomen tuum&nbsp;; adveniat regnum tuum&nbsp;;
            fiat voluntas tua, sicut in cælo et in terra. Panem nostrum quotidianum da nobis hodie&nbsp;;
            et dimitte nobis debita nostra, sicut et nos dimittimus debitoribus nostris&nbsp;;
            et ne nos inducas in tentationem, sed libera nos a malo. Amen.
          </p>
        </div>

        <h2>Les sept demandes, une par une</h2>
        <p class="cg-note">
          Trois regardent Dieu, quatre regardent les hommes. L'ordre n'a rien d'accidentel.
        </p>
        <ul class="et-list">${demandesHtml}</ul>

        <h2>Questions fréquentes</h2>
        <p class="cg-note">Dont les deux qui reviennent toujours&nbsp;: le changement de 2017, et la finale.</p>
        ${faqHtml}

        <div class="cg-tip">
          <strong>Une manière de le prier autrement&nbsp;:</strong> prenez une seule demande, et
          restez-y toute la journée. Sept jours, sept demandes — beaucoup découvrent ainsi une
          prière qu'ils récitaient depuis quarante ans sans plus l'entendre.
        </div>

        <div class="cg-cta">
          <h2>Le prier chaque jour</h2>
          <p>
            Le Notre Père ouvre chaque dizaine du chapelet. Le chapelet guidé du site vous
            accompagne grain par grain, en mode tactile ou en audio.
          </p>
          <a href="/agenda#open-chapelet">Ouvrir le chapelet</a>
        </div>

        <p class="cg-apres">
          Pour aller plus loin&nbsp;: <a href="/comment-prier-le-chapelet">comment prier le chapelet</a>,
          <a href="/comment-prier-une-neuvaine">comment prier une neuvaine</a>, ou
          <a href="/evangile-du-jour">l'évangile du jour</a>.
        </p>
      </div>`;

    const propre = s => String(s).replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').trim();
    const jsonLd = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Le Notre Père — texte officiel, explication et origine',
        description: desc,
        inLanguage: 'fr',
        mainEntityOfPage: canonical,
        author: { '@type': 'Organization', name: 'PrionsEnLigne' },
        publisher: { '@type': 'Organization', name: 'PrionsEnLigne' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: 'fr',
        mainEntity: FAQ.map(([q, r]) => ({
          '@type': 'Question',
          name: propre(q),
          acceptedAnswer: { '@type': 'Answer', text: propre(r) },
        })),
      },
    ]);

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(pageShell({
      title, desc, canonical,
      h1: 'Le Notre Père',
      sub: 'Le texte officiel, et ce que disent ses sept demandes',
      bodyHtml, jsonLd,
    }));
    return;
  }

  /* ── Comment se confesser ──────────────────────────────────────────
     Troisième guide durable. Le sujet est très cherché, et presque
     toujours par quelqu'un que la démarche intimide : « ça fait vingt
     ans », « je ne sais pas quoi dire ». La page répond donc d'abord à
     cette gêne — le déroulement exact, les mots à prononcer — avant la
     doctrine. Rien n'est dramatisé, rien n'est édulcoré non plus. */
  if (p === 'confession-guide') {
    const canonical = `${SITE}/comment-se-confesser`;
    const title = "Comment se confesser — le déroulement, les mots à dire, l'acte de contrition | PrionsEnLigne";
    const desc = "Se confesser pas à pas : comment se préparer, ce que l'on dit en entrant, le texte de l'acte de contrition, ce que fait le prêtre. Guide clair, même si votre dernière confession remonte à très longtemps.";

    // Examen de conscience — présenté en questions plutôt qu'en liste de
    // fautes : on cherche à aider quelqu'un à réfléchir, pas à l'accabler.
    const EXAMEN = [
      ['Envers Dieu', [
        "Ai-je fait une place à la prière, ou seulement quand j'avais besoin de quelque chose&nbsp;?",
        "Ai-je manqué la messe du dimanche par simple négligence&nbsp;?",
        "Me suis-je servi du nom de Dieu à la légère, ou pour blesser&nbsp;?",
        "Ai-je cherché des réponses ailleurs — voyance, superstitions — plutôt qu'auprès de lui&nbsp;?",
      ]],
      ['Envers les autres', [
        "Ai-je menti, trompé, trahi une confiance&nbsp;?",
        "Ai-je parlé dans le dos de quelqu'un, révélé ce qui ne m'appartenait pas&nbsp;?",
        "Ai-je été dur, méprisant, violent en paroles&nbsp;?",
        "Ai-je gardé de la rancune, refusé de pardonner, entretenu une brouille&nbsp;?",
        "Ai-je manqué à mes engagements — conjugaux, familiaux, professionnels&nbsp;?",
        "Ai-je pris ce qui ne m'appartenait pas, ou profité de quelqu'un de plus faible&nbsp;?",
        "Ai-je vu un besoin autour de moi et détourné le regard&nbsp;?",
      ]],
      ['Envers soi-même', [
        "Ai-je laissé un excès prendre le dessus — alcool, écrans, jeu, achats, pornographie&nbsp;?",
        "Ai-je usé de mon corps ou de celui d'un autre comme d'un objet&nbsp;?",
        "Me suis-je laissé aller au découragement au point de douter d'être aimé de Dieu&nbsp;?",
        "Ai-je gâché mon temps et mes forces alors que d'autres comptaient sur moi&nbsp;?",
      ]],
    ];

    const ETAPES = [
      ['Entrer et se signer',
       "Vous choisissez le confessionnal, où l'on n'est pas vu, ou le face-à-face, selon ce qui est proposé. Le prêtre commence par le signe de croix&nbsp;: vous le faites avec lui."],
      ['Dire depuis quand',
       "La formule d'usage est&nbsp;: «&nbsp;Bénissez-moi mon père parce que j'ai péché. Ma dernière confession remonte à…&nbsp;» Si vous ne savez plus, dites-le tel quel — «&nbsp;cela fait très longtemps, je ne sais plus&nbsp;». Cela arrive tous les jours."],
      ['Dire ses péchés',
       "Simplement, sans détour et sans se justifier. On dit ce que l'on a fait, pas ce que les autres ont fait. Pour les fautes graves, on indique aussi à peu près combien de fois. Si les mots ne viennent pas, dites-le au prêtre&nbsp;: c'est son métier de vous aider à avancer, et il le fera sans vous brusquer."],
      ['Écouter ce que dit le prêtre',
       "Quelques mots, souvent brefs&nbsp;: un conseil, un encouragement. Puis il vous donne une pénitence — le plus souvent une prière, parfois un geste concret."],
      ['Dire l\'acte de contrition',
       "Une courte prière par laquelle on exprime son regret. Le texte est plus bas sur cette page&nbsp;; il n'est pas obligatoire de le connaître par cœur, et vos propres mots conviennent."],
      ['Recevoir l\'absolution',
       "Le prêtre étend la main et prononce la formule qui se termine par «&nbsp;…je te pardonne tous tes péchés, au nom du Père, et du Fils, et du Saint-Esprit&nbsp;». Vous répondez «&nbsp;Amen&nbsp;». C'est fini. Il ne reste qu'à accomplir la pénitence reçue."],
    ];

    const FAQ = [
      ["Cela fait vingt ans — puis-je quand même y aller&nbsp;?",
       "Oui, et c'est la situation que les prêtres rencontrent le plus souvent. Dites simplement en entrant depuis combien de temps vous n'êtes pas venu&nbsp;: il adaptera. Aucune durée n'est un obstacle, et il n'y a rien à rattraper avant de venir."],
      ["Faut-il vraiment tout dire&nbsp;?",
       "L'Église demande de confesser les péchés graves — ceux qui portent sur une matière importante, commis en connaissance de cause et librement — avec leur nature et, autant que possible, leur nombre approximatif. Les fautes légères ne sont pas obligatoires&nbsp;; les confesser reste vivement encouragé, parce que c'est là qu'on progresse. On ne demande ni récit détaillé ni circonstances scabreuses."],
      ["Et si j'oublie un péché&nbsp;?",
       "Un oubli involontaire n'annule rien&nbsp;: le pardon reçu vaut pour l'ensemble. Vous le direz simplement la prochaine fois. Ce qui invaliderait la confession, c'est de taire volontairement une faute grave."],
      ["Le prêtre peut-il répéter ce que je lui dis&nbsp;?",
       "Jamais, sous aucun prétexte et envers personne&nbsp;: c'est le secret sacramentel, absolu en droit de l'Église (canon 983). Un prêtre qui le violerait serait excommunié. Il ne peut pas non plus se servir de ce qu'il a entendu, même sans le révéler."],
      ["Peut-on se confesser sans être vu&nbsp;?",
       "Oui. Le confessionnal traditionnel, avec sa grille, existe précisément pour cela, et il est proposé dans la plupart des églises. Le choix vous revient&nbsp;: personne ne vous demandera de justifier votre préférence."],
      ["Combien de temps cela dure-t-il&nbsp;?",
       "Rarement plus d'un quart d'heure, souvent cinq minutes. Une confession après une longue absence est un peu plus longue, sans plus."],
      ["Faut-il connaître des prières par cœur&nbsp;?",
       "Non. Le prêtre vous guide de bout en bout et vous souffle ce qu'il faut dire si vous hésitez."],
      ["À quelle fréquence&nbsp;?",
       "L'obligation minimale est d'une fois par an pour qui a conscience d'une faute grave&nbsp;; c'est l'un des préceptes de l'Église. Beaucoup s'en tiennent aux grandes fêtes, d'autres viennent tous les mois. Ce rythme mensuel est celui que recommandent le plus souvent les confesseurs."],
      ["Peut-on se confesser par téléphone ou en visioconférence&nbsp;?",
       "Non&nbsp;: le sacrement suppose la présence physique, et l'Église l'a rappelé pendant la pandémie. Si vous ne pouvez vraiment pas vous déplacer et que la situation est grave, vous pouvez faire un acte de contrition sincère, avec l'intention ferme de vous confesser dès que ce sera possible."],
      ["Peut-on communier sans s'être confessé&nbsp;?",
       "Oui, si l'on n'a pas conscience d'une faute grave&nbsp;: la confession n'est pas un passage obligé avant chaque communion. En revanche, quand on a conscience d'un péché grave, la confession vient d'abord."],
      ["Et pour un enfant&nbsp;?",
       "La première confession précède habituellement la première communion, vers 8 ans. Le prêtre adapte entièrement sa manière&nbsp;; il n'y a rien à préparer d'autre que d'expliquer à l'enfant qu'il va parler de ce qui l'a rendu triste ou fâché avec les autres."],
    ];

    const examenHtml = EXAMEN.map(([titre, qs]) => `
        <article class="ex">
          <h3 class="ex-t">${titre}</h3>
          <ul class="ex-l">${qs.map(q => `<li>${q}</li>`).join('')}</ul>
        </article>`).join('');

    const etapesHtml = ETAPES.map(([nom, txt], i) => `
        <li class="et">
          <span class="et-n">${i + 1}</span>
          <div><h3 class="et-t">${nom}</h3><p class="et-d">${txt}</p></div>
        </li>`).join('');

    const faqHtml = FAQ.map(([q, r]) => `
        <div class="fq"><h3 class="fq-q">${q}</h3><p class="fq-r">${r}</p></div>`).join('');

    const bodyHtml = `
      <style>
        .cg-lede{font-family:var(--serif);font-size:19px;line-height:1.6;color:var(--navy);margin:-4px 0 26px}
        .cg h2{font-family:var(--serif);font-size:26px;color:var(--navy);margin:38px 0 6px}
        .cg-note{margin:0 0 18px;color:var(--soft);font-size:14.5px}
        .cg p{max-width:65ch}
        .ex-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:16px}
        .ex{background:#fff;border:1px solid rgba(0,0,0,.07);border-top:3px solid var(--gold);border-radius:9px;padding:16px 18px}
        .ex-t{font-family:var(--serif);font-size:20px;color:var(--navy);margin:0 0 8px}
        .ex-l{margin:0;padding-left:18px}
        .ex-l li{font-size:15.5px;line-height:1.55;color:var(--soft);margin-bottom:7px}
        .et-list{list-style:none;margin:18px 0 0;padding:0}
        .et{display:flex;gap:14px;padding:0 0 18px}
        .et-n{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--navy);color:#fff;
          display:flex;align-items:center;justify-content:center;font-weight:600;font-size:15px}
        .et-t{font-family:var(--serif);font-size:20px;color:var(--navy);margin:2px 0 4px}
        .et-d{margin:0;font-size:16px;line-height:1.6}
        .dial{background:#fff;border:1px solid rgba(0,0,0,.07);border-left:3px solid var(--navy);
          border-radius:9px;padding:18px 20px;margin-top:16px}
        .dial p{margin:0 0 12px;font-size:16px;line-height:1.6}
        .dial p:last-child{margin-bottom:0}
        .dial b{color:var(--navy)}
        .prayer{background:rgba(201,168,76,.1);border-radius:9px;padding:20px 22px;margin-top:16px}
        .prayer h3{font-family:var(--serif);font-size:19px;color:var(--navy);margin:0 0 8px}
        .prayer p{font-family:var(--serif);font-size:18px;line-height:1.65;color:var(--navy);margin:0}
        .prayer + .prayer{margin-top:12px}
        .fq{padding:14px 0;border-bottom:1px solid rgba(0,0,0,.08)}
        .fq:last-of-type{border-bottom:none}
        .fq-q{font-family:var(--serif);font-size:19px;color:var(--navy);margin:0 0 5px}
        .fq-r{margin:0;font-size:16px;line-height:1.6;color:var(--soft)}
        .cg-tip{background:rgba(201,168,76,.1);border-radius:8px;padding:16px 20px;margin-top:22px;font-size:16px;line-height:1.6}
        .cg-tip strong{color:var(--navy)}
        .cg-cta{background:var(--navy);border-radius:12px;padding:24px 22px;margin:32px 0 0;text-align:center}
        .cg-cta h2{color:#fff;margin:0 0 8px;font-size:24px}
        .cg-cta p{color:rgba(255,255,255,.82);font-size:16px;margin:0 auto 18px;max-width:46ch}
        .cg-cta a{display:inline-flex;align-items:center;gap:9px;background:var(--gold);color:var(--navy);
          font-weight:600;font-size:16px;padding:13px 26px;border-radius:999px;text-decoration:none;min-height:44px}
        .cg-apres{font-size:14.5px;color:var(--soft);text-align:center;margin:16px 0 0;line-height:1.6}
        .cg-apres a{color:var(--navy)}
      </style>

      <div class="cg">
        <p class="cg-lede">
          Se confesser intimide presque toujours, et d'abord parce qu'on ne sait pas comment
          cela se passe. Voici le déroulement exact, les mots que l'on prononce, et les
          réponses aux questions que l'on n'ose pas poser.
        </p>

        <h2>Ce qu'est ce sacrement</h2>
        <p>
          La confession — l'Église parle du sacrement de réconciliation, ou de pénitence — est
          le geste par lequel un baptisé reconnaît ses fautes devant un prêtre et en reçoit le
          pardon de Dieu. Le prêtre n'est pas un juge qui évalue&nbsp;: il est le témoin et
          l'instrument de ce pardon.
        </p>
        <p>
          Trois choses seulement sont requises du pénitent&nbsp;: le regret de ce qu'il a fait,
          l'aveu de ses fautes, et la volonté de réparer autant qu'il le peut. Ni éloquence,
          ni vocabulaire particulier, ni perfection préalable.
        </p>

        <h2>Se préparer&nbsp;: l'examen de conscience</h2>
        <p class="cg-note">
          Quelques minutes suffisent. Il ne s'agit pas de dresser un inventaire, mais de
          regarder honnêtement où l'on en est. Ces questions ne sont qu'un point de départ.
        </p>
        <div class="ex-grid">${examenHtml}</div>

        <h2>Le déroulement, pas à pas</h2>
        <p class="cg-note">Six moments, et rien d'autre.</p>
        <ul class="et-list">${etapesHtml}</ul>

        <h2>Ce qui se dit exactement</h2>
        <p class="cg-note">Le dialogue habituel, pour n'avoir aucune surprise.</p>
        <div class="dial">
          <p><b>Le prêtre&nbsp;:</b> «&nbsp;Au nom du Père, et du Fils, et du Saint-Esprit.&nbsp;»</p>
          <p><b>Vous&nbsp;:</b> «&nbsp;Amen. Bénissez-moi mon père parce que j'ai péché.
            Ma dernière confession remonte à trois mois&nbsp;» — ou «&nbsp;à plusieurs années,
            je ne sais plus exactement&nbsp;».</p>
          <p><b>Vous&nbsp;:</b> vous dites ensuite vos fautes, puis&nbsp;: «&nbsp;Je m'accuse
            de tous ces péchés et de ceux dont je ne me souviens pas.&nbsp;»</p>
          <p><b>Le prêtre&nbsp;:</b> quelques mots, puis la pénitence à accomplir.</p>
          <p><b>Vous&nbsp;:</b> l'acte de contrition.</p>
          <p><b>Le prêtre&nbsp;:</b> l'absolution. Vous répondez «&nbsp;Amen&nbsp;».</p>
        </div>

        <h2>L'acte de contrition</h2>
        <p class="cg-note">
          Deux formules parmi les plus répandues. Vos propres mots font tout aussi bien&nbsp;:
          ce qui compte est le regret, non la formule.
        </p>
        <div class="prayer">
          <h3>Formule traditionnelle</h3>
          <p>
            Mon Dieu, j'ai un très grand regret de vous avoir offensé, parce que vous êtes
            infiniment bon, infiniment aimable, et que le péché vous déplaît. Je prends la
            ferme résolution, avec le secours de votre sainte grâce, de ne plus vous offenser
            et de faire pénitence. Amen.
          </p>
        </div>
        <div class="prayer">
          <h3>Formule brève</h3>
          <p>
            Seigneur Jésus, Fils de Dieu, prends pitié de moi qui suis pécheur.
          </p>
        </div>

        <h2>Questions fréquentes</h2>
        <p class="cg-note">Y compris celles que l'on garde pour soi.</p>
        ${faqHtml}

        <div class="cg-tip">
          <strong>Si la démarche vous coûte&nbsp;:</strong> allez dans une église où vous
          n'êtes pas connu, et dites au prêtre dès la première phrase que vous êtes mal à
          l'aise et que cela fait longtemps. C'est la phrase qu'il entend le plus souvent, et
          elle suffit à ce qu'il prenne les choses en main.
        </div>

        <div class="cg-cta">
          <h2>Trouver une église près de chez vous</h2>
          <p>
            Les horaires de confession sont affichés par la plupart des paroisses, souvent
            avant la messe du samedi ou du dimanche.
          </p>
          <a href="/paroisses">Voir les paroisses</a>
        </div>

        <p class="cg-apres">
          Beaucoup préparent leur confession par une prière&nbsp;:
          <a href="/comment-prier-le-chapelet">le chapelet</a> ou
          <a href="/comment-prier-une-neuvaine">une neuvaine</a> en sont les formes les plus
          courantes.
        </p>
      </div>`;

    const propre = s => String(s).replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').trim();
    const jsonLd = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'Comment se confesser',
        description: desc,
        inLanguage: 'fr',
        step: ETAPES.map(([nom, txt], i) => ({
          '@type': 'HowToStep', position: i + 1, name: nom, text: propre(txt),
        })),
        mainEntityOfPage: canonical,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: 'fr',
        mainEntity: FAQ.map(([q, r]) => ({
          '@type': 'Question',
          name: propre(q),
          acceptedAnswer: { '@type': 'Answer', text: propre(r) },
        })),
      },
    ]);

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(pageShell({
      title, desc, canonical,
      h1: 'Comment se confesser',
      sub: "Le déroulement, les mots à dire — même après des années",
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
        <tr>
          <th scope="row">${nom}</th>
          <td class="fam-n" data-lbl="Fidèles">${nb}</td>
          <td class="fam-d" data-lbl="En bref">${note}</td>
        </tr>`).join('');

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
        /* Même traitement que le guide des neuvaines : en dessous de 640 px,
           le tableau dépassait de l'écran et imposait un défilement latéral.
           Chaque famille devient un bloc lisible d'un seul tenant. */
        @media (max-width:640px){
          .fam-wrap{overflow-x:visible}
          table.fam,table.fam tbody,table.fam tr,table.fam th,table.fam td{display:block;width:auto;min-width:0}
          table.fam thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
          table.fam tr{background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:9px;padding:14px 16px;margin-bottom:12px}
          table.fam th,table.fam td{border-bottom:none;padding:0;white-space:normal}
          table.fam th{font-family:var(--serif);font-size:19px;margin-bottom:3px}
          .fam-n{font-size:15px;margin-bottom:6px}
        }
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

    // Sérialisé ici : le gabarit insère la chaîne telle quelle.
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: "Histoire du christianisme et de ses branches",
      description: desc,
      inLanguage: 'fr',
      mainEntityOfPage: canonical,
      publisher: { '@type': 'Organization', name: 'PrionsEnLigne', logo: { '@type': 'ImageObject', url: `${SITE}/icons/icon-512.png` } },
    });

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
