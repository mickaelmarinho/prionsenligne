/*
  Vercel Serverless Function — /api/config
  Expose les variables d'environnement au frontend JavaScript.

  Variables à définir dans Vercel (Settings → Environment Variables) :
    SUPABASE_URL       → https://xxxxx.supabase.co
    SUPABASE_ANON_KEY  → eyJxxxxxxx...

  La clé anon Supabase est conçue pour être publique côté client.
  Ce endpoint est en lecture seule, aucune donnée sensible n'est exposée.
*/

export default function handler(req, res) {
  // CORS : autorise uniquement les requêtes venant du même domaine
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Cache-Control', 'no-store');

  res.status(200).json({
    supabaseUrl:  process.env.SUPABASE_URL       || '',
    supabaseAnon: process.env.SUPABASE_ANON_KEY  || '',
  });
}
