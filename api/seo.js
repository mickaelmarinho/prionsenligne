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
<style>
  :root{--ink:#1e1c18;--cream:#f7f3ea;--navy:#1a2744;--gold:#c9a84c;--soft:#6b6357}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Outfit',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--cream);line-height:1.6}
  .wrap{max-width:720px;margin:0 auto;padding:0 20px}
  header{background:var(--navy);color:#fff;padding:14px 0}
  header .wrap{display:flex;align-items:center;justify-content:space-between}
  .brand{font-family:Georgia,serif;font-size:18px;color:#fff;text-decoration:none;display:flex;align-items:center;gap:8px}
  .brand b{color:var(--gold);font-weight:700}
  .open-app{background:var(--gold);color:var(--ink);font-weight:600;font-size:14px;padding:8px 16px;border-radius:999px;text-decoration:none}
  main{padding:34px 0 10px}
  .eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:12px;color:var(--gold);font-weight:600;margin-bottom:6px}
  h1{font-family:Georgia,serif;font-size:30px;line-height:1.2;margin:0 0 6px}
  .sub{color:var(--soft);font-size:15px;margin-bottom:22px}
  .card{background:#fff;border:1px solid #e7e0d2;border-left:3px solid var(--gold);border-radius:10px;padding:20px 22px;margin:18px 0}
  .card h2{font-family:Georgia,serif;font-size:21px;margin:0 0 10px}
  .ref{color:var(--gold);font-weight:600;font-size:14px;margin-bottom:10px}
  p{margin:0 0 14px}
  .cta{display:inline-flex;align-items:center;gap:9px;background:var(--navy);color:#fff;font-weight:600;padding:13px 26px;border-radius:999px;text-decoration:none;margin:8px 0 26px}
  .links{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0;border-top:1px solid #e7e0d2;padding-top:20px}
  .links a{color:var(--navy);text-decoration:none;font-size:14px;background:#fff;border:1px solid #e7e0d2;padding:8px 14px;border-radius:8px}
  .links a:hover{border-color:var(--gold)}
  footer{color:var(--soft);font-size:12.5px;text-align:center;padding:26px 0 40px;line-height:1.7}
  footer a{color:var(--soft)}
  .src{font-size:12.5px;color:var(--soft);font-style:italic;margin-top:6px}
  main h2{font-family:Georgia,serif;font-size:19px;margin:26px 0 8px;color:var(--navy)}
  .card h2{margin:0 0 10px;font-size:21px}
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
  <a class="brand" href="/">✝ Prions<b>EnLigne</b></a>
  <a class="open-app" href="/agenda">Ouvrir l'app</a>
</div></header>
<main><div class="wrap">
  <div class="eyebrow">${esc(sub)}</div>
  <h1>${esc(h1)}</h1>
  ${bodyHtml}
  <a class="cta" href="/agenda">📿 Ouvrir PrionsEnLigne — offices, messes, chapelet</a>
  <div class="links">
    <a href="/agenda">Agenda du jour</a>
    <a href="/saint-du-jour">Saint du jour</a>
    <a href="/evangile-du-jour">Évangile du jour</a>
    <a href="/saints">Tous les saints</a>
    <a href="/messe-en-direct">Messe en direct</a>
    <a href="/">Accueil</a>
  </div>
</div></main>
<footer><div class="wrap">
  <p><strong>PrionsEnLigne</strong> — Prier ensemble, chaque jour. Gratuit, sans publicité.<br>
  Offices du bréviaire, messes en direct, chapelet numérique, Bible interactive, calendrier liturgique.</p>
  <p><a href="/">prionsenligne.fr</a> · Textes liturgiques : AELF · Saints : Nominis (CEF)</p>
</div></footer>
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

  // Route inconnue → redirige vers l'app
  res.setHeader('Location', '/agenda');
  res.status(302).end();
}
