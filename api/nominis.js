/*
  Vercel Serverless Function — /api/nominis
  Proxy vers l'API JSON officielle nominis.cef.fr (Conférence des évêques).

  Deux usages, réunis ici en une seule fonction :
    GET /api/nominis?day=DD&month=MM&year=YYYY   → biographie d'un saint
        Réponse : { nom, description, contenu (HTML), lien }
    GET /api/nominis-month?year=YYYY&month=MM    → tous les saints du mois
        (réécrit vers ?scope=month dans vercel.json — l'URL publique et les
         appels côté client sont inchangés)
        Réponse : { year, month, days: [{ day, nom, description, lien }] }

  Les deux routes vivaient dans deux fichiers, soit deux fonctions. Le plan
  Vercel en autorise 12 par déploiement, plafond déjà atteint : les réunir
  libère l'emplacement nécessaire à la recherche biblique.

  Cache agressif côté CDN (24h) pour ne pas solliciter nominis à chaque
  visiteur — les saints et leurs bios sont stables d'année en année.
*/

const ALLOWED_ORIGINS = [
  'https://prionsenligne.fr',
  'https://www.prionsenligne.fr',
];

const UPSTREAM = (day, month, year) =>
  `https://nominis.cef.fr/json/saintdujour.php?jour=${day}&mois=${month}&annee=${year}`;

const UPSTREAM_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 PrionsEnLigne (https://prionsenligne.fr)',
};

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Un jour du mois : renvoie null en cas d'échec, pour ne pas faire tomber
// l'ensemble du mois si Nominis bronche sur une date.
async function fetchOne(day, month, year) {
  try {
    const r = await fetch(UPSTREAM(day, month, year), { headers: UPSTREAM_HEADERS });
    if (!r.ok) return null;
    const data = await r.json();
    const s = data?.response?.saintdujour;
    if (!s || !s.nom) return null;
    return {
      day,
      nom:         s.nom         || '',
      description: s.description || '',
      lien:        (s.lien || '').replace(':80', ''),
    };
  } catch (_) {
    return null;
  }
}

async function handleMonth(req, res) {
  const year  = parseInt(req.query.year,  10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12 || year < 2000 || year > 2100) {
    res.status(400).json({ error: 'Paramètres invalides.' });
    return;
  }
  const nb = daysInMonth(year, month);
  const promises = [];
  for (let d = 1; d <= nb; d++) promises.push(fetchOne(d, month, year));
  const days = (await Promise.all(promises)).filter(Boolean);
  res.status(200).json({ year, month, days });
}

export default async function handler(req, res) {
  // CORS — limité à notre domaine
  const origin = req.headers.origin || '';
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/prionsenligne(-[a-z0-9]+)?\.vercel\.app$/.test(origin);
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Cache fort : la bio d'un saint ne change quasi jamais
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // Route « mois entier » (/api/nominis-month, réécrit vers ?scope=month)
  if (req.query.scope === 'month') { await handleMonth(req, res); return; }

  const day   = parseInt(req.query.day,   10);
  const month = parseInt(req.query.month, 10);
  const year  = parseInt(req.query.year,  10) || new Date().getFullYear();

  if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) {
    res.status(400).json({ error: 'Paramètres invalides (day 1-31, month 1-12).' });
    return;
  }

  try {
    const upstream = await fetch(UPSTREAM(day, month, year), { headers: UPSTREAM_HEADERS });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Nominis: HTTP ${upstream.status}` });
      return;
    }

    const data = await upstream.json();
    const saint = data?.response?.saintdujour;
    if (!saint || !saint.nom) {
      res.status(404).json({ error: 'Aucun saint pour cette date.' });
      return;
    }

    // Lien : on remplace le port :80 inutile
    const lien = (saint.lien || '').replace(':80', '');

    res.status(200).json({
      nom:         saint.nom         || '',
      description: saint.description || '',
      contenu:     saint.contenu     || '',
      lien,
      source:      'Nominis (Conférence des évêques de France)',
    });
  } catch (err) {
    console.error('[nominis] fetch error:', err.message);
    res.status(502).json({ error: err.message });
  }
}
