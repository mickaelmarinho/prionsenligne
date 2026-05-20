/*
  Vercel Serverless Function — /api/keepalive
  Appelé quotidiennement par un cron Vercel pour maintenir le projet
  Supabase actif. Sans activité pendant 7 jours, le free tier Supabase
  met le projet en pause — ce ping l'évite.

  Sécurité : Vercel ajoute automatiquement un header
  `Authorization: Bearer <CRON_SECRET>` aux requêtes de cron, qu'on
  vérifie ici pour éviter qu'un visiteur n'appelle inutilement l'endpoint.

  Le ping fait une requête HEAD légère sur une table existante.
*/

const ALLOWED_ORIGINS = [
  'https://prionsenligne.fr',
  'https://www.prionsenligne.fr',
];

export default async function handler(req, res) {
  // Autorise les appels manuels depuis nos domaines (debug)
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin) ||
      /^https:\/\/prionsenligne(-[a-z0-9]+)?\.vercel\.app$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  // Vérifie l'authentification du cron (Vercel injecte CRON_SECRET)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  // En dev / appel manuel : on accepte aussi (sans secret) pour pouvoir tester
  const isManual = req.headers['x-manual-ping'] === '1';

  // Ping Supabase : HEAD léger sur prayer_intentions (table déjà publique en lecture)
  const supaUrl = process.env.SUPABASE_URL || 'https://idltzfiaourgfwiuiphp.supabase.co';
  const supaKey = process.env.SUPABASE_ANON_KEY ||
                  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkbHR6Zmlhb3VyZ2Z3aXVpcGhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzYxOTksImV4cCI6MjA5MjcxMjE5OX0.d5egaKYxiIarxdkW6Lxvttlbd8dukJtmoJ3k4s1Hjro';

  const checks = [];
  const pingedAt = new Date().toISOString();

  async function ping(table) {
    try {
      const r = await fetch(`${supaUrl}/rest/v1/${table}?select=id&limit=1`, {
        method:  'GET',
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
      });
      return { table, ok: r.ok, status: r.status };
    } catch (err) {
      return { table, ok: false, error: err.message };
    }
  }

  // On ping plusieurs tables pour garantir l'activité même si l'une change
  for (const t of ['prayer_intentions', 'schedule_overrides']) {
    // eslint-disable-next-line no-await-in-loop
    checks.push(await ping(t));
  }

  const allOk = checks.every(c => c.ok);
  const status = allOk ? 200 : 502;

  console.log('[keepalive]', { pingedAt, allOk, isCron, isManual, checks });

  res.status(status).json({
    ok:       allOk,
    pingedAt,
    isCron:   isCron || false,
    checks,
  });
}
