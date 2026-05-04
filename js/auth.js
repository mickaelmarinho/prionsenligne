/* ═══════════════════════════════════════════════
   PRIONSENLIGNE — auth.js
   Modes : login · signup · reset-request · reset-password
═══════════════════════════════════════════════ */

// ── Credentials Supabase ──────────────────────
// Sur Vercel : définir SUPABASE_URL et SUPABASE_ANON_KEY dans
//   Settings → Environment Variables (le /api/config les injecte automatiquement).
// Pour test local (sans serveur Vercel) : coller ici les valeurs du dashboard Supabase
//   Project Settings → API → Project URL  et  anon / public key
const _SB_URL_LOCAL  = 'https://idltzfiaourgfwiuiphp.supabase.co';
const _SB_KEY_LOCAL  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkbHR6Zmlhb3VyZ2Z3aXVpcGhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzYxOTksImV4cCI6MjA5MjcxMjE5OX0.d5egaKYxiIarxdkW6Lxvttlbd8dukJtmoJ3k4s1Hjro';
// ─────────────────────────────────────────────

// ── Helpers ──
function $id(id) { return document.getElementById(id); }

// ── État ──
let _sb              = null;   // Client Supabase (initialisé de manière asynchrone)
let _currentUser     = null;
let _formMode        = 'login';
let _lastSignupEmail = '';     // mémorisé pour pouvoir renvoyer l'email de confirmation

