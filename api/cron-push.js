/*
  Vercel Cron Function — /api/cron-push
  Exécutée chaque minute. Lit push_subscriptions, filtre les pushes dont
  l'heure est dans la fenêtre courante (now ± 60s), les envoie via VAPID,
  puis nettoie next_pushes.

  Variables d'environnement requises :
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY  → contourne RLS pour scan global
    VAPID_PUBLIC_KEY           → clé publique (commune au client)
    VAPID_PRIVATE_KEY          → clé privée (jamais exposée au client)
    VAPID_SUBJECT              → mailto:contact@prionsenligne.fr

  Sécurité : protégée par le secret CRON_SECRET (vercel.json ajoute le
  header Authorization automatiquement).
*/

import webpush from 'web-push';

const FETCH_WINDOW_MS = 90 * 1000; // pushes dont 'at' est dans now ± 90s

function configureVapid() {
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub  = process.env.VAPID_SUBJECT || 'mailto:contact@prionsenligne.fr';
  if (!pub || !priv) throw new Error('VAPID keys not configured');
  webpush.setVapidDetails(sub, pub, priv);
}

async function loadSubscriptions() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role not configured');
  const r = await fetch(`${url}/rest/v1/push_subscriptions?select=*`, {
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
    },
  });
  if (!r.ok) throw new Error(`Supabase fetch failed: ${r.status}`);
  return r.json();
}

async function updateSubscriptionPushes(id, nextPushes) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  await fetch(`${url}/rest/v1/push_subscriptions?id=eq.${id}`, {
    method:  'PATCH',
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ next_pushes: nextPushes }),
  });
}

async function deleteSubscription(id) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  await fetch(`${url}/rest/v1/push_subscriptions?id=eq.${id}`, {
    method:  'DELETE',
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Prefer':        'return=minimal',
    },
  });
}

export default async function handler(req, res) {
  // Sécurité : Vercel cron injecte le header automatiquement
  const expected = process.env.CRON_SECRET;
  const got      = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (expected && got !== expected) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  try {
    configureVapid();
  } catch (err) {
    console.error('[cron-push] VAPID config error:', err.message);
    res.status(200).json({ ok: false, error: 'vapid_config' });
    return;
  }

  let subs;
  try {
    subs = await loadSubscriptions();
  } catch (err) {
    console.error('[cron-push] load error:', err.message);
    res.status(200).json({ ok: false, error: 'load_failed' });
    return;
  }

  const now = Date.now();
  const lowerBound = now - FETCH_WINDOW_MS;  // n'envoie pas les pushes manqués depuis > 90s
  let sentCount = 0;
  let errorCount = 0;
  let deletedCount = 0;

  for (const sub of subs) {
    const list = Array.isArray(sub.next_pushes) ? sub.next_pushes : [];
    if (list.length === 0) continue;

    const due  = [];
    const keep = [];
    const future = [];
    for (const p of list) {
      const t = Date.parse(p.at || '');
      if (!t) continue;
      if (t >= lowerBound && t <= now + 30000) due.push(p);
      else if (t > now) future.push(p);
      // else: trop ancien (> 90s), on droppe (manqué)
    }
    keep.push(...future);

    if (due.length === 0) {
      // Si on a droppé des pushes trop anciens, on met à jour pour nettoyer
      if (list.length !== keep.length) {
        await updateSubscriptionPushes(sub.id, keep);
      }
      continue;
    }

    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
    };

    let subscriptionDead = false;
    for (const p of due) {
      const payload = JSON.stringify({
        title: p.label || 'PrionsEnLigne',
        body:  p.body  || 'Un office commence bientôt',
        url:   p.url   || '/agenda',
        tag:   p.tag   || `pel-${p.type || 'office'}-${p.at}`,
      });
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 600 });
        sentCount++;
      } catch (err) {
        errorCount++;
        // 404/410 = endpoint invalide → supprimer la souscription
        if (err.statusCode === 404 || err.statusCode === 410) {
          subscriptionDead = true;
          break;
        }
      }
    }

    if (subscriptionDead) {
      await deleteSubscription(sub.id);
      deletedCount++;
    } else {
      await updateSubscriptionPushes(sub.id, keep);
    }
  }

  res.status(200).json({
    ok: true,
    subscriptions: subs.length,
    sent: sentCount,
    errors: errorCount,
    deleted: deletedCount,
  });
}
