/* ═══════════════════════════════════════════════
   PRIONSENLIGNE — Panneau Admin (modération)
   Visible uniquement si user.app_metadata.is_admin = true.
   Lit la table moderation_log via RLS (le serveur la protège côté DB).
═══════════════════════════════════════════════ */

(function () {
  const PAGE_SIZE = 80;

  function $id(id) { return document.getElementById(id); }

  function isAdmin(user) {
    return !!user && user.app_metadata && user.app_metadata.is_admin === true;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)     return 'à l\'instant';
    if (s < 3600)   return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400)  return `il y a ${Math.floor(s / 3600)} h`;
    return `il y a ${Math.floor(s / 86400)} j`;
  }

  function categoryBadge(cat) {
    const map = {
      'ok':         { label: 'OK',          cls: 'mod-cat-ok' },
      'spam':       { label: 'Spam',        cls: 'mod-cat-spam' },
      'haine':      { label: 'Haine',       cls: 'mod-cat-haine' },
      'blaspheme':  { label: 'Blasphème',   cls: 'mod-cat-blaspheme' },
      'sexuel':     { label: 'Sexuel',      cls: 'mod-cat-sexuel' },
      'violence':   { label: 'Violence',    cls: 'mod-cat-violence' },
      'hors-sujet': { label: 'Hors-sujet',  cls: 'mod-cat-horssujet' },
      'autre':      { label: 'Autre',       cls: 'mod-cat-autre' },
    };
    const info = map[cat] || { label: cat || '—', cls: 'mod-cat-autre' };
    return `<span class="mod-cat-badge ${info.cls}">${esc(info.label)}</span>`;
  }

  function sourceBadge(src) {
    const map = {
      'claude':       { label: 'Claude',    cls: 'mod-src-claude' },
      'local-flood':  { label: 'Flood',     cls: 'mod-src-local' },
      'local-url':    { label: 'URLs',      cls: 'mod-src-local' },
      'fallback':     { label: 'Fallback',  cls: 'mod-src-fallback' },
    };
    const info = map[src] || { label: src || '—', cls: 'mod-src-fallback' };
    return `<span class="mod-src-badge ${info.cls}">${esc(info.label)}</span>`;
  }

  let _filter = 'all';   // 'all' | 'blocked' | 'allowed'

  async function loadStats(sb) {
    if (!sb) return null;
    // Aggrégations simples côté client (PostgREST count + filter)
    async function count(filter = '') {
      const u = '/rest/v1/moderation_log?select=id' + (filter ? '&' + filter : '');
      const r = await sb
        .from('moderation_log')
        .select('id', { count: 'exact', head: true, ...(filter ? {} : {}) });
      return r.count ?? 0;
    }
    // Plus simple : on lit les colonnes nécessaires en 1 fois
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const week      = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [all24h, blocked24h, blocked7d, allTime, blockedAllTime] = await Promise.all([
      sb.from('moderation_log').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
      sb.from('moderation_log').select('id', { count: 'exact', head: true }).gte('created_at', yesterday).eq('allowed', false),
      sb.from('moderation_log').select('id', { count: 'exact', head: true }).gte('created_at', week).eq('allowed', false),
      sb.from('moderation_log').select('id', { count: 'exact', head: true }),
      sb.from('moderation_log').select('id', { count: 'exact', head: true }).eq('allowed', false),
    ]);
    return {
      messages24h:      all24h.count ?? 0,
      blocked24h:       blocked24h.count ?? 0,
      blocked7d:        blocked7d.count ?? 0,
      messagesAllTime:  allTime.count ?? 0,
      blockedAllTime:   blockedAllTime.count ?? 0,
    };
  }

  async function loadEntries(sb, filter) {
    let q = sb.from('moderation_log').select('*').order('created_at', { ascending: false }).limit(PAGE_SIZE);
    if (filter === 'blocked') q = q.eq('allowed', false);
    if (filter === 'allowed') q = q.eq('allowed', true);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  }

  function renderStats(stats) {
    if (!stats) {
      return '<div class="mod-stats-empty">Statistiques indisponibles.</div>';
    }
    const pct24h = stats.messages24h > 0
      ? Math.round((stats.blocked24h / stats.messages24h) * 100)
      : 0;
    return `
      <div class="mod-stats-grid">
        <div class="mod-stat-card">
          <div class="mod-stat-val">${stats.messages24h}</div>
          <div class="mod-stat-lbl">Messages 24 h</div>
        </div>
        <div class="mod-stat-card mod-stat-blocked">
          <div class="mod-stat-val">${stats.blocked24h}</div>
          <div class="mod-stat-lbl">Bloqués 24 h <span class="mod-stat-sub">(${pct24h} %)</span></div>
        </div>
        <div class="mod-stat-card">
          <div class="mod-stat-val">${stats.blocked7d}</div>
          <div class="mod-stat-lbl">Bloqués 7 j</div>
        </div>
        <div class="mod-stat-card">
          <div class="mod-stat-val">${stats.blockedAllTime}</div>
          <div class="mod-stat-lbl">Bloqués total <span class="mod-stat-sub">/ ${stats.messagesAllTime}</span></div>
        </div>
      </div>
    `;
  }

  function renderEntries(entries) {
    if (!entries.length) {
      return `<div class="mod-empty">Aucun message dans cette catégorie.</div>`;
    }
    return entries.map(e => `
      <div class="mod-entry ${e.allowed ? 'mod-entry-ok' : 'mod-entry-blocked'}">
        <div class="mod-entry-head">
          <span class="mod-entry-user"><i class="fa-solid fa-user"></i> ${esc(e.user_name || 'anonyme')}</span>
          ${categoryBadge(e.category)}
          ${sourceBadge(e.source)}
          <span class="mod-entry-time" title="${esc(fmtDate(e.created_at))}">${esc(relativeTime(e.created_at))}</span>
        </div>
        <div class="mod-entry-message">${esc(e.message)}</div>
        ${e.reason ? `<div class="mod-entry-reason"><i class="fa-solid fa-circle-info"></i> ${esc(e.reason)}</div>` : ''}
        ${e.office_id ? `<div class="mod-entry-office">Office : ${esc(e.office_id)}</div>` : ''}
      </div>
    `).join('');
  }

  async function loadAdminPanel() {
    const body = $id('admin-body');
    const user = window._pelUser;
    const sb   = window._sbClient;
    if (!body) return;
    if (!isAdmin(user)) {
      body.innerHTML = `<div class="mod-empty">Accès réservé aux administrateurs.</div>`;
      return;
    }
    body.innerHTML = `
      <div class="mod-loading"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</div>
    `;

    const [stats, entries] = await Promise.all([
      loadStats(sb).catch(() => null),
      loadEntries(sb, _filter).catch(() => []),
    ]);

    body.innerHTML = `
      <div class="mod-hero">
        <div class="mod-hero-title">Journal de modération</div>
        <div class="mod-hero-sub">Décisions du bot — table moderation_log</div>
      </div>
      ${renderStats(stats)}
      <div class="mod-filters">
        <button class="mod-filter ${_filter === 'all' ? 'active' : ''}" data-filter="all">Tout</button>
        <button class="mod-filter ${_filter === 'blocked' ? 'active' : ''}" data-filter="blocked">Bloqués</button>
        <button class="mod-filter ${_filter === 'allowed' ? 'active' : ''}" data-filter="allowed">Autorisés</button>
        <button class="mod-refresh" id="mod-refresh" title="Rafraîchir"><i class="fa-solid fa-rotate"></i></button>
      </div>
      <div class="mod-entries">${renderEntries(entries)}</div>
    `;
    // Filtres
    body.querySelectorAll('.mod-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        _filter = btn.dataset.filter;
        loadAdminPanel();
      });
    });
    body.querySelector('#mod-refresh')?.addEventListener('click', loadAdminPanel);
  }

  function openAdminPanel() {
    const panel   = $id('admin-panel');
    const overlay = $id('admin-overlay');
    if (!panel) return;
    $id('hamburger-menu')?.classList.add('hidden');
    $id('hamburger-overlay')?.classList.remove('show');
    loadAdminPanel();
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    overlay?.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeAdminPanel() {
    $id('admin-panel')?.classList.remove('open');
    $id('admin-panel')?.setAttribute('aria-hidden', 'true');
    $id('admin-overlay')?.classList.remove('show');
    document.body.style.overflow = '';
  }

  function showAdminButtonIfAdmin() {
    const user = window._pelUser;
    if (!isAdmin(user)) {
      $id('hm-admin-row')?.classList.add('hidden');
      $id('hm-admin-divider')?.classList.add('hidden');
      return;
    }
    // Injecte un item "Modération" dans le menu hamburger si absent
    const menu = $id('hamburger-menu');
    if (!menu) return;
    if ($id('hm-admin-row')) return; // déjà présent
    const row = document.createElement('div');
    row.id = 'hm-admin-row';
    row.className = 'hm-item';
    row.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Modération`;
    row.addEventListener('click', () => {
      menu.classList.add('hidden');
      $id('hamburger-overlay')?.classList.remove('show');
      openAdminPanel();
    });
    // Insère en haut du menu (juste après l'éventuel profil)
    const profileRow = $id('hm-profile-row');
    if (profileRow) profileRow.after(row);
    else menu.prepend(row);
  }

  // Init listeners DOM
  document.addEventListener('DOMContentLoaded', () => {
    $id('admin-close')?.addEventListener('click', closeAdminPanel);
    $id('admin-overlay')?.addEventListener('click', closeAdminPanel);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAdminPanel();
    });
  });

  // Mise à jour à chaque changement d'auth (le flag is_admin peut avoir changé)
  document.addEventListener('pel:authchange', () => showAdminButtonIfAdmin());
  // Au cas où l'event passe avant cet IIFE, on tente aussi au prochain tick
  setTimeout(showAdminButtonIfAdmin, 600);

  // Exposition globale (utile pour debug)
  window._pelAdmin = { open: openAdminPanel, close: closeAdminPanel, reload: loadAdminPanel };
})();
