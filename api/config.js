/*
  Vercel Serverless Function — /api/config
  Expose les variables d'environnement au frontend JavaScript.

  Variables à définir dans Vercel (Settings → Environment Variables) :
    SUPABASE_URL       → https://xxxxx.supabase.co
    SUPABASE_ANON_KEY  → eyJxxxxxxx...
    VAPID_PUBLIC_KEY   → BPxxx... (clé publique VAPID pour les notifs push)

  La clé anon Supabase et la clé publique VAPID sont conçues pour être
  publiques côté client. Ce endpoint est en lecture seule.
*/

export default function handler(req, res) {
  // CORS : autorise uniquement les requêtes venant du même domaine
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');

  res.status(200).json({
    supabaseUrl:  process.env.SUPABASE_URL       || '',
    supabaseAnon: process.env.SUPABASE_ANON_KEY  || '',
    vapidPublic:  process.env.VAPID_PUBLIC_KEY   || '',
  });
}
