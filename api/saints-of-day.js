/*
  Vercel Serverless Function — /api/saints-of-day?day=DD&month=MM&year=YYYY
  Récupère la liste complète des saints célébrés un jour donné depuis la page
  /contenus/fetes/JJ/M/AAAA/JJ-Mois-AAAA.html de nominis.cef.fr, section
  "Autres fêtes du jour".

  Réponse : { day, month, year, saints: [{ name, bio, url }] }
  Cache CDN 24h : les saints d'un jour sont stables d'année en année.
*/

const ALLOWED_ORIGINS = [
  'https://prionsenligne.fr',
  'https://www.prionsenligne.fr',
];

const MONTH_NAMES = [
  'Janvier','Fevrier','Mars','Avril','Mai','Juin',
  'Juillet','Aout','Septembre','Octobre','Novembre','Decembre',
];

function stripTags(html) {
  return (html || '')
    .replace(/<sup[^>]*>([^<]*)<\/sup>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&ecirc;/g, 'ê')
    .replace(/&agrave;/g, 'à').replace(/&acirc;/g, 'â').replace(/&iuml;/g, 'ï')
    .replace(/&icirc;/g, 'î').replace(/&ocirc;/g, 'ô').replace(/&ucirc;/g, 'û')
    .replace(/&ugrave;/g, 'ù').replace(/&ccedil;/g, 'ç').replace(/&Eacute;/g, 'É')
    .replace(/&Egrave;/g, 'È').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const day   = parseInt(req.query.day,   10);
  const month = parseInt(req.query.month, 10);
  const year  = parseInt(req.query.year,  10) || new Date().getFullYear();
  if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) {
    res.status(400).json({ error: 'Paramètres invalides.' });
    return;
  }

  const monthName = MONTH_NAMES[month - 1];
  const url = `https://nominis.cef.fr/contenus/fetes/${day}/${month}/${year}/${day}-${monthName}-${year}.html`;

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 PrionsEnLigne (https://prionsenligne.fr)' },
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Nominis: HTTP ${upstream.status}`, saints: [] });
      return;
    }
    const html = await upstream.text();

    // Isole le bloc "Autres fêtes du jour"
    const blockMatch = html.match(/<h4>Autres f[êe]tes du jour<\/h4>[\s\S]*?<\/div>/i);
    if (!blockMatch) {
      res.status(200).json({ day, month, year, saints: [] });
      return;
    }
    const block = blockMatch[0];

    // Parse chaque ancre : <a href="/contenus/saint/ID/SLUG.html" ...><div ...><h5 ...>NAME</h5></div><p ...>BIO</p></a>
    const saints = [];
    const seen = new Set();
    const re = /<a[^>]+href="\/contenus\/saint\/(\d+)\/([^"]+)\.html"[^>]*>[\s\S]*?<h5[^>]*>([^<]+)<\/h5>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?[\s\S]*?<\/a>/gi;
    let m;
    while ((m = re.exec(block)) !== null) {
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const slug = m[2];
      const name = stripTags(m[3]);
      const bio  = stripTags(m[4] || '').slice(0, 140);
      saints.push({
        id, name, bio,
        url: `https://nominis.cef.fr/contenus/saint/${id}/${slug}.html`,
      });
    }

    res.status(200).json({ day, month, year, saints });
  } catch (err) {
    console.error('[saints-of-day] error:', err.message);
    res.status(502).json({ error: err.message, saints: [] });
  }
}