/* ════════════════════════════════════════════
   PROFIL — COULEUR AVATAR
═════════════════════════════════════════════*/
function avatarColor(str) {
  const palette = [
    { bg: '#1a2744', fg: '#c9a84c' },
    { bg: '#534AB7', fg: '#fff'    },
    { bg: '#0F6E56', fg: '#fff'    },
    { bg: '#854F0B', fg: '#fff'    },
    { bg: '#993556', fg: '#fff'    },
    { bg: '#185FA5', fg: '#fff'    },
    { bg: '#444441', fg: '#e8d89a' },
  ];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/* ════════════════════════════════════════════
   UI HEADER
═════════════════════════════════════════════*/
function updateHeaderUI(user) {
  _currentUser = user;
  window._pelUser = user; // Exposé pour app.js (chat)
  const btn         = $id('hamburger-btn');
  const signoutItem = $id('hm-signout');
  const logoutBtn   = $id('header-btn-logout');
  const accountBtn  = $id('header-btn-account');
  const headerUser  = $id('header-user');
  const hmAuthSep   = $id('hm-auth-sep');
  const hmLogin     = $id('hm-login-item');
  const hmSignup    = $id('hm-signup-item');
  const hmProfileRow = $id('hm-profile-row');
  const hmPrDivider  = $id('hm-pr-divider');

  if (user) {
    const name    = user.user_metadata?.name || user.email.split('@')[0];
    const email   = user.email || '';
    const initial = name.charAt(0).toUpperCase();
    const col     = avatarColor(name);

    // Hamburger btn → avatar stylé
    if (btn) btn.innerHTML = `<span class="hamburger-avatar" title="${name}">${initial}</span>`;
    headerUser?.classList.add('user-logged-in');

    // Bouton compte desktop
    if (accountBtn) {
      accountBtn.classList.remove('hidden');
      const avatarSpan = $id('header-acct-avatar');
      const nameSpan   = $id('header-acct-name');
      if (avatarSpan) {
        avatarSpan.textContent = initial;
        avatarSpan.style.background = col.bg;
        avatarSpan.style.color      = col.fg;
      }
      if (nameSpan) nameSpan.textContent = name;
    }

    // Ligne profil dans le menu burger
    if (hmProfileRow) {
      hmProfileRow.classList.remove('hidden');
      const av = $id('hm-pr-avatar');
      const nm = $id('hm-pr-name');
      const em = $id('hm-pr-email');
      if (av) { av.textContent = initial; av.style.background = col.bg; av.style.color = col.fg; }
      if (nm) nm.textContent = name;
      if (em) em.textContent = email;
    }
    if (hmPrDivider) hmPrDivider.classList.remove('hidden');

    if (hmAuthSep) hmAuthSep.style.display = 'none';
    if (hmLogin)   hmLogin.style.display   = 'none';
    if (hmSignup)  hmSignup.style.display  = 'none';
    logoutBtn?.classList.add('hidden'); // signout est désormais dans le panneau profil
  } else {
    if (btn) btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    headerUser?.classList.remove('user-logged-in');
    accountBtn?.classList.add('hidden');
    if (hmProfileRow) hmProfileRow.classList.add('hidden');
    if (hmPrDivider)  hmPrDivider.classList.add('hidden');
    if (hmAuthSep) hmAuthSep.style.display = '';
    if (hmLogin)   hmLogin.style.display   = '';
    if (hmSignup)  hmSignup.style.display  = '';
    logoutBtn?.classList.add('hidden');
  }
  if (signoutItem) signoutItem.style.display = user ? '' : 'none';
}

/* ════════════════════════════════════════════
   PROFIL — PANNEAU LATÉRAL
═════════════════════════════════════════════*/
function openProfilePanel() {
  const panel   = $id('profile-panel');
  const overlay = $id('profile-overlay');
  if (!panel) return;
  $id('hamburger-menu')?.classList.add('hidden');
  loadProfileContent();
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  overlay?.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeProfilePanel() {
  $id('profile-panel')?.classList.remove('open');
  $id('profile-panel')?.setAttribute('aria-hidden', 'true');
  $id('profile-overlay')?.classList.remove('show');
  document.body.style.overflow = '';
}

function _esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadProfileContent() {
  const user = _currentUser;
  if (!user) return;

  const bodyEl = $id('profile-body');
  if (!bodyEl) return;

  const name    = user.user_metadata?.name || user.email.split('@')[0];
  const email   = user.email || '';
  const initial = name.charAt(0).toUpperCase();
  const col     = avatarColor(name);

  const since  = user.created_at ? new Date(user.created_at) : null;
  const sinceStr = since
    ? since.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  // Squelette immédiat (sans attendre Supabase)
  bodyEl.innerHTML = `
    <div class="prof-hero">
      <div class="prof-avatar" style="background:${col.bg};color:${col.fg}">${_esc(initial)}</div>
      <div class="prof-name" id="prof-display-name">${_esc(name)}</div>
      <div class="prof-email">${_esc(email)}</div>
      ${sinceStr ? `<div class="prof-since"><i class="fa-solid fa-cross"></i> Membre depuis le ${sinceStr}</div>` : ''}
    </div>

    <div class="prof-stats">
      <div class="prof-stat-card prof-stat-intentions">
        <div class="prof-stat-value" id="prof-stat-int">…</div>
        <div class="prof-stat-label"><i class="fa-solid fa-hands-praying"></i> Intentions de prière</div>
      </div>
    </div>

    <div class="prof-section">
      <div class="prof-section-title">Modifier mon prénom</div>
      <div class="prof-name-form">
        <input type="text" id="prof-name-input" class="prof-input"
               value="${_esc(name)}" placeholder="Votre prénom"
               maxlength="40" autocomplete="given-name">
        <button class="prof-save-btn" id="prof-name-save">
          <i class="fa-solid fa-check"></i> Enregistrer
        </button>
      </div>
      <div class="prof-feedback hidden" id="prof-name-feedback"></div>
    </div>

    <div class="prof-section">
      <div class="prof-section-title">Sécurité</div>
      <button class="prof-action-btn" id="prof-change-pw-btn">
        <i class="fa-solid fa-lock"></i> Changer mon mot de passe
        <i class="fa-solid fa-chevron-down prof-action-chevron" id="prof-pw-chevron"></i>
      </button>
      <div class="prof-pw-form hidden" id="prof-pw-form">
        <div class="prof-pw-group">
          <input type="password" id="prof-pw-new" class="prof-input"
                 placeholder="Nouveau mot de passe" minlength="6" autocomplete="new-password">
        </div>
        <div class="prof-pw-group">
          <input type="password" id="prof-pw-confirm" class="prof-input"
                 placeholder="Confirmer le mot de passe" minlength="6" autocomplete="new-password">
        </div>
        <div class="prof-feedback hidden" id="prof-pw-feedback"></div>
        <button class="prof-save-btn" id="prof-pw-save">
          <i class="fa-solid fa-check"></i> Enregistrer le mot de passe
        </button>
      </div>
    </div>

    <div class="prof-section prof-section--danger">
      <button class="prof-signout-btn" id="prof-signout-btn">
        <i class="fa-solid fa-right-from-bracket"></i> Se déconnecter
      </button>
    </div>
  `;

  // Charger les stats en parallèle
  if (_sb) {
    _sb.from('prayer_intentions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count, error }) => {
        const el = $id('prof-stat-int');
        if (el) el.textContent = error ? '—' : (count ?? 0);
      })
      .catch(() => {
        const el = $id('prof-stat-int');
        if (el) el.textContent = '—';
      });
  } else {
    const el = $id('prof-stat-int');
    if (el) el.textContent = '—';
  }

  // Events
  $id('prof-name-save')?.addEventListener('click', saveProfileName);

  $id('prof-change-pw-btn')?.addEventListener('click', () => {
    const form    = $id('prof-pw-form');
    const chevron = $id('prof-pw-chevron');
    const open    = form.classList.toggle('hidden') === false;
    chevron?.classList.toggle('rotated', open);
    if (open) $id('prof-pw-new')?.focus();
  });

  $id('prof-pw-save')?.addEventListener('click', saveProfilePassword);

  $id('prof-signout-btn')?.addEventListener('click', async () => {
    if (!_sb) return;
    closeProfilePanel();
    await _sb.auth.signOut();
  });
}

async function saveProfileName() {
  const input = $id('prof-name-input');
  const fb    = $id('prof-name-feedback');
  if (!input || !_sb) return;
  const name = input.value.trim();
  if (!name) { _showProfFeedback(fb, 'Veuillez entrer un prénom.', 'error'); return; }

  const btn = $id('prof-name-save');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  const { error } = await _sb.auth.updateUser({ data: { name } });
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Enregistrer';

  if (error) { _showProfFeedback(fb, translateSupabaseError(error), 'error'); return; }

  _showProfFeedback(fb, '<i class="fa-solid fa-circle-check"></i> Prénom mis à jour !', 'success');

  // Mettre à jour l'UI en direct
  if (_currentUser) {
    _currentUser = { ..._currentUser, user_metadata: { ..._currentUser.user_metadata, name } };
    window._pelUser = _currentUser;
    updateHeaderUI(_currentUser);
  }
  const dispEl   = $id('prof-display-name');
  const avatarEl = document.querySelector('#profile-panel .prof-avatar');
  if (dispEl) dispEl.textContent = name;
  if (avatarEl) {
    const col = avatarColor(name);
    avatarEl.textContent       = name.charAt(0).toUpperCase();
    avatarEl.style.background  = col.bg;
    avatarEl.style.color       = col.fg;
  }
}

async function saveProfilePassword() {
  const pwEl = $id('prof-pw-new');
  const cfEl = $id('prof-pw-confirm');
  const fb   = $id('prof-pw-feedback');
  if (!pwEl || !_sb) return;

  const pw = pwEl.value;
  const cf = cfEl.value;
  if (!pw)          { _showProfFeedback(fb, 'Veuillez entrer un mot de passe.', 'error'); return; }
  if (pw.length < 6) { _showProfFeedback(fb, 'Au moins 6 caractères requis.', 'error'); return; }
  if (pw !== cf)    { _showProfFeedback(fb, 'Les mots de passe ne correspondent pas.', 'error'); return; }

  const btn = $id('prof-pw-save');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  const { error } = await _sb.auth.updateUser({ password: pw });
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Enregistrer le mot de passe';

  if (error) { _showProfFeedback(fb, translateSupabaseError(error), 'error'); return; }

  _showProfFeedback(fb, '<i class="fa-solid fa-circle-check"></i> Mot de passe mis à jour !', 'success');
  pwEl.value = '';
  cfEl.value = '';
  setTimeout(() => $id('prof-pw-form')?.classList.add('hidden'), 1800);
}

function _showProfFeedback(el, html, type) {
  if (!el) return;
  el.innerHTML  = html;
  el.className  = `prof-feedback prof-feedback--${type}`;
  clearTimeout(el._feedbackTimer);
  el._feedbackTimer = setTimeout(() => {
    if (el) el.className = 'prof-feedback hidden';
  }, 4000);
}

function initProfilePanel() {
  $id('profile-close')?.addEventListener('click', closeProfilePanel);
  $id('profile-overlay')?.addEventListener('click', closeProfilePanel);

  // Ligne profil dans le menu burger
  $id('hm-profile-row')?.addEventListener('click', () => {
    $id('hamburger-menu')?.classList.add('hidden');
    openProfilePanel();
  });

  // Bouton compte desktop
  $id('header-btn-account')?.addEventListener('click', openProfilePanel);

  // ESC ferme le panneau
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeProfilePanel();
  });

  // Exposé globalement pour que app.js (initHamburger) puisse l'appeler
  window._openProfilePanel = openProfilePanel;
}

