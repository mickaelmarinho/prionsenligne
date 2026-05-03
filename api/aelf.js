/*
  Vercel Serverless Function — /api/aelf
  Proxy vers l'API AELF (évite les restrictions CORS navigateur).
  Usage : GET /api/aelf?office=laudes&y=2025&m=05&d=03
*/

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const { office, y, m, d } = req.query;
  const validOffices = ['laudes', 'messes', 'vepres', 'complies'];

  if (!office || !validOffices.includes(office) || !y || !m || !d) {
    res.status(400).json({ error: 'Paramètres invalides.' });
    return;
  }

  const url = `https://api.aelf.org/v1/${office}/${y}/${m}/${d}/france`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer':         'https://www.aelf.org/',
        'Origin':          'https://www.aelf.org',
      },
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      console.error(`[aelf-proxy] ${upstream.status} — ${url}`);
      res.status(upstream.status).json({ error: `AELF: ${upstream.status}`, url });
      return;
    }

    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      console.error('[aelf-proxy] JSON parse error:', text.slice(0, 200));
      res.status(502).json({ error: 'Réponse AELF non-JSON', preview: text.slice(0, 100) });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('[aelf-proxy] fetch error:', err.message);
    res.status(502).json({ error: err.message });
  }
}
