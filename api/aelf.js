/*
  Vercel Serverless Function — /api/aelf
  Proxy vers l'API AELF pour éviter les restrictions CORS navigateur.

  Usage : GET /api/aelf?office=laudes&y=2026&m=05&d=02
  Retourne le JSON de https://api.aelf.org/v1/{office}/{y}/{m}/{d}/france
*/

import https from 'https';

export default function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { office, y, m, d } = req.query;

  const validOffices = ['laudes', 'messes', 'vepres', 'complies'];
  if (!office || !validOffices.includes(office) || !y || !m || !d) {
    res.status(400).json({ error: 'Paramètres invalides.' });
    return;
  }

  const url = `https://api.aelf.org/v1/${office}/${y}/${m}/${d}/france`;

  const options = {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'prionsenligne.fr/1.0',
    },
  };

  https.get(url, options, (apiRes) => {
    let body = '';

    apiRes.on('data', chunk => { body += chunk; });

    apiRes.on('end', () => {
      if (apiRes.statusCode !== 200) {
        res.status(apiRes.statusCode).json({ error: `AELF API: ${apiRes.statusCode}` });
        return;
      }
      try {
        const data = JSON.parse(body);
        res.status(200).json(data);
      } catch (e) {
        res.status(502).json({ error: 'Réponse AELF invalide.' });
      }
    });
  }).on('error', (err) => {
    console.error('Erreur proxy AELF:', err.message);
    res.status(502).json({ error: 'Impossible de contacter l\'API AELF.' });
  });
}
