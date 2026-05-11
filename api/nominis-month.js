/*
  Vercel Serverless Function — /api/nominis-month?year=YYYY&month=MM
  Renvoie en un seul appel TOUS les saints du jour pour le mois demandé,
  via 30+ appels parallèles à nominis.cef.fr.

  Réponse : { days: [{ day, nom, description, lien }] }
  Cache CDN agressif : 24h (les saints sont stables d'une année sur l'autre).
*/

const ALLOWED_ORIGINS = [
  'https://prionsenligne.fr',
  'https://www.prionsenligne.fr',
];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

async function fetchOne(day, month, year) {
  const url = `https://nominis.cef.fr/json/saintdujour.php?jour=${day}&mois=${month}&annee=${year}`;
  try {
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 PrionsEnLigne (https://prionsenligne.fr)',
      },
    });
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

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/prionsenligne(-[a-z0-9]+)?\.vercel\.app$/.test(origin);
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Cache fort : les saints du jour ne changent pas en cours d'année
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const year  = parseInt(req.query.year,  10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12 || year < 2000 || year > 2100) {
    res.status(400).json({ error: 'Paramètres invalides.' });
    return;
  }

  const nb = daysInMonth(year, month);
  const promises = [];
  for (let d = 1; d <= nb; d++) promises.push(fetchOne(d, month, year));
  const settled = await Promise.all(promises);
  const days = settled.filter(Boolean);
  res.status(200).json({ year, month, days });
}
