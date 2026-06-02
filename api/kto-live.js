/*
  Vercel Serverless Function — /api/kto-live
  Renvoie l'ID de la vidéo YouTube live actuelle de KTO, pour l'embarquer
  directement (youtube.com/embed/{videoId}) — seul format d'embed YouTube
  qui fonctionne sur un domaine tiers (pas de frame-ancestors restrictif,
  contrairement à l'endpoint /embed/live_stream?channel= qui est cassé).

  Stratégie :
    1. Scrape la page /channel/{id}/live de YouTube avec des en-têtes
       navigateur. Extrait le videoId courant.
    2. Si YouTube bloque la requête serveur (IP datacenter Vercel parfois
       servies en page de consentement / réponse vide), on retombe sur un
       ID de secours connu (à mettre à jour si KTO relance un nouveau live).
    3. Cache CDN 30 min (un live YouTube garde le même ID des heures/jours).

  Réponse : { videoId: 'xxxxxxxxxxx', source: 'scrape'|'fallback' }
*/

const KTO_CHANNEL_ID = 'UCg0L6cPMNLv1gjsyzYqMG7g';
// ID de secours — dernier live KTO connu. Mettre à jour si le live change
// durablement (rare : YouTube garde le même ID tant que le direct tourne).
const FALLBACK_VIDEO_ID = 'VN1_PRBoVHU';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function extractLiveVideoId(html) {
  if (!html) return null;
  // Plusieurs patterns possibles selon la version de la page YouTube
  const patterns = [
    /"videoId":"([a-zA-Z0-9_-]{11})"/,
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/,
    /\\?"videoId\\?":\\?"([a-zA-Z0-9_-]{11})\\?"/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  // Cache CDN : 30 min côté edge, revalidation en arrière-plan
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');

  let videoId = null;
  let source = 'fallback';

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`https://www.youtube.com/channel/${KTO_CHANNEL_ID}/live`, {
      headers: BROWSER_HEADERS,
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (r.ok) {
      const html = await r.text();
      const id = extractLiveVideoId(html);
      if (id) { videoId = id; source = 'scrape'; }
    }
  } catch (_) { /* YouTube a bloqué / timeout → fallback */ }

  if (!videoId) videoId = FALLBACK_VIDEO_ID;

  res.status(200).json({ videoId, source });
}
