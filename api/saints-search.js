/*
  Vercel Serverless Function — /api/saints-search?q=<terme>
  Recherche dans l'index alphabétique nominis.cef.fr.

  Stratégie :
    - L'utilisateur tape "jas..." → on fetch les pages /alphabetique/J/*.html
      (jusqu'à MAX_PAGES_PER_LETTER pages, env. 250 entrées par lettre)
    - Parse les ancres : <a href="/contenus/saint/<id>/<slug>.html">…<h5>NAME</h5>…<p>BIO</p>…</a>
    - Filtre par substring insensible aux accents / casse
    - Cache mémoire module + CDN agressif (7 jours)

  Réponse : { results: [{ id, name, url, slug, bio }] }
*/

const ALLOWED_ORIGINS = [
  'https://prionsenligne.fr',
  'https://www.prionsenligne.fr',
];

const MAX_PAGES_PER_LETTER = 15;  // couvre toutes les lettres (les plus longues : J=15, M=14)
const TTL_MS = 7 * 24 * 3600 * 1000;
const _letterCache = {};          // { 'J': { entries, fetchedAt } }

function stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function loadLetter(letter) {
  letter = letter.toUpperCase();
  if (!/^[A-Z]$/.test(letter)) return [];
  const cached = _letterCache[letter];
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.entries;

  // Construit les URLs pour les DEUX index : saints (~15 pages max) ET prénoms (~5 pages max)
  const urls = [];
  for (let p = 1; p <= MAX_PAGES_PER_LETTER; p++) {
    urls.push({ kind: 'saint',  url: p === 1
      ? `https://nominis.cef.fr/contenus/saint/alphabetique/${letter}.html`
      : `https://nominis.cef.fr/contenus/saint/alphabetique/${letter}-${p}.html` });
  }
  for (let p = 1; p <= 8; p++) {
    urls.push({ kind: 'prenom', url: p === 1
      ? `https://nominis.cef.fr/contenus/prenoms/alphabetique/${letter}.html`
      : `https://nominis.cef.fr/contenus/prenoms/alphabetique/${letter}-${p}.html` });
  }

  const fetched = await Promise.all(urls.map(({ kind, url }) =>
    fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 PrionsEnLigne (https://prionsenligne.fr)' } })
      .then(r => r.ok ? r.text() : null)
      .catch(() => null)
      .then(html => ({ kind, html }))
  ));

  const entries = [];
  const seen = new Set();           // dédup par "type:id"
  const saintRe  = /<a[^>]+href="\/contenus\/saint\/(\d+)\/([^"]+)\.html"[^>]*>[\s\S]*?<h5[^>]*>([^<]+)<\/h5>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?[\s\S]*?<\/a>/gi;
  const prenomRe = /<a[^>]+href="\/contenus\/prenom\/(\d+)\/([^"]+)\.html"[^>]*>[\s\S]*?<h5[^>]*>([^<]+)<\/h5>[\s\S]*?<\/a>/gi;

  for (const { kind, html } of fetched) {
    if (!html) continue;
    const re = kind === 'saint' ? saintRe : prenomRe;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      const key = kind + ':' + m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      const id   = m[1];
      const slug = m[2];
      const name = m[3].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const bio  = (m[4] || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140);
      entries.push({ kind, id, name, slug, bio, normalized: stripAccents(name) });
    }
  }
  _letterCache[letter] = { entries, fetchedAt: Date.now() };
  return entries;
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

  const qRaw = (req.query.q || '').toString().trim();
  const q = stripAccents(qRaw);
  if (!q || q.length < 2) { res.status(200).json({ results: [] }); return; }

  // Premier caractère = lettre à charger. On retire les préfixes "saint" / "sainte"
  // pour cibler la bonne lettre si l'utilisateur tape « Saint Jas… »
  const qBare = q.replace(/^(saint[es]?|saints?|bienheureux|bienheureuse|venerable[s]?)\s+/, '');
  const firstLetter = (qBare || q).charAt(0).toUpperCase();

  try {
    const entries = await loadLetter(firstLetter);
    const matches = [];
    for (const e of entries) {
      // Match si le nom (sans accents/casse) contient la requête
      if (e.normalized.includes(q) || e.normalized.includes(qBare)) {
        const path = e.kind === 'saint' ? 'saint' : 'prenom';
        matches.push({
          kind: e.kind,
          id:   e.id,
          name: e.kind === 'prenom' ? `Saint ${e.name}` : e.name,
          slug: e.slug,
          url:  `https://nominis.cef.fr/contenus/${path}/${e.id}/${e.slug}.html`,
          bio:  e.bio,
        });
        if (matches.length >= 30) break;
      }
    }
    // Tri : préférence aux noms qui commencent par le terme
    matches.sort((a, b) => {
      const aN = stripAccents(a.name).replace(/^(saint[es]?|saints?|bienheureux|bienheureuse|venerable[s]?)\s+/, '');
      const bN = stripAccents(b.name).replace(/^(saint[es]?|saints?|bienheureux|bienheureuse|venerable[s]?)\s+/, '');
      const aP = aN.startsWith(qBare) || aN.startsWith(q);
      const bP = bN.startsWith(qBare) || bN.startsWith(q);
      if (aP && !bP) return -1;
      if (!aP && bP) return 1;
      return aN.localeCompare(bN);
    });
    res.status(200).json({ results: matches });
  } catch (err) {
    console.error('[saints-search] error:', err.message);
    res.status(502).json({ error: err.message, results: [] });
  }
}
