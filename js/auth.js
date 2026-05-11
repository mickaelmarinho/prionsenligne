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
   PERSONNALISATION — Icônes + palettes liturgiques
═════════════════════════════════════════════*/
const AVATAR_ICONS = {
  initial: { type:'text', label:'Mon initiale' },
  cross:   { type:'icon', icon:'fa-cross',          label:'Croix latine' },
  dove:    { type:'icon', icon:'fa-dove',           label:'Colombe — Esprit Saint' },
  hands:   { type:'icon', icon:'fa-hands-praying',  label:'Mains jointes' },
  church:  { type:'icon', icon:'fa-church',         label:'Église' },
  bible:   { type:'icon', icon:'fa-book-bible',     label:'Bible' },
  heart:   { type:'icon', icon:'fa-heart',          label:'Cœur Sacré' },
  fire:    { type:'icon', icon:'fa-fire',           label:'Feu de l\'Esprit' },
  star:    { type:'icon', icon:'fa-star',           label:'Étoile' },
  leaf:    { type:'icon', icon:'fa-leaf',           label:'Rameau d\'olivier' },
  feather: { type:'icon', icon:'fa-feather',        label:'Plume — humilité' },
  crown:   { type:'icon', icon:'fa-crown',          label:'Couronne — Christ Roi' },
};

// Palettes inspirées des couleurs liturgiques de l'Église catholique
const AVATAR_PALETTES = {
  auto:    { label:'Automatique (selon prénom)' },
  classic: { bg:'#1a2744', fg:'#c9a84c', label:'Classique — Navy & Or' },
  sacred:  { bg:'#8b1117', fg:'#f5d76e', label:'Sacré-Cœur — Rouge' },
  marian:  { bg:'#1e3a8a', fg:'#e0e7ff', label:'Marial — Bleu Immaculée' },
  hope:    { bg:'#0f5132', fg:'#fde047', label:'Espérance — Vert' },
  advent:  { bg:'#581c87', fg:'#fde68a', label:'Avent / Carême — Violet' },
  ivory:   { bg:'#f5f0e8', fg:'#1a2744', label:'Ivoire — Pâques / Noël' },
};

// ~30 saints populaires — affichage sous la forme « Saint Joseph (19 mars) »
const SAINTS = [
  { id:'aucun',      name:'— Aucun —',                        feast:'' },
  { id:'marie',      name:'Sainte Vierge Marie',              feast:'15 août' },
  { id:'joseph',     name:'Saint Joseph',                     feast:'19 mars' },
  { id:'michel',     name:'Saint Michel Archange',            feast:'29 septembre' },
  { id:'pierre',     name:'Saint Pierre',                     feast:'29 juin' },
  { id:'paul',       name:'Saint Paul',                       feast:'29 juin' },
  { id:'jean-evang', name:'Saint Jean l\'Évangéliste',        feast:'27 décembre' },
  { id:'jb',         name:'Saint Jean-Baptiste',              feast:'24 juin' },
  { id:'francois',   name:'Saint François d\'Assise',         feast:'4 octobre' },
  { id:'antoine-p',  name:'Saint Antoine de Padoue',          feast:'13 juin' },
  { id:'therese-l',  name:'Sainte Thérèse de Lisieux',        feast:'1er octobre' },
  { id:'therese-a',  name:'Sainte Thérèse d\'Avila',          feast:'15 octobre' },
  { id:'ignace',     name:'Saint Ignace de Loyola',           feast:'31 juillet' },
  { id:'benoit',     name:'Saint Benoît',                     feast:'11 juillet' },
  { id:'augustin',   name:'Saint Augustin',                   feast:'28 août' },
  { id:'thomas-aq',  name:'Saint Thomas d\'Aquin',            feast:'28 janvier' },
  { id:'christophe', name:'Saint Christophe',                 feast:'25 juillet' },
  { id:'bernadette', name:'Sainte Bernadette',                feast:'16 avril' },
  { id:'faustine',   name:'Sainte Faustine',                  feast:'5 octobre' },
  { id:'padre-pio',  name:'Saint Padre Pio',                  feast:'23 septembre' },
  { id:'jp2',        name:'Saint Jean-Paul II',               feast:'22 octobre' },
  { id:'jean-23',    name:'Saint Jean XXIII',                 feast:'11 octobre' },
  { id:'cath-s',     name:'Sainte Catherine de Sienne',       feast:'29 avril' },
  { id:'jeanne',     name:'Sainte Jeanne d\'Arc',             feast:'30 mai' },
  { id:'vincent',    name:'Saint Vincent de Paul',            feast:'27 septembre' },
  { id:'monique',    name:'Sainte Monique',                   feast:'27 août' },
  { id:'claire',     name:'Sainte Claire d\'Assise',          feast:'11 août' },
  { id:'rita',       name:'Sainte Rita',                      feast:'22 mai' },
  { id:'philomene',  name:'Sainte Philomène',                 feast:'11 août' },
  { id:'kateri',     name:'Sainte Kateri Tekakwitha',         feast:'14 juillet' },
  { id:'jean-vian',  name:'Saint Jean-Marie Vianney (curé d\'Ars)', feast:'4 août' },
  { id:'maxim-k',    name:'Saint Maximilien Kolbe',           feast:'14 août' },
  { id:'edith-s',    name:'Sainte Edith Stein',               feast:'9 août' },
  { id:'mere-tere',  name:'Sainte Mère Teresa',               feast:'5 septembre' },
  { id:'charles-f',  name:'Saint Charles de Foucauld',        feast:'1er décembre' },
];

