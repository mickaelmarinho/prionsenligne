/*
  Vercel Serverless Function — /api/saints-search?q=<terme>
  Recherche dans l'index alphabétique nominis.cef.fr de TOUS les saints
  (~ 10 000 entrées). Renvoie jusqu'à 30 résultats correspondant au terme.

  Stratégie :
    - L'index complet est récupéré une fois et mis en cache module (chaud entre invocations)
      avec un TTL côté CDN agressif (7 jours) — les saints ne changent pas.
    - Filtre côté serveur par substring insensible aux accents / casse.

  Réponse : { results: [{ id, name, url, slug }] }
*/

const ALLOWED_ORIGINS = [
  'https://prionsenligne.fr',
  'https://www.prionsenligne.fr',
];

// Cache module : reste chaud entre invocations sur la même instance Lambda
let _indexCache = null;        // [{ id, name, url, normalized }]
let _indexFetchedAt = 0;
const INDEX_TTL_MS = 7 * 24 * 3600 * 1000;

function stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function loadIndex() {
  if (_indexCache && Date.now() - _indexFetchedAt < INDEX_TTL_MS) return _indexCache;
  const resp = await fetch('https://nominis.cef.fr/contenus/saint/alphabetique.html', {
    headers: { 'User-Agent': 'Mozilla/5.0 PrionsEnLigne (https://prionsenligne.fr)' },
  });
  if (!resp.ok) throw new Error('Nominis index: HTTP ' + resp.status);
  const html = await resp.text();

  // Parse les ancres : <a href="/contenus/saint/<id>/<slug>.html">Saint Xxxxx</a>
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href="\/contenus\/saint\/(\d+)\/([^"]+)\.html"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id   = m[1];
    if (seen.has(id)) continue;       // doublons dans la page (rare)
    const slug = m[2];
    const name = m[3].trim().replace(/\s+/g, ' ');
    if (!/^(Saint|Sainte|Saints|Bienheureux|Bienheureuse|Vénérable|Vénérables)/i.test(name)) continue;
    seen.add(id);
    out.push({
      id, name, slug,
      url: 'https://nominis.cef.fr/contenus/saint/' + id + '/' + slug + '.html',
      normalized: stripAccents(name),
    });
  }
  _indexCache = out;
  _indexFetchedAt = Date.now();
  return out;
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
  // Cache CDN long — les saints sont stables
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const q = stripAccents((req.query.q || '').toString().trim());
  if (!q || q.length < 2) {
    res.status(200).json({ results: [] });
    return;
  }

  try {
    const index = await loadIndex();
    const matches = [];
    for (const entry of index) {
      if (entry.normalized.includes(q)) {
        matches.push({ id: entry.id, name: entry.name, url: entry.url, slug: entry.slug });
        if (matches.length >= 30) break;
      }
    }
    // Tri : priorité aux noms commençant par le terme
    matches.sort((a, b) => {
      const an = stripAccents(a.name);
      const bn = stripAccents(b.name);
      const aPrefix = an.startsWith('saint ' + q) || an.startsWith('sainte ' + q) || an.includes(' ' + q);
      const bPrefix = bn.startsWith('saint ' + q) || bn.startsWith('sainte ' + q) || bn.includes(' ' + q);
      if (aPrefix && !bPrefix) return -1;
      if (!aPrefix && bPrefix) return 1;
      return an.localeCompare(bn);
    });
    res.status(200).json({ results: matches });
  } catch (err) {
    console.error('[saints-search] error:', err.message);
    res.status(502).json({ error: err.message, results: [] });
  }
}