/* ════════════════════════════════════════════
   MODAL — OUVERTURE / FERMETURE
═════════════════════════════════════════════*/
function openAuthModal(mode) {
  const modal   = $id('auth-modal');
  const overlay = $id('auth-overlay');
  if (!modal) return;
  restoreFields();
  setMode(mode || 'login');
  modal.classList.remove('hidden');
  overlay.classList.remove('hidden');
  setTimeout(() => {
    const target = (mode === 'reset-password') ? $id('auth-password') : $id('auth-email');
    target?.focus();
  }, 60);
}

function closeAuthModal() {
  $id('auth-modal')?.classList.add('hidden');
  $id('auth-overlay')?.classList.add('hidden');
  clearAuthError();
  setTimeout(() => {
    restoreFields();
    setMode('login');
    $id('auth-form')?.reset();
    // Supprimer le bouton "Renvoyer" injecté dynamiquement pour éviter les doublons
    $id('auth-success-screen')?.querySelector('.auth-resend-btn')?.remove();
  }, 300);
}

function restoreFields() {
  const fields = $id('auth-fields');
  const screen = $id('auth-success-screen');
  const note   = $id('auth-note');
  const tabsEl = document.querySelector('.auth-tabs');
  if (fields)  fields.style.display  = '';
  if (screen)  screen.style.display  = 'none';
  if (note)    note.style.display    = '';
  if (tabsEl)  tabsEl.style.display  = '';
}

