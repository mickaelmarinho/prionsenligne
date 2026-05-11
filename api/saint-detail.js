/*
  Vercel Serverless Function — /api/saint-detail?id=<nominisId>&slug=<slug>
  Récupère la fiche détaillée d'un saint sur nominis.cef.fr et en extrait
  la date de fête (et un court extrait de biographie).

  Réponse : { name, feast, lien, summary }
*/

const ALLOWED_ORIGINS = [
  'https://prionsenligne.fr',
  'https://www.prionsenligne.fr',
];

const MONTHS = '(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)';

function extractFeast(html) {
  if (!html) return '';
  // Cherche des patterns du type "12 juillet", "1er octobre", "Fête le 22 mai"
  const reFete = new RegExp('F[êe]te[^0-9]{0,30}(1er|\\d{1,2})\\s+' + MONTHS, 'i');
  const m1 = html.match(reFete);
  if (m1) return `${m1[1]} ${m1[2]}`;
  // Fallback : première occurrence d'une date claire
  const re = new RegExp('(1er|\\d{1,2})\\s+' + MONTHS, 'i');
  const m2 = html.match(re);
  if (m2) return `${m2[1]} ${m2[2]}`;
  return '';
}

function stripTags(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
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

  const id   = (req.query.id   || '').toString();
  const slug = (req.query.slug || '').toString();
  const kind = (req.query.kind || 'saint').toString();
  if (!/^\d+$/.test(id) || !/^[A-Za-z0-9_%-]+$/.test(slug) || !/^(saint|prenom)$/.test(kind)) {
    res.status(400).json({ error: 'Paramètres invalides.' });
    return;
  }

  const url = `https://nominis.cef.fr/contenus/${kind}/${id}/${slug}.html`;
  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 PrionsEnLigne (https://prionsenligne.fr)' },
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Nominis: HTTP ${upstream.status}` });
      return;
    }
    const html  = await upstream.text();
    const feast = extractFeast(html);
    // Extrait court : 1er <p> du contenu
    let summary = '';
    const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) summary = stripTags(pMatch[1]).slice(0, 220);
    // Nom : <h1>...</h1>
    let name = '';
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) name = stripTags(h1[1]);

    res.status(200).json({ name, feast, lien: url, summary });
  } catch (err) {
    console.error('[saint-detail] error:', err.message);
    res.status(502).json({ error: err.message });
  }
}
