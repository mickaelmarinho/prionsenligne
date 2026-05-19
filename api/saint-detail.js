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
  // 1) PRIORITÉ : encadré officiel "Dates de fête" (le plus fiable)
  //    Structure Nominis : <span ...>Dates de fête</span><a ...>JJ mois...</a>
  //    ou : <h4>Dates de fête</h4>... DATE
  const headerMatch = html.match(/Dates? de f[êe]te[\s\S]{0,500}/i);
  if (headerMatch) {
    const window = headerMatch[0];
    const re = new RegExp('(1er|\\d{1,2})\\s+' + MONTHS, 'i');
    const m = window.match(re);
    if (m) return `${m[1]} ${m[2]}`;
  }
  // 2) Patterns du type "Fête le 22 mai" / "Fêté le 12 juillet"
  const reFete = new RegExp('F[êe]t[eé][^0-9]{0,30}(1er|\\d{1,2})\\s+' + MONTHS, 'i');
  const m1 = html.match(reFete);
  if (m1) return `${m1[1]} ${m1[2]}`;
  // 3) Fallback : première occurrence (peut être imprécis)
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

  let url = `https://nominis.cef.fr/contenus/${kind}/${id}/${slug}.html`;

  // Pour les pages prénom : on les utilise pour TROUVER le saint correspondant,
  // puis on fetch la VRAIE fiche saint. La page prénom affiche le saint du jour
  // par défaut (pas le saint de ce prénom-là).
  async function fetchHtml(u) {
    const r = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0 PrionsEnLigne (https://prionsenligne.fr)' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  }

  try {
    let html;

    if (kind === 'prenom') {
      // 1) Charge la page prénom et cherche les liens vers /contenus/saint/...
      //    qui devraient être les saints associés à ce prénom.
      const prenomHtml = await fetchHtml(url);
      // Cherche un lien direct vers un saint dont le nom CONTIENT le slug du prénom
      // (ex: pour le prénom "Jason", on cherche un lien "/contenus/saint/...Jason..." )
      const wanted = slug.toLowerCase().replace(/[%_-]/g, '').replace(/\d+/g, '');
      const linkRe = /<a[^>]+href="(\/contenus\/saint\/(\d+)\/([^"]+)\.html)"/gi;
      let bestUrl = null;
      let m;
      while ((m = linkRe.exec(prenomHtml)) !== null) {
        const saintSlug = decodeURIComponent(m[3]).toLowerCase().replace(/[%_-]/g, '');
        if (saintSlug.includes(wanted) && wanted.length >= 3) {
          bestUrl = 'https://nominis.cef.fr' + m[1];
          break;
        }
      }
      if (bestUrl) {
        url = bestUrl;
        html = await fetchHtml(url);
      } else {
        // Pas de saint match → on garde la page prénom (mieux que rien)
        html = prenomHtml;
      }
    } else {
      html = await fetchHtml(url);
    }

    const feast = extractFeast(html);
    let summary = '';
    const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) summary = stripTags(pMatch[1]).slice(0, 220);
    let name = '';
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) name = stripTags(h1[1]);

    res.status(200).json({ name, feast, lien: url, summary });
  } catch (err) {
    console.error('[saint-detail] error:', err.message);
    res.status(502).json({ error: err.message });
  }
}