/* ════════════════════════════════════════════
   MODAL — MODES
═════════════════════════════════════════════*/
function setMode(mode) {
  _formMode = mode;

  const isLogin    = mode === 'login';
  const isSignup   = mode === 'signup';
  const isResetReq = mode === 'reset-request';
  const isResetPw  = mode === 'reset-password';
  const isReset    = isResetReq || isResetPw;

  const tabsEl = document.querySelector('.auth-tabs');
  if (tabsEl) tabsEl.style.display = isReset ? 'none' : '';
  $id('auth-tab-login')?.classList.toggle('active', isLogin);
  $id('auth-tab-signup')?.classList.toggle('active', isSignup);

  const resetHeader = $id('auth-reset-header');
  if (resetHeader) resetHeader.style.display = isReset ? '' : 'none';
  if (isResetReq) {
    if ($id('auth-reset-title')) $id('auth-reset-title').textContent = 'Réinitialiser le mot de passe';
    if ($id('auth-reset-desc'))  $id('auth-reset-desc').textContent  =
      'Entrez votre adresse e-mail. Vous recevrez un lien pour créer un nouveau mot de passe.';
  }
  if (isResetPw) {
    if ($id('auth-reset-title')) $id('auth-reset-title').textContent = 'Nouveau mot de passe';
    if ($id('auth-reset-desc'))  $id('auth-reset-desc').textContent  =
      'Choisissez un nouveau mot de passe sécurisé pour votre compte.';
  }

  const nameGrp = $id('auth-name-group');
  if (nameGrp) nameGrp.style.display = isSignup ? '' : 'none';

  const emailGrp = $id('auth-email-group');
  if (emailGrp) emailGrp.style.display = isResetPw ? 'none' : '';

  const pwGrp = $id('auth-password-group');
  if (pwGrp) pwGrp.style.display = isResetReq ? 'none' : '';

  const pwLabel = $id('auth-password-label');
  if (pwLabel) pwLabel.innerHTML = isResetPw
    ? '<i class="fa-solid fa-lock"></i> Nouveau mot de passe'
    : '<i class="fa-solid fa-lock"></i> Mot de passe';

  const pwInput = $id('auth-password');
  if (pwInput) pwInput.autocomplete = (isSignup || isResetPw) ? 'new-password' : 'current-password';

  const confirmGrp = $id('auth-confirm-group');
  if (confirmGrp) confirmGrp.style.display = (isSignup || isResetPw) ? '' : 'none';
  const confirmLabel = $id('auth-confirm-label');
  if (confirmLabel) confirmLabel.innerHTML = isResetPw
    ? '<i class="fa-solid fa-lock"></i> Confirmer le nouveau mot de passe'
    : '<i class="fa-solid fa-lock"></i> Confirmer le mot de passe';

  const forgotEl = $id('auth-forgot');
  if (forgotEl) forgotEl.style.display = isLogin ? '' : 'none';

  const submitBtn = $id('auth-submit');
  if (submitBtn) {
    const labels = {
      'login':          'Se connecter',
      'signup':         'Créer mon compte',
      'reset-request':  'Envoyer le lien',
      'reset-password': 'Enregistrer le mot de passe',
    };
    submitBtn.textContent   = labels[mode] || 'Se connecter';
    submitBtn.dataset.label = submitBtn.textContent;
  }

  clearAuthError();
}