// ── Nominis : récupération bio du saint patron ──
const _MONTHS_FR = {
  'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
  'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
  'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12,
};
function parseFeastDate(feast) {
  if (!feast) return null;
  // Formats : "19 mars", "1er octobre", "15 août"
  const m = feast.trim().toLowerCase().match(/^(\d{1,2})(?:er)?\s+([a-zûéèêâô]+)/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = _MONTHS_FR[m[2]];
  if (!day || !month) return null;
  return { day, month };
}

const _saintBioCache = {};
let _saintBioAbort = null;
async function fetchSaintBio(day, month) {
  const key = `${day}-${month}`;
  if (_saintBioCache[key]) return _saintBioCache[key];
  if (_saintBioAbort) _saintBioAbort.abort();
  _saintBioAbort = new AbortController();
  try {
    const year = new Date().getFullYear();
    const resp = await fetch(`/api/nominis?day=${day}&month=${month}&year=${year}`, { signal: _saintBioAbort.signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    _saintBioCache[key] = data;
    return data;
  } catch (_) { return null; }
}

// Applique l'avatar (icône+couleur OU initiale+auto-couleur) à un élément
function applyAvatarTo(el, user) {
  if (!el || !user) return;
  const meta = user.user_metadata || {};
  const name = meta.name || (user.email || '').split('@')[0] || '?';
  const iconKey    = meta.avatar_icon    || 'initial';
  const paletteKey = meta.avatar_palette || 'auto';
  const palette    = (paletteKey === 'auto')
    ? avatarColor(name)
    : (AVATAR_PALETTES[paletteKey] && AVATAR_PALETTES[paletteKey].bg
        ? AVATAR_PALETTES[paletteKey]
        : avatarColor(name));
  const icon = AVATAR_ICONS[iconKey] || AVATAR_ICONS.initial;

  el.style.background = palette.bg;
  el.style.color      = palette.fg;
  if (icon.type === 'icon') {
    el.innerHTML = `<i class="fa-solid ${icon.icon}"></i>`;
    el.classList.add('avatar-with-icon');
  } else {
    el.textContent = name.charAt(0).toUpperCase();
    el.classList.remove('avatar-with-icon');
  }
}

/* ════════════════════════════════════════════
   UI HEADER
═════════════════════════════════════════════*/
// Dispatche un événement custom à chaque changement d'auth
// → permet aux autres modules (Bible) de réagir (sync, refresh UI…)
function _dispatchAuthChange(user) {
  try {
    document.dispatchEvent(new CustomEvent('pel:authchange', {
      detail: { user, sb: window._sbClient || null },
    }));
  } catch (_) {}
}

function updateHeaderUI(user) {
  _currentUser = user;
  window._pelUser = user; // Exposé pour app.js (chat)
  _dispatchAuthChange(user);
  const btn         = $id('hamburger-btn');
  const signoutItem = $id('hm-signout');
  const logoutBtn   = $id('header-btn-logout');
  const accountBtn  = $id('header-btn-account');
  const authUnified = $id('header-btn-auth');
  const headerUser  = $id('header-user');
  const hmProfileRow = $id('hm-profile-row');
  const hmPrDivider  = $id('hm-pr-divider');

  if (user) {
    const name    = user.user_metadata?.name || user.email.split('@')[0];
    const email   = user.email || '';

    // Hamburger btn : avatar mini (toujours initiale pour la lisibilité dans le bouton compact)
    if (btn) {
      const initial = name.charAt(0).toUpperCase();
      const col     = avatarColor(name);
      btn.innerHTML = `<span class="hamburger-avatar" title="${name}" style="background:${col.bg};color:${col.fg}">${initial}</span>`;
    }
    headerUser?.classList.add('user-logged-in');

    // Bouton compte desktop — avatar plein avec icône perso
    if (accountBtn) {
      accountBtn.classList.remove('hidden');
      const avatarSpan = $id('header-acct-avatar');
      const nameSpan   = $id('header-acct-name');
      applyAvatarTo(avatarSpan, user);
      if (nameSpan) nameSpan.textContent = name;
    }

    // Ligne profil dans le menu burger — avec icône perso
    if (hmProfileRow) {
      hmProfileRow.classList.remove('hidden');
      const av = $id('hm-pr-avatar');
      const nm = $id('hm-pr-name');
      const em = $id('hm-pr-email');
      applyAvatarTo(av, user);
      if (nm) nm.textContent = name;
      if (em) em.textContent = email;
    }
    if (hmPrDivider) hmPrDivider.classList.remove('hidden');

    // Connecté → masque le bouton auth unifié, montre le profil
    authUnified?.classList.add('hidden');
    logoutBtn?.classList.add('hidden'); // signout est désormais dans le panneau profil
  } else {
    if (btn) btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    headerUser?.classList.remove('user-logged-in');
    accountBtn?.classList.add('hidden');
    if (hmProfileRow) hmProfileRow.classList.add('hidden');
    if (hmPrDivider)  hmPrDivider.classList.add('hidden');
    // Pas connecté → montre le bouton auth unifié
    authUnified?.classList.remove('hidden');
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

  // Méta utilisateur pour la perso
  const meta = user.user_metadata || {};
  const currentIcon    = meta.avatar_icon    || 'initial';
  const currentPalette = meta.avatar_palette || 'auto';
  const currentSaint   = meta.patron_saint   || 'aucun';
  const currentVerse   = meta.favorite_verse || '';

  // HTML pour la grille des icônes
  const iconsGridHTML = Object.entries(AVATAR_ICONS).map(([key, ico]) => {
    const isActive = key === currentIcon;
    const inner = ico.type === 'icon' ? `<i class="fa-solid ${ico.icon}"></i>` : '<span class="prof-ico-initial">A</span>';
    return `<button type="button" class="prof-ico-btn${isActive ? ' active' : ''}" data-icon="${key}" title="${_esc(ico.label)}">${inner}</button>`;
  }).join('');

  // HTML pour la grille des palettes
  const palettesGridHTML = Object.entries(AVATAR_PALETTES).map(([key, pal]) => {
    const isActive = key === currentPalette;
    const swatch = pal.bg
      ? `<span class="prof-pal-swatch" style="background:${pal.bg};color:${pal.fg}"></span>`
      : `<span class="prof-pal-swatch prof-pal-auto"><i class="fa-solid fa-shuffle"></i></span>`;
    return `<button type="button" class="prof-pal-btn${isActive ? ' active' : ''}" data-palette="${key}" title="${_esc(pal.label)}">${swatch}<span class="prof-pal-name">${_esc(pal.label)}</span></button>`;
  }).join('');

  // HTML pour le sélecteur de saint patron
  const saintsHTML = SAINTS.map(s => {
    const sel = s.id === currentSaint ? ' selected' : '';
    const display = s.feast ? `${s.name} — ${s.feast}` : s.name;
    return `<option value="${s.id}"${sel}>${_esc(display)}</option>`;
  }).join('');

  const selectedSaint = SAINTS.find(s => s.id === currentSaint);

  // Squelette immédiat (sans attendre Supabase)
  bodyEl.innerHTML = `
    <div class="prof-hero">
      <div class="prof-avatar" id="prof-avatar-display"></div>
      <div class="prof-name" id="prof-display-name">${_esc(name)}</div>
      <div class="prof-email">${_esc(email)}</div>
      ${sinceStr ? `<div class="prof-since"><i class="fa-solid fa-cross"></i> Membre depuis le ${sinceStr}</div>` : ''}
      ${selectedSaint && selectedSaint.id !== 'aucun' ? `<div class="prof-patron"><i class="fa-solid fa-star"></i> Saint patron : <strong>${_esc(selectedSaint.name)}</strong>${selectedSaint.feast ? ' <span class="prof-patron-feast">(' + _esc(selectedSaint.feast) + ')</span>' : ''}</div>` : ''}
      <div class="prof-patron-bio" id="prof-patron-bio" style="display:none"></div>
      ${currentVerse ? `<blockquote class="prof-verse">« ${_esc(currentVerse)} »</blockquote>` : ''}
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
      <div class="prof-section-title">
        <i class="fa-solid fa-palette"></i> Personnalisation
      </div>

      <div class="prof-perso-label">Icône de votre avatar</div>
      <div class="prof-ico-grid">${iconsGridHTML}</div>

      <div class="prof-perso-label">Couleur (palette liturgique)</div>
      <div class="prof-pal-grid">${palettesGridHTML}</div>

      <div class="prof-perso-label">Saint patron</div>
      <select class="prof-input prof-saint-select" id="prof-saint-select">
        ${saintsHTML}
      </select>

      <div class="prof-perso-label">Citation favorite (Bible, saint…)</div>
      <textarea class="prof-input prof-verse-input" id="prof-verse-input"
                rows="2" maxlength="240"
                placeholder="« Que votre cœur ne se trouble pas… » — Jean 14:1">${_esc(currentVerse)}</textarea>
      <button class="prof-save-btn" id="prof-perso-save">
        <i class="fa-solid fa-check"></i> Enregistrer mes préférences
      </button>
      <div class="prof-feedback hidden" id="prof-perso-feedback"></div>
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

  // Avatar avec icône / palette : aperçu live dans le hero
  applyAvatarTo($id('prof-avatar-display'), user);

  // Sélection d'icône : highlight + preview
  document.querySelectorAll('.prof-ico-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.prof-ico-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      btn.dataset.touched = '1';
      // Preview immédiate dans le hero
      previewAvatar();
    });
  });

  // Sélection de palette : highlight + preview
  document.querySelectorAll('.prof-pal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.prof-pal-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      previewAvatar();
    });
  });

  // Saint patron : preview sous le hero
  $id('prof-saint-select')?.addEventListener('change', () => {
    const sid = $id('prof-saint-select').value;
    const s = SAINTS.find(x => x.id === sid);
    let bloc = document.querySelector('.prof-patron');
    const heroEl = document.querySelector('.prof-hero');
    if (!s || s.id === 'aucun') {
      bloc?.remove();
      const bio = $id('prof-patron-bio');
      if (bio) { bio.style.display = 'none'; bio.innerHTML = ''; }
    } else {
      const html = `<i class="fa-solid fa-star"></i> Saint patron : <strong>${_esc(s.name)}</strong>${s.feast ? ' <span class="prof-patron-feast">(' + _esc(s.feast) + ')</span>' : ''}`;
      if (bloc) {
        bloc.innerHTML = html;
      } else if (heroEl) {
        const div = document.createElement('div');
        div.className = 'prof-patron';
        div.innerHTML = html;
        // Inséré avant la bio si elle existe, sinon avant la citation
        const bio = heroEl.querySelector('.prof-patron-bio');
        const verse = heroEl.querySelector('.prof-verse');
        if (bio) bio.before(div);
        else if (verse) verse.before(div);
        else heroEl.appendChild(div);
      }
      renderPatronBio(s);
    }
  });

  // Bio initiale du saint patron (si défini)
  if (selectedSaint && selectedSaint.id !== 'aucun') renderPatronBio(selectedSaint);

  // Citation : preview en live
  $id('prof-verse-input')?.addEventListener('input', () => {
    const txt = $id('prof-verse-input').value.trim();
    let bloc = document.querySelector('.prof-verse');
    const heroEl = document.querySelector('.prof-hero');
    if (!txt) { bloc?.remove(); return; }
    if (bloc) {
      bloc.textContent = `« ${txt} »`;
    } else if (heroEl) {
      const bq = document.createElement('blockquote');
      bq.className = 'prof-verse';
      bq.textContent = `« ${txt} »`;
      heroEl.appendChild(bq);
    }
  });

  // Save personnalisation
  $id('prof-perso-save')?.addEventListener('click', saveProfilePerso);

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

// Affiche la biographie du saint patron via /api/nominis
async function renderPatronBio(saint) {
  const bio = $id('prof-patron-bio');
  if (!bio || !saint || saint.id === 'aucun') return;
  const parsed = parseFeastDate(saint.feast);
  if (!parsed) { bio.style.display = 'none'; return; }
  bio.style.display = '';
  bio.innerHTML = `<div class="prof-patron-bio-loading"><i class="fa-solid fa-spinner fa-spin"></i> Chargement de la biographie…</div>`;
  const data = await fetchSaintBio(parsed.day, parsed.month);
  // Vérifier que l'utilisateur n'a pas changé de saint entre-temps
  const currentSid = $id('prof-saint-select')?.value;
  if (currentSid && currentSid !== saint.id) return;
  if (!data) { bio.style.display = 'none'; return; }
  const desc = data.description ? `<div class="prof-patron-desc">${_esc(data.description)}</div>` : '';
  const lien = data.lien ? `<a class="prof-patron-link" href="${_esc(data.lien)}" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i> Lire la biographie complète sur Nominis</a>` : '';
  const src  = data.source ? `<div class="prof-patron-src">Source : ${_esc(data.source)}</div>` : '';
  bio.innerHTML = `${desc}${lien}${src}`;
}

// Preview live de l'avatar quand l'utilisateur sélectionne une icône / palette
function previewAvatar() {
  if (!_currentUser) return;
  const iconKey    = document.querySelector('.prof-ico-btn.active')?.dataset.icon || 'initial';
  const paletteKey = document.querySelector('.prof-pal-btn.active')?.dataset.palette || 'auto';
  // On simule un user temporaire avec les meta pickées
  const tempUser = {
    ...(_currentUser),
    user_metadata: {
      ...(_currentUser.user_metadata || {}),
      avatar_icon: iconKey,
      avatar_palette: paletteKey,
    },
  };
  applyAvatarTo($id('prof-avatar-display'), tempUser);
}

// Sauvegarde des préférences perso (icône, palette, saint, citation)
async function saveProfilePerso() {
  const fb = $id('prof-perso-feedback');
  if (!_sb || !_currentUser) return;
  const btn = $id('prof-perso-save');
  if (!btn) return;

  const iconKey    = document.querySelector('.prof-ico-btn.active')?.dataset.icon || 'initial';
  const paletteKey = document.querySelector('.prof-pal-btn.active')?.dataset.palette || 'auto';
  const saintId    = $id('prof-saint-select')?.value || 'aucun';
  const verseTxt   = $id('prof-verse-input')?.value.trim().slice(0, 240) || '';

  btn.disabled = true;
  const oldHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement…';

  try {
    const newMeta = {
      ...(_currentUser.user_metadata || {}),
      avatar_icon:    iconKey,
      avatar_palette: paletteKey,
      patron_saint:   saintId,
      favorite_verse: verseTxt,
    };
    const { data, error } = await _sb.auth.updateUser({ data: newMeta });
    if (error) throw error;
    _currentUser = data?.user || _currentUser;
    window._pelUser = _currentUser;
    updateHeaderUI(_currentUser);
    applyAvatarTo($id('prof-avatar-display'), _currentUser);
    _showProfFeedback(fb, '✓ Préférences enregistrées', 'success');
  } catch (err) {
    _showProfFeedback(fb, err.message || 'Erreur, réessayez.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHTML;
  }
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
  // Anciens boutons login/signup (cachés mais conservés pour compat)
  $id('header-btn-login')?.addEventListener('click',  () => openAuthModal('login'));
  $id('header-btn-signup')?.addEventListener('click', () => openAuthModal('signup'));
  // Nouveau bouton unifié "Se connecter / Rejoindre" : ouvre le modal en mode signup
  // (l'utilisateur peut basculer vers Connexion via les onglets dans le modal)
  $id('header-btn-auth')?.addEventListener('click', () => openAuthModal('signup'));

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

  // ── 1. Init synchrone avec les credentials embarqués (disponible tout de suite) ──
  // Le SDK Supabase est chargé en UMD : window.supabase.createClient
  const sbLib = window.supabase || window.Supabase;
  if (sbLib?.createClient && _SB_URL_LOCAL && _SB_KEY_LOCAL) {
    try { _sb = sbLib.createClient(_SB_URL_LOCAL, _SB_KEY_LOCAL); } catch (_) {}
  }

  // ── 2. Tenter de récupérer les credentials Vercel (variables d'env) ──
  // Si différents des locaux, réinitialise le client. Fait en arrière-plan.
  (async () => {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) return;
      const { supabaseUrl, supabaseAnon } = await res.json();
      if (!supabaseUrl || !supabaseAnon) return;
      if (supabaseUrl === _SB_URL_LOCAL && supabaseAnon === _SB_KEY_LOCAL) return; // identiques
      const newClient = sbLib?.createClient(supabaseUrl, supabaseAnon);
      if (newClient) _sb = newClient;
    } catch (_) { /* ignoré hors Vercel */ }
  })();

  if (!_sb) {
    console.warn('[PrionsEnLigne] Supabase SDK introuvable — auth désactivée.');
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
