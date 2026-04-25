/* ═══════════════════════════════════════════════
   PRIONSENLIGNE — auth.js
   Authentification via Supabase
═══════════════════════════════════════════════

   CONFIGURATION :
   1. Créez un projet sur https://supabase.com (gratuit)
   2. Dashboard → Settings → API
   3. Remplacez les deux valeurs ci-dessous
   La clé "anon/public" est conçue pour être exposée côté client.
   La sécurité est assurée par les Row Level Security policies côté serveur.
*/

// ── Helpers ──
function $id(id) { return document.getElementById(id); }

// ── État ──
let _currentUser = null;

/* ────────────────────────────────────────────
   Mise à jour de l'UI header selon l'état auth
──────────────────────────────────────────────*/
function updateHeaderUI(user) {
  _currentUser = user;
  const btn        = $id('hamburger-btn');
  const accountItem= $id('hm-account');
  const signoutItem= $id('hm-signout');

  if (!btn) return;

  if (user) {
    const name    = user.user_metadata?.name || user.email;
    const initial = name.charAt(0).toUpperCase();
    btn.innerHTML = `<span class="hamburger-avatar" title="${name}">${initial}</span>`;
  } else {
    btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
  }

  if (accountItem)  accountItem.style.display = user ? 'none' : '';
  if (signoutItem)  signoutItem.style.display  = user ? ''     : 'none';
}

/* ────────────────────────────────────────────
   Ouverture / fermeture du modal
──────────────────────────────────────────────*/
function openAuthModal(mode) {
  const modal   = $id('auth-modal');
  const overlay = $id('auth-overlay');
  if (!modal) return;
  setMode(mode || 'login');
  modal.classList.remove('hidden');
  overlay.classList.remove('hidden');
  setTimeout(() => $id('auth-email')?.focus(), 50);
}

function closeAuthModal() {
  $id('auth-modal')?.classList.add('hidden');
  $id('auth-overlay')?.classList.add('hidden');
  clearAuthError();
}

/* ────────────────────────────────────────────
   Basculer Connexion / Créer un compte
──────────────────────────────────────────────*/
function setMode(mode) {
  const isSignup   = mode === 'signup';
  const nameGroup  = $id('auth-name-group');
  const submitBtn  = $id('auth-submit');
  const tabLogin   = $id('auth-tab-login');
  const tabSignup  = $id('auth-tab-signup');

  tabLogin?.classList.toggle('active', !isSignup);
  tabSignup?.classList.toggle('active', isSignup);

  if (nameGroup)  nameGroup.style.display  = isSignup ? '' : 'none';
  if (submitBtn) {
    submitBtn.textContent   = isSignup ? 'Créer mon compte' : 'Se connecter';
    submitBtn.dataset.label = submitBtn.textContent;
  }
  clearAuthError();
}

/* ────────────────────────────────────────────
   Feedback erreurs / chargement
──────────────────────────────────────────────*/
function showAuthError(msg) {
  const el = $id('auth-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
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
  const m = err?.message || '';
  if (m.includes('Invalid login'))     return 'Email ou mot de passe incorrect.';
  if (m.includes('Email not confirmed')) return 'Veuillez confirmer votre email avant de vous connecter.';
  if (m.includes('already registered')) return 'Cet email est déjà utilisé.';
  if (m.includes('Password should'))   return 'Le mot de passe doit comporter au moins 6 caractères.';
  if (m.includes('rate limit'))        return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError'))
    return 'Impossible de se connecter. Vérifiez votre connexion internet.';
  return 'Une erreur est survenue. Réessayez.';
}

/* ────────────────────────────────────────────
   Confirmation après inscription
──────────────────────────────────────────────*/
function showConfirmation() {
  const form = $id('auth-form');
  if (!form) return;
  form.innerHTML = `
    <div class="auth-confirm">
      <i class="fa-solid fa-envelope-circle-check"></i>
      <h3>Vérifiez votre email</h3>
      <p>Un lien de confirmation a été envoyé à votre adresse.<br>
         Cliquez dessus pour activer votre compte PrionsEnLigne.</p>
      <button class="auth-submit" onclick="closeAuthModal()" type="button">Fermer</button>
    </div>`;
}

/* ────────────────────────────────────────────
   Initialisation principale
──────────────────────────────────────────────*/
async function initAuth() {
  // Récupère les credentials depuis le endpoint Vercel
  let sb;
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('config fetch failed');
    const { supabaseUrl, supabaseAnon } = await res.json();
    if (!supabaseUrl || !supabaseAnon) {
      console.info('[PrionsEnLigne] Supabase non configuré (variables d\'environnement manquantes).');
      return;
    }
    sb = window.supabase?.createClient(supabaseUrl, supabaseAnon);
  } catch (err) {
    console.info('[PrionsEnLigne] Impossible de récupérer la config Supabase :', err.message);
    return;
  }

  if (!sb) {
    console.info('[PrionsEnLigne] Supabase SDK introuvable (CDN non chargé ?).');
    return;
  }

  // Récupère la session existante
  sb.auth.getSession().then(({ data }) => {
    updateHeaderUI(data.session?.user || null);
  });

  // Écoute les changements d'état (login / logout)
  sb.auth.onAuthStateChange((_event, session) => {
    updateHeaderUI(session?.user || null);
  });

  // Clic "Mon compte" → ouvre le modal
  $id('hm-account')?.addEventListener('click', () => {
    $id('hamburger-menu')?.classList.add('hidden');
    openAuthModal('login');
  });

  // Déconnexion
  $id('hm-signout')?.addEventListener('click', async () => {
    await sb.auth.signOut();
    $id('hamburger-menu')?.classList.add('hidden');
  });

  // Fermeture modal
  $id('auth-close')?.addEventListener('click', closeAuthModal);
  $id('auth-overlay')?.addEventListener('click', closeAuthModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAuthModal(); });

  // Onglets
  $id('auth-tab-login')?.addEventListener('click',  () => setMode('login'));
  $id('auth-tab-signup')?.addEventListener('click', () => setMode('signup'));

  // Soumission formulaire
  $id('auth-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    clearAuthError();

    const isSignup  = $id('auth-tab-signup')?.classList.contains('active');
    const email     = $id('auth-email')?.value.trim();
    const password  = $id('auth-password')?.value;
    const name      = $id('auth-name')?.value.trim();

    if (!email || !password) { showAuthError('Veuillez remplir tous les champs.'); return; }

    setAuthLoading(true);

    if (isSignup) {
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { name: name || email.split('@')[0] } },
      });
      setAuthLoading(false);
      if (error) { showAuthError(translateSupabaseError(error)); return; }
      showConfirmation();
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      setAuthLoading(false);
      if (error) { showAuthError(translateSupabaseError(error)); return; }
      closeAuthModal();
    }
  });
}