/* ════════════════════════════════════════════
   FEEDBACK
═════════════════════════════════════════════*/
function showAuthError(msg) {
  const el = $id('auth-error');
  if (el) {
    el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
    el.classList.remove('hidden');
  }
}
function clearAuthError() {
  const el = $id('auth-error');
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}
function setAuthLoading(on) {
  const btn = $id('auth-submit');
  if (!btn) return;
  btn.disabled  = on;
  btn.innerHTML = on
    ? '<i class="fa-solid fa-spinner fa-spin"></i> Chargement…'
    : (btn.dataset.label || 'Se connecter');
}

function translateSupabaseError(err) {
  // Log complet pour diagnostic
  console.error('[PrionsEnLigne] Supabase error:', err?.message, err);
  const m = (err?.message || '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials'))
    return 'Email ou mot de passe incorrect.';
  if (m.includes('email not confirmed'))
    return 'Veuillez confirmer votre email avant de vous connecter.';
  if (m.includes('already registered') || m.includes('user already registered'))
    return 'Cet email est déjà utilisé.';
  if (m.includes('password should') || m.includes('password'))
    return 'Le mot de passe doit comporter au moins 6 caractères.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (m.includes('sending confirmation') || m.includes('sending email') || m.includes('email') && m.includes('send'))
    return 'Impossible d\'envoyer l\'email de confirmation. Réessayez dans quelques instants ou contactez-nous.';
  if (m.includes('signup') && (m.includes('disabled') || m.includes('not allowed')))
    return 'Les inscriptions sont temporairement désactivées.';
  if (m.includes('email') && m.includes('invalid'))
    return 'Adresse email invalide.';
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('fetch'))
    return 'Impossible de se connecter. Vérifiez votre connexion internet.';
  // Message brut pour aider au diagnostic (sera retiré en production)
  return `Erreur : ${err?.message || 'inconnue'}`;
}

