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

  // ── Présence live (abonnement à la chaîne site_presence) ────────────
  let _presenceChannelAdmin = null;
  function _startPresenceLiveUpdate() {
    const sb = window._sbClient;
    if (!sb) return;
    if (_presenceChannelAdmin) return; // déjà abonné
    // Clé unique pour l'admin (pour ne pas dédoublonner avec sa propre présence)
    const adminKey = (window._pelUser?.id || 'admin') + '-monitor-' + Math.random().toString(36).slice(2, 8);
    _presenceChannelAdmin = sb.channel('site_presence', {
      config: { presence: { key: adminKey } },
    });
    _presenceChannelAdmin.on('presence', { event: 'sync' }, _updatePresenceCard);
    _presenceChannelAdmin.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      // Track avec un marqueur "monitor" pour ne pas être compté dans la liste
      await _presenceChannelAdmin.track({ _monitor: true });
      _updatePresenceCard(); // initial render
    });
  }
  function _stopPresenceLiveUpdate() {
    const sb = window._sbClient;
    if (_presenceChannelAdmin && sb) {
      try { sb.removeChannel(_presenceChannelAdmin); } catch (_) {}
    }
    _presenceChannelAdmin = null;
  }

  function _updatePresenceCard() {
    if (!_presenceChannelAdmin) return;
    const state = _presenceChannelAdmin.presenceState() || {};
    // Aplatit : { key1: [{...}, ...], key2: [...] } → liste de {key, ...meta}
    const entries = [];
    for (const key of Object.keys(state)) {
      const arr = state[key] || [];
      for (const meta of arr) {
        if (meta?._monitor) continue; // exclut les admins en mode monitoring
        entries.push({ key, ...meta });
      }
    }
    // Dédoublonne par key (un user peut avoir plusieurs onglets → on garde le 1er)
    const dedup = new Map();
    for (const e of entries) {
      if (!dedup.has(e.key)) dedup.set(e.key, e);
    }
    const list = Array.from(dedup.values());
    const logged = list.filter(e => !e.isAnon);
    const anon   = list.filter(e => e.isAnon);

    const $ = id => document.getElementById(id);
    if ($('adm-pres-total'))  $('adm-pres-total').textContent  = list.length;
    if ($('adm-pres-logged')) $('adm-pres-logged').textContent = logged.length;
    if ($('adm-pres-anon'))   $('adm-pres-anon').textContent   = anon.length;
    const listEl = $('adm-presence-list');
    if (!listEl) return;
    if (logged.length === 0) {
      listEl.innerHTML = `<div class="adm-presence-empty">Aucun utilisateur connecté actuellement.</div>`;
      return;
    }
    listEl.innerHTML = `
      <div class="adm-presence-sublabel">${logged.length} utilisateur${logged.length > 1 ? 's' : ''} connecté${logged.length > 1 ? 's' : ''} :</div>
      <div class="adm-presence-grid">
        ${logged.map(u => {
          const avatar = document.createElement('span');
          avatar.className = 'adm-pres-avatar';
          if (window.pelRenderAvatar) {
            window.pelRenderAvatar(avatar, {
              icon:    u.avatar_icon,
              palette: u.avatar_palette,
              name:    u.name,
            });
          } else {
            avatar.textContent = (u.name || '?').charAt(0).toUpperCase();
          }
          const since = u.joined_at
            ? new Date(u.joined_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : '';
          return `<div class="adm-pres-user" title="${esc(u.email || '')}">
            <span class="adm-pres-avatar-wrap">${avatar.outerHTML}</span>
            <div class="adm-pres-info">
              <div class="adm-pres-name">${esc(u.name || 'Anonyme')}</div>
              <div class="adm-pres-since">depuis ${esc(since)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }
  let _adminTab = 'mod'; // 'mod' | 'planning'
  let _planningDate = new Date();  // date affichée dans l'onglet Planning

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

  // === ONGLET PLANNING =====================================
  function dateISO(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function isoToDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function fmtDayLong(d) {
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function shiftDate(d, days) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  }

  const OFFICE_TYPES = [
    { id: 'laudes',   label: 'Laudes' },
    { id: 'matin',    label: 'Prière du matin' },
    { id: 'messe',    label: 'Sainte Messe' },
    { id: 'chapelet', label: 'Chapelet' },
    { id: 'vepres',   label: 'Vêpres' },
    { id: 'soiree',   label: 'Prière du soir' },
    { id: 'complies', label: 'Complies' },
  ];

  const SOURCE_CODES = [
    { id: 'rm',  label: 'Radio Maria' },
    { id: 'nd',  label: 'RCF Notre-Dame' },
    { id: 'kto', label: 'KTO' },
    { id: 'lou', label: 'Lourdes' },
    { id: 'esp', label: 'Radio Espérance' },
    { id: 'fid', label: 'Radio Fidélité' },
    { id: 'rcf', label: 'RCF' },
    { id: 'van', label: 'Vatican News' },
    { id: 'ndp', label: 'Notre-Dame de Paris' },
    { id: 'ars', label: 'Ars' },
  ];

  // Renvoie le planning effectif pour une date donnée (base + overrides appliqués)
  function effectiveSchedule(date) {
    if (typeof window.getDaySchedule === 'function') {
      try { return window.getDaySchedule(date); } catch (_) {}
    }
    return [];
  }

  // Charge les overrides actifs pour la date donnée
  async function loadOverridesForDate(sb, iso) {
    const { data } = await sb.from('schedule_overrides')
      .select('*')
      .lte('date_start', iso)
      .gte('date_end', iso)
      .eq('enabled', true)
      .order('created_at', { ascending: false });
    return data || [];
  }

  function esc2(s) { return esc(s); }

  function renderPlanning(date, slots, overrides) {
    const iso = dateISO(date);
    const todayISO = dateISO(new Date());
    const isToday = (iso === todayISO);

    // Liste tous les offices (entries aplaties)
    const items = [];
    for (const slot of slots) {
      for (const e of slot.entries) {
        items.push({
          officeId: slot.type + '_' + e.t.replace(':', ''),
          type:     slot.type,
          label:    slot.label,
          time:     e.t,
          tl:       e.tl,
          duration: e.dur || 30,
          sources:  e.srcs || [],
          desc:     slot.desc || '',
        });
      }
    }
    // Tri chronologique
    items.sort((a, b) => {
      const am = a.time.split(':').reduce((acc, v, i) => acc + (+v) * (i === 0 ? 60 : 1), 0);
      const bm = b.time.split(':').reduce((acc, v, i) => acc + (+v) * (i === 0 ? 60 : 1), 0);
      return am - bm;
    });

    // Mémorise quels offices sont issus d'un override
    const overrideIds = new Map();
    overrides.forEach(o => {
      if (o.action === 'add') {
        const id = (o.type || '') + '_' + (o.time || '').replace(':', '');
        overrideIds.set(id, o);
      }
    });

    const rowsHtml = items.length === 0
      ? `<div class="mod-empty">Aucun office prévu ce jour-là (ou tout a été désactivé).</div>`
      : items.map(it => {
        const ov = overrideIds.get(it.officeId);
        const isAdded = !!ov;
        const srcLabels = it.sources.map(s => {
          const found = SOURCE_CODES.find(x => x.id === s);
          return found ? found.label : s;
        }).join(' · ');
        return `
          <div class="adm-office-row" data-office-id="${esc(it.officeId)}" data-label="${esc(it.label)}">
            <div class="adm-office-time">${esc(it.tl)}<span class="adm-office-dur">${it.duration} min</span></div>
            <div class="adm-office-main">
              <div class="adm-office-label">
                ${isAdded ? '<span class="adm-office-badge adm-badge-added">Ajouté</span>' : ''}
                ${esc(it.label)}
              </div>
              ${srcLabels ? `<div class="adm-office-sources">${esc(srcLabels)}</div>` : ''}
            </div>
            <div class="adm-office-actions">
              ${isAdded
                ? `<button class="adm-btn-icon adm-btn-restore" data-override-id="${esc(ov.id)}" title="Supprimer cet ajout">
                     <i class="fa-solid fa-trash"></i>
                   </button>`
                : `<button class="adm-btn-icon adm-btn-disable" title="Désactiver pour ce jour">
                     <i class="fa-solid fa-ban"></i>
                   </button>`
              }
            </div>
          </div>
        `;
      }).join('');

    // Overrides "disable" : la liste des offices désactivés pour info
    const disabledOverrides = overrides.filter(o => o.action === 'disable');
    const disabledHtml = disabledOverrides.length === 0 ? '' : `
      <div class="adm-disabled-section">
        <div class="adm-disabled-label"><i class="fa-solid fa-ban"></i> Offices désactivés ce jour (${disabledOverrides.length})</div>
        ${disabledOverrides.map(o => `
          <div class="adm-disabled-row" data-override-id="${esc(o.id)}">
            <span class="adm-disabled-info">${esc(o.target_office_id || '—')}${o.notes ? ` — ${esc(o.notes)}` : ''}</span>
            <button class="adm-btn-mini adm-btn-restore">Réactiver</button>
          </div>
        `).join('')}
      </div>
    `;

    return `
      <div class="adm-planning">
        <div class="adm-planning-nav">
          <button class="adm-nav-btn" id="adm-prev-day"><i class="fa-solid fa-chevron-left"></i></button>
          <div class="adm-planning-date">
            <div class="adm-planning-day">${esc(fmtDayLong(date))}</div>
            ${isToday ? '<span class="adm-planning-today">Aujourd\'hui</span>' : ''}
          </div>
          <button class="adm-nav-btn" id="adm-next-day"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <input type="date" class="adm-planning-date-input" id="adm-date-input" value="${iso}">
        <div class="adm-planning-actions">
          <button class="adm-add-btn" id="adm-add-office">
            <i class="fa-solid fa-plus"></i> Ajouter un office ce jour
          </button>
        </div>
        ${disabledHtml}
        <div class="adm-office-list">
          ${rowsHtml}
        </div>
        <div class="adm-planning-hint">
          <i class="fa-solid fa-info-circle"></i>
          Les changements ne touchent que les jours sélectionnés. La grille « normale » reste intacte.
        </div>
      </div>
    `;
  }

  function renderAddOfficeForm(date) {
    const iso = dateISO(date);
    return `
      <div class="adm-modal-backdrop" id="adm-modal-backdrop">
        <div class="adm-modal">
          <div class="adm-modal-head">
            <h3>Ajouter un office</h3>
            <button class="profile-close" id="adm-modal-close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="adm-modal-body">
            <div class="adm-field">
              <label>Type</label>
              <select id="adm-new-type">
                ${OFFICE_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="adm-field">
              <label>Intitulé affiché</label>
              <input type="text" id="adm-new-label" placeholder="Ex. Messe d'été à Cotignac" maxlength="80">
            </div>
            <div class="adm-field-row">
              <div class="adm-field">
                <label>Heure (HH:MM)</label>
                <input type="time" id="adm-new-time" value="10:00">
              </div>
              <div class="adm-field">
                <label>Durée (min)</label>
                <input type="number" id="adm-new-duration" min="5" max="240" step="5" value="45">
              </div>
            </div>
            <div class="adm-field">
              <label>Sources radio</label>
              <div class="adm-checkboxes">
                ${SOURCE_CODES.map(s => `
                  <label class="adm-check">
                    <input type="checkbox" name="src" value="${s.id}">
                    <span>${s.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="adm-field-row">
              <div class="adm-field">
                <label>Date de début</label>
                <input type="date" id="adm-new-date-start" value="${iso}">
              </div>
              <div class="adm-field">
                <label>Date de fin</label>
                <input type="date" id="adm-new-date-end" value="${iso}">
              </div>
            </div>
            <div class="adm-field">
              <label>Note (mémo perso, optionnel)</label>
              <input type="text" id="adm-new-notes" placeholder="Ex. Vacances été 2026" maxlength="120">
            </div>
            <div class="adm-modal-feedback" id="adm-modal-feedback"></div>
          </div>
          <div class="adm-modal-foot">
            <button class="adm-btn-secondary" id="adm-modal-cancel">Annuler</button>
            <button class="adm-btn-primary" id="adm-modal-save"><i class="fa-solid fa-check"></i> Enregistrer</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderDisableForm(officeRow, date) {
    const iso = dateISO(date);
    return `
      <div class="adm-modal-backdrop" id="adm-modal-backdrop">
        <div class="adm-modal">
          <div class="adm-modal-head">
            <h3>Désactiver un office</h3>
            <button class="profile-close" id="adm-modal-close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="adm-modal-body">
            <div class="adm-modal-info">
              <strong>Office :</strong> ${esc(officeRow.dataset.label || '')}<br>
              <span class="adm-modal-info-id">ID : ${esc(officeRow.dataset.officeId)}</span>
            </div>
            <div class="adm-field-row">
              <div class="adm-field">
                <label>Désactiver du</label>
                <input type="date" id="adm-disable-date-start" value="${iso}">
              </div>
              <div class="adm-field">
                <label>au</label>
                <input type="date" id="adm-disable-date-end" value="${iso}">
              </div>
            </div>
            <div class="adm-field">
              <label>Note (raison)</label>
              <input type="text" id="adm-disable-notes" placeholder="Ex. Pas de messe en août" maxlength="120">
            </div>
            <div class="adm-modal-feedback" id="adm-modal-feedback"></div>
          </div>
          <div class="adm-modal-foot">
            <button class="adm-btn-secondary" id="adm-modal-cancel">Annuler</button>
            <button class="adm-btn-primary" id="adm-modal-save"><i class="fa-solid fa-check"></i> Désactiver</button>
          </div>
        </div>
      </div>
    `;
  }

  async function showModal(htmlBuilder, onSave) {
    const existing = document.getElementById('adm-modal-backdrop');
    if (existing) existing.remove();
    const body = $id('admin-body');
    body.insertAdjacentHTML('beforeend', htmlBuilder);
    const backdrop = $id('adm-modal-backdrop');
    backdrop.querySelector('#adm-modal-close')?.addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('#adm-modal-cancel')?.addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('#adm-modal-save')?.addEventListener('click', async () => {
      const ok = await onSave(backdrop);
      if (ok) backdrop.remove();
    });
  }

  async function saveOverride(payload) {
    const sb = window._sbClient;
    if (!sb) return { ok: false, error: 'Pas de client Supabase' };
    const { error } = await sb.from('schedule_overrides').insert(payload).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function deleteOverride(id) {
    const sb = window._sbClient;
    if (!sb) return false;
    const { error } = await sb.from('schedule_overrides').delete().eq('id', id);
    return !error;
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

    // Tabs
    const tabsHtml = `
      <div class="adm-tabs">
        <button class="adm-tab ${_adminTab === 'mod' ? 'active' : ''}" data-tab="mod">
          <i class="fa-solid fa-shield-halved"></i> Modération
        </button>
        <button class="adm-tab ${_adminTab === 'planning' ? 'active' : ''}" data-tab="planning">
          <i class="fa-solid fa-calendar-days"></i> Planning
        </button>
      </div>
    `;

    if (_adminTab === 'mod') {
      body.innerHTML = tabsHtml + `<div class="mod-loading"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</div>`;
      const [stats, entries] = await Promise.all([
        loadStats(sb).catch(() => null),
        loadEntries(sb, _filter).catch(() => []),
      ]);
      body.innerHTML = tabsHtml + `
        <div class="mod-hero">
          <div class="mod-hero-title">Journal de modération</div>
          <div class="mod-hero-sub">Décisions du bot — table moderation_log</div>
        </div>
        <div id="adm-presence-card" class="adm-presence-card">
          <div class="adm-presence-header">
            <i class="fa-solid fa-tower-broadcast adm-presence-icon"></i>
            <div class="adm-presence-title">
              <span class="adm-presence-pulse"></span>
              En direct sur le site
            </div>
          </div>
          <div class="adm-presence-stats">
            <div class="adm-pres-stat">
              <div class="adm-pres-val" id="adm-pres-total">—</div>
              <div class="adm-pres-lbl">Total connectés</div>
            </div>
            <div class="adm-pres-stat">
              <div class="adm-pres-val" id="adm-pres-logged">—</div>
              <div class="adm-pres-lbl">Avec compte</div>
            </div>
            <div class="adm-pres-stat">
              <div class="adm-pres-val" id="adm-pres-anon">—</div>
              <div class="adm-pres-lbl">Visiteurs anonymes</div>
            </div>
          </div>
          <div class="adm-presence-list" id="adm-presence-list"></div>
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
      body.querySelectorAll('.mod-filter').forEach(btn => {
        btn.addEventListener('click', () => { _filter = btn.dataset.filter; loadAdminPanel(); });
      });
      body.querySelector('#mod-refresh')?.addEventListener('click', loadAdminPanel);
      // Live presence — abonnement Realtime à chaque (ré)ouverture du panneau
      _startPresenceLiveUpdate();
    } else {
      // Arrête le suivi presence quand on quitte l'onglet
      _stopPresenceLiveUpdate();
      // Onglet Planning
      body.innerHTML = tabsHtml + `<div class="mod-loading"><i class="fa-solid fa-spinner fa-spin"></i> Chargement du planning…</div>`;
      // Recharge les overrides à chaque affichage
      if (typeof window._pelReloadScheduleOverrides === 'function') {
        await window._pelReloadScheduleOverrides();
      }
      const iso = dateISO(_planningDate);
      const [slots, overrides] = await Promise.all([
        Promise.resolve(effectiveSchedule(_planningDate)),
        loadOverridesForDate(sb, iso).catch(() => []),
      ]);
      body.innerHTML = tabsHtml + renderPlanning(_planningDate, slots, overrides);

      // Navigation par jour
      body.querySelector('#adm-prev-day')?.addEventListener('click', () => { _planningDate = shiftDate(_planningDate, -1); loadAdminPanel(); });
      body.querySelector('#adm-next-day')?.addEventListener('click', () => { _planningDate = shiftDate(_planningDate, 1); loadAdminPanel(); });
      body.querySelector('#adm-date-input')?.addEventListener('change', e => {
        if (!e.target.value) return;
        _planningDate = isoToDate(e.target.value);
        loadAdminPanel();
      });

      // Bouton "Ajouter un office"
      body.querySelector('#adm-add-office')?.addEventListener('click', () => {
        showModal(renderAddOfficeForm(_planningDate), async (modal) => {
          const fb = modal.querySelector('#adm-modal-feedback');
          const type     = modal.querySelector('#adm-new-type')?.value;
          const label    = modal.querySelector('#adm-new-label')?.value.trim() || (OFFICE_TYPES.find(t => t.id === type)?.label || '');
          const time     = modal.querySelector('#adm-new-time')?.value;
          const duration = parseInt(modal.querySelector('#adm-new-duration')?.value, 10) || 30;
          const ds       = modal.querySelector('#adm-new-date-start')?.value;
          const de       = modal.querySelector('#adm-new-date-end')?.value || ds;
          const notes    = modal.querySelector('#adm-new-notes')?.value.trim() || null;
          const sources  = Array.from(modal.querySelectorAll('input[name="src"]:checked')).map(i => i.value);
          if (!type || !time || !ds) {
            if (fb) fb.textContent = 'Veuillez remplir type, heure et date de début.';
            return false;
          }
          const result = await saveOverride({
            date_start: ds, date_end: de,
            action: 'add',
            type, label, time, duration,
            sources: sources.length ? sources : null,
            notes,
            created_by: window._pelUser?.id || null,
          });
          if (!result.ok) {
            if (fb) fb.textContent = 'Erreur : ' + result.error;
            return false;
          }
          // Force le rechargement des overrides côté app
          if (typeof window._pelReloadScheduleOverrides === 'function') {
            await window._pelReloadScheduleOverrides();
          }
          loadAdminPanel();
          return true;
        });
      });

      // Boutons "Désactiver"
      body.querySelectorAll('.adm-btn-disable').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.adm-office-row');
          if (!row) return;
          showModal(renderDisableForm(row, _planningDate), async (modal) => {
            const fb = modal.querySelector('#adm-modal-feedback');
            const ds = modal.querySelector('#adm-disable-date-start')?.value;
            const de = modal.querySelector('#adm-disable-date-end')?.value || ds;
            const notes = modal.querySelector('#adm-disable-notes')?.value.trim() || null;
            if (!ds) {
              if (fb) fb.textContent = 'Veuillez choisir une date.';
              return false;
            }
            const result = await saveOverride({
              date_start: ds, date_end: de,
              action: 'disable',
              target_office_id: row.dataset.officeId,
              notes,
              created_by: window._pelUser?.id || null,
            });
            if (!result.ok) {
              if (fb) fb.textContent = 'Erreur : ' + result.error;
              return false;
            }
            if (typeof window._pelReloadScheduleOverrides === 'function') {
              await window._pelReloadScheduleOverrides();
            }
            loadAdminPanel();
            return true;
          });
        });
      });

      // Boutons "Restaurer" (suppression d'override)
      body.querySelectorAll('.adm-btn-restore').forEach(btn => {
        btn.addEventListener('click', async () => {
          const target = btn.closest('[data-override-id]');
          if (!target) return;
          if (!confirm('Supprimer cette modification du planning ?')) return;
          const ok = await deleteOverride(target.dataset.overrideId);
          if (ok) {
            if (typeof window._pelReloadScheduleOverrides === 'function') {
              await window._pelReloadScheduleOverrides();
            }
            loadAdminPanel();
          } else {
            alert('Erreur lors de la suppression.');
          }
        });
      });
    }

    // Tabs : binding
    body.querySelectorAll('.adm-tab').forEach(t => {
      t.addEventListener('click', () => {
        _adminTab = t.dataset.tab;
        loadAdminPanel();
      });
    });
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
    _stopPresenceLiveUpdate();   // libère le channel websocket
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
