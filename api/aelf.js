/*
  Vercel Serverless Function — /api/aelf
  Proxy vers l'API AELF pour éviter les restrictions CORS navigateur.

  Usage : GET /api/aelf?office=laudes&y=2026&m=05&d=02
  Retourne le JSON brut de https://api.aelf.org/v1/{office}/{y}/{m}/{d}/france
*/

export default async function handler(req, res) {
  // CORS : autorise uniquement le même domaine
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { office, y, m, d } = req.query;

  // Validation basique
  const validOffices = ['laudes', 'messes', 'vepres', 'complies'];
  if (!office || !validOffices.includes(office)) {
    res.status(400).json({ error: 'Paramètre office invalide.' });
    return;
  }
  if (!y || !m || !d) {
    res.status(400).json({ error: 'Paramètres de date manquants.' });
    return;
  }

  const url = `https://api.aelf.org/v1/${office}/${y}/${m}/${d}/france`;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'prionsenligne.fr/1.0',
      },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: `AELF API error: ${response.status}` });
      return;
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('Erreur proxy AELF:', err);
    res.status(502).json({ error: 'Impossible de contacter l\'API AELF.' });
  }
}