/* ════════════════════════════════════════════
   ÉCRANS DE SUCCÈS
═════════════════════════════════════════════*/
function showSuccessScreen({ icon, title, desc, btnLabel, btnAction }) {
  const fields = $id('auth-fields');
  const screen = $id('auth-success-screen');
  const note   = $id('auth-note');
  const tabsEl = document.querySelector('.auth-tabs');
  if (fields)  fields.style.display  = 'none';
  if (screen)  screen.style.display  = '';
  if (note)    note.style.display    = 'none';
  if (tabsEl)  tabsEl.style.display  = 'none';
  if ($id('auth-success-icon'))  $id('auth-success-icon').className = `fa-solid ${icon}`;
  if ($id('auth-success-title')) $id('auth-success-title').textContent = title;
  if ($id('auth-success-desc'))  $id('auth-success-desc').innerHTML  = desc;
  const btn = $id('auth-success-btn');
  if (btn) { btn.textContent = btnLabel; btn.onclick = btnAction; }
}

/* ── Renvoyer l'email de confirmation ── */
async function _resendConfirmEmail(btnEl) {
  if (!_sb || !_lastSignupEmail) return;
  btnEl.disabled = true;
  btnEl.textContent = 'Envoi en cours…';
  try {
    const { error } = await _sb.auth.resend({ type: 'signup', email: _lastSignupEmail });
    if (error) throw error;
    btnEl.textContent = '✓ Email renvoyé !';
    setTimeout(() => { btnEl.textContent = "Renvoyer l'email"; btnEl.disabled = false; }, 5000);
  } catch (_) {
    btnEl.textContent = 'Erreur — réessayez';
    setTimeout(() => { btnEl.textContent = "Renvoyer l'email"; btnEl.disabled = false; }, 3000);
  }
}

function showConfirmation(email) {
  if (email) _lastSignupEmail = email;
  showSuccessScreen({
    icon:     'fa-envelope-circle-check',
    title:    'Vérifiez votre email',
    desc:     'Un lien de confirmation a été envoyé à votre adresse e-mail.<br>Cliquez dessus pour activer votre compte.<br><small style="color:var(--text-soft)">Pensez à vérifier vos spams si vous ne le recevez pas.</small>',
    btnLabel: 'Fermer',
    btnAction: closeAuthModal,
  });
  // Injecter dynamiquement le bouton "Renvoyer"
  const screen = $id('auth-success-screen');
  if (screen && !screen.querySelector('.auth-resend-btn')) {
    const resendBtn = document.createElement('button');
    resendBtn.type = 'button';
    resendBtn.className = 'auth-resend-btn';
    resendBtn.textContent = "Renvoyer l'email de confirmation";
    resendBtn.addEventListener('click', () => _resendConfirmEmail(resendBtn));
    const closeBtn = $id('auth-success-btn');
    if (closeBtn) closeBtn.before(resendBtn);
  }
}
function showResetSent() {
  showSuccessScreen({
    icon:     'fa-paper-plane',
    title:    'Email envoyé !',
    desc:     'Un lien de réinitialisation a été envoyé.<br><small style="color:var(--text-soft)">Vérifiez vos spams. Le lien expire dans 1 heure.</small>',
    btnLabel: 'Retour à la connexion',
    btnAction: () => { restoreFields(); setMode('login'); },
  });
}
function showPasswordUpdated() {
  showSuccessScreen({
    icon:     'fa-circle-check',
    title:    'Mot de passe mis à jour !',
    desc:     'Votre mot de passe a été modifié avec succès.<br>Vous êtes maintenant connecté.',
    btnLabel: 'Continuer',
    btnAction: closeAuthModal,
  });
}

