/*
  Vercel Serverless Function — /api/contact
  Reçoit les messages du formulaire de contact et les envoie par email
  via Resend (https://resend.com — free tier 3000 emails/mois).

  Variables d'environnement à définir dans Vercel :
    RESEND_API_KEY    → clé API Resend (re_xxxxx)
    CONTACT_TO_EMAIL  → email destinataire (ex: contact@prionsenligne.fr)
    CONTACT_FROM_EMAIL→ optionnel — adresse expéditeur vérifiée chez Resend
                        (par défaut : onboarding@resend.dev pour les tests)

  Anti-abus :
    - Honeypot (champ "website" — doit être vide)
    - Limite de longueur message
    - Rate limiting basique par IP (mémoire — best effort sur serverless)
*/

const ALLOWED_ORIGINS = [
  'https://prionsenligne.fr',
  'https://www.prionsenligne.fr',
];

// Rate limit best-effort (la mémoire ne persiste pas entre invocations cold
// mais bloque les rafales sur la même instance chaude)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;   // 1 minute
const RATE_LIMIT_MAX       = 3;         // max 3 envois / minute / IP

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || [];
  const recent = entry.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TYPE_LABELS = {
  suggestion: '💡 Suggestion',
  bug:        '🐛 Bug',
  merci:      '❤️ Remerciement',
  autre:      '💬 Message',
};

// Détection automatique du type à partir du contenu du message.
// Permet de classer les emails sans rien demander à l'utilisateur.
function detectType(message) {
  const m = (message || '').toLowerCase();
  const norm = m.normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Bug : mots techniques évoquant un dysfonctionnement
  if (/(bug|bogue|erreur|plante?\s|crashe?|fonctionne pas|ne marche pas|page blanche|404|impossible de|n'arrive pas\s+(à|a)\s+|probl[eè]me|defaut|defectueux|d[ée]connect[ée]|ne se charge|ne r[ée]pond)/i.test(m) ||
      /(probleme|defaillance|erreur|crash)/i.test(norm)) {
    return 'bug';
  }
  // Remerciement : gratitude, encouragement
  if (/(merci|f[ée]licitations|f[eé]licite|encouragement|bravo|formidable|magnifique|que dieu vous|continuez|priez? pour|tr[èe]s beau site|tr[èe]s belle initiative|chapeau)/i.test(m)) {
    return 'merci';
  }
  // Suggestion : "ce serait", "pourriez-vous", "il manque", "ajouter"...
  if (/(suggest|pourriez[- ]vous|serait[- ]il possible|ce serait|il manque|j'aimerais|je voudrais|pourquoi pas|ajouter|am[ée]liorer|id[ée]e)/i.test(m)) {
    return 'suggestion';
  }
  return 'autre';
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin) ||
      /^https:\/\/prionsenligne(-[a-z0-9]+)?\.vercel\.app$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Méthode non autorisée' }); return; }

  // Rate limit
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.socket?.remoteAddress
            || 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Trop de messages, réessayez dans une minute.' });
    return;
  }

  // Parse body
  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) { data = {}; }
  }
  data = data || {};

  // Honeypot
  if (data.website) {
    // Bot détecté → on prétend que tout va bien (pour ne pas leur donner d'info)
    res.status(200).json({ ok: true });
    return;
  }

  // Type détecté automatiquement à partir du message (l'UI n'a plus de sélecteur)
  // On accepte tout de même un `type` explicite si fourni (compatibilité).
  let type = (data.type || '').toString().slice(0, 32);
  if (!type || !TYPE_LABELS[type]) type = detectType(data.message || '');
  const email   = (data.email   || '').toString().slice(0, 200).trim();
  const message = (data.message || '').toString().trim().slice(0, 5000);
  const ua      = (data.ua      || '').toString().slice(0, 300);
  const page    = (data.page    || '').toString().slice(0, 100);

  if (!message || message.length < 5) {
    res.status(400).json({ error: 'Message trop court.' });
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Email invalide.' });
    return;
  }

  // Configuration Resend
  // Le domaine prionsenligne.fr est vérifié chez Resend → on l'utilise par défaut
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL || 'contact@prionsenligne.fr';
  const fromEmail = process.env.CONTACT_FROM_EMAIL || 'PrionsEnLigne <contact@prionsenligne.fr>';

  if (!apiKey) {
    // Service pas encore configuré côté Vercel. On renvoie un code spécial
    // que le frontend reconnaît pour basculer sur un mailto:
    console.warn('[contact] RESEND_API_KEY non configurée');
    res.status(503).json({ error: 'not_configured', fallback: 'mailto' });
    return;
  }

  const typeLabel = TYPE_LABELS[type] || '💬 Message';
  const subject = `[PrionsEnLigne] ${typeLabel}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1e1c18">
      <h2 style="color:#1a2744;font-family:Georgia,serif;border-bottom:2px solid #c9a84c;padding-bottom:8px;">
        ${typeLabel}
      </h2>
      <p style="white-space:pre-wrap;line-height:1.6;font-size:15px;color:#333;background:#f5f0e8;border-left:3px solid #c9a84c;padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0;">
        ${escapeHtml(message)}
      </p>
      <table style="width:100%;font-size:13px;color:#666;margin-top:24px;border-collapse:collapse;">
        <tr><td style="padding:6px 0;width:120px;"><strong>De :</strong></td><td>${email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : '<em>non fourni</em>'}</td></tr>
        <tr><td style="padding:6px 0;"><strong>Type :</strong></td><td>${escapeHtml(type)}</td></tr>
        <tr><td style="padding:6px 0;"><strong>Page :</strong></td><td>${escapeHtml(page)}</td></tr>
        <tr><td style="padding:6px 0;"><strong>IP :</strong></td><td>${escapeHtml(ip)}</td></tr>
        <tr><td style="padding:6px 0;vertical-align:top;"><strong>Navigateur :</strong></td><td style="font-size:11px;color:#999;word-break:break-all;">${escapeHtml(ua)}</td></tr>
      </table>
      <p style="font-size:11px;color:#aaa;margin-top:24px;text-align:center;">
        Envoyé depuis le formulaire de contact de PrionsEnLigne
      </p>
    </div>`;

  const text = `${typeLabel}\n\n${message}\n\n---\nDe : ${email || 'non fourni'}\nType : ${type}\nPage : ${page}\nIP : ${ip}\nNavigateur : ${ua}`;

  try {
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     fromEmail,
        to:       [toEmail],
        reply_to: email || undefined,
        subject,
        html,
        text,
      }),
    });

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      console.error('[contact] Resend error:', resendResp.status, errText);
      // Renvoie le message d'erreur Resend pour aider au debug en dev
      let errDetail = '';
      try {
        const errObj = JSON.parse(errText);
        errDetail = errObj.message || errObj.error || errText;
      } catch (_) { errDetail = errText; }
      res.status(502).json({
        error: 'Erreur d\'envoi côté serveur.',
        detail: errDetail.slice(0, 200),
        status: resendResp.status,
      });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[contact] fetch error:', err.message);
    res.status(502).json({ error: err.message });
  }
}
