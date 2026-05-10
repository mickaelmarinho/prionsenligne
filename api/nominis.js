/*
  Vercel Serverless Function — /api/nominis
  Proxy vers l'API JSON officielle nominis.cef.fr (Conférence des évêques)
  pour récupérer la biographie du saint d'une date donnée.

  Usage : GET /api/nominis?day=DD&month=MM&year=YYYY
  Réponse : { nom, description, contenu (HTML), lien }

  Cache agressif côté CDN (24h) pour ne pas solliciter nominis pour
  chaque visiteur — les bios des saints sont stables d'année en année.
*/

const ALLOWED_ORIGINS = [
  'https://prionsenligne.fr',
  'https://www.prionsenligne.fr',
];

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

  const day   = parseInt(req.query.day,   10);
  const month = parseInt(req.query.month, 10);
  const year  = parseInt(req.query.year,  10) || new Date().getFullYear();

  if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) {
    res.status(400).json({ error: 'Paramètres invalides (day 1-31, month 1-12).' });
    return;
  }

  const url = `https://nominis.cef.fr/json/saintdujour.php?jour=${day}&mois=${month}&annee=${year}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 PrionsEnLigne (https://prionsenligne.fr)',
      },
    });

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