/* ════════════════════════════════════════════
   LISTENERS UI (indépendants de Supabase)
   Appelés IMMÉDIATEMENT → boutons toujours cliquables
═════════════════════════════════════════════*/
function initAuthUI() {
  // ── Ouvrir le modal (header desktop) ──
  $id('header-btn-login')?.addEventListener('click',  () => openAuthModal('login'));
  $id('header-btn-signup')?.addEventListener('click', () => openAuthModal('signup'));

  // ── Déconnexion (bouton desktop header) ──
  $id('header-btn-logout')?.addEventListener('click', async () => {
    if (!_sb) return;
    await _sb.auth.signOut();
  });

  // ── Ouvrir le modal (menu burger mobile) ──
  $id('hm-login-item')?.addEventListener('click', () => {
    $id('hamburger-menu')?.classList.add('hidden');
    openAuthModal('login');
  });
  $id('hm-signup-item')?.addEventListener('click', () => {
    $id('hamburger-menu')?.classList.add('hidden');
    openAuthModal('signup');
  });

  // ── Déconnexion (nécessite _sb) ──
  $id('hm-signout')?.addEventListener('click', async () => {
    if (!_sb) return;
    await _sb.auth.signOut();
    $id('hamburger-menu')?.classList.add('hidden');
  });

  // ── Fermeture modal ──
  $id('auth-close')?.addEventListener('click', closeAuthModal);
  $id('auth-overlay')?.addEventListener('click', closeAuthModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAuthModal(); });

  // ── Onglets ──
  $id('auth-tab-login')?.addEventListener('click',  () => { restoreFields(); setMode('login'); });
  $id('auth-tab-signup')?.addEventListener('click', () => { restoreFields(); setMode('signup'); });

  // ── Mot de passe oublié / Retour ──
  $id('auth-forgot-btn')?.addEventListener('click', () => { restoreFields(); setMode('reset-request'); });
  $id('auth-back-btn')?.addEventListener('click',   () => { restoreFields(); setMode('login'); });

  // ── Toggle afficher / masquer mot de passe ──
  $id('auth-pw-toggle')?.addEventListener('click', () => {
    const input = $id('auth-password');
    const icon  = $id('auth-pw-eye');
    if (!input) return;
    const hidden = input.type === 'password';
    input.type     = hidden ? 'text' : 'password';
    icon.className = hidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  });

  // ── Panneau profil ──
  initProfilePanel();

  // ── Soumission formulaire ──
  $id('auth-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearAuthError();

    // Supabase pas encore prêt
    if (!_sb) {
      showAuthError('Service en cours de chargement. Réessayez dans quelques instants.');
      return;
    }

    // CONNEXION
    if (_formMode === 'login') {
      const email    = $id('auth-email')?.value.trim();
      const password = $id('auth-password')?.value;
      if (!email || !password) { showAuthError('Veuillez remplir tous les champs.'); return; }
      setAuthLoading(true);
      const { error } = await _sb.auth.signInWithPassword({ email, password });
      setAuthLoading(false);
      if (error) {
        // Cas particulier : email pas encore confirmé → afficher l'écran de renvoi
        if ((error.message || '').toLowerCase().includes('email not confirmed')) {
          _lastSignupEmail = email;
          showConfirmation(email);
        } else {
          showAuthError(translateSupabaseError(error));
        }
        return;
      }
      closeAuthModal();
    }

    // INSCRIPTION
    else if (_formMode === 'signup') {
      const email    = $id('auth-email')?.value.trim();
      const password = $id('auth-password')?.value;
      const confirm  = $id('auth-confirm')?.value;
      const name     = $id('auth-name')?.value.trim();
      if (!email || !password) { showAuthError('Veuillez remplir tous les champs.'); return; }
      if (password.length < 6) { showAuthError('Le mot de passe doit comporter au moins 6 caractères.'); return; }
      if (password !== confirm) { showAuthError('Les mots de passe ne correspondent pas.'); return; }
      setAuthLoading(true);
      const { data: signUpData, error } = await _sb.auth.signUp({
        email, password,
        options: { data: { name: name || email.split('@')[0] } },
      });
      setAuthLoading(false);
      if (error) { showAuthError(translateSupabaseError(error)); return; }
      // Si la confirmation email est désactivée → session immédiate → on ferme le modal
      // Sinon → email de confirmation envoyé → on affiche l'écran de confirmation
      if (signUpData?.session) {
        closeAuthModal();
      } else {
        showConfirmation(email); // passe l'email pour pouvoir renvoyer si besoin
      }
    }

    // DEMANDE RESET
    else if (_formMode === 'reset-request') {
      const email = $id('auth-email')?.value.trim();
      if (!email) { showAuthError('Veuillez entrer votre adresse e-mail.'); return; }
      setAuthLoading(true);
      const { error } = await _sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/agenda',
      });
      setAuthLoading(false);
      if (error) { showAuthError(translateSupabaseError(error)); return; }
      showResetSent();
    }

    // NOUVEAU MOT DE PASSE
    else if (_formMode === 'reset-password') {
      const password = $id('auth-password')?.value;
      const confirm  = $id('auth-confirm')?.value;
      if (!password) { showAuthError('Veuillez entrer un nouveau mot de passe.'); return; }
      if (password.length < 6) { showAuthError('Le mot de passe doit comporter au moins 6 caractères.'); return; }
      if (password !== confirm) { showAuthError('Les mots de passe ne correspondent pas.'); return; }
      setAuthLoading(true);
      const { error } = await _sb.auth.updateUser({ password });
      setAuthLoading(false);
      if (error) { showAuthError(translateSupabaseError(error)); return; }
      showPasswordUpdated();
    }
  });
}

/* ════════════════════════════════════════════
   INIT SUPABASE (asynchrone)
═════════════════════════════════════════════*/
async function initAuth() {
  // Les listeners UI sont attachés IMMÉDIATEMENT
  initAuthUI();

  // Ensuite on tente d'initialiser Supabase
  // Priorité : /api/config (Vercel env vars) → _SB_*_LOCAL (fallback local)
  let supabaseUrl = '', supabaseAnon = '';
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      supabaseUrl  = cfg.supabaseUrl  || '';
      supabaseAnon = cfg.supabaseAnon || '';
    }
  } catch (_) { /* hors Vercel – ignoré */ }

  // Fallback : credentials locaux définis en haut du fichier
  if (!supabaseUrl)  supabaseUrl  = _SB_URL_LOCAL;
  if (!supabaseAnon) supabaseAnon = _SB_KEY_LOCAL;

  if (!supabaseUrl || !supabaseAnon) {
    console.info('[PrionsEnLigne] Supabase non configuré — voir les instructions en haut de auth.js.');
    return;
  }

  try {
    _sb = window.supabase?.createClient(supabaseUrl, supabaseAnon);
  } catch (err) {
    console.info('[PrionsEnLigne] Erreur création client Supabase :', err.message);
    return;
  }

  if (!_sb) {
    console.info('[PrionsEnLigne] Supabase SDK introuvable (CDN non chargé ?).');
    return;
  }

  // Session existante
  const { data: { session } } = await _sb.auth.getSession();
  updateHeaderUI(session?.user || null);

  // Changements d'état auth
  _sb.auth.onAuthStateChange((event, sess) => {
    if (event === 'PASSWORD_RECOVERY') {
      openAuthModal('reset-password');
    } else {
      updateHeaderUI(sess?.user || null);
    }
  });

  // Expose le client Supabase pour app.js
  window._sbClient = _sb;
}
