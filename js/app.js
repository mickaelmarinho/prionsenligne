/* ═══════════════════════════════════════════════
   PRIONSENLIGNE — app.js
   Navigation, filtres prières, bréviaire AELF, calendrier, lecteur radio
═══════════════════════════════════════════════ */

'use strict';

/* ────────────────────────────────────────────
   1. NAVIGATION ONGLETS
──────────────────────────────────────────────*/
function initTabs() {
  const navTabs  = document.querySelectorAll('.nav-tab');
  const bnTabs   = document.querySelectorAll('.bn[data-tab]');
  const sections = document.querySelectorAll('.tab-section');

  function activateTab(tabId) {
    sections.forEach(s => s.classList.remove('active'));
    navTabs.forEach(b => b.classList.remove('active'));
    bnTabs.forEach(b => b.classList.remove('active'));

    const section = document.getElementById('tab-' + tabId);
    if (section) section.classList.add('active');

    navTabs.forEach(b => { if (b.dataset.tab === tabId) b.classList.add('active'); });
    bnTabs.forEach(b => { if (b.dataset.tab === tabId) b.classList.add('active'); });
  }

  navTabs.forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
  bnTabs.forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

  document.querySelectorAll('.footer-nav-link[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.tab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}


/* ────────────────────────────────────────────
   2. FILTRES PRIÈRES (vue Aujourd'hui)
   Les items étant générés dynamiquement par initTodayTimeline(),
   on re-requête le DOM à chaque clic plutôt que de capturer la NodeList à l'init.
──────────────────────────────────────────────*/
function initFilters() {
  // Sélection multiple : chaque filtre se toggle indépendamment.
  // Un Set vide = « Tout » affiché.
  // #7 — Le choix est mémorisé (localStorage) pour que « Aujourd'hui »
  // n'affiche que les offices favoris les jours suivants, sans recommencer.
  const STORE_KEY = 'pel_office_filters';
  const active = new Set();

  // Restaure la sélection sauvegardée
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(saved)) saved.forEach(t => t && active.add(t));
  } catch (_) {}

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...active])); } catch (_) {}
  }

  // ── #4 — Synchronisation au compte (multi-appareils) ──
  // Le localStorage reste la source immédiate ; quand l'utilisateur est
  // connecté, on lit/écrit aussi ses favoris dans Supabase. Dégradation
  // gracieuse : si la table n'existe pas encore (migration non lancée) ou si
  // l'appareil est hors-ligne, les erreurs sont ignorées et le local fait foi.
  function _sbCtx() {
    const sb = window._sbClient, user = window._pelUser;
    return (sb && user) ? { sb, user } : null;
  }
  async function persistRemote() {
    const ctx = _sbCtx();
    if (!ctx) return;
    try {
      await ctx.sb.from('user_preferences').upsert({
        user_id: ctx.user.id,
        office_filters: [...active],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } catch (_) {}
  }
  async function loadRemote() {
    const ctx = _sbCtx();
    if (!ctx) return;
    try {
      const { data, error } = await ctx.sb
        .from('user_preferences')
        .select('office_filters')
        .eq('user_id', ctx.user.id)
        .maybeSingle();
      if (error) return; // table absente / RLS / etc. → on garde le local
      if (data && Array.isArray(data.office_filters)) {
        // Le compte fait foi : applique ses favoris sur cet appareil.
        applyFilterSet(data.office_filters, { persistLocal: true });
      } else if (active.size > 0) {
        // Aucune préférence en base mais un choix local existe → 1ʳᵉ synchro.
        persistRemote();
      }
    } catch (_) {}
  }
  function applyFilterSet(arr, opts = {}) {
    active.clear();
    if (Array.isArray(arr)) arr.forEach(t => t && active.add(t));
    syncButtons();
    if (opts.persistLocal) persist();
    applyFilters();
  }

  function syncButtons() {
    const allBtn = document.querySelector('.pf[data-filter="all"]');
    document.querySelectorAll('.pf').forEach(b => {
      const t = b.dataset.filter;
      if (t === 'all') b.classList.toggle('active', active.size === 0);
      else b.classList.toggle('active', active.has(t));
    });
    if (allBtn) allBtn.classList.toggle('active', active.size === 0);
  }

  function syncHint() {
    const hint = document.getElementById('pf-saved-hint');
    if (hint) hint.hidden = active.size === 0;
  }

  function applyFilters() {
    const showAll = active.size === 0;
    document.querySelectorAll('.tl-item').forEach(item => {
      const show = showAll || active.has(item.dataset.type);
      item.style.display = show ? '' : 'none';
      if (show) item.style.animation = 'fadeIn .2s ease';
    });
    syncHint();
  }

  // Exposé pour ré-appliquer le filtre après (re)génération de la timeline,
  // qui peut survenir APRÈS initFilters (items injectés dynamiquement).
  window._pelApplyFilters = applyFilters;
  // Exposé pour l'onboarding des nouveaux inscrits : applique + persiste
  // (local et compte) un jeu de favoris choisi hors de ce module.
  window._pelSetOfficeFilters = arr => {
    applyFilterSet(arr, { persistLocal: true });
    persistRemote();
  };

  document.querySelectorAll('.pf').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.filter;

      if (type === 'all') {
        // Réinitialise tout → « Tout »
        active.clear();
      } else {
        if (active.has(type)) active.delete(type);
        else active.add(type);
      }

      syncButtons();
      persist();
      persistRemote();
      applyFilters();
    });
  });

  // Lien « Tout réafficher » de l'indice favoris
  document.getElementById('pf-saved-reset')?.addEventListener('click', () => {
    active.clear();
    syncButtons();
    persist();
    persistRemote();
    applyFilters();
  });

  // Synchronisation au compte : à chaque connexion, on récupère les favoris
  // enregistrés (et on pousse le choix local si la base est vide).
  document.addEventListener('pel:authchange', e => { if (e.detail?.user) loadRemote(); });
  // Session déjà restaurée avant l'init de ce module ?
  if (window._pelUser) loadRemote();

  // État initial (boutons + filtrage) selon la sélection restaurée
  syncButtons();
  applyFilters();
}


/* ────────────────────────────────────────────
   HELPER — Date en heure de Paris
──────────────────────────────────────────────*/
function getParisDate() {
  // Retourne toujours la date courante selon le fuseau Europe/Paris,
  // quel que soit le fuseau du navigateur de l'utilisateur.
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
}

/* ────────────────────────────────────────────
   3. DATE AUTOMATIQUE
──────────────────────────────────────────────*/
function initDate() {
  const now    = getParisDate();
  const days   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const label  = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  const el = document.getElementById('js-date');
  if (el) el.textContent = label;
  // Feast display handled by initCalendar() → renderCalendar()
  // Fallback : si le bandeau reste à « — » après 800 ms (pas de saint curated pour aujourd'hui),
  // on tente une enrichissement direct via Nominis (n'attend pas la nav vers l'onglet Mois).
  setTimeout(() => {
    const fe = document.getElementById('js-feast');
    if (!fe || (fe.textContent && fe.textContent !== '—')) return;
    fetch(`/api/nominis?day=${now.getDate()}&month=${now.getMonth() + 1}&year=${now.getFullYear()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.nom) return;
        const cur = document.getElementById('js-feast');
        if (cur && (!cur.textContent || cur.textContent === '—')) cur.textContent = d.nom;
      })
      .catch(() => {});
  }, 800);
}



/* ────────────────────────────────────────────
   4. CALENDRIER — clic sur un jour
──────────────────────────────────────────────*/
/* ────────────────────────────────────────────
   CALENDAR DATA — Saints & fêtes liturgiques 2026
   Structure : { 'YYYY-MM': { days: { [d]: { saint, type, desc, minor } } } }
   type : 'ordinaire' | 'memoire' | 'fete' | 'solennite'
   minor : saints secondaires du même jour (affiché dans le panneau détail)
──────────────────────────────────────────────*/
/* ────────────────────────────────────────────
   SAINTS FRANCOPHONES RÉGIONAUX — calendrier complémentaire
   Saints/fêtes fortement vénérés dans un pays francophone précis,
   non systématiquement mis en avant dans le calendrier romain général.
   Affichés sous la bio Nominis dans le panneau détail du calendrier.
   Format : { date: 'MM-DD', country: 'ca|be|ch|cm|ci|ht|...', name, desc }
──────────────────────────────────────────────*/
const REGIONAL_SAINTS = [
  // 🇨🇦 QUÉBEC / CANADA
  { date: '01-06', country: 'ca', name: 'Saint Frère André (Alfred Bessette)',
    desc: "Religieux montréalais canonisé en 2010, fondateur de l'Oratoire Saint-Joseph du Mont-Royal. Surnommé « le portier de Dieu », il est vénéré pour ses dons de guérison. Patron des aidants naturels au Québec." },
  { date: '04-17', country: 'ca', name: 'Bienheureuse Kateri Tekakwitha',
    desc: "Première sainte amérindienne (Mohawk-Algonquine, 1656-1680). Canonisée en 2012, surnommée « le lys des Mohawks ». Patronne de l'écologie et des Amérindiens." },
  { date: '07-26', country: 'ca', name: 'Sainte Anne, patronne du Canada',
    desc: "Mère de la Vierge Marie et patronne principale du Canada et du Québec. Le sanctuaire de Sainte-Anne-de-Beaupré, près de Québec, est le plus ancien pèlerinage d'Amérique du Nord (depuis 1658)." },
  { date: '10-19', country: 'ca', name: 'Saints Martyrs canadiens',
    desc: "Huit missionnaires jésuites — Jean de Brébeuf, Isaac Jogues, Gabriel Lalemant et leurs compagnons — martyrisés entre 1642 et 1649 chez les Hurons et les Iroquois. Canonisés en 1930." },

  // 🇧🇪 BELGIQUE
  { date: '01-15', country: 'be', name: 'Notre-Dame de Banneux',
    desc: "Apparitions mariales reconnues en 1933 à Mariette Beco, dans la province de Liège. La Vierge des Pauvres y est invoquée pour les malades et les souffrants." },
  { date: '05-10', country: 'be', name: 'Saint Damien de Veuster (Molokai)',
    desc: "Missionnaire belge (1840-1889), apôtre des lépreux de l'île de Molokai (Hawaï). Canonisé en 2009, choisi en 2005 comme « plus grand Belge de tous les temps »." },
  { date: '11-24', country: 'be', name: 'Bienheureux Albert de Louvain',
    desc: "Évêque de Liège assassiné en 1192 pour avoir défendu l'indépendance de son diocèse face à l'empereur. Béatifié au XVIIIe siècle." },
  { date: '11-29', country: 'be', name: 'Notre-Dame de Beauraing',
    desc: "Apparitions mariales reconnues en 1932-1933 à cinq enfants dans la province de Namur. La « Vierge au Cœur d'Or » est invoquée pour la conversion des pécheurs." },

  // 🇨🇭 SUISSE
  { date: '06-27', country: 'ch', name: 'Bienheureuse Marguerite Bays',
    desc: "Couturière vaudoise (1815-1879), Tertiaire franciscaine, stigmatisée. Canonisée en 2019, première sainte fribourgeoise des temps modernes." },
  { date: '09-22', country: 'ch', name: 'Saint Maurice et les martyrs d\'Agaune',
    desc: "Officier romain chrétien et toute sa légion (la « Légion Thébaine ») martyrisés vers 286 à Agaune (Saint-Maurice, Valais). L'abbaye fondée sur leur tombeau est la plus ancienne d'Occident encore en activité." },
  { date: '09-25', country: 'ch', name: 'Saint Nicolas de Flüe, patron de la Suisse',
    desc: "Ermite et mystique (1417-1487) qui œuvra pour l'unité de la Confédération suisse au Diet de Stans (1481). Canonisé en 1947, patron de la Suisse et symbole de réconciliation." },

  // 🌍 AFRIQUE FRANCOPHONE
  { date: '01-20', country: 'cm', name: 'Bienheureux Cyprien Iwene Tansi',
    desc: "Prêtre nigérian (1903-1964), trappiste, premier bienheureux d'Afrique noire moderne. Béatifié en 1998 par Jean-Paul II au Nigeria." },
  { date: '04-30', country: 'cm', name: 'Notre-Dame d\'Afrique',
    desc: "Patronne de l'Afrique du Nord. Sa basilique à Alger (1872) est un haut lieu de dialogue chrétien-musulman et un repère pour les chrétiens d'Afrique francophone." },
  { date: '06-03', country: 'cm', name: 'Saints Charles Lwanga et compagnons, martyrs de l\'Ouganda',
    desc: "Vingt-deux jeunes pages chrétiens (catholiques et anglicans) brûlés vifs en 1886 sur ordre du roi Mwanga II du Buganda. Canonisés en 1964, ils sont les premiers saints d'Afrique noire moderne." },
  { date: '08-12', country: 'cm', name: 'Bienheureux Isidore Bakanja',
    desc: "Jeune laïc congolais (vers 1885-1909), martyr du scapulaire du Carmel. Battu à mort pour avoir refusé d'abandonner sa foi. Béatifié en 1994." },

  // 🇨🇮 CÔTE D'IVOIRE
  { date: '12-08', country: 'ci', name: 'Notre-Dame de la Paix de Yamoussoukro',
    desc: "Basilique consacrée le 10 septembre 1990 par Jean-Paul II. Plus grande église catholique au monde, elle est dédiée à Notre-Dame de la Paix, célébrée à l'Immaculée Conception." },

  // 🇭🇹 HAÏTI
  { date: '06-27', country: 'ht', name: 'Notre-Dame du Perpétuel Secours, patronne d\'Haïti',
    desc: "Patronne principale d'Haïti depuis 1942. L'icône byzantine est l'objet d'une dévotion populaire intense, particulièrement après l'épidémie de variole de 1882 attribuée à son intercession." },
];

// Retourne tous les saints régionaux pour une date donnée (Date object).
function getRegionalSaintsForDate(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;
  return REGIONAL_SAINTS.filter(s => s.date === key);
}
window.getRegionalSaintsForDate = getRegionalSaintsForDate;

const CALENDAR_DATA = {
  '2026-01': { days: {
    1:  { saint: 'Sainte Marie, Mère de Dieu', type: 'solennite', desc: "Solennité mariale ouvrant l'année civile. Journée mondiale de la Paix.", minor: '' },
    2:  { saint: 'Saints Basile et Grégoire de Nazianze', type: 'memoire', desc: "Deux grands Pères de l'Église du IVe siècle, défenseurs de la foi trinitaire.", minor: '' },
    6:  { saint: 'Épiphanie du Seigneur', type: 'solennite', desc: "Manifestation du Christ aux nations représentées par les Mages d'Orient.", minor: '' },
    11: { saint: 'Baptême du Seigneur', type: 'fete', desc: "Jésus est baptisé par Jean dans le Jourdain. Le Père proclame : 'Celui-ci est mon Fils bien-aimé.'", minor: '' },
    17: { saint: 'Saint Antoine, abbé', type: 'memoire', desc: "Père du monachisme chrétien en Égypte au IIIe siècle. Patron des animaux.", minor: '' },
    20: { saint: 'Saint Sébastien', type: 'memoire', desc: "Officier romain martyrisé sous Dioclétien. Patron des soldats.", minor: 'St Fabien, pape' },
    21: { saint: 'Sainte Agnès', type: 'memoire', desc: "Jeune martyre romaine du IVe siècle, patronne des jeunes filles.", minor: '' },
    22: { saint: 'Saint Vincent', type: 'memoire', desc: "Diacre et martyr espagnol du IVe siècle. Patron des vignerons.", minor: '' },
    24: { saint: 'Saint François de Sales', type: 'memoire', desc: "Évêque de Genève et Docteur de l'Église. Fondateur de l'Ordre de la Visitation.", minor: '' },
    25: { saint: 'Conversion de saint Paul', type: 'fete', desc: "Sur le chemin de Damas, Saul est renversé et entend la voix du Christ ressuscité.", minor: '' },
    26: { saint: 'Saints Timothée et Tite', type: 'memoire', desc: "Disciples de saint Paul, premiers évêques d'Éphèse et de Crète.", minor: '' },
    28: { saint: 'Saint Thomas d\'Aquin', type: 'memoire', desc: "Dominicain du XIIIe siècle, Docteur de l'Église, prince de la scolastique.", minor: '' },
    31: { saint: 'Saint Jean Bosco', type: 'memoire', desc: "Prêtre turinois, fondateur des Salésiens. Patron des jeunes et des éducateurs.", minor: '' },
  }},
  '2026-02': { days: {
    2:  { saint: 'Présentation du Seigneur — Chandeleur', type: 'fete', desc: "Quarante jours après Noël, Jésus est présenté au Temple par Marie et Joseph.", minor: '' },
    3:  { saint: 'Saint Blaise', type: 'memoire', desc: "Évêque et martyr arménien. Patron des gorges malades.", minor: 'St Anschaire' },
    5:  { saint: 'Sainte Agathe', type: 'memoire', desc: "Vierge et martyre sicilienne du IIIe siècle. Patronne des infirmières.", minor: '' },
    6:  { saint: 'Saints Paul Miki et compagnons', type: 'memoire', desc: "26 martyrs crucifiés à Nagasaki en 1597, premiers martyrs d'Extrême-Orient.", minor: '' },
    8:  { saint: 'Sainte Joséphine Bakhita', type: 'memoire', desc: "Ancienne esclave soudanaise devenue religieuse canossienne.", minor: '' },
    10: { saint: 'Sainte Scholastique', type: 'memoire', desc: "Sœur de saint Benoît, fondatrice du monachisme féminin occidental.", minor: '' },
    11: { saint: 'Notre-Dame de Lourdes', type: 'memoire', desc: "Apparitions de l'Immaculée à Bernadette Soubirous (11 fév. 1858). Journée des malades.", minor: '' },
    14: { saint: 'Saints Cyrille et Méthode', type: 'fete', desc: "Frères évangélisateurs des Slaves, créateurs de l'alphabet cyrillique. Co-patrons de l'Europe.", minor: 'St Valentin' },
    17: { saint: 'Sept fondateurs des Servites de Marie', type: 'memoire', desc: "Sept marchands florentins qui fondèrent l'ordre des Servites au XIIIe siècle.", minor: '' },
    18: { saint: 'Mercredi des Cendres', type: 'fete', desc: "Début du Carême. Le prêtre impose des cendres : 'Souviens-toi que tu es poussière...'", minor: '' },
    22: { saint: 'Chaire de saint Pierre', type: 'fete', desc: "Fête du ministère pétrinien, fondement de l'unité de l'Église.", minor: '' },
    23: { saint: 'Saint Polycarpe', type: 'memoire', desc: "Évêque de Smyrne et martyr au IIe siècle, disciple de saint Jean.", minor: '' },
  }},
  '2026-03': { days: {
    1:  { saint: '2e dimanche de Carême', type: 'ordinaire', desc: 'Deuxième dimanche du Carême.', minor: 'St Aubin' },
    4:  { saint: 'Saint Casimir', type: 'memoire', desc: "Prince de Pologne et de Lituanie, mort à 25 ans. Patron de la Pologne et de la Lituanie.", minor: '' },
    7:  { saint: 'Saintes Félicité et Perpétue', type: 'memoire', desc: "Martyres à Carthage en 203. Leurs actes de martyre comptent parmi les plus anciens documents chrétiens.", minor: '' },
    8:  { saint: '3e dimanche de Carême', type: 'ordinaire', desc: 'Troisième dimanche du Carême.', minor: 'St Jean de Dieu' },
    9:  { saint: 'Sainte Françoise Romaine', type: 'memoire', desc: "Épouse, mère et religieuse du XVe siècle. Fondatrice des Oblates Bénédictines. Patronne des automobilistes.", minor: '' },
    15: { saint: '4e dimanche de Carême — Laetare', type: 'fete', desc: "Dimanche de la joie au cœur du Carême. La liturgie revêt la couleur rose.", minor: '' },
    17: { saint: 'Saint Patrick', type: 'memoire', desc: "Évangélisateur de l'Irlande au Ve siècle. Patron de l'Irlande.", minor: '' },
    18: { saint: 'Saint Cyrille de Jérusalem', type: 'memoire', desc: "Évêque de Jérusalem et Docteur de l'Église au IVe siècle.", minor: '' },
    19: { saint: 'Saint Joseph, époux de la Vierge Marie', type: 'solennite', desc: "Patron de l'Église universelle, des pères de famille, des travailleurs et de la Bonne Mort.", minor: '' },
    22: { saint: '5e dimanche de Carême', type: 'ordinaire', desc: 'Cinquième dimanche du Carême — dimanche de la Passion.', minor: 'Ste Léa' },
    23: { saint: 'Saint Turibio de Mogrovejo', type: 'memoire', desc: "Archevêque de Lima, évangélisateur des Amériques espagnoles au XVIe siècle.", minor: '' },
    25: { saint: 'Annonciation du Seigneur', type: 'solennite', desc: "L'archange Gabriel annonce à Marie qu'elle concevra le Fils de Dieu. Neuf mois avant Noël.", minor: '' },
    29: { saint: 'Dimanche des Rameaux et de la Passion', type: 'solennite', desc: "Entrée triomphale de Jésus à Jérusalem. Début de la Semaine Sainte.", minor: '' },
    30: { saint: 'Lundi Saint', type: 'ordinaire', desc: 'Semaine Sainte.', minor: '' },
    31: { saint: 'Mardi Saint', type: 'ordinaire', desc: 'Semaine Sainte.', minor: '' },
  }},
  '2026-04': { days: {
    1:  { saint: 'Mercredi Saint', type: 'ordinaire', desc: 'Semaine Sainte — dernier mercredi avant Pâques.', minor: 'Ste Valérie' },
    2:  { saint: 'Jeudi Saint — Cène du Seigneur', type: 'solennite', desc: "Jésus institue l'Eucharistie et le sacerdoce, lave les pieds de ses Apôtres. Début du Triduum Pascal.", minor: 'St François de Paule' },
    3:  { saint: 'Vendredi Saint — Passion du Seigneur', type: 'solennite', desc: "Le Christ est crucifié et meurt sur la Croix. Jour de jeûne et d'abstinence, le seul sans messe de l'année.", minor: 'Ste Agape' },
    4:  { saint: 'Samedi Saint — Vigile pascale', type: 'fete', desc: "Le grand silence du Samedi Saint. La Vigile pascale est la 'mère de toutes les veilles'.", minor: 'St Isidore de Séville' },
    5:  { saint: 'Pâques — Résurrection du Seigneur', type: 'solennite', desc: "'Il n'est pas ici, il est ressuscité !' La plus grande fête de l'Église catholique. Alléluia !", minor: '' },
    6:  { saint: 'Lundi de Pâques', type: 'solennite', desc: "Dans l'octave de Pâques, chaque jour est célébré comme Pâques lui-même.", minor: 'St Marcellin' },
    7:  { saint: 'Saint Jean-Baptiste de la Salle', type: 'memoire', desc: "Fondateur des Frères des Écoles Chrétiennes au XVIIe siècle. Patron des éducateurs.", minor: 'St Hermann Joseph' },
    8:  { saint: 'Saint Gautier de Pontoise', type: 'ordinaire', desc: "Abbé bénédictin du XIe siècle, fondateur du prieuré de Pontoise. Connu pour sa douceur et sa persévérance.", minor: 'Ste Maxime' },
    9:  { saint: 'Sainte Marie Clotilde', type: 'ordinaire', desc: "Reine des Francs (470-545), épouse de Clovis. Sa foi contribua à la conversion du roi et à la christianisation des Francs.", minor: 'St Hugues de Rouen' },
    10: { saint: 'Saint Fulbert de Chartres', type: 'ordinaire', desc: "Évêque de Chartres au XIe siècle, initiateur de la construction de la cathédrale. Grand théologien et musicien sacré.", minor: 'St Macaire' },
    11: { saint: 'Saint Stanislas', type: 'memoire', desc: "Évêque de Cracovie et martyr en 1079. Patron de la Pologne.", minor: 'St Gemme Galgani' },
    12: { saint: 'Dimanche de la Miséricorde Divine', type: 'fete', desc: "Instituée par Jean-Paul II. Jésus dit à sainte Faustine : 'Je veux que la fête de la Miséricorde soit le refuge de toutes les âmes.'", minor: 'St Jules Ier' },
    13: { saint: 'Saint Martin Ier', type: 'memoire', desc: "Pape et martyr du VIIe siècle, défenseur de la foi contre le monothélisme.", minor: 'Ste Ida' },
    14: { saint: 'Sainte Lidwine de Schiedam', type: 'ordinaire', desc: "Mystique néerlandaise du XVe siècle. Paralysée après une chute sur la glace à 15 ans, elle offrit ses souffrances pour les âmes.", minor: 'St Tiburce · Ste Valérie' },
    15: { saint: 'Sainte Anastasie', type: 'ordinaire', desc: "Martyre du IVe siècle, vénérée en Orient. Décapitée sous Dioclétien pour avoir refusé d'abjurer sa foi.", minor: 'Ste Paterne' },
    16: { saint: 'Sainte Bernadette Soubirous', type: 'ordinaire', desc: "Voyante de Lourdes (1844-1879), elle mourut ce jour dans sa cellule à Nevers. Sa dépouille repose incorruptible à Saint-Gildard.", minor: 'St Benoît-Joseph Labre' },
    17: { saint: 'Saint Anicet', type: 'ordinaire', desc: "Pape et martyr du IIe siècle, il gouverna l'Église vers 155-166.", minor: 'St Innocent · Ste Martine' },
    18: { saint: 'Saint Parfait', type: 'fete', desc: "Prêtre de Cordoue, martyrisé en 850 pour avoir refusé de renier sa foi.", minor: 'Ste Apollonie' },
    19: { saint: '3e dimanche de Pâques', type: 'ordinaire', desc: "Temps pascal. Le Christ ressuscité se révèle aux disciples sur le chemin d'Emmaüs.", minor: 'St Léon IX' },
    20: { saint: 'Sainte Odette', type: 'ordinaire', desc: "Vierge du IVe siècle, patronne des aveugles. Elle aurait recouvré la vue au baptême pour mieux contempler le Christ.", minor: 'St Marcellin de Paris' },
    21: { saint: 'Saint Anselme', type: 'memoire', desc: "Archevêque de Cantorbéry et Docteur de l'Église. Auteur de la preuve ontologique de l'existence de Dieu.", minor: 'St Conrad de Plaisance' },
    22: { saint: 'Saint Alexandre Ier', type: 'ordinaire', desc: "Pape et martyr au IIe siècle, il gouverna l'Église vers 107-115.", minor: 'St Léonide · Ste Opportune' },
    23: { saint: 'Saint Georges', type: 'fete', desc: "Martyr légendaire du IIIe siècle, patron de l'Angleterre, de la chevalerie et des soldats.", minor: 'St Adalbert de Prague' },
    24: { saint: 'Saint Fidèle de Sigmaringen', type: 'memoire', desc: "Premier martyr capucin, missionnaire en Suisse, tué en 1622.", minor: 'St Mellite' },
    25: { saint: 'Saint Marc, évangéliste', type: 'fete', desc: "Auteur du 2e Évangile, le plus bref. Compagnon de Pierre à Rome, premier évêque d'Alexandrie. Son symbole est le lion ailé.", minor: '' },
    26: { saint: '4e dimanche de Pâques — Bon Pasteur', type: 'fete', desc: "Dimanche du Bon Pasteur. Journée mondiale de prière pour les vocations sacerdotales et religieuses.", minor: 'St Clet · St Marcellin' },
    27: { saint: 'Sainte Zita', type: 'ordinaire', desc: "Servante lucquoise du XIIIe siècle, patronne des domestiques et des gens de maison. Modèle de charité discrète.", minor: 'St Pierre Canisius' },
    28: { saint: 'Saint Pierre Chanel', type: 'memoire', desc: "Prêtre mariste, premier martyr d'Océanie, tué aux îles Futuna en 1841.", minor: 'St Louis-Marie Grignion de Montfort' },
    29: { saint: 'Sainte Catherine de Sienne', type: 'fete', desc: "Docteure de l'Église, co-patronne de l'Europe. Mystique dominicaine qui reçut les stigmates et convainquit le pape de rentrer à Rome.", minor: 'St Robert Bellarmin' },
    30: { saint: 'Saint Pie V', type: 'memoire', desc: "Pape dominicain (1566-1572), promoteur du saint Rosaire et réformateur de la liturgie tridentine.", minor: 'Ste Marie de la Providence' },
  }},
  '2026-05': { days: {
    1:  { saint: 'Saint Joseph Travailleur', type: 'memoire', desc: "Mémoire de Joseph artisan. Promulguée par Pie XII en 1955.", minor: '' },
    2:  { saint: 'Saint Athanase', type: 'memoire', desc: "Évêque d'Alexandrie et Docteur de l'Église, surnommé 'Athanase contre le monde'.", minor: '' },
    3:  { saint: 'Saints Philippe et Jacques', type: 'fete', desc: "Deux des Douze Apôtres : Philippe de Bethsaïde et Jacques le Mineur, premier évêque de Jérusalem.", minor: '' },
    10: { saint: 'Saint Jean d\'Avila', type: 'memoire', desc: "Docteur de l'Église, maître spirituel espagnol du XVIe siècle.", minor: 'Ste Solange' },
    12: { saint: 'Saints Nérée et Achillée', type: 'memoire', desc: "Soldats romains martyrisés au Ier siècle pour avoir refusé de persécuter des chrétiens.", minor: 'St Pancrace' },
    13: { saint: 'Notre-Dame de Fatima', type: 'memoire', desc: "Apparitions de la Vierge aux trois pastoureaux de Fatima (1917). 'Priez le Rosaire chaque jour.'", minor: '' },
    14: { saint: 'Ascension du Seigneur', type: 'solennite', desc: "Quarante jours après la Résurrection, Jésus monte au ciel à la droite du Père.", minor: '' },
    15: { saint: 'Saint Isidore le Laboureur', type: 'memoire', desc: "Agriculteur madrilène du XIIe siècle, patron des paysans.", minor: 'St Matthias' },
    18: { saint: 'Saint Jean Ier', type: 'memoire', desc: "Pape martyr mort en 526 en captivité sous Théodoric le Grand.", minor: '' },
    19: { saint: 'Saint Yves', type: 'fete', desc: "Prêtre breton et juge, patron des avocats, de la Bretagne et des hommes de loi.", minor: '' },
    20: { saint: 'Saint Bernardin de Sienne', type: 'memoire', desc: "Franciscain du XVe siècle, grand prédicateur. Diffuseur de la dévotion au Nom de Jésus (IHS).", minor: '' },
    21: { saint: 'Saint Christophe Magallanes', type: 'memoire', desc: "Prêtre mexicain et ses compagnons, martyrs de la persécution cristero (1927).", minor: '' },
    22: { saint: 'Sainte Rita de Cascia', type: 'memoire', desc: "Veuve et religieuse du XVe siècle. Patronne des causes désespérées, elle reçut les stigmates.", minor: '' },
    24: { saint: 'Pentecôte', type: 'solennite', desc: "Cinquante jours après Pâques, l'Esprit Saint descend sur les Apôtres et Marie réunis dans le Cénacle. Naissance de l'Église.", minor: '' },
    25: { saint: 'Saint Bède le Vénérable', type: 'memoire', desc: "Moine bénédictin anglo-saxon, Docteur de l'Église, père de l'historiographie anglaise.", minor: 'St Grégoire VII · Ste Marie-Madeleine de Pazzi' },
    26: { saint: 'Saint Philippe Néri', type: 'memoire', desc: "Prêtre romain du XVIe siècle, fondateur de l'Oratoire, 'apôtre de Rome'.", minor: '' },
    27: { saint: 'Saint Augustin de Cantorbéry', type: 'memoire', desc: "Envoyé par Grégoire le Grand pour évangéliser l'Angleterre. Premier archevêque de Cantorbéry.", minor: '' },
    31: { saint: 'Visitation de la Vierge Marie', type: 'fete', desc: "Marie rend visite à sa cousine Élisabeth, enceinte de Jean-Baptiste.", minor: '' },
  }},
  '2026-06': { days: {
    1:  { saint: 'Saint Justin', type: 'memoire', desc: "Philosophe converti et martyr du IIe siècle. Ses Apologies sont parmi les premiers textes de théologie chrétienne.", minor: '' },
    2:  { saint: 'Saints Marcellin et Pierre', type: 'memoire', desc: "Prêtre et exorciste romains, martyrisés sous Dioclétien vers 304.", minor: '' },
    3:  { saint: 'Saint Charles Lwanga et compagnons', type: 'memoire', desc: "22 jeunes ougandais martyrisés en 1886 pour avoir refusé de se soumettre au roi Mwanga.", minor: '' },
    5:  { saint: 'Saint Boniface', type: 'memoire', desc: "Archevêque et martyr du VIIIe siècle, apôtre de la Germanie.", minor: '' },
    7:  { saint: 'Fête-Dieu — Corps et Sang du Christ', type: 'solennite', desc: "Célébration de la présence réelle du Christ dans l'Eucharistie. Procession solennelle du Saint-Sacrement.", minor: '' },
    9:  { saint: 'Saint Éphrem', type: 'memoire', desc: "Diacre syrien et Docteur de l'Église du IVe siècle. Grand poète de la théologie.", minor: '' },
    11: { saint: 'Saint Barnabé', type: 'memoire', desc: "Compagnon de saint Paul dans ses voyages. Lévite de Chypre, un des premiers disciples.", minor: '' },
    12: { saint: 'Sacré-Cœur de Jésus', type: 'solennite', desc: "Célébration de l'amour infini de Dieu manifesté dans le Cœur transpercé du Christ. Journée des prêtres.", minor: '' },
    13: { saint: 'Saint Antoine de Padoue', type: 'memoire', desc: "Franciscain et Docteur de l'Église. Prédicateur exceptionnel, patron des objets perdus.", minor: '' },
    14: { saint: 'Immaculé Cœur de Marie', type: 'fete', desc: "Fête du Cœur pur de Marie, célébrée le samedi après le Sacré-Cœur. Liée aux apparitions de Fatima.", minor: '' },
    19: { saint: 'Saint Romuald', type: 'memoire', desc: "Fondateur de la congrégation camaldule, réformateur du monachisme bénédictin.", minor: '' },
    21: { saint: 'Saint Louis de Gonzague', type: 'memoire', desc: "Jésuite mort à 23 ans en soignant les pestiférés. Patron de la jeunesse chrétienne.", minor: '' },
    22: { saint: 'Saints Thomas More et Jean Fisher', type: 'memoire', desc: "Martyrs anglais sous Henri VIII (1535), morts pour défendre la primauté du Pape.", minor: 'St Paulin de Nole' },
    24: { saint: 'Nativité de saint Jean-Baptiste', type: 'solennite', desc: "Unique saint dont la naissance est célébrée comme fête. 'Il y eut un homme envoyé de Dieu, du nom de Jean.'", minor: '' },
    27: { saint: 'Saint Cyrille d\'Alexandrie', type: 'memoire', desc: "Évêque et Docteur de l'Église, défenseur de la maternité divine de Marie au Concile d'Éphèse.", minor: '' },
    28: { saint: 'Saint Irénée de Lyon', type: 'fete', desc: "Évêque de Lyon et Docteur de l'Église du IIe siècle, pionnier de la théologie.", minor: '' },
    29: { saint: 'Saints Pierre et Paul, Apôtres', type: 'solennite', desc: "Double solennité des deux colonnes de l'Église : Pierre le pêcheur devenu roc, et Paul l'apôtre des nations.", minor: '' },
    30: { saint: 'Premiers Martyrs de l\'Église de Rome', type: 'memoire', desc: "Chrétiens suppliciés par Néron après l'incendie de Rome en 64.", minor: '' },
  }},
  '2026-07': { days: {
    3:  { saint: 'Saint Thomas, Apôtre', type: 'fete', desc: "'Mon Seigneur et mon Dieu !' Thomas, l'apôtre du doute devenu celui de la foi, évangélisa l'Inde.", minor: '' },
    11: { saint: 'Saint Benoît', type: 'fete', desc: "Père du monachisme occidental, fondateur de l'ordre bénédictin. Patron de l'Europe.", minor: '' },
    14: { saint: 'Saint Camille de Lellis', type: 'memoire', desc: "Fondateur des Camilliens, patron des malades et du personnel soignant.", minor: '' },
    15: { saint: 'Saint Bonaventure', type: 'memoire', desc: "Cardinal franciscain et Docteur de l'Église. Auteur de l'Itinéraire de l'âme vers Dieu.", minor: '' },
    16: { saint: 'Notre-Dame du Mont-Carmel', type: 'memoire', desc: "Fête patronale de l'ordre du Carmel. Commémoration de la scapulaire de saint Simon Stock.", minor: '' },
    22: { saint: 'Sainte Marie-Madeleine', type: 'fete', desc: "'Apôtre des Apôtres', première témoin de la Résurrection.", minor: '' },
    23: { saint: 'Sainte Brigitte de Suède', type: 'fete', desc: "Mystique suédoise du XIVe siècle, co-patronne de l'Europe.", minor: '' },
    25: { saint: 'Saint Jacques, Apôtre', type: 'fete', desc: "Fils de Zébédée, premier Apôtre martyr. Patron de l'Espagne et des pèlerins de Compostelle.", minor: '' },
    26: { saint: 'Saints Joachim et Anne', type: 'memoire', desc: "Parents de la Vierge Marie et grands-parents de Jésus. Patrons des familles.", minor: '' },
    29: { saint: 'Saintes Marthe, Marie et Lazare', type: 'memoire', desc: "Les frère et sœurs de Béthanie, amis de Jésus. 'Lazare, viens dehors !'", minor: '' },
    31: { saint: 'Saint Ignace de Loyola', type: 'memoire', desc: "Fondateur de la Compagnie de Jésus (jésuites). 'Pour la plus grande gloire de Dieu' (AMDG).", minor: '' },
  }},
  '2026-08': { days: {
    1:  { saint: 'Saint Alphonse de Liguori', type: 'memoire', desc: "Fondateur des Rédemptoristes et Docteur de l'Église.", minor: '' },
    4:  { saint: 'Saint Jean-Marie Vianney', type: 'memoire', desc: "Curé d'Ars, patron des prêtres. Passait jusqu'à 16h par jour au confessionnal.", minor: '' },
    6:  { saint: 'Transfiguration du Seigneur', type: 'fete', desc: "Sur le mont Thabor, Jésus apparaît dans sa gloire divine. 'Celui-ci est mon Fils bien-aimé.'", minor: '' },
    8:  { saint: 'Saint Dominique', type: 'memoire', desc: "Fondateur de l'Ordre des Prêcheurs (dominicains). Grand promoteur du saint Rosaire.", minor: '' },
    10: { saint: 'Saint Laurent', type: 'fete', desc: "Diacre et martyr romain du IIIe siècle. Patron des bibliothécaires.", minor: '' },
    11: { saint: 'Sainte Claire d\'Assise', type: 'memoire', desc: "Fondatrice des Clarisses, premier ordre féminin franciscain.", minor: '' },
    14: { saint: 'Saint Maximilien Kolbe', type: 'memoire', desc: "Franciscain polonais mort à Auschwitz (1941) à la place d'un père de famille.", minor: '' },
    15: { saint: 'Assomption de la Vierge Marie', type: 'solennite', desc: "Marie est élevée corps et âme dans la gloire céleste. Grande fête mariale de l'été.", minor: '' },
    20: { saint: 'Saint Bernard', type: 'memoire', desc: "Abbé de Clairvaux et Docteur de l'Église au XIIe siècle. Réformateur cistercien.", minor: '' },
    21: { saint: 'Saint Pie X', type: 'memoire', desc: "Pape (1903-1914), réformateur de la liturgie. Encourage la communion fréquente des enfants.", minor: '' },
    22: { saint: 'Sainte Marie Reine', type: 'memoire', desc: "Fête de Marie comme Reine du ciel et de la terre, instituée par Pie XII (1954).", minor: '' },
    24: { saint: 'Saint Barthélemy, Apôtre', type: 'fete', desc: "L'un des Douze, identifié à Nathanaël. Évangélisa l'Arménie et l'Inde.", minor: '' },
    25: { saint: 'Saint Louis de France', type: 'memoire', desc: "Roi de France (1226-1270), modèle du souverain chrétien.", minor: '' },
    27: { saint: 'Sainte Monique', type: 'memoire', desc: "Mère de saint Augustin, dont elle obtint la conversion par ses prières. Patronne des mères.", minor: '' },
    28: { saint: 'Saint Augustin', type: 'memoire', desc: "Évêque d'Hippone et Docteur de l'Église. 'Notre cœur est sans repos tant qu'il ne repose pas en Toi.'", minor: '' },
    29: { saint: 'Passion de saint Jean-Baptiste', type: 'memoire', desc: "Décapitation du précurseur sur ordre d'Hérode Antipas.", minor: '' },
  }},
  '2026-09': { days: {
    3:  { saint: 'Saint Grégoire le Grand', type: 'memoire', desc: "Pape (590-604) et Docteur de l'Église. Réformateur du chant liturgique (grégorien).", minor: '' },
    8:  { saint: 'Nativité de la Vierge Marie', type: 'fete', desc: "Naissance de Marie, préparée à être la Mère du Rédempteur.", minor: '' },
    14: { saint: 'Exaltation de la Sainte-Croix', type: 'fete', desc: "Célébration de la Croix du Christ, instrument de notre salut.", minor: '' },
    15: { saint: 'Notre-Dame des Douleurs', type: 'memoire', desc: "Commémoration des sept douleurs de Marie. 'Un glaive te transpercera l'âme.'", minor: '' },
    21: { saint: 'Saint Matthieu, Apôtre et évangéliste', type: 'fete', desc: "Publicain converti par Jésus, auteur du premier Évangile.", minor: '' },
    23: { saint: 'Saint Padre Pio de Pietrelcina', type: 'memoire', desc: "Capucin stigmatisé (1918-1968). 'Prie, espère et ne t'inquiète pas.'", minor: '' },
    27: { saint: 'Saint Vincent de Paul', type: 'memoire', desc: "Fondateur des Lazaristes et des Filles de la Charité. Patron de la charité catholique.", minor: '' },
    29: { saint: 'Saints Michel, Gabriel et Raphaël, Archanges', type: 'fete', desc: "Les trois archanges nommés dans l'Écriture : Michel, Gabriel et Raphaël.", minor: '' },
    30: { saint: 'Saint Jérôme', type: 'memoire', desc: "Docteur de l'Église et traducteur de la Bible en latin (Vulgate).", minor: '' },
  }},
  '2026-10': { days: {
    1:  { saint: 'Sainte Thérèse de l\'Enfant-Jésus', type: 'memoire', desc: "Carmélite du XIXe siècle, Docteure de l'Église. Sa 'petite voie' a révolutionné la spiritualité.", minor: '' },
    2:  { saint: 'Saints Anges Gardiens', type: 'memoire', desc: "Fête des anges protecteurs envoyés par Dieu auprès de chaque être humain.", minor: '' },
    4:  { saint: 'Saint François d\'Assise', type: 'memoire', desc: "Fondateur des franciscains. 'Ouvre-moi, Seigneur, aux trésors de ta bonté.'", minor: '' },
    7:  { saint: 'Notre-Dame du Rosaire', type: 'memoire', desc: "Mois du Rosaire. Institué en mémoire de la victoire de Lépante (1571).", minor: '' },
    15: { saint: 'Sainte Thérèse d\'Ávila', type: 'memoire', desc: "Première femme Docteure de l'Église. Réformatrice du Carmel, mystique extraordinaire.", minor: '' },
    18: { saint: 'Saint Luc, évangéliste', type: 'fete', desc: "Médecin d'Antioche, compagnon de Paul. Auteur du 3e Évangile et des Actes des Apôtres.", minor: '' },
    22: { saint: 'Saint Jean-Paul II', type: 'memoire', desc: "Pape (1978-2005), 'le Grand'. Évangélisateur infatigable, canonisé en 2014.", minor: '' },
    28: { saint: 'Saints Simon et Jude, Apôtres', type: 'fete', desc: "Simon le Zélote et Jude Thaddée, deux des Douze. Saint Jude est patron des causes désespérées.", minor: '' },
  }},
  '2026-11': { days: {
    1:  { saint: 'Toussaint', type: 'solennite', desc: "Célébration de tous les saints, connus et inconnus, qui règnent dans la gloire éternelle.", minor: '' },
    2:  { saint: 'Commémoration des fidèles défunts', type: 'fete', desc: "Prière de l'Église pour tous les défunts. 'Je suis la résurrection et la vie.'", minor: '' },
    4:  { saint: 'Saint Charles Borromée', type: 'memoire', desc: "Cardinal-archevêque de Milan, principal artisan de la réforme tridentine.", minor: '' },
    9:  { saint: 'Dédicace de la basilique du Latran', type: 'fete', desc: "Cathédrale du Pape, évêque de Rome. La 'mère de toutes les Églises'.", minor: '' },
    11: { saint: 'Saint Martin de Tours', type: 'memoire', desc: "Évêque de Tours du IVe siècle, premier grand saint de France. Patron des soldats.", minor: '' },
    17: { saint: 'Sainte Élisabeth de Hongrie', type: 'memoire', desc: "Reine du XIIIe siècle qui consacra sa vie aux pauvres. Patronne de la charité chrétienne.", minor: '' },
    21: { saint: 'Présentation de la Vierge Marie', type: 'memoire', desc: "Marie, enfant, présentée au Temple par ses parents.", minor: '' },
    22: { saint: 'Sainte Cécile', type: 'memoire', desc: "Vierge et martyre du IIIe siècle. Patronne des musiciens et des chanteurs.", minor: '' },
    29: { saint: '1er dimanche de l\'Avent', type: 'fete', desc: "Début de l'année liturgique. Temps d'attente et de préparation à la venue du Seigneur.", minor: '' },
    30: { saint: 'Saint André, Apôtre', type: 'fete', desc: "Frère de Pierre, premier appelé par Jésus. Patron de l'Écosse et de la Russie.", minor: '' },
  }},
  '2026-12': { days: {
    3:  { saint: 'Saint François Xavier', type: 'memoire', desc: "Jésuite espagnol du XVIe siècle, 'apôtre des Indes et du Japon'.", minor: '' },
    6:  { saint: 'Saint Nicolas', type: 'memoire', desc: "Évêque de Myre au IVe siècle, patron des enfants, des marins et des voyageurs.", minor: '' },
    7:  { saint: 'Saint Ambroise', type: 'memoire', desc: "Évêque de Milan et Docteur de l'Église. Baptisa saint Augustin.", minor: '' },
    8:  { saint: 'Immaculée Conception de la Vierge Marie', type: 'solennite', desc: "Marie fut préservée du péché originel dès le premier instant de sa conception. Dogme défini par Pie IX en 1854.", minor: '' },
    12: { saint: 'Notre-Dame de Guadalupe', type: 'fete', desc: "Apparition de la Vierge à Juan Diego au Mexique. Patronne des Amériques.", minor: '' },
    13: { saint: 'Sainte Lucie', type: 'memoire', desc: "Vierge et martyre sicilienne du IVe siècle. Patronne des malvoyants et de la lumière.", minor: '' },
    14: { saint: 'Saint Jean de la Croix', type: 'memoire', desc: "Carme et Docteur de l'Église. Sa Nuit obscure de l'âme est le sommet de la mystique chrétienne.", minor: '' },
    24: { saint: 'Vigile de Noël', type: 'fete', desc: "Veille de la Nativité du Seigneur. La lumière du Christ entre dans les ténèbres.", minor: '' },
    25: { saint: 'Noel — Nativite du Seigneur', type: 'solennite', desc: "'Le Verbe s'est fait chair et il a habite parmi nous.' Gloire a Dieu au plus haut des cieux !", minor: '' },
    26: { saint: 'Saint Étienne, premier martyr', type: 'fete', desc: "Premier martyr chrétien, lapidé à Jérusalem.", minor: '' },
    27: { saint: 'Saint Jean, Apôtre et évangéliste', type: 'fete', desc: "L'apôtre bien-aimé, auteur du 4e Évangile. Seul Apôtre à ne pas mourir martyr.", minor: '' },
    28: { saint: 'Saints Innocents, martyrs', type: 'fete', desc: "Enfants massacrés par Hérode à Bethléem. Premiers martyrs à mourir pour le Christ.", minor: '' },
    31: { saint: 'Saint Sylvestre Ier', type: 'memoire', desc: "Pape (314-335) sous lequel le christianisme devint religion d'Empire après Constantin.", minor: '' },
  }},
};

function initCalendar() {
  const MONTH_NAMES = [
    'Janvier','Fevrier','Mars','Avril','Mai','Juin',
    'Juillet','Aout','Septembre','Octobre','Novembre','Decembre'
  ];
  const MONTH_FR = [
    'janvier','fevrier','mars','avril','mai','juin',
    'juillet','aout','septembre','octobre','novembre','decembre'
  ];
  const DOW_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const TYPE_LABELS = {
    ordinaire: 'Temps ordinaire',
    memoire:   'Memoire',
    fete:      'Fete liturgique',
    solennite: 'Solennite',
  };

  const now = getParisDate();
  let viewYear  = now.getFullYear();
  let viewMonth = now.getMonth() + 1; // 1-12

  const detail  = document.getElementById('day-detail');
  const ddDate  = document.getElementById('dd-date');
  const ddType  = document.getElementById('dd-type');
  const ddSaint = document.getElementById('dd-saint');
  const ddDesc  = document.getElementById('dd-desc');
  const ddMinor = document.getElementById('dd-minor');
  const grid    = document.querySelector('.cal-grid');
  const titleEl = document.querySelector('.month-title');
  const legend  = document.querySelector('.month-legend');

  if (!grid || !detail) return;

  function getDayData(year, month, d) {
    const key = `${year}-${String(month).padStart(2,'0')}`;
    return CALENDAR_DATA[key]?.days?.[d] || null;
  }

  // Cache mémoire pour les bios nominis (évite les appels en double)
  const _nominisCache = {};
  let _nominisAbort = null;

  // Cache module pour les batchs mois
  const _nominisMonthCache = {};

  // Enrichit les cases du mois sans saint curated avec les données Nominis
  async function enrichCalendarWithNominis(year, month, grid) {
    const key = `${year}-${month}`;
    let monthData;
    if (_nominisMonthCache[key]) {
      monthData = _nominisMonthCache[key];
    } else {
      try {
        const r = await fetch(`/api/nominis-month?year=${year}&month=${month}`);
        if (!r.ok) return;
        monthData = await r.json();
        _nominisMonthCache[key] = monthData;
      } catch (_) { return; }
    }
    if (!monthData?.days) return;

    // Vérifier qu'on est toujours sur le bon mois (l'utilisateur a pu naviguer)
    const currentKey = grid.dataset.monthKey;
    if (currentKey && currentKey !== key) return;

    monthData.days.forEach(entry => {
      const cell = grid.querySelector(`.cal-day[data-day="${entry.day}"][data-month="${month}"]`);
      if (!cell || cell.classList.contains('other')) return;
      // Ne touche pas aux cases qui ont déjà un saint curated
      if (cell.dataset.saint) {
        // Stocker le 2e nom comme "nominis" pour info (consulté dans selectDay)
        if (!cell.dataset.nominisName) cell.dataset.nominisName = entry.nom;
        return;
      }
      // Pose les méta-données et l'affichage
      cell.dataset.saint = entry.nom;
      // Strip HTML pour le bandeau et le data-attribute (le texte brut suffit ici)
      cell.dataset.desc  = (entry.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      cell.dataset.nominisOnly = '1';
      const shortName = entry.nom.replace(/^(Saint|Sainte|Ss|Ste|St|Bienheureux|Bienheureuse|Vénérable)\s+/i, '').replace(/,.*$/, '').substring(0, 13);
      const numEl = cell.querySelector('.cal-num');
      if (numEl && !cell.querySelector('.cal-saint')) {
        const span = document.createElement('span');
        span.className = 'cal-saint cal-saint--nominis';
        span.textContent = shortName;
        numEl.after(span);
      }
      // Mettre à jour le bandeau si c'est aujourd'hui
      if (cell.classList.contains('today')) {
        const saintEl = document.getElementById('js-feast');
        if (saintEl && (!saintEl.textContent || saintEl.textContent === '—')) {
          saintEl.textContent = entry.nom;
        }
      }
    });
  }

  async function fetchNominisBio(year, month, day) {
    const key = `${year}-${month}-${day}`;
    if (_nominisCache[key]) return _nominisCache[key];
    if (_nominisAbort) _nominisAbort.abort();
    _nominisAbort = new AbortController();
    try {
      const resp = await fetch(`/api/nominis?day=${day}&month=${month}&year=${year}`, {
        signal: _nominisAbort.signal,
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      _nominisCache[key] = data;
      return data;
    } catch (_) { return null; }
  }

  function selectDay(dayEl) {
    const date  = dayEl.dataset.date  || '';
    const type  = dayEl.dataset.type  || 'ordinaire';
    const saint = dayEl.dataset.saint || '';
    const desc  = dayEl.dataset.desc  || '';
    const minor = dayEl.dataset.minor || '';
    const yr    = parseInt(dayEl.dataset.year,  10);
    const mo    = parseInt(dayEl.dataset.month, 10);
    const dy    = parseInt(dayEl.dataset.day,   10);

    if (ddDate)  ddDate.textContent  = date;
    if (ddType) { ddType.textContent = TYPE_LABELS[type] || type; ddType.className = 'dd-type ' + type; }
    if (ddSaint) ddSaint.textContent = saint;
    if (ddDesc)  ddDesc.textContent  = desc;

    // Bouton « Partager ce saint » (saint principal du jour sélectionné)
    const shareMainBtn = document.getElementById('dd-share-main');
    if (shareMainBtn) {
      if (saint) {
        shareMainBtn.style.display = '';
        const eyebrowLabel = TYPE_LABELS[type] || 'Saint du jour';
        shareMainBtn.onclick = () => window._pelShareSaint?.({ name: saint, eyebrow: eyebrowLabel, date, btn: shareMainBtn });
      } else {
        shareMainBtn.style.display = 'none';
      }
    }

    // Bouton réglages voix du calendrier
    const ddVoiceCfg = document.getElementById('dd-voice-cfg');
    if (ddVoiceCfg) {
      if (!('speechSynthesis' in window) || !saint) ddVoiceCfg.style.display = 'none';
      else { ddVoiceCfg.style.display = ''; ddVoiceCfg.onclick = () => window._openVoiceSettings?.(); }
    }

    // Bouton « Écouter » : lit le saint + sa description à voix haute
    const listenDdBtn = document.getElementById('dd-listen');
    if (listenDdBtn) {
      const reader = window._pelReader;
      if (!('speechSynthesis' in window) || !saint) {
        listenDdBtn.style.display = 'none';
      } else {
        listenDdBtn.style.display = '';
        reader.stop(); // réinitialise à chaque changement de jour
        listenDdBtn.onclick = () => {
          if (reader.state === 'playing') { reader.pause(); return; }
          if (reader.state === 'paused')  { reader.resume(); return; }
          // Texte lu : nom + description + tagline Nominis si présente
          const tagline = document.querySelector('#dd-nominis .dd-nominis-tagline')?.textContent || '';
          const txt = [saint, desc, tagline].filter(Boolean).join('. ');
          reader.read(txt, listenDdBtn);
        };
      }
    }
    if (ddMinor) {
      if (minor) { ddMinor.textContent = 'Aussi celebres : ' + minor; ddMinor.style.display = ''; }
      else { ddMinor.style.display = 'none'; }
    }

    // Saints francophones régionaux (Québec, Belgique, Suisse, Afrique francophone…)
    // Affiché si la date a des saints régionaux dans REGIONAL_SAINTS.
    let regBlock = document.getElementById('dd-regional');
    if (!regBlock) {
      regBlock = document.createElement('div');
      regBlock.id = 'dd-regional';
      regBlock.className = 'dd-regional';
      detail.appendChild(regBlock);
    }
    if (yr && mo && dy) {
      const regionalDate = new Date(yr, mo - 1, dy);
      const regional = getRegionalSaintsForDate(regionalDate);
      const COUNTRY_LABELS = {
        ca: 'Québec / Canada', be: 'Belgique', ch: 'Suisse',
        cm: 'Afrique francophone', ci: 'Côte d\'Ivoire', ht: 'Haïti',
      };
      if (regional.length > 0) {
        const cardsHtml = regional.map(r => {
          const country = COUNTRY_LABELS[r.country] || r.country.toUpperCase();
          return `<div class="dd-regional-card">
            <div class="dd-regional-head">
              <img class="src-flag" src="https://flagcdn.com/w20/${r.country}.png" srcset="https://flagcdn.com/w40/${r.country}.png 2x" width="14" height="10" alt="" aria-hidden="true">
              <span class="dd-regional-name">${escapeHtmlSimple(r.name)}</span>
              <button class="dd-share-mini" data-sname="${escapeHtmlSimple(r.name)}" data-seb="${escapeHtmlSimple(country)}" title="Partager ${escapeHtmlSimple(r.name)}" aria-label="Partager"><i class="fa-solid fa-share-nodes"></i></button>
              <span class="dd-regional-country">${country}</span>
            </div>
            <p class="dd-regional-desc">${escapeHtmlSimple(r.desc)}</p>
          </div>`;
        }).join('');
        regBlock.innerHTML = `
          <div class="dd-regional-head-section">
            <i class="fa-solid fa-globe"></i>
            <span class="dd-regional-title">Saints francophones du jour</span>
          </div>
          ${cardsHtml}`;
        regBlock.dataset.shareDate = date;
        // Délégation (attachée une seule fois)
        if (!regBlock.dataset.shareWired) {
          regBlock.dataset.shareWired = '1';
          regBlock.addEventListener('click', (e) => {
            const b = e.target.closest('.dd-share-mini');
            if (!b) return;
            window._pelShareSaint?.({ name: b.dataset.sname, eyebrow: b.dataset.seb, date: regBlock.dataset.shareDate, btn: b });
          });
        }
        regBlock.style.display = '';
      } else {
        regBlock.style.display = 'none';
      }
    } else {
      regBlock.style.display = 'none';
    }

    // Enrichissement nominis : bio détaillée + lien officiel CEF
    let nomBlock = document.getElementById('dd-nominis');
    if (!nomBlock) {
      nomBlock = document.createElement('div');
      nomBlock.id = 'dd-nominis';
      nomBlock.className = 'dd-nominis';
      detail.appendChild(nomBlock);
    }
    nomBlock.innerHTML = `<div class="dd-nominis-loading">
      <span class="dd-nominis-spinner"></span>
      Chargement de la biographie…
    </div>`;
    nomBlock.style.display = '';

    if (yr && mo && dy) {
      fetchNominisBio(yr, mo, dy).then(bio => {
        if (!bio || !bio.nom) {
          nomBlock.style.display = 'none';
          return;
        }
        // Si on a déjà changé de jour entre temps, on ignore
        if (parseInt(dayEl.dataset.day, 10) !== dy) return;
        // Description courte (sans HTML)
        const shortDesc = (bio.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        // Bio HTML : on garde en l'état (lien aelf, vatican, etc. ouvre dans nouvel onglet)
        // On n'expose qu'un extrait par défaut, avec bouton "Lire plus"
        let safeHtml = bio.contenu || '';
        // Force target=_blank sur tous les liens pour ouvrir hors-app
        safeHtml = safeHtml.replace(/<a /g, '<a target="_blank" rel="noopener" ');
        // Réécrit les URLs relatives en absolues (pointent vers nominis.cef.fr)
        safeHtml = safeHtml
          .replace(/(<img[^>]+src=")\/([^"]+)/gi, '$1https://nominis.cef.fr/$2')
          .replace(/(<a[^>]+href=")\/([^"]+)/gi, '$1https://nominis.cef.fr/$2');
        const lien = bio.lien || '';

        nomBlock.innerHTML = `
          <div class="dd-nominis-head">
            <i class="fa-solid fa-book-open"></i>
            <span class="dd-nominis-title">${bio.nom !== saint ? `<strong>${escapeHtmlSimple(bio.nom)}</strong> — ` : ''}selon nominis</span>
          </div>
          ${shortDesc ? `<div class="dd-nominis-tagline">${escapeHtmlSimple(shortDesc)}</div>` : ''}
          <div class="dd-nominis-bio dd-nominis-collapsed">${safeHtml}</div>
          <div class="dd-nominis-actions">
            <button type="button" class="dd-nominis-toggle" id="dd-nominis-toggle">Lire la biographie complète <i class="fa-solid fa-chevron-down"></i></button>
            <button type="button" class="pel-listen-btn" id="dd-nominis-listen"><i class="fa-solid fa-volume-high"></i><span>Écouter</span></button>
            <button type="button" class="dd-share-btn" id="dd-nominis-share"><i class="fa-solid fa-share-nodes"></i> Partager</button>
            ${lien ? `<a class="dd-nominis-link" href="${lien}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Voir sur nominis.cef.fr</a>` : ''}
          </div>
          <div class="dd-nominis-others" id="dd-nominis-others-${dy}" style="display:none"></div>
        `;

        // Bouton « Partager » du saint Nominis (ex : Saint Kevin)
        const nomShareBtn = nomBlock.querySelector('#dd-nominis-share');
        if (nomShareBtn) nomShareBtn.onclick = () =>
          window._pelShareSaint?.({ name: bio.nom, eyebrow: 'Saint du jour', date, btn: nomShareBtn });

        // Bouton « Écouter » du saint Nominis (lit nom + bio à voix haute)
        const nomListenBtn = nomBlock.querySelector('#dd-nominis-listen');
        if (nomListenBtn) {
          const reader = window._pelReader;
          if (!('speechSynthesis' in window)) { nomListenBtn.style.display = 'none'; }
          else nomListenBtn.onclick = () => {
            if (reader.state === 'playing') { reader.pause(); return; }
            if (reader.state === 'paused')  { reader.resume(); return; }
            const bioTxt = nomBlock.querySelector('.dd-nominis-bio')?.innerText || shortDesc || '';
            reader.read([bio.nom, shortDesc, bioTxt].filter(Boolean).join('. '), nomListenBtn);
          };
        }

        // Charge en parallèle la liste des autres saints du jour (Nominis "Autres fêtes du jour")
        fetch(`/api/saints-of-day?day=${dy}&month=${mo}&year=${yr}`)
          .then(r => r.ok ? r.json() : null)
          .then(payload => {
            // Vérifier qu'on n'a pas changé de jour entre-temps
            if (parseInt(dayEl.dataset.day, 10) !== dy) return;
            const others = (payload?.saints || []).filter(s => {
              // Exclure le saint principal déjà affiché plus haut
              return !bio.nom || !s.name.toLowerCase().includes(bio.nom.replace(/^(Saint[es]?|Bienheureux[se]?)\s+/i, '').toLowerCase().split(/\s/)[0]);
            });
            const wrap = document.getElementById('dd-nominis-others-' + dy);
            if (!wrap || others.length === 0) return;
            wrap.style.display = '';
            const VISIBLE = 4;
            const head = others.slice(0, VISIBLE);
            const rest = others.slice(VISIBLE);
            const chip = s => `<span class="dd-nominis-other">
              <a class="dd-other-link" href="${escapeHtmlSimple(s.url)}" target="_blank" rel="noopener" title="${escapeHtmlSimple(s.bio || '')}">${escapeHtmlSimple(s.name)}</a>
              <button class="dd-other-share" data-sname="${escapeHtmlSimple(s.name)}" title="Partager ${escapeHtmlSimple(s.name)}" aria-label="Partager"><i class="fa-solid fa-share-nodes"></i></button>
            </span>`;
            const headHTML = head.map(chip).join('');
            const restHTML = rest.map(chip).join('');
            wrap.innerHTML = `
              <button type="button" class="dd-nominis-others-toggle" id="dd-others-toggle-${dy}" aria-expanded="false">
                <i class="fa-solid fa-users"></i>
                <span class="dd-others-toggle-label">Voir les ${others.length} saints également célébrés ce jour</span>
                <i class="fa-solid fa-chevron-down dd-others-chevron"></i>
              </button>
              <div class="dd-nominis-others-list dd-others-collapsed" id="dd-others-list-${dy}">
                ${headHTML}
                ${rest.length ? `<span class="dd-others-rest">${restHTML}</span>` : ''}
              </div>
              <div class="dd-nominis-others-more">Cliquez sur un saint pour voir sa fiche complète sur nominis.cef.fr</div>
            `;
            const tBtn = document.getElementById('dd-others-toggle-' + dy);
            const tList = document.getElementById('dd-others-list-' + dy);
            const tLabel = tBtn?.querySelector('.dd-others-toggle-label');
            tBtn?.addEventListener('click', () => {
              const expanded = tList.classList.toggle('dd-others-collapsed') === false;
              tBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
              if (tLabel) tLabel.textContent = expanded
                ? `Replier la liste`
                : `Voir les ${others.length} saints également célébrés ce jour`;
            });
            // Partage des autres saints (délégation sur la liste)
            tList?.addEventListener('click', (e) => {
              const b = e.target.closest('.dd-other-share');
              if (!b) return;
              e.preventDefault();
              window._pelShareSaint?.({ name: b.dataset.sname, eyebrow: 'Saint du jour', date, btn: b });
            });
          })
          .catch(() => {});
        const toggleBtn = document.getElementById('dd-nominis-toggle');
        const bioEl     = nomBlock.querySelector('.dd-nominis-bio');
        toggleBtn?.addEventListener('click', () => {
          const expanded = bioEl.classList.toggle('dd-nominis-collapsed') === false;
          toggleBtn.innerHTML = expanded
            ? 'Réduire <i class="fa-solid fa-chevron-up"></i>'
            : 'Lire la biographie complète <i class="fa-solid fa-chevron-down"></i>';
        });
      }).catch(() => {
        nomBlock.style.display = 'none';
      });
    } else {
      nomBlock.style.display = 'none';
    }

    detail.classList.remove('hidden');
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    grid.querySelectorAll('.cal-day:not(.other)').forEach(d => d.style.outline = '');
    dayEl.style.outline = '2px solid #c9a84c';
  }

  // Helper pour l'échappement HTML (réutilisable, simple)
  function escapeHtmlSimple(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function renderCalendar(year, month) {
    // Title
    if (titleEl) titleEl.textContent = MONTH_NAMES[month - 1] + ' ' + year;

    // First day of month: JS 0=Sun…6=Sat → Mon-based: 0=Mon…6=Sun
    const firstDow  = new Date(year, month - 1, 1).getDay();
    const startCol  = (firstDow + 6) % 7;
    const daysInMonth     = new Date(year, month, 0).getDate();
    const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

    const todayDate  = getParisDate();
    const isThisMonth = year === todayDate.getFullYear() && month === todayDate.getMonth() + 1;
    const todayDay   = todayDate.getDate();

    // Rebuild grid — keep header cells
    const headers = Array.from(grid.querySelectorAll('.cal-head')).map(h => h.cloneNode(true));
    grid.innerHTML = '';
    headers.forEach(h => grid.appendChild(h));
    grid.dataset.monthKey = `${year}-${month}`;

    // Leading "other" cells
    for (let i = 0; i < startCol; i++) {
      const div = document.createElement('div');
      div.className = 'cal-day other';
      div.innerHTML = '<span class="cal-num">' + (daysInPrevMonth - startCol + 1 + i) + '</span>';
      grid.appendChild(div);
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const data   = getDayData(year, month, d);
      const saint  = data?.saint || '';
      const type   = data?.type  || 'ordinaire';
      const desc   = data?.desc  || '';
      const minor  = data?.minor || '';
      const isToday = isThisMonth && d === todayDay;

      const dow       = new Date(year, month - 1, d).getDay();
      const dateLabel = DOW_FR[dow] + ' ' + d + ' ' + MONTH_FR[month - 1] + ' ' + year;
      const shortSaint = saint.replace(/^(Saint|Sainte|Ss|Ste|St)\s+/i, '').replace(/,.*$/, '').substring(0, 13);

      let dotHtml = '';
      if (type === 'solennite' || type === 'fete') dotHtml = '<div class="cal-dot gold"></div>';
      else if (type === 'memoire')                  dotHtml = '<div class="cal-dot purple"></div>';

      const div = document.createElement('div');
      div.className = 'cal-day' + (type !== 'ordinaire' ? ' ' + type : '') + (isToday ? ' today' : '') + (minor ? ' has-minor' : '');
      div.dataset.date  = dateLabel;
      div.dataset.type  = type;
      div.dataset.saint = saint;
      div.dataset.desc  = desc;
      div.dataset.minor = minor;
      div.dataset.year  = year;
      div.dataset.month = month;
      div.dataset.day   = d;
      // Petit tag discret pour les saints mineurs, visible dans la case
      const minorTag = minor ? '<span class="cal-minor-hint" title="' + minor + '">+</span>' : '';
      div.innerHTML = '<span class="cal-num">' + d + '</span>' +
        (saint ? '<span class="cal-saint">' + shortSaint + '</span>' : '') + dotHtml + minorTag;
      div.addEventListener('click', () => selectDay(div));
      grid.appendChild(div);

      // Update feast banner for today
      if (isToday) {
        const saintEl = document.getElementById('js-feast');
        const typeEl  = document.getElementById('js-feast-type');
        if (saintEl) saintEl.textContent = saint || '—';
        if (typeEl)  typeEl.textContent  = TYPE_LABELS[type] || '—';
      }
    }

    // Enrichissement Nominis : remplit les cases sans saint curated
    // (asynchrone, non bloquant). Cache CDN 24h → quasi gratuit après le 1er hit.
    enrichCalendarWithNominis(year, month, grid);

    // Trailing "other" cells
    const total    = startCol + daysInMonth;
    const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let i = 1; i <= trailing; i++) {
      const div = document.createElement('div');
      div.className = 'cal-day other';
      div.innerHTML = '<span class="cal-num">' + i + '</span>';
      grid.appendChild(div);
    }

    // Legend
    if (legend) {
      const todayLegend = legend.querySelector('.today-legend');
      if (todayLegend) todayLegend.textContent = isThisMonth ? ' Aujourd\'hui' : '';
    }

    // Update nav button labels
    const prevM = month === 1 ? 12 : month - 1;
    const nextM = month === 12 ? 1 : month + 1;
    const btns  = document.querySelectorAll('.month-nav .month-btn');
    if (btns[0]) btns[0].textContent = '‹ ' + MONTH_NAMES[prevM - 1];
    if (btns[1]) btns[1].textContent = MONTH_NAMES[nextM - 1] + ' ›';

    // Reset detail panel
    detail.classList.add('hidden');
    if (ddMinor) ddMinor.style.display = 'none';
    const regBlock = document.getElementById('dd-regional');
    if (regBlock) regBlock.style.display = 'none';
  }

  // Wire nav buttons
  const navBtns = document.querySelectorAll('.month-nav .month-btn');
  navBtns[0]?.addEventListener('click', () => {
    if (viewMonth === 1) { viewYear--; viewMonth = 12; } else { viewMonth--; }
    renderCalendar(viewYear, viewMonth);
  });
  navBtns[1]?.addEventListener('click', () => {
    if (viewMonth === 12) { viewYear++; viewMonth = 1; } else { viewMonth++; }
    renderCalendar(viewYear, viewMonth);
  });

  // Initial render
  renderCalendar(viewYear, viewMonth);

  // Auto-select today
  function autoSelectToday() {
    const todayCell = grid.querySelector('.cal-day.today');
    if (todayCell) selectDay(todayCell);
  }
  document.querySelector('.nav-tab[data-tab="mois"]')
    ?.addEventListener('click', () => setTimeout(autoSelectToday, 60));
  window._calAutoSelectToday = autoSelectToday;
}


/* ────────────────────────────────────────────
   5. BRÉVIAIRE — panneau AELF
──────────────────────────────────────────────*/

const PRAYER_NAMES = {
  laudes:   'Laudes',
  matin:    'Prière du matin',
  messe:    'Messe',
  chapelet: 'Chapelet',
  vepres:   'Vêpres',
  complies: 'Complies',
  soiree:   'Prière du soir',
};

const FALLBACK_TEXTS = {
  laudes: {
    title: 'Laudes — Prière du matin',
    sections: [
      {
        heading: 'Hymne',
        text: `Lumière joyeuse, gloire du Père immortel,\ncéleste, saint, bienheureux,\nÔ Jésus-Christ !\n\nVenus au coucher du soleil,\nvoyant la lumière du soir,\nnous chantons le Père, le Fils\net le Saint-Esprit de Dieu.`,
        ref: 'Hymne des Laudes',
      },
      {
        heading: 'Psaume 63',
        text: `Dieu, tu es mon Dieu, je te cherche dès l'aube :\nmon âme a soif de toi ;\nma chair brûle pour toi\ndans une terre aride, desséchée, sans eau.\n\nC'est ainsi que je t'ai contemplé au sanctuaire,\nvoyant ta force et ta gloire.`,
        ref: 'Ps 63, 2-3',
      },
      {
        heading: 'Oraison',
        text: `Seigneur notre Dieu, en commençant ce jour\nsous le signe de ta lumière,\nnous te demandons de nous aider\nà marcher dans tes voies.\nQue cette journée soit pour nous\nun témoignage de ta gloire.\nPar Jésus-Christ, notre Seigneur. Amen.`,
        ref: '',
      },
    ],
  },
  matin: {
    title: 'Prière du matin',
    sections: [
      {
        heading: 'Acte d\'offrande',
        text: `Seigneur, je t'offre ce nouveau jour.\nJe t'offre mes prières, mes pensées,\nmes joies et mes peines d'aujourd'hui.\nOffre-les avec le Cœur Sacré de Jésus\npour la gloire du Père\net le salut des âmes.`,
        ref: '',
      },
      {
        heading: 'Évangile du jour',
        text: `En ce temps-là, Jésus dit à ses disciples :\n« Je suis le chemin, la vérité et la vie.\nNul ne vient au Père que par moi.\nSi vous me connaissez,\nvous connaîtrez aussi mon Père. »`,
        ref: 'Jn 14, 6-7',
      },
    ],
  },
  messe: {
    title: 'Textes de la Messe du jour',
    sections: [
      {
        heading: 'Antienne d\'entrée',
        text: `Criez de joie pour Dieu, toute la terre ;\ncélébrez la gloire de son Nom,\nrendez-lui une gloire éclatante. Alléluia.`,
        ref: 'Ps 65, 1-2',
      },
      {
        heading: 'Première lecture',
        text: `Lecture du livre des Actes des Apôtres.\n\nEn ces jours-là, Barnabé et Paul\nannoncèrent avec assurance la Parole de Dieu\ndans la synagogue. Un grand nombre de Juifs\net de prosélytes pieux se joignirent à Paul et Barnabé.`,
        ref: 'Ac 13, 43',
      },
      {
        heading: 'Évangile',
        text: `Évangile de Jésus-Christ selon saint Marc.\n\nEn ce temps-là, Jésus ressuscité\nse manifesta aux onze Apôtres\net leur dit : « Allez dans le monde entier,\nproclamez l'Évangile à toute la création.\nCelui qui croira et sera baptisé sera sauvé. »`,
        ref: 'Mc 16, 15-16',
      },
    ],
  },
  chapelet: {
    title: 'Le Saint Rosaire',
    sections: [
      {
        heading: 'Mystères Lumineux (jeudi)',
        text: `1. Le Baptême de Jésus au Jourdain\n2. Les noces de Cana\n3. L'annonce du Royaume de Dieu\n4. La Transfiguration\n5. L'institution de l'Eucharistie`,
        ref: 'Proposés par saint Jean-Paul II en 2002',
      },
      {
        heading: 'Je vous salue, Marie',
        text: `Je vous salue, Marie pleine de grâces,\nle Seigneur est avec vous.\nVous êtes bénie entre toutes les femmes\net Jésus, le fruit de vos entrailles, est béni.\n\nSainte Marie, Mère de Dieu,\npriez pour nous pauvres pécheurs,\nmaintenant et à l'heure de notre mort. Amen.`,
        ref: '',
      },
      {
        heading: 'Gloire au Père',
        text: `Gloire au Père, et au Fils,\net au Saint-Esprit.\nComme il était au commencement,\nmaintenant et toujours,\ndans les siècles des siècles. Amen.`,
        ref: '',
      },
    ],
  },
  vepres: {
    title: 'Vêpres — Prière du soir',
    sections: [
      {
        heading: 'Hymne',
        text: `Avant que s'achève le jour,\nNous t'en supplions, Créateur du monde :\nDans ta miséricorde, garde-nous\nEt protège-nous par ta grâce.`,
        ref: 'Hymne des Vêpres',
      },
      {
        heading: 'Magnificat',
        text: `Mon âme exalte le Seigneur,\nexulte mon esprit en Dieu, mon Sauveur !\nIl s'est penché sur son humble servante ;\ndésormais tous les âges me diront bienheureuse.\n\nLe Puissant fit pour moi des merveilles ;\nSaint est son nom !\nSon amour s'étend d'âge en âge\nsur ceux qui le craignent.`,
        ref: 'Lc 1, 46-50',
      },
    ],
  },
  soiree: {
    title: 'Prière du soir',
    sections: [
      {
        heading: 'Prière du soir en famille',
        text: `Seigneur Jésus,\nau terme de cette journée,\nnous te rendons grâce pour tout le bien reçu.\nGarde cette maison dans ta paix,\nprotège les enfants qui s'endorment\net veille sur chacun de nous cette nuit.\nAmen.`,
        ref: '',
      },
      {
        heading: 'Je vous salue, Marie',
        text: `Je vous salue, Marie pleine de grâces,\nle Seigneur est avec vous.\nVous êtes bénie entre toutes les femmes\net Jésus, le fruit de vos entrailles, est béni.\n\nSainte Marie, Mère de Dieu,\npriez pour nous pauvres pécheurs,\nmaintenant et à l'heure de notre mort. Amen.`,
        ref: '',
      },
    ],
  },
  complies: {
    title: 'Complies — Prière de la nuit',
    sections: [
      {
        heading: 'Examen de conscience',
        text: `Seigneur, je viens devant toi\nau terme de ce jour.\nJe te confie ce que j'ai fait de bien\net ce qui n'a pas été à la hauteur.\nTa miséricorde est plus grande\nque toutes mes faiblesses.`,
        ref: '',
      },
      {
        heading: 'Psaume 91',
        text: `Il habite à l'abri du Très-Haut,\nil gîte à l'ombre du Tout-Puissant.\nJe dis au Seigneur : « Mon refuge, mon rempart,\nmon Dieu dont je suis sûr ! »\n\nC'est lui qui te libère du filet du chasseur,\nde la mort qui frappe dans les ténèbres.`,
        ref: 'Ps 91, 1-3.5',
      },
      {
        heading: 'Salve Regina',
        text: `Salve, Regina, mater misericordiae,\nvita, dulcedo et spes nostra, salve.\n\nSalut, ô Reine, mère de miséricorde,\nnotre vie, notre douceur et notre espoir, salut.`,
        ref: 'Antienne mariale',
      },
    ],
  },
};

function openBreviary(prayerKey, chapeletLabel) {
  const panel   = document.getElementById('breviary-panel');
  const overlay = document.getElementById('breviary-overlay');
  const nameEl  = document.getElementById('brev-prayer-name');
  const dateEl  = document.getElementById('brev-date');
  const bodyEl  = document.getElementById('brev-body');

  if (!panel) return;
  // Stoppe une éventuelle lecture en cours (nouvel office)
  try { window._pelReader?.stop(); } catch (_) {}

  nameEl.textContent = PRAYER_NAMES[prayerKey] || prayerKey;

  const now    = getParisDate();
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  dateEl.textContent = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

  bodyEl.innerHTML = `
    <div class="brev-loading">
      <div class="brev-spinner"></div>
      <p>Chargement des textes du jour…</p>
      <p class="brev-note">Les textes officiels sont fournis par l'AELF<br>(Association Épiscopale Liturgique Francophone)</p>
    </div>`;

  panel.classList.add('open');
  overlay.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');

  const aelfMap = {
    laudes:   'laudes',
    messe:    'messes',
    vepres:   'vepres',
    complies: 'complies',
    soiree:   'vepres',    // Prière du soir → endpoint vêpres AELF
    matin:    'laudes',    // Prière du matin → endpoint laudes AELF
    chapelet: null,        // Pas d'endpoint AELF pour le chapelet
  };

  const aelfOffice = aelfMap[prayerKey];

  if (aelfOffice) {
    const d = getParisDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    const url = `/api/aelf?office=${aelfOffice}&y=${y}&m=${m}&d=${j}`;

    fetch(url)
      .then(async r => {
        if (r.status === 404) { renderFallback(prayerKey, bodyEl, 'unavailable'); return; }
        if (!r.ok) { renderFallback(prayerKey, bodyEl, 'error'); return; }
        const data = await r.json();
        console.log('[AELF] reçu pour', prayerKey, Object.keys(data));
        renderAelfData(data, prayerKey, bodyEl);
      })
      .catch(err => {
        console.error('[AELF] erreur réseau:', err.message);
        renderFallback(prayerKey, bodyEl, 'error');
      });
  } else {
    setTimeout(() => renderFallback(prayerKey, bodyEl, 'none', chapeletLabel || ''), 600);
  }
}

function renderAelfData(data, prayerKey, bodyEl) {
  try {
    let html = '';

    if (prayerKey === 'messe') {
      // Les messes AELF sont un tableau
      const messes = data.messes;
      if (!messes || !Array.isArray(messes) || messes.length === 0) {
        renderFallback(prayerKey, bodyEl); return;
      }
      html = renderMesseContent(messes);
    } else {
      // Laudes, vêpres, complies (et leurs alias matin / soiree)
      const key = prayerKey === 'soiree' ? 'vepres'
                : prayerKey === 'matin'  ? 'laudes'
                : prayerKey;
      const office = data[key];
      if (!office) { renderFallback(prayerKey, bodyEl); return; }
      html = renderOfficeContent(office);
    }

    if (!html.trim()) { renderFallback(prayerKey, bodyEl); return; }

    html += `<p class="brev-aelf-credit">Textes fournis par <a href="https://www.aelf.org" target="_blank" rel="noopener">l'AELF</a><br><small>Association Épiscopale Liturgique Francophone</small></p>`;
    bodyEl.innerHTML = html;
  } catch(e) {
    console.error('Erreur rendu AELF', e);
    renderFallback(prayerKey, bodyEl);
  }
}

// ── Lien AELF direct pour la date du jour ─────────────────────────────────────
function aelfDayUrl(office) {
  const d = getParisDate();
  const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `https://www.aelf.org/${ds}/france/${office}`;
}

// ── Laudes locales (fallback hebdomadaire) ─────────────────────────────────────
function renderLaudesLocal(bodyEl) {
  const dow = getParisDate().getDay();

  const PSAUMES = [
    { titre:'Psaume 63 — Soif de Dieu', ref:'Ps 63', ant:'Mon âme a soif de toi, Seigneur mon Dieu.',
      texte:`Dieu, tu es mon Dieu, je te cherche dès l'aube :\nmon âme a soif de toi,\nma chair brûle pour toi\ndans une terre aride, desséchée, sans eau.\n\nC'est ainsi que je t'ai contemplé au sanctuaire,\nvoyant ta force et ta gloire.\nTon amour vaut mieux que la vie,\nmes lèvres proclament ta louange !\n\nJe veux te bénir ma vie entière,\nlever les mains en invoquant ton nom.\nJe suis rassasié, comme par un festin de viandes grasses ;\nla joie sur les lèvres, je te loue !\n\nDans la nuit je me souviens de toi\net je reste des heures à te penser :\ncar tu as été mon secours,\nà l'ombre de tes ailes je crie de joie.\n\nMon âme s'attache à toi,\nta main droite me soutient.`},
    { titre:'Psaume 5 — Prière du matin', ref:'Ps 5', ant:'Seigneur, à l\'aurore tu entends ma voix.',
      texte:`Écoute mes paroles, Seigneur,\nentends ma plainte.\nSois attentif à ma voix qui crie vers toi,\nmon Roi et mon Dieu.\n\nC'est vers toi que je prie ;\ndès le matin, Seigneur, tu entends ma voix.\nDès le matin, je me prépare pour toi,\nje reste en attente.\n\nMoi, par ton grand amour,\nje peux entrer dans ta maison,\nje me prosterne vers ton temple saint\ndans la crainte que tu m'inspires.\n\nSeigneur, guide-moi dans ta justice\nà cause de mes ennemis ;\naplanis devant moi ta route.\n\nQue se réjouissent tous ceux qui s'abritent en toi ;\nqu'ils crient leur joie à jamais !\nTu les abrites, et ils t'exultent,\neux qui aiment ton nom.`},
    { titre:'Psaume 24 — Le bon chemin', ref:'Ps 24', ant:'Vers toi, Seigneur, j\'élève mon âme.',
      texte:`Vers toi, Seigneur, j'élève mon âme,\nmon Dieu, en toi je me confie.\n\nFais-moi connaître tes voies, Seigneur,\nenseigne-moi tes sentiers.\nFais-moi marcher selon ta vérité,\nenseigne-moi,\ncar tu es le Dieu de mon salut.\n\nRappelle-toi, Seigneur, ta tendresse,\nton amour qui est de toujours.\nN'évoque pas les fautes de ma jeunesse,\nmais souviens-toi de moi dans ton amour.\n\nIl est droit, il est bon, le Seigneur :\nil montre aux pécheurs le chemin.\nSa voie est justice pour les humbles,\nil enseigne aux humbles son chemin.`},
    { titre:'Psaume 36 — Confiance en Dieu', ref:'Ps 36, 1-11', ant:'Les humbles possèderont la terre.',
      texte:`Ne t'irrite pas contre les méchants,\nne jalouse pas les fauteurs d'injustice.\nComme l'herbe ils se dessèchent vite,\nils tombent comme la verdure.\n\nFie-toi au Seigneur et fais le bien,\nhabite la terre et reste fidèle.\nFais du Seigneur ta seule joie,\nil comblera les désirs de ton cœur.\n\nConfie au Seigneur ta destinée,\nmets en lui ta foi, il agira.\nIl fera paraître ton bon droit comme le jour,\nta justice comme le soleil de midi.\n\nLes humbles posséderont la terre,\nils jouiront d'une paix sans fin.`},
    { titre:'Psaume 57 — Appel à la justice', ref:'Ps 57', ant:'Levez-vous dès l\'aurore, cherchez Dieu.',
      texte:`Prononcez-vous vraiment selon la justice ?\nJugez-vous les fils des hommes avec droiture ?\n\nDieu, brise leurs dents dans leur bouche,\narrache les crocs des lionceaux.\nQu'ils s'écoulent comme l'eau qui ruisselle ;\nque l'homme juste se réjouisse\nen voyant la vengeance.\n\nLe juste se réjouira de voir le châtiment,\nil baignera ses pieds dans le sang des méchants.\nOn dira : "Vraiment, le juste a sa récompense,\nvraiment, il est un Dieu qui juge sur la terre."` },
    { titre:'Psaume 51 — Le miserere', ref:'Ps 51', ant:'Pitié pour moi, mon Dieu, dans ton amour.',
      texte:`Pitié pour moi, mon Dieu, dans ton amour,\nselon ta grande miséricorde, efface mon péché.\nLave-moi tout entier de ma faute,\npurifie-moi de mon offense.\n\nMon péché est devant moi sans cesse.\nContre toi, et toi seul, j'ai péché,\nce qui est mal à tes yeux, je l'ai fait.\n\nCrée en moi un cœur pur, ô mon Dieu,\nrenouvelle et raffermis au fond de moi mon esprit.\nNe me chasse pas loin de ta face,\nne me reprends pas ton esprit saint.\n\nRends-moi la joie d'être sauvé ;\nque l'esprit généreux me soutienne.\nSeigneur, ouvre mes lèvres,\net ma bouche annoncera ta louange.`},
    { titre:'Psaume 119 — L\'aurore et la Parole', ref:'Ps 119, 145-152', ant:'Seigneur, j\'ai crié vers toi dès l\'aurore.',
      texte:`De tout mon cœur je t'appelle, réponds-moi, Seigneur !\nJe veux garder tes commandements.\nJe t'appelle, sauve-moi,\nque je garde tes exigences !\n\nJ'ai devancé l'aurore, j'ai crié,\nj'espère en tes paroles.\nMes yeux ont devancé la nuit\npour méditer ta promesse.\n\nEntends ma voix dans ton amour, Seigneur ;\ndonne-moi la vie selon ton droit.\nCeux qui me persécutent sont proches,\nilssont loin de ta loi.\n\nTu es proche, Seigneur,\net tous tes commandements sont vérité.`},
  ];

  const LECTURES = [
    { ref:'Is 55, 1-3', texte:'Vous tous qui avez soif, venez, voici de l\'eau ! Vous qui n\'avez pas d\'argent, venez quand même. Écoutez et vous vivrez. Je ferai avec vous une alliance éternelle, les bienfaits assurés à David.' },
    { ref:'Sg 16, 28', texte:'Cela t\'apprend que l\'on doit devancer le soleil pour te rendre grâce, et te prier dès les premières lueurs.' },
    { ref:'Za 8, 8', texte:'Je les ramènerai, ils habiteront au milieu de Jérusalem, ils seront mon peuple et moi je serai leur Dieu dans la fidélité et la justice.' },
    { ref:'Ez 36, 25-26', texte:'Je répandrai sur vous une eau pure et vous serez purifiés. Je mettrai en vous un esprit nouveau, j\'enlèverai de votre corps le cœur de pierre, je vous donnerai un cœur de chair.' },
    { ref:'Rm 13, 12', texte:'La nuit est avancée, le jour approche. Rejetons les œuvres des ténèbres, revêtons les armes de la lumière.' },
    { ref:'Lm 3, 22-23', texte:'L\'amour du Seigneur ne s\'est pas épuisé, sa tendresse ne s\'est pas tarie. Elle se renouvelle chaque matin. Grande est ta fidélité !' },
    { ref:'Ap 7, 12', texte:'Amen ! Louange, gloire, sagesse, action de grâces, honneur, puissance et force à notre Dieu, pour les siècles des siècles ! Amen.' },
  ];

  const ps   = PSAUMES[dow];
  const lect = LECTURES[dow];
  const ant  = dow === 0 ? 'Alléluia, alléluia, alléluia !' : 'Béni soit le Seigneur, le Dieu d\'Israël.';

  let html = `<div class="brev-day-header"><span class="brev-day-name">Laudes — Prière du matin</span></div>`;

  // Hymne
  html += `<div class="brev-section brev-section--hymne">
    <div class="brev-section-title">Hymne</div>
    <div class="brev-text">
      <p>Lumière joyeuse, gloire du Père immortel,<br>céleste, saint, bienheureux, ô Jésus-Christ !</p>
      <p>Arrivés au coucher du soleil,<br>voyant la lumière du soir,<br>nous chantons Dieu : Père, Fils et Saint-Esprit.</p>
      <p>Tu es digne en tout temps d'être chanté par des voix pures,<br>ô Fils de Dieu qui donnes la vie ;<br>le monde entier te rend gloire.</p>
    </div>
  </div>`;

  // Psaume du jour
  html += `<div class="brev-section">
    <div class="brev-section-title">${ps.titre}</div>
    <span class="brev-ref">${ps.ref}</span>
    <div class="brev-antienne"><em class="brev-antienne-label">Ant.</em> ${ps.ant}</div>
    <div class="brev-text">${ps.texte.replace(/\n/g,'<br>')}</div>
    <div class="brev-antienne brev-antienne--after"><em class="brev-antienne-label">Ant.</em> ${ps.ant}</div>
  </div>`;

  // Lecture brève
  html += `<div class="brev-section">
    <div class="brev-section-title">Lecture brève</div>
    <span class="brev-ref">${lect.ref}</span>
    <div class="brev-text"><p>${lect.texte}</p></div>
  </div>`;

  // Benedictus — fixe chaque matin
  html += `<div class="brev-section">
    <div class="brev-section-title">Cantique de Zacharie — Benedictus</div>
    <span class="brev-ref">Lc 1, 68-79</span>
    <div class="brev-antienne"><em class="brev-antienne-label">Ant.</em> ${ant}</div>
    <div class="brev-text">
      <p>Béni soit le Seigneur, le Dieu d'Israël,<br>qui visite et rachète son peuple.</p>
      <p>Il nous a donné un puissant Sauveur<br>dans la maison de David, son serviteur,<br>comme il l'avait dit par la bouche de ses saints prophètes.</p>
      <p>C'est le salut qui nous arrache à l'ennemi<br>et à la main de tous nos oppresseurs,<br>pour montrer sa miséricorde envers nos pères,<br>et se souvenir de sa sainte alliance.</p>
      <p>Serment qu'il a juré à notre père Abraham<br>de nous rendre sans crainte,<br>afin que délivrés de la main des ennemis,<br>nous le servions dans la justice et la sainteté,<br>en sa présence, tout au long de nos jours.</p>
      <p>Et toi, petit enfant, tu seras appelé prophète du Très-Haut ;<br>tu marcheras devant, à la face du Seigneur,<br>et tu prépareras ses chemins<br>pour donner à son peuple de connaître le salut.</p>
      <p>Par le pardon de ses péchés,<br>grâce à la tendresse, à l'amour de notre Dieu,<br>quand nous visite l'astre d'en haut<br>pour illuminer ceux qui habitent les ténèbres<br>et l'ombre de la mort,<br>pour conduire nos pas au chemin de la paix.</p>
    </div>
    <div class="brev-antienne brev-antienne--after"><em class="brev-antienne-label">Ant.</em> ${ant}</div>
  </div>`;

  // Oraison
  html += `<div class="brev-section brev-section--oraison">
    <div class="brev-section-title">Oraison</div>
    <div class="brev-text brev-oraison">
      <p>Seigneur notre Dieu, en commençant ce jour sous le signe de ta lumière,<br>
      nous te demandons de nous aider à marcher dans tes voies,<br>
      à travailler pour ta gloire et le service de nos frères.<br>
      Par Jésus-Christ, notre Seigneur. Amen.</p>
    </div>
  </div>`;

  html += `<p class="brev-aelf-credit">Textes liturgiques — Liturgie des Heures<br>
    <small>Cycle hebdomadaire des Laudes · <a href="${aelfDayUrl('laudes')}" target="_blank" rel="noopener" style="color:var(--gold)">Textes du jour sur aelf.org →</a></small></p>`;
  bodyEl.innerHTML = html;
}

// ── Vêpres locales (fallback hebdomadaire) ────────────────────────────────────
function renderVepresLocal(bodyEl) {
  const dow = getParisDate().getDay();

  const PSAUMES = [
    [{ titre:'Psaume 110 — La royauté du Messie', ref:'Ps 110', ant:'Le Seigneur dit à mon Seigneur : siège à ma droite.',
       texte:`Oracle du Seigneur à mon Seigneur :\n« Siège à ma droite,\net je ferai de tes ennemis\nl'escabeau de tes pieds. »\n\nLe Seigneur tend depuis Sion\nle sceptre de ta puissance :\n« Règne sur tes ennemis tout proches ! »\n\nLe jour de ta victoire, sur les monts saints,\ndans l'aurore du matin,\ncomme la rosée, je t'ai engendré.\n\nLe Seigneur l'a juré, il ne s'en repentira pas :\n« Tu es prêtre pour toujours\nselon l'ordre de Melkisédek. »`},
     { titre:'Psaume 111 — Le bonheur du juste', ref:'Ps 111', ant:'Heureux l\'homme qui craint le Seigneur.',
       texte:`Heureux l'homme qui craint le Seigneur\net qui aime ses commandements !\n\nSa postérité sera puissante sur la terre,\nla génération des hommes droits sera bénie ;\nil y a dans sa maison richesse et abondance,\nsa justice demeure à jamais.\n\nIl est pour les ténèbres une lumière qui se lève,\ncet homme de bien, cet homme de pitié, ce juste.\n\nBien heureux l'homme plein de pitié qui prête ;\nil mène ses affaires avec droiture.\n\nIl n'est pas ébranlé ; éternellement\non se souvient du juste.\nSon cœur est sûr, il ne craint pas.\nSa justice demeure à jamais.`}],
    [{ titre:'Psaume 116 — Louange universelle', ref:'Ps 116', ant:'Allez par le monde entier, proclamez l\'Évangile.',
       texte:`Louez le Seigneur, vous toutes les nations,\nfêtez-le, vous tous les peuples !\n\nSon amour pour nous est immense,\nla fidélité du Seigneur est éternelle.`},
     { titre:'Psaume 117 — Action de grâces', ref:'Ps 117', ant:'Rendez grâce au Seigneur car il est bon.',
       texte:`Rendez grâce au Seigneur car il est bon,\néternel est son amour !\n\nQue le dise Israël :\néternel est son amour !\n\nDans ma détresse, j'ai crié vers le Seigneur,\nil m'a répondu, le Seigneur.\n\nLe Seigneur est pour moi, je ne crains rien :\nque peut me faire un homme ?\n\nMieux vaut s'appuyer sur le Seigneur\nque de compter sur les hommes.\n\nTu es mon Dieu, je te rends grâce ;\nmon Dieu, je t'exalte.\nRendez grâce au Seigneur car il est bon ;\néternel est son amour !`}],
    [{ titre:'Psaume 120 — Le Seigneur protège', ref:'Ps 120', ant:'Mon secours vient du Seigneur.',
       texte:`Je lève les yeux vers les montagnes :\nd'où le secours me viendra-t-il ?\nLe secours me vient du Seigneur\nqui a fait le ciel et la terre.\n\nIl ne permettra pas que ton pied chancelle ;\nton gardien ne sommeille pas.\nNon, il ne sommeille pas, il ne dort pas,\nle gardien d'Israël.\n\nLe Seigneur est ton gardien,\nle Seigneur est ton ombrage près de toi.\nLe jour, le soleil ne te frappera pas,\nni la lune dans la nuit.\n\nLe Seigneur te gardera de tout mal,\nil gardera ta vie.\nLe Seigneur gardera ton départ et ton arrivée,\ndès maintenant et pour toujours.`},
     { titre:'Psaume 121 — Joie du pèlerin', ref:'Ps 121', ant:'Allons à la maison du Seigneur.',
       texte:`Quelle joie quand on m'a dit :\n« Nous allons à la maison du Seigneur ! »\nNos pieds s'arrêtent, Jérusalem,\ndans tes portes !\n\nPrie pour la paix de Jérusalem :\nque vivent dans la paix ceux qui t'aiment !\nQue la paix règne dans tes murs,\ndans tes palais la tranquillité !\n\nA cause de mes frères et de mes proches,\nje dirai : « Paix sur toi ! »\nA cause de la maison du Seigneur notre Dieu,\nje prierai pour ton bonheur.`}],
    [{ titre:'Psaume 126 — Tout vient de Dieu', ref:'Ps 126', ant:'Si le Seigneur ne bâtit la maison, les bâtisseurs travaillent en vain.',
       texte:`Si le Seigneur ne bâtit la maison,\nles bâtisseurs travaillent pour rien.\nSi le Seigneur ne garde la ville,\nc'est pour rien que veillent les gardes.\n\nPour rien vous levez-vous dès l'aurore,\nvous couchez tard, vous mangez un pain de douleur :\nDieu en donne autant à ses bien-aimés\ndurant leur sommeil.\n\nOui, les fils sont un don du Seigneur,\nle fruit du sein une récompense.\nComme les flèches d'un guerrier,\ntels sont les fils de la jeunesse.\n\nHeureux l'homme qui en a garni son carquois !`},
     { titre:'Psaume 127 — La famille bénie', ref:'Ps 127', ant:'Heureux ceux qui craignent le Seigneur.',
       texte:`Heureux qui craint le Seigneur\net marche dans ses voies !\nTu te nourriras du travail de tes mains,\nheureux es-tu, à toi le bonheur !\n\nTa femme est une vigne féconde\nau fond de ta maison.\nTes fils, autour de ta table,\ndes plants d'olivier.\n\nVoilà comment est béni\nl'homme qui craint le Seigneur.\n\nQue le Seigneur te bénisse depuis Sion,\nque tu voies le bonheur de Jérusalem\ntous les jours de ta vie !`}],
    [{ titre:'Psaume 130 — Abandon à Dieu', ref:'Ps 130', ant:'Mon âme s\'appuie sur le Seigneur.',
       texte:`Seigneur, mon cœur n'est pas fier,\nni mon regard hautain ;\nje ne poursuis ni grands projets\nni merveilles qui me dépassent.\n\nNon, je tiens mon âme\négale et silencieuse ;\nmon âme est en moi comme un enfant,\ncomme un petit enfant contre sa mère.\n\nAttends le Seigneur, Israël,\nmaintenant et pour toujours.`},
     { titre:'Psaume 131 — L\'arche du Seigneur', ref:'Ps 131', ant:'Lève-toi, Seigneur, viens à ton lieu de repos.',
       texte:`Souviens-toi, Seigneur, de David,\net de toutes ses peines.\nIl avait juré au Seigneur,\nfait un vœu au Puissant de Jacob.\n\nNous avons appris qu'elle était à Ephrata,\nnous l'avons trouvée dans les plaines de Yahar.\nEntrons dans sa demeure,\nprosternons-nous à l'endroit où ses pieds se posent.\n\nCar le Seigneur a choisi Sion,\nil a désiré cette demeure.\nC'est ici mon lieu de repos pour toujours ;\nj'y habiterai, car je l'ai désiré.`}],
    [{ titre:'Psaume 135 — Litanie de la création', ref:'Ps 135, 1-9.13-14', ant:'Rendez grâce au Dieu des dieux.',
       texte:`Rendez grâce au Seigneur car il est bon,\néternel est son amour !\nRendez grâce au Dieu des dieux,\néternel est son amour !\nRendez grâce au Seigneur des seigneurs,\néternel est son amour !\n\nLui seul accomplit de grandes merveilles,\néternel est son amour !\nIl a fait les cieux avec sagesse,\néternel est son amour !\nIl a étendu la terre sur les eaux,\néternel est son amour !\nIl a fait les grands luminaires,\néternel est son amour !\nLe soleil pour régir le jour,\néternel est son amour !\nLa lune et les étoiles pour régir la nuit,\néternel est son amour !`},
     { titre:'Psaume 136 — Mémoire du salut', ref:'Ps 136, 1-6', ant:'Près des fleuves de Babylone, nous pleurions.',
       texte:`Près des fleuves de Babylone,\nnous étions assis et nous pleurions,\nnous souvenant de Sion.\n\nAux saules de ces rives\nnous avions pendu nos harpes.\n\nCeux qui nous avaient déportés\nnous demandaient des cantiques,\nnos bourreaux voulaient qu'on leur chante,\nen chantant : « Un cantique de Sion ! »\n\nComment chanterions-nous le chant du Seigneur\nsur une terre étrangère ?\n\nSi je t'oublie, Jérusalem,\nque ma main droite m'oublie !\nQue ma langue colle à mon palais\nsi je perds ton souvenir,\nsi je ne mets Jérusalem au sommet de ma joie !`}],
    [{ titre:'Psaume 138 — Dieu connaît tout', ref:'Ps 138', ant:'Seigneur, tu me scrutes et tu me connais.',
       texte:`Seigneur, tu me scrutes et tu me connais,\nque je me lève ou m'asseye, tu le sais,\nde loin tu discernes mes projets.\n\nQue je marche ou m'étende, tu le vois ;\ntoutes mes routes te sont familières.\n\nSans que la parole soit sur ma langue,\ndéjà, Seigneur, tu la connais entièrement.\n\nTu m'enserres de toutes parts,\ntu m'as mis la main dessus.\n\nUne telle science me dépasse,\nso élévation m'échappe.\n\nOù aller, loin de ton esprit ?\nOù fuir, loin de ta face ?\n\nSi je gravis les cieux, tu es là ;\nqu'au shéol je m'étende, te voilà.\n\nJe gravis les ailes de l'aurore,\nm'établis à l'extrême mer :\nLà encore, ta main me conduit,\nta droite me saisit.`},
     { titre:'Psaume 139 — Contre la violence', ref:'Ps 139, 1-6', ant:'Délivre-moi, Seigneur, des méchants.',
       texte:`Arrache-moi, Seigneur, aux gens de violence,\nprotège-moi contre les hommes de violence,\nceux qui méditent le mal dans leur cœur\net excitent chaque jour des conflits.\n\nLeur langue est venin de serpent,\nsous leurs lèvres un venin de vipère.\n\nSeigneur, garde-moi des mains des méchants,\nprotège-moi contre les hommes de violence,\nceux qui méditent ma chute.\n\nC'est toi, Seigneur, mon Dieu et ma force,\nentends, Seigneur, ma voix qui crie.`}],
  ];

  const LECTURES = [
    { ref:'Ap 19, 5-7', texte:'Une voix venait du trône : « Louez notre Dieu, vous tous ses serviteurs, vous qui le craignez, petits et grands ! » Et j\'entendis comme la clameur d\'une foule immense : « Alléluia ! Le Seigneur notre Dieu a pris possession de son règne. »' },
    { ref:'1 Pi 1, 3-5', texte:'Béni soit Dieu, le Père de notre Seigneur Jésus Christ : dans sa grande miséricorde, il nous a engendrés de nouveau pour une espérance vivante, par la résurrection de Jésus Christ d\'entre les morts.' },
    { ref:'Ep 3, 20-21', texte:'À Dieu qui, par sa puissance agissant en nous, est capable de faire bien au-delà de tout ce que nous demandons et imaginons, à lui la gloire dans l\'Église et en Jésus Christ, pour tous les âges et tous les siècles ! Amen.' },
    { ref:'Col 3, 16', texte:'Que la parole du Christ, en toute sa richesse, habite parmi vous : instruisez-vous en vous réciproquement avec sagesse ; chantez à Dieu de tout votre cœur avec reconnaissance des psaumes, des hymnes et des cantiques inspirés.' },
    { ref:'Ph 4, 4-5', texte:'Soyez toujours dans la joie du Seigneur ; je le dis encore, soyez dans la joie. Que votre bienveillance soit connue de tous les hommes. Le Seigneur est proche.' },
    { ref:'1 Jn 4, 16', texte:'Nous avons reconnu l\'amour que Dieu a pour nous, et nous y avons cru. Dieu est amour : celui qui demeure dans l\'amour demeure en Dieu, et Dieu demeure en lui.' },
    { ref:'Tb 13, 1-2', texte:'Béni soit Dieu qui vit à jamais et dont le règne dure à travers tous les âges ! Car il châtie et fait grâce, il fait descendre jusqu\'au séjour des morts et il en fait remonter. Rien n\'échappe à sa main.' },
  ];

  const psPair = PSAUMES[dow];
  const lect   = LECTURES[dow];
  const ant    = dow === 0 ? 'Alléluia, alléluia, alléluia !' : 'Ma bouche redira tes louanges, Seigneur.';

  let html = `<div class="brev-day-header"><span class="brev-day-name">Vêpres — Prière du soir</span></div>`;

  html += `<div class="brev-section brev-section--hymne">
    <div class="brev-section-title">Hymne</div>
    <div class="brev-text">
      <p>Avant que s'achève ce jour,<br>nous t'en supplions, Créateur du monde :<br>dans ta miséricorde, garde-nous<br>et protège-nous par ta grâce.</p>
      <p>Ô toi qui illumines la nuit,<br>toi qui sépares la nuit du jour,<br>avant que la lumière décline,<br>entends la voix de ceux qui prient.</p>
    </div>
  </div>`;

  psPair.forEach(ps => {
    html += `<div class="brev-section">
      <div class="brev-section-title">${ps.titre}</div>
      <span class="brev-ref">${ps.ref}</span>
      <div class="brev-antienne"><em class="brev-antienne-label">Ant.</em> ${ps.ant}</div>
      <div class="brev-text">${ps.texte.replace(/\n/g,'<br>')}</div>
      <div class="brev-antienne brev-antienne--after"><em class="brev-antienne-label">Ant.</em> ${ps.ant}</div>
    </div>`;
  });

  html += `<div class="brev-section">
    <div class="brev-section-title">Lecture brève</div>
    <span class="brev-ref">${lect.ref}</span>
    <div class="brev-text"><p>${lect.texte}</p></div>
  </div>`;

  // Magnificat — fixe chaque soir
  html += `<div class="brev-section">
    <div class="brev-section-title">Cantique de Marie — Magnificat</div>
    <span class="brev-ref">Lc 1, 46-55</span>
    <div class="brev-antienne"><em class="brev-antienne-label">Ant.</em> ${ant}</div>
    <div class="brev-text">
      <p>Mon âme exalte le Seigneur,<br>exulte mon esprit en Dieu, mon Sauveur !</p>
      <p>Il s'est penché sur son humble servante ;<br>désormais tous les âges me diront bienheureuse.</p>
      <p>Le Puissant fit pour moi des merveilles ;<br>Saint est son nom !<br>Son amour s'étend d'âge en âge<br>sur ceux qui le craignent.</p>
      <p>Déployant la force de son bras,<br>il disperse les superbes.<br>Il renverse les puissants de leurs trônes,<br>il élève les humbles.</p>
      <p>Il comble de biens les affamés,<br>renvoie les riches les mains vides.</p>
      <p>Il relève Israël, son serviteur ;<br>il se souvient de son amour,<br>de la promesse faite à nos pères,<br>en faveur d'Abraham et de sa race à jamais.</p>
    </div>
    <div class="brev-antienne brev-antienne--after"><em class="brev-antienne-label">Ant.</em> ${ant}</div>
  </div>`;

  html += `<div class="brev-section brev-section--oraison">
    <div class="brev-section-title">Oraison</div>
    <div class="brev-text brev-oraison">
      <p>Seigneur notre Dieu, au déclin de ce jour,<br>
      nous te rendons grâce pour les bienfaits reçus.<br>
      Que ta présence éclaire notre nuit,<br>
      et que ton amour nous garde dans la paix.<br>
      Par Jésus-Christ, notre Seigneur. Amen.</p>
    </div>
  </div>`;

  html += `<p class="brev-aelf-credit">Textes liturgiques — Liturgie des Heures<br>
    <small>Cycle hebdomadaire des Vêpres · <a href="${aelfDayUrl('vepres')}" target="_blank" rel="noopener" style="color:var(--gold)">Textes du jour sur aelf.org →</a></small></p>`;
  bodyEl.innerHTML = html;
}

// ── Messe locale (textes invariables + lien lectures du jour) ─────────────────
function renderMesseLocal(bodyEl) {
  const url = aelfDayUrl('messe');
  let html = `<div class="brev-day-header"><span class="brev-day-name">Messe du jour</span></div>`;

  // Lien direct vers les lectures
  html += `<div class="brev-section" style="background:rgba(197,160,82,0.08);border-radius:10px;padding:16px;">
    <div class="brev-section-title" style="color:var(--gold)">Lectures du jour</div>
    <div class="brev-text">
      <p>Les lectures Scripture changent chaque jour selon le calendrier liturgique.<br>
      Retrouvez-les directement sur l'AELF :</p>
      <p style="text-align:center;margin:14px 0">
        <a href="${url}" target="_blank" rel="noopener"
           style="color:var(--gold);font-weight:600;font-size:17px;text-decoration:none">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Lectures du jour sur aelf.org
        </a>
      </p>
    </div>
  </div>`;

  // Gloria
  html += `<div class="brev-section brev-section--hymne">
    <div class="brev-section-title">Gloria</div>
    <div class="brev-text">
      <p>Gloire à Dieu au plus haut des cieux,<br>et paix sur la terre aux hommes qu'il aime.</p>
      <p>Nous te louons, nous te bénissons,<br>nous t'adorons, nous te glorifions,<br>nous te rendons grâce, pour ton immense gloire.</p>
      <p>Seigneur Dieu, Roi du ciel,<br>Dieu le Père tout-puissant.<br>Seigneur, Fils unique, Jésus-Christ,<br>Seigneur Dieu, Agneau de Dieu, le Fils du Père.</p>
      <p>Toi qui enlèves le péché du monde,<br>prends pitié de nous.<br>Toi qui enlèves le péché du monde,<br>reçois notre prière.<br>Toi qui es assis à la droite du Père,<br>prends pitié de nous.</p>
      <p>Car toi seul es saint,<br>toi seul es Seigneur,<br>toi seul es le Très-Haut, Jésus-Christ,<br>avec le Saint-Esprit,<br>dans la gloire de Dieu le Père. Amen.</p>
    </div>
  </div>`;

  // Credo
  html += `<div class="brev-section">
    <div class="brev-section-title">Credo</div>
    <div class="brev-text">
      <p>Je crois en un seul Dieu, le Père tout-puissant,<br>Créateur du ciel et de la terre,<br>de l'univers visible et invisible.</p>
      <p>Je crois en un seul Seigneur, Jésus-Christ,<br>le Fils unique de Dieu,<br>né du Père avant tous les siècles :<br>Il est Dieu, né de Dieu,<br>lumière, née de la lumière,<br>vrai Dieu, né du vrai Dieu.</p>
      <p>Engendré, non pas créé,<br>de même nature que le Père ;<br>et par lui tout a été fait.<br>Pour nous les hommes,<br>et pour notre salut,<br>il descendit du ciel.</p>
      <p>Par l'Esprit Saint, il a pris chair de la Vierge Marie,<br>et s'est fait homme.<br>Crucifié pour nous sous Ponce Pilate,<br>il souffrit sa passion et fut mis au tombeau.<br>Il ressuscita le troisième jour,<br>conformément aux Écritures.</p>
      <p>Il monta au ciel ; il est assis à la droite du Père.<br>Il reviendra dans la gloire pour juger les vivants et les morts ;<br>et son règne n'aura pas de fin.</p>
      <p>Je crois en l'Esprit Saint,<br>qui est Seigneur et qui donne la vie ;<br>il procède du Père et du Fils.<br>Avec le Père et le Fils, il reçoit même adoration et même gloire ;<br>il a parlé par les prophètes.</p>
      <p>Je crois en l'Église, une, sainte, catholique et apostolique.<br>Je reconnais un seul baptême pour le pardon des péchés.<br>J'attends la résurrection des morts,<br>et la vie du monde à venir. Amen.</p>
    </div>
  </div>`;

  // Sanctus
  html += `<div class="brev-section brev-section--hymne">
    <div class="brev-section-title">Sanctus</div>
    <div class="brev-text">
      <p>Saint ! Saint ! Saint, le Seigneur, Dieu de l'univers !<br>Le ciel et la terre sont remplis de ta gloire.<br>Hosanna au plus haut des cieux.</p>
      <p>Béni soit celui qui vient au nom du Seigneur.<br>Hosanna au plus haut des cieux.</p>
    </div>
  </div>`;

  // Notre Père
  html += `<div class="brev-section">
    <div class="brev-section-title">Notre Père</div>
    <div class="brev-text">
      <p>Notre Père, qui es aux cieux,<br>que ton nom soit sanctifié,<br>que ton règne vienne,<br>que ta volonté soit faite<br>sur la terre comme au ciel.</p>
      <p>Donne-nous aujourd'hui notre pain de ce jour.<br>Pardonne-nous nos offenses,<br>comme nous pardonnons aussi<br>à ceux qui nous ont offensés.<br>Et ne nous soumets pas à la tentation,<br>mais délivre-nous du Mal. Amen.</p>
    </div>
  </div>`;

  html += `<p class="brev-aelf-credit">Textes liturgiques — Missel romain<br>
    <small><a href="${url}" target="_blank" rel="noopener" style="color:var(--gold)">Lectures complètes sur aelf.org →</a></small></p>`;
  bodyEl.innerHTML = html;
}

// ── Helper : rend le contenu AELF (HTML ou texte brut) ───────────────────────
function aelfHtml(str) {
  if (!str) return '';
  // Si le contenu contient déjà des balises HTML, l'utiliser directement
  if (/<[a-z][\s\S]*>/i.test(str)) return str;
  // Sinon : double saut de ligne = nouveau paragraphe, simple saut = <br>
  return str.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

// ── Office des heures (laudes, vêpres, complies) ─────────────────────────────
function renderOfficeContent(office) {
  let html = '';

  // En-tête liturgique
  const info = office.informations || {};
  if (info.jour_liturgique_nom || info.couleur) {
    html += `<div class="brev-day-header">`;
    if (info.jour_liturgique_nom) {
      html += `<span class="brev-day-name">${info.jour_liturgique_nom}</span>`;
    }
    if (info.couleur) {
      html += `<span class="brev-color-badge brev-color-${info.couleur}">${info.couleur}</span>`;
    }
    html += `</div>`;
  }

  // Psaumes, hymne, cantiques, benedictus, magnificat…
  const psaumes = office.psaumes || [];
  psaumes.forEach(ps => {
    const type    = (ps.type || '').toLowerCase();
    const isHymne = type === 'hymne';
    const titre   = ps.titre || '';

    html += `<div class="brev-section${isHymne ? ' brev-section--hymne' : ''}">`;
    if (titre) html += `<div class="brev-section-title">${titre}</div>`;
    if (ps.refs) html += `<span class="brev-ref">${ps.refs}</span>`;

    // Antienne (avant)
    if (ps.antienne) {
      html += `<div class="brev-antienne"><em class="brev-antienne-label">Ant.</em> ${ps.antienne}</div>`;
    }

    // Versets du psaume
    if (ps.versets && ps.versets.length) {
      html += `<div class="brev-text">`;
      ps.versets.forEach(v => {
        const vClass = (v.type === 'gloria') ? ' class="brev-gloria"' : '';
        html += `<p${vClass}>${(v.verset || '').replace(/\n/g, '<br>')}</p>`;
      });
      html += `</div>`;
    }
    // NB : on garde .replace(\n) pour les versets (texte brut AELF)

    // Antienne (répétition après)
    if (ps.antienne) {
      html += `<div class="brev-antienne brev-antienne--after"><em class="brev-antienne-label">Ant.</em> ${ps.antienne}</div>`;
    }

    html += `</div>`;
  });

  // Lectures courtes / longues
  const lectures = office.lectures || [];
  lectures.forEach(lect => {
    html += `<div class="brev-section">`;
    if (lect.titre)   html += `<div class="brev-section-title">${lect.titre}</div>`;
    if (lect.ref)     html += `<span class="brev-ref">${lect.ref}</span>`;
    if (lect.contenu) html += `<div class="brev-text">${aelfHtml(lect.contenu)}</div>`;
    html += `</div>`;
  });

  // Répons
  const repons = office.repons || [];
  repons.forEach(rep => {
    if (rep.contenu) {
      html += `<div class="brev-section brev-section--repons">
        <div class="brev-section-title">Répons</div>
        <div class="brev-text brev-repons">${aelfHtml(rep.contenu)}</div>
      </div>`;
    }
  });

  // Oraison finale
  if (office.oraison && office.oraison.contenu) {
    html += `<div class="brev-section brev-section--oraison">
      <div class="brev-section-title">Oraison</div>
      <div class="brev-text brev-oraison">${aelfHtml(office.oraison.contenu)}</div>
    </div>`;
  }

  return html;
}

// ── Messe ─────────────────────────────────────────────────────────────────────
function renderMesseContent(messes) {
  let html = '';

  messes.forEach((messe, idx) => {
    const info = messe.informations || {};

    // En-tête
    const nomMesse = messe.nom || info.jour_liturgique_nom || '';
    if (nomMesse || info.couleur) {
      html += `<div class="brev-day-header">`;
      if (nomMesse) html += `<span class="brev-day-name">${nomMesse}</span>`;
      if (info.couleur) html += `<span class="brev-color-badge brev-color-${info.couleur}">${info.couleur}</span>`;
      html += `</div>`;
    }

    const lectures = messe.lectures || [];
    lectures.forEach(lect => {
      const type       = (lect.type || '').toLowerCase();
      const isEvangile = type === 'evangile';
      const isPsaume   = type === 'psaume';
      const isAlleluia = type === 'verset_alleluia';

      let secClass = 'brev-section';
      if (isEvangile) secClass += ' brev-section--evangile';
      if (isPsaume)   secClass += ' brev-section--psaume';

      html += `<div class="${secClass}">`;
      if (lect.titre) html += `<div class="brev-section-title">${lect.titre}</div>`;
      if (lect.ref)   html += `<span class="brev-ref">${lect.ref}</span>`;
      if (lect.contenu) {
        if (isAlleluia) {
          html += `<div class="brev-text brev-alleluia">${aelfHtml(lect.contenu)}</div>`;
        } else if (isEvangile) {
          html += `<div class="brev-text brev-evangile">${aelfHtml(lect.contenu)}</div>`;
        } else {
          html += `<div class="brev-text">${aelfHtml(lect.contenu)}</div>`;
        }
      }
      html += `</div>`;
    });

    if (idx < messes.length - 1) {
      html += `<hr class="brev-separator">`;
    }
  });

  return html;
}

// ── Complies locales — cycle hebdomadaire (fallback quand AELF indisponible) ──
function renderCompliesLocal(bodyEl) {
  const dow = getParisDate().getDay(); // 0=dim … 6=sam

  // ── Psaumes selon le jour ────────────────────────────────────────────────
  const PSAUMES = {
    0: [{ // Dimanche
      titre: 'Psaume 91 — La sécurité du juste',
      ref: 'Ps 91',
      ant: 'Tu ne craindras pas les terreurs de la nuit.',
      texte: `Il habite à l'abri du Très-Haut,\ngîte à l'ombre du Tout-Puissant.\nJe dis au Seigneur : « Mon refuge, mon rempart,\nmon Dieu, en qui je m'appuie ! »\n\nC'est lui qui te libère du filet du chasseur,\nde la mort qui frappe dans les ténèbres.\nDe son plumage il te couvre,\net sous ses ailes tu trouves refuge :\nsa vérité est bouclier et armure.\n\nTu ne craindras ni les terreurs de la nuit,\nni la flèche qui vole de jour,\nni la mort qui rôde dans les ténèbres,\nni le fléau qui dévaste à midi.\n\nQu'il en tombe mille à tes côtés,\ndix mille à ta droite,\ntoi, tu restes hors d'atteinte.\n\nCar tu as dit : « Le Seigneur est mon refuge ! »\nEt tu as fait du Très-Haut ta demeure.\nAucun malheur ne peut t'atteindre,\naucun fléau n'approche de ta tente.\n\nCar il donne mission à ses anges\nde te garder sur tous tes chemins.\nIls te porteront sur leurs mains\npour que ton pied ne heurte une pierre.\n\n« Puisqu'il s'attache à moi, je le libère ;\nje le protège, car il connaît mon nom.\nIl m'appelle, et moi, je lui réponds ;\nje suis avec lui dans le malheur ;\nje le délivre et le glorifie.\nJe le rassasie de longs jours,\net je lui fais voir mon salut. »`,
    }],
    1: [{ // Lundi
      titre: 'Psaume 86 — Sion, mère de tous les peuples',
      ref: 'Ps 86',
      ant: 'Le Seigneur aime les portes de Sion.',
      texte: `Sa fondation est sur les monts saints :\nle Seigneur aime les portes de Sion\nplus que toutes les demeures de Jacob.\n\nOn dit de toi des choses glorieuses,\ncité de Dieu !\n\nJe compte Rahab et Babylone\nparmi ceux qui me connaissent ;\nvois Philistie, Tyr, avec l'Éthiopie :\ntel est né là-bas.\n\nMais de Sion on dit : « Chacun y est né » ;\net c'est lui, le Très-Haut, qui l'affermit.\n\nLe Seigneur inscrit au registre des peuples :\n« C'est là qu'il est né. »\n\nEt les danseurs diront : « Toutes mes sources sont en toi. »`,
    }, {
      titre: 'Psaume 143 — Prière du soir',
      ref: 'Ps 143, 1-11',
      ant: 'Exauce-moi, Seigneur, ne te détourne pas de moi.',
      texte: `Seigneur, écoute ma prière,\nentends ma supplication ;\npar ta fidélité, réponds-moi,\npar ta justice.\n\nN'entre pas en jugement avec ton serviteur :\ndevant toi, aucun vivant n'est juste.\n\nL'ennemi pourchasse mon âme,\nil écrase ma vie contre terre ;\nil me relègue dans les ténèbres,\ncomme les morts depuis toujours.\n\nMon esprit s'abat en moi,\nmon cœur se glace en dedans.\n\nJe me souviens du passé,\nje réfléchis à toutes tes œuvres,\nj'évoque les actions de tes mains.\n\nVers toi j'étends les mains,\nmon âme est comme une terre assoiffée.\n\nSeigneur, répondez vite ; mon souffle s'épuise.\nNe me cache pas ton visage,\nje serais comme ceux qui descendent dans la fosse.\n\nFais-moi entendre au matin ton amour,\ncar en toi j'ai confiance ;\nfais-moi connaître la route à prendre,\ncar vers toi j'élève mon âme.\n\nApprends-moi à faire ta volonté,\ncar tu es mon Dieu ;\nque ton bon esprit me conduise\nsur une terre unie.`,
    }],
    2: [{ // Mardi
      titre: 'Psaume 31 — Confiance en Dieu',
      ref: 'Ps 31, 1-6',
      ant: 'En toi, Seigneur, j\'ai mon refuge.',
      texte: `En toi, Seigneur, j'ai mon refuge ;\nque jamais je ne sois déçu !\nDans ta justice, délivre-moi.\n\nTends vers moi l'oreille,\nviens vite à mon secours ;\nsois pour moi le rocher de refuge,\nla forteresse qui me sauve.\n\nTu es mon rocher, ma forteresse ;\npour l'honneur de ton nom, tu me guides, tu me mènes.\n\nTu me dégageras du filet qu'ils m'ont tendu,\ncar tu es mon soutien.\n\nEn tes mains je remets mon esprit ;\nje t'appartiens, Seigneur,\nDieu de vérité.`,
    }, {
      titre: 'Psaume 130 — L\'humilité devant Dieu',
      ref: 'Ps 130',
      ant: 'Mon âme s\'appuie sur le Seigneur.',
      texte: `Seigneur, mon cœur n'est pas fier,\nni mon regard hautain ;\nje ne poursuis ni grands projets\nni merveilles qui me dépassent.\n\nNon, je tiens mon âme\négale et silencieuse ;\nmon âme est en moi comme un enfant,\ncomme un petit enfant contre sa mère.\n\nAttends le Seigneur, Israël,\nmaintenant et pour toujours.`,
    }],
    3: [{ // Mercredi
      titre: 'Psaume 16 — Sous la garde de Dieu',
      ref: 'Ps 16',
      ant: 'Garde-moi, Seigneur, à l\'ombre de tes ailes.',
      texte: `Seigneur, entends ma juste cause,\nsois attentif à ma plainte ;\nprête l'oreille à ma prière :\nmes lèvres ne trompent pas.\n\nQue ta sentence vienne de ta face ;\nque tes yeux voient ce qui est droit.\n\nTu sondes mon cœur, tu le visites la nuit ;\ntu m'éprouves, tu ne trouves rien ;\nma bouche ne transgresse pas.\n\nMoi, je marcherai dans la justice ;\nquand tu te révèles, je me rassasierai de ton image.\n\nMoi, dans la justice, je verrai ta face\net je me rassasierai, à mon réveil, de ta présence.`,
    }],
    4: [{ // Jeudi
      titre: 'Psaume 16 — Sous la garde de Dieu',
      ref: 'Ps 16',
      ant: 'À l\'abri de tes ailes, protège-moi.',
      texte: `Seigneur, entends ma juste cause,\nsois attentif à ma plainte ;\nprête l'oreille à ma prière :\nmes lèvres ne trompent pas.\n\nQue ta sentence vienne de ta face ;\nque tes yeux voient ce qui est droit.\n\nTu sondes mon cœur, tu le visites la nuit ;\ntu m'éprouves, tu ne trouves rien ;\nma bouche ne transgresse pas.\n\nJe t'appelle, toi qui me réponds, mon Dieu ;\ntends l'oreille vers moi, entends mes paroles.\n\nMontre tes grands actes d'amour,\ntoi qui sauves des assaillants\nceux qui s'abritent à ta droite.\n\nGarde-moi comme la prunelle de tes yeux ;\nà l'ombre de tes ailes, cache-moi.`,
    }],
    5: [{ // Vendredi
      titre: 'Psaume 4 — Prière du soir',
      ref: 'Ps 4',
      ant: 'Le Seigneur m\'entend quand je crie vers lui.',
      texte: `Quand je crie, réponds-moi,\nDieu, ma justice !\nToi qui me libérais dans la détresse,\nprends pitié de moi, écoute ma prière !\n\nFils des hommes, jusqu'où allez-vous\nmépriser ma gloire,\naimer le néant et courir au mensonge ?\n\nSachez que le Seigneur met à part\ncelui qui lui est fidèle :\nle Seigneur m'entend quand je crie vers lui.\n\nTremblez, ne péchez pas :\nsur vos couches, en silence, demeurez recueillis.\n\nOffrez le sacrifice de justice\net confiez-vous au Seigneur.\n\nBeaucoup demandent : « Qui nous fera voir le bonheur ? »\nQue sur nous brille la lumière de ta face, Seigneur !\n\nTu mets dans mon cœur plus de joie\nqu'en leur saison d'abondance, blé et vin.\n\nOui, je me couche et m'endors en paix,\ncar toi seul, Seigneur, tu m'établis en sécurité.`,
    }],
    6: [{ // Samedi
      titre: 'Psaume 4 — Prière du soir',
      ref: 'Ps 4',
      ant: 'Je me couche et m\'endors en paix.',
      texte: `Quand je crie, réponds-moi,\nDieu, ma justice !\nToi qui me libérais dans la détresse,\nprends pitié de moi, écoute ma prière !\n\nFils des hommes, jusqu'où allez-vous\nmépriser ma gloire,\naimer le néant et courir au mensonge ?\n\nSachez que le Seigneur met à part\ncelui qui lui est fidèle :\nle Seigneur m'entend quand je crie vers lui.\n\nTremblez, ne péchez pas :\nsur vos couches, en silence, demeurez recueillis.\n\nOffrez le sacrifice de justice\net confiez-vous au Seigneur.\n\nTu mets dans mon cœur plus de joie\nqu'en leur saison d'abondance, blé et vin.\n\nOui, je me couche et m'endors en paix,\ncar toi seul, Seigneur, tu m'établis en sécurité.`,
    }, {
      titre: 'Psaume 134 — Louange nocturne',
      ref: 'Ps 134',
      ant: 'Pendant la nuit, levez les mains vers le sanctuaire.',
      texte: `Louez le nom du Seigneur,\nlouez-le, vous ses serviteurs,\nvous qui vous tenez dans la maison du Seigneur,\ndans les parvis de la maison de notre Dieu.\n\nLouez le Seigneur, car il est bon,\nchantez son nom, car il est beau.\nCar le Seigneur s'est choisi Jacob,\nIsraël comme son trésor.\n\nQue Sion bénisse le Seigneur,\nlui qui habite à Jérusalem !`,
    }],
  };

  // ── Lectures brèves (rotation sur 7) ────────────────────────────────────
  const LECTURES = [
    { ref: '1 Th 5, 23', texte: 'Que le Dieu de la paix lui-même vous sanctifie totalement, et que votre être entier — l\'esprit, l\'âme et le corps — soit gardé sans reproche à l\'avènement de notre Seigneur Jésus-Christ.' },
    { ref: '1 Pi 5, 8-9', texte: 'Soyez sobres et vigilants. Votre adversaire, le diable, rôde comme un lion rugissant, cherchant quelqu\'un à dévorer. Résistez-lui avec la force de la foi.' },
    { ref: 'Jr 14, 9', texte: 'Toi qui es au milieu de nous, Seigneur, ton nom a été invoqué sur nous, ne nous abandonne pas !' },
    { ref: 'Ap 22, 4-5', texte: 'Les serviteurs de Dieu verront sa face. Il n\'y aura plus de nuit, et ils n\'auront besoin ni de lampe ni de lumière, car le Seigneur Dieu les illuminera, et ils régneront pour les siècles des siècles.' },
    { ref: 'Dt 6, 4-7', texte: 'Écoute, Israël : le Seigneur notre Dieu est le Seigneur Un. Tu aimeras le Seigneur ton Dieu de tout ton cœur, de toute ton âme et de toute ta force.' },
    { ref: 'Rm 8, 38-39', texte: 'J\'ai la certitude que ni la mort ni la vie, ni les anges ni les dominations, ni le présent ni l\'avenir, ni les puissances, ni aucune créature ne pourra nous séparer de l\'amour de Dieu qui est en Jésus-Christ notre Seigneur.' },
    { ref: 'Ps 31, 5', texte: 'En tes mains je remets mon esprit. Tu me rachètes, Seigneur, Dieu de vérité.' },
  ];

  const psaumes = PSAUMES[dow] || PSAUMES[5];
  const lect    = LECTURES[dow];

  let html = '';

  // En-tête
  html += `<div class="brev-day-header">
    <span class="brev-day-name">Complies — Prière de la nuit</span>
  </div>`;

  // Hymne
  html += `<div class="brev-section brev-section--hymne">
    <div class="brev-section-title">Hymne</div>
    <div class="brev-text">
      <p>Avant que s'achève ce jour,<br>
      nous t'en supplions, Créateur du monde :<br>
      dans ta miséricorde, garde-nous<br>
      et protège-nous par ta grâce.</p>
      <p>Éloigne de nous les rêves mauvais<br>
      et les fantômes de la nuit ;<br>
      tiens en lisière notre ennemi<br>
      et garde nos corps sans souillure.</p>
    </div>
  </div>`;

  // Psaume(s)
  psaumes.forEach(ps => {
    html += `<div class="brev-section">
      <div class="brev-section-title">${ps.titre}</div>
      <span class="brev-ref">${ps.ref}</span>
      <div class="brev-antienne"><em class="brev-antienne-label">Ant.</em> ${ps.ant}</div>
      <div class="brev-text">${ps.texte.replace(/\n/g, '<br>')}</div>
      <div class="brev-antienne brev-antienne--after"><em class="brev-antienne-label">Ant.</em> ${ps.ant}</div>
    </div>`;
  });

  // Lecture brève
  html += `<div class="brev-section">
    <div class="brev-section-title">Lecture brève</div>
    <span class="brev-ref">${lect.ref}</span>
    <div class="brev-text"><p>${lect.texte}</p></div>
  </div>`;

  // Cantique de Syméon (Nunc Dimittis) — fixe chaque soir
  html += `<div class="brev-section">
    <div class="brev-section-title">Cantique de Syméon</div>
    <span class="brev-ref">Lc 2, 29-32</span>
    <div class="brev-antienne"><em class="brev-antienne-label">Ant.</em> Protège-nous, Seigneur, pendant notre veille ; garde-nous dans la paix de ton repos.</div>
    <div class="brev-text">
      <p>Maintenant, ô Maître souverain,<br>
      tu peux laisser ton serviteur s'en aller en paix,<br>
      selon ta parole.</p>
      <p>Car mes yeux ont vu ton salut<br>
      que tu préparais à la face des peuples :<br>
      lumière pour éclairer les nations,<br>
      et gloire d'Israël ton peuple.</p>
    </div>
    <div class="brev-antienne brev-antienne--after"><em class="brev-antienne-label">Ant.</em> Protège-nous, Seigneur, pendant notre veille ; garde-nous dans la paix de ton repos.</div>
  </div>`;

  // Oraison
  html += `<div class="brev-section brev-section--oraison">
    <div class="brev-section-title">Oraison</div>
    <div class="brev-text brev-oraison">
      <p>Visitez, Seigneur, cette demeure,<br>
      et repoussez loin d'elle toutes les embûches de l'ennemi ;<br>
      que vos saints anges y habitent<br>
      pour nous garder dans la paix,<br>
      et que votre bénédiction soit toujours sur nous.<br>
      Par Jésus-Christ, notre Seigneur. Amen.</p>
    </div>
  </div>`;

  // Salve Regina
  html += `<div class="brev-section">
    <div class="brev-section-title">Salve Regina</div>
    <div class="brev-text" style="font-style:italic">
      <p>Salut, ô Reine, Mère de miséricorde,<br>
      notre vie, notre douceur et notre espoir, salut !<br>
      Vers toi nous crions, pauvres enfants d'Ève en exil ;<br>
      vers toi nous soupirons, gémissant et pleurant<br>
      dans cette vallée de larmes.</p>
      <p>Ô toi, notre avocate, tourne vers nous<br>
      tes regards miséricordieux,<br>
      et après cet exil, montre-nous Jésus,<br>
      le fruit béni de tes entrailles.<br>
      Ô clémente, ô pieuse,<br>
      ô douce Vierge Marie !</p>
    </div>
  </div>`;

  html += `<p class="brev-aelf-credit">Textes liturgiques — Liturgie des Heures<br>
    <small>Rite romain · Cycle hebdomadaire des Complies</small></p>`;

  bodyEl.innerHTML = html;
}

/* ────────────────────────────────────────────
   CHAPELET — textes locaux (mystères + prières)
──────────────────────────────────────────────*/
const CHAPELET_MYST = {
  joyeux:     { name: 'Mystères Joyeux',     list: ["L'Annonciation","La Visitation","La Nativité de Jésus","La Présentation au Temple","Le Recouvrement au Temple"] },
  douloureux: { name: 'Mystères Douloureux', list: ["L'Agonie à Gethsémani","La Flagellation","Le Couronnement d'épines","Le Portement de Croix","La Crucifixion et la Mort de Jésus"] },
  lumineux:   { name: 'Mystères Lumineux',   list: ["Le Baptême de Jésus","Les Noces de Cana","L'Annonce du Royaume","La Transfiguration","L'Institution de l'Eucharistie"] },
  glorieux:   { name: 'Mystères Glorieux',   list: ["La Résurrection","L'Ascension","La Pentecôte","L'Assomption de Marie","Le Couronnement de Marie"] },
};
const CHAPELET_DOW = { 0:'glorieux', 1:'joyeux', 2:'douloureux', 3:'glorieux', 4:'lumineux', 5:'douloureux', 6:'joyeux' };

function renderChapeletLocal(bodyEl, label) {
  const lc = (label || '').toLowerCase();

  if (lc.includes('miséricorde') || lc.includes('misericorde')) {
    renderDivineMercyLocal(bodyEl, label);
    return;
  }

  // Rosaire classique
  const key     = CHAPELET_DOW[getParisDate().getDay()];
  const mystery = CHAPELET_MYST[key];
  const isLatin = lc.includes('latin');

  let html = `
    <div class="brev-day-header">
      <span class="brev-day-name">${label || 'Le Saint Rosaire'}</span>
      ${isLatin ? '<span class="brev-color-badge" style="background:#185FA5">Latin</span>' : ''}
    </div>

    <div class="brev-section brev-section--hymne">
      <div class="brev-section-title"><i class="fa-solid fa-star-of-david"></i> ${mystery.name}</div>
      <p class="brev-text" style="font-style:italic;color:var(--text-soft);font-size:13px;margin-bottom:12px;">
        Tradition catholique — ${['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][getParisDate().getDay()]}
      </p>
      <ol class="chapelet-mystery-list">
        ${mystery.list.map((m, i) => `<li><span class="ch-mystery-num">${i+1}</span><span>${m}</span></li>`).join('')}
      </ol>
    </div>

    <div class="brev-section">
      <div class="brev-section-title"><i class="fa-solid fa-hands-praying"></i> Séquence d'une décade</div>
      <div class="brev-text">
        <p><strong>Au début de chaque décade :</strong><br>Notre Père</p>
        <p><strong>10 fois :</strong><br>${isLatin ? 'Ave Maria, gratia plena…' : 'Je vous salue Marie, pleine de grâce…'}</p>
        <p><strong>À la fin :</strong><br>Gloire au Père, au Fils et au Saint-Esprit, comme il était au commencement, maintenant et toujours, dans les siècles des siècles. Amen.<br>
        <em>Ô mon Jésus, pardonnez-nous nos péchés, préservez-nous du feu de l'enfer, conduisez au ciel toutes les âmes, surtout celles qui ont le plus besoin de votre miséricorde.</em></p>
      </div>
    </div>

    <div class="brev-section">
      <div class="brev-section-title"><i class="fa-solid fa-cross"></i> Prières de l'introduction</div>
      <div class="brev-text">
        <p><strong>Je crois en Dieu</strong> (Credo des Apôtres)</p>
        <p><strong>Notre Père</strong></p>
        <p><strong>3 × Je vous salue Marie</strong> (pour la foi, l'espérance, la charité)</p>
        <p><strong>Gloire au Père</strong></p>
      </div>
    </div>

    <div class="brev-section">
      <div class="brev-section-title"><i class="fa-solid fa-radio"></i> Suivre sur les radios</div>
      <div class="brev-text" style="font-size:13px;">
        <p>Radio Maria · Radio Notre-Dame · Sanctuaire de Lourdes</p>
        <p style="color:var(--text-soft)">Les sources radio proposées dans la timeline vous permettent de prier en communion avec les fidèles en direct.</p>
      </div>
    </div>

    <p class="brev-aelf-credit">Le Saint Rosaire<br>
      <small>Tradition bénédictine · Mystères selon le jour de la semaine</small></p>
  `;
  bodyEl.innerHTML = html;
}

function renderDivineMercyLocal(bodyEl, label) {
  bodyEl.innerHTML = `
    <div class="brev-day-header">
      <span class="brev-day-name">${label || 'Chapelet de la Divine Miséricorde'}</span>
      <span class="brev-color-badge" style="background:#993556">15h00</span>
    </div>

    <div class="brev-section brev-section--hymne">
      <div class="brev-section-title"><i class="fa-solid fa-heart"></i> Introduction</div>
      <div class="brev-text">
        <p>Signe de Croix</p>
        <p><strong>Prière d'ouverture</strong><br>
        Ô Sang et Eau, qui avez jailli du Cœur de Jésus comme une source de miséricorde pour nous,
        je me confie en Vous.</p>
        <p><strong>Notre Père</strong></p>
        <p><strong>Je vous salue Marie</strong></p>
        <p><strong>Je crois en Dieu</strong></p>
      </div>
    </div>

    <div class="brev-section">
      <div class="brev-section-title"><i class="fa-solid fa-circle-dot"></i> Les 5 dizaines</div>
      <div class="brev-text">
        <p><strong>Sur les grandes perles (5×) :</strong></p>
        <p class="brev-antienne">« Père éternel, j'offre le Corps et le Sang, l'Âme et la Divinité de votre Fils bien-aimé, Notre Seigneur Jésus-Christ, en réparation de nos péchés et ceux du monde entier. »</p>
        <p><strong>Sur les petites perles (10× par dizaine) :</strong></p>
        <p class="brev-antienne">« Pour sa douloureuse Passion, ayez pitié de nous et du monde entier. »</p>
      </div>
    </div>

    <div class="brev-section">
      <div class="brev-section-title"><i class="fa-solid fa-cross"></i> Conclusion (3 fois)</div>
      <div class="brev-text">
        <p class="brev-antienne">« Dieu Saint, Dieu Fort, Dieu Éternel, ayez pitié de nous et du monde entier. »</p>
        <p style="margin-top:12px;"><strong>Prière finale :</strong><br>
        Ô Sang et Eau qui avez jailli du Cœur de Jésus comme une source de miséricorde pour nous,
        nous avons confiance en Vous !</p>
      </div>
    </div>

    <div class="brev-section">
      <div class="brev-section-title"><i class="fa-solid fa-book"></i> Histoire</div>
      <div class="brev-text" style="font-size:13px;color:var(--text-soft);">
        <p>Ce chapelet a été révélé à sainte Faustine Kowalska (1905–1938), religieuse polonaise,
        qui en a consigné la forme dans son <em>Journal de la Miséricorde Divine</em>.
        Il se prie traditionnellement à 15h00, l'heure de l'agonie de Notre Seigneur.</p>
      </div>
    </div>

    <p class="brev-aelf-credit">Chapelet de la Divine Miséricorde<br>
      <small>Révélé à sainte Faustine Kowalska · 1935</small></p>
  `;
}

function renderFallback(prayerKey, bodyEl, reason, chapeletLabel) {
  // Chapelet → toujours le rendu local enrichi (pas d'AELF pour le chapelet)
  if (prayerKey === 'chapelet') { renderChapeletLocal(bodyEl, chapeletLabel || ''); return; }

  // Offices non disponibles sur AELF → textes locaux permanents
  if (reason === 'unavailable' || reason === 'error') {
    if (prayerKey === 'complies')                          { renderCompliesLocal(bodyEl); return; }
    if (prayerKey === 'laudes' || prayerKey === 'matin')   { renderLaudesLocal(bodyEl);   return; }
    if (prayerKey === 'vepres' || prayerKey === 'soiree')  { renderVepresLocal(bodyEl);   return; }
    if (prayerKey === 'messe')                             { renderMesseLocal(bodyEl);    return; }
  }

  const names = {
    laudes:   'Laudes — Prière du matin',
    matin:    'Prière du matin',
    messe:    'Messe du jour',
    vepres:   'Vêpres — Prière du soir',
    soiree:   'Prière du soir',
    complies: 'Complies — Prière de la nuit',
    chapelet: 'Le Saint Rosaire',
  };
  const nom = names[prayerKey] || 'Prière';

  let icon, msg;
  if (reason === 'unavailable') {
    icon = '<i class="fa-solid fa-calendar-xmark" style="color:var(--gold);font-size:28px;margin-bottom:12px;display:block"></i>';
    msg  = `<p>Les textes de cet office ne sont pas publiés par l'AELF pour aujourd'hui.</p>
            <p>Retrouvez-les directement sur :</p>`;
  } else if (reason === 'error') {
    icon = '<i class="fa-solid fa-wifi" style="color:var(--text-soft);font-size:28px;margin-bottom:12px;display:block"></i>';
    msg  = `<p>Les textes du jour sont temporairement indisponibles.</p>
            <p>Vérifiez votre connexion ou retrouvez-les sur :</p>`;
  } else {
    icon = '';
    msg  = `<p>Les textes de cette prière sont disponibles sur :</p>`;
  }

  bodyEl.innerHTML = `
    <div class="brev-section" style="text-align:center;padding-top:16px;">
      ${icon}
      <div class="brev-section-title">${nom}</div>
      <div class="brev-text" style="text-align:left;margin-top:12px;">
        ${msg}
        <p style="text-align:center;margin-top:16px;">
          <a href="https://www.aelf.org" target="_blank" rel="noopener"
             style="color:var(--gold);font-weight:600;font-size:17px;">www.aelf.org</a>
        </p>
      </div>
    </div>
  `;
}

function closeBreviary() {
  const panel   = document.getElementById('breviary-panel');
  const overlay = document.getElementById('breviary-overlay');
  if (!panel) return;
  panel.classList.remove('open');
  overlay.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
  // Arrête la lecture à voix haute si en cours
  try { window._pelReader?.stop(); } catch (_) {}
}

function initBreviary() {
  // Délégation d'événement — capture les boutons générés dynamiquement par initTodayTimeline()
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tl-breviary-btn');
    if (!btn) return;
    // Office monastique → modale pédagogique dédiée (Triors, Saint-Wandrille, etc.)
    if (btn.dataset.action === 'monastic') {
      e.preventDefault();
      e.stopPropagation();
      if (window._openMonasticModal) {
        window._openMonasticModal(btn.dataset.label || 'Office monastique', btn.dataset.kind || 'laudes');
      }
      return;
    }
    // Messe en latin (Saint-Wandrille, etc.) → modale Ordinaire de la messe
    if (btn.dataset.action === 'latin-mass') {
      e.preventDefault();
      e.stopPropagation();
      if (window._openLatinMassModal) window._openLatinMassModal(btn.dataset.label || 'Messe en latin');
      return;
    }
    openBreviary(btn.dataset.prayer, btn.dataset.label || '');
  });

  const closeBtn = document.getElementById('brev-close');
  const overlay  = document.getElementById('breviary-overlay');
  if (closeBtn) closeBtn.addEventListener('click', closeBreviary);
  if (overlay)  overlay.addEventListener('click', closeBreviary);

  // Bouton réglages voix (bréviaire)
  const voiceCfgBtn = document.getElementById('brev-voice-cfg');
  if (voiceCfgBtn) {
    if (!('speechSynthesis' in window)) voiceCfgBtn.style.display = 'none';
    else voiceCfgBtn.addEventListener('click', () => window._openVoiceSettings?.());
  }

  // Bouton « Écouter » : lit à voix haute les textes affichés du bréviaire
  const listenBtn = document.getElementById('brev-listen');
  if (listenBtn) {
    if (!('speechSynthesis' in window)) {
      listenBtn.style.display = 'none'; // navigateur sans synthèse vocale
    } else {
      listenBtn.addEventListener('click', () => {
        const reader = window._pelReader;
        if (reader.state === 'playing') { reader.pause(); return; }
        if (reader.state === 'paused')  { reader.resume(); return; }
        const body = document.getElementById('brev-body');
        const txt = (body?.innerText || body?.textContent || '').trim();
        if (txt) reader.read(txt, listenBtn);
      });
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeBreviary();
  });
}


/* ────────────────────────────────────────────
   6. LECTEUR RADIO INTÉGRÉ
──────────────────────────────────────────────*/

function initRadioPlayer() {
  const player    = document.getElementById('radio-player');
  const audio     = document.getElementById('rp-audio');
  const playBtn   = document.getElementById('rp-play');
  const playIcon  = document.getElementById('rp-icon');
  const closeBtn  = document.getElementById('rp-close');
  const volSlider = document.getElementById('rp-vol');
  const nameEl    = document.getElementById('rp-name');
  const subEl     = document.getElementById('rp-sub');

  if (!player || !audio) return;

  // Sécurité : le lecteur ne doit JAMAIS être visible au chargement de la page
  player.classList.remove('visible');
  document.body.classList.remove('player-open');

  audio.volume = 0.8;

  // On traque la source courante avec une variable dédiée
  // (évite le bug de comparaison audio.src qui retourne l'URL absolue résolue)
  let currentStream = '';
  let currentWeb    = '';

  function setIcon(playing) {
    playIcon.className = playing
      ? 'fa-solid fa-pause'
      : 'fa-solid fa-play';
  }

  function showPlayer(name, prayer, time) {
    nameEl.textContent = name;
    subEl.textContent  = `${prayer} · ${time}`;
    player.classList.add('visible');
    document.body.classList.add('player-open');
  }

  function closePlayer() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    currentStream = '';
    currentWeb    = '';   // évite qu'un onglet s'ouvre via le handler audio.error
    player.classList.remove('visible');
    document.body.classList.remove('player-open');
    setIcon(false);
  }

  // ─── Modale TV (KTO, etc.) — iframe YouTube live ─────────────
  function openTvModal({ embed, web, name, prayer, time }) {
    if (!embed) {
      if (web) window.open(web, '_blank', 'noopener');
      return;
    }
    let modal = document.getElementById('tv-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'tv-modal';
      modal.className = 'tv-modal hidden';
      modal.innerHTML = `
        <div class="tv-modal-backdrop" data-tv-close></div>
        <div class="tv-modal-panel" role="dialog" aria-modal="true" aria-label="Lecteur vidéo">
          <div class="tv-modal-head">
            <div class="tv-modal-title">
              <span class="tv-modal-channel" id="tv-modal-channel">—</span>
              <span class="tv-modal-prayer"  id="tv-modal-prayer">—</span>
            </div>
            <a class="tv-modal-external" id="tv-modal-external" href="#" target="_blank" rel="noopener" title="Ouvrir sur le site officiel">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </a>
            <button class="tv-modal-close" data-tv-close aria-label="Fermer">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="tv-modal-frame-wrap">
            <iframe id="tv-modal-iframe" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
          </div>
          <div class="tv-modal-fallback">
            <span>La vidéo ne s'affiche pas&nbsp;? Certains navigateurs (Opera, bloqueurs) empêchent l'intégration.</span>
            <a class="tv-modal-fallback-btn" id="tv-modal-fallback-btn" href="#" target="_blank" rel="noopener">
              <i class="fa-brands fa-youtube"></i> Regarder sur KTO
            </a>
          </div>
        </div>`;
      document.body.appendChild(modal);

      modal.addEventListener('click', e => {
        if (e.target.closest('[data-tv-close]')) closeTvModal();
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeTvModal();
      });
    }
    const iframe   = modal.querySelector('#tv-modal-iframe');
    const channel  = modal.querySelector('#tv-modal-channel');
    const prayerEl = modal.querySelector('#tv-modal-prayer');
    const ext      = modal.querySelector('#tv-modal-external');
    const fbBtn    = modal.querySelector('#tv-modal-fallback-btn');
    const frameWrap = modal.querySelector('.tv-modal-frame-wrap');
    channel.textContent  = name || '';
    prayerEl.textContent = prayer ? `${prayer}${time ? ' · ' + time : ''}` : '';
    if (ext)   ext.href   = web || '#';
    if (fbBtn) fbBtn.href  = web || '#';
    modal.classList.remove('hidden');
    document.body.classList.add('tv-modal-open');

    // Marqueur 'kto-live' → résout l'ID du DIRECT actuel via l'API YouTube,
    // puis embarque youtube.com/embed/{id} (les vidéos live démarrent au point
    // live, avec rewind possible). Fallback sur l'ID connu si pas de direct.
    if (embed === 'kto-live') {
      iframe.removeAttribute('src');
      if (frameWrap) frameWrap.classList.add('tv-loading');
      fetch('/api/seo?p=kto-live')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (frameWrap) frameWrap.classList.remove('tv-loading');
          if (modal.classList.contains('hidden')) return; // fermée entre-temps
          const vid = (data && data.videoId) || 'VN1_PRBoVHU';
          iframe.src = `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`;
        })
        .catch(() => {
          if (frameWrap) frameWrap.classList.remove('tv-loading');
          iframe.src = 'https://www.youtube.com/embed/VN1_PRBoVHU?autoplay=1&rel=0';
        });
    } else {
      iframe.src = embed;
    }
  }
  function closeTvModal() {
    const modal = document.getElementById('tv-modal');
    if (!modal) return;
    const iframe = modal.querySelector('#tv-modal-iframe');
    if (iframe) iframe.src = ''; // stoppe la lecture YouTube
    modal.classList.add('hidden');
    document.body.classList.remove('tv-modal-open');
  }

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play().then(() => setIcon(true)).catch(() => {});
    } else {
      audio.pause();
      setIcon(false);
    }
  });

  // Bouton fermer — délégation forte : capture le clic même si on tape sur l'icône <i>
  // (sur mobile certains navigateurs créent une zone tactile précise sur le SVG)
  closeBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    closePlayer();
  });
  // Fallback tactile : iOS/Safari peuvent retarder le click
  closeBtn.addEventListener('touchend', e => {
    e.preventDefault();
    e.stopPropagation();
    closePlayer();
  }, { passive: false });

  volSlider.addEventListener('input', () => {
    audio.volume = parseFloat(volSlider.value);
  });

  audio.addEventListener('error', () => {
    closePlayer();
    if (currentWeb) window.open(currentWeb, '_blank', 'noopener');
  });

  // Délégation : ouvre la modale TV pour les sources vidéo (KTO, etc.)
  document.addEventListener('click', e => {
    const tvBtn = e.target.closest('[data-action="tv"]');
    if (!tvBtn) return;
    e.preventDefault();
    e.stopPropagation();
    openTvModal({
      embed:  tvBtn.dataset.embed  || '',
      web:    tvBtn.dataset.web    || '',
      name:   tvBtn.dataset.name   || '',
      prayer: tvBtn.dataset.prayer || '',
      time:   tvBtn.dataset.time   || '',
    });
  });

  // Délégation d'événement — capture TOUS les boutons radio
  // (onglet Aujourd'hui statique ET onglet Semaine généré dynamiquement)
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="radio"]');
    if (!btn) return;

    const stream = btn.dataset.stream || '';
    const web    = btn.dataset.web    || '';
    const name   = btn.dataset.name   || '';
    const prayer = btn.dataset.prayer || '';
    const time   = btn.dataset.time   || '';

    currentWeb = web;

    // Pas de stream → ouvre le site dans un nouvel onglet
    if (!stream) {
      window.open(web, '_blank', 'noopener');
      return;
    }

    // Charge uniquement si flux différent du courant
    if (stream !== currentStream) {
      audio.pause();
      audio.src     = stream;
      currentStream = stream;
      audio.load();
    }

    showPlayer(name, prayer, time);
    audio.play()
      .then(() => setIcon(true))
      .catch(() => {
        closePlayer();
        if (web) window.open(web, '_blank', 'noopener');
      });
  });

  // Accessibilité : les cartes Sources rendues cliquables via role="button"
  // (sous-items combo) doivent réagir à Entrée / Espace comme un vrai bouton.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const btn = e.target.closest('[data-action="radio"][role="button"]');
    if (!btn) return;
    e.preventDefault();
    btn.click();
  });
}


/* ────────────────────────────────────────────
   7. MENU BURGER
──────────────────────────────────────────────*/

function initHamburger() {
  const btn     = document.getElementById('hamburger-btn');
  const bnBtn   = document.getElementById('bn-compte');
  const menu    = document.getElementById('hamburger-menu');
  const overlay = document.getElementById('hamburger-overlay');
  if (!menu) return;

  function openMenu() {
    menu.classList.remove('hidden');
    overlay?.classList.add('show');
    btn?.setAttribute('aria-expanded', 'true');
    // Marque l'onglet courant dans la nav du drawer
    const active = document.querySelector('.nav-tab.active')?.dataset.tab;
    menu.querySelectorAll('.hm-nav-item').forEach(it =>
      it.classList.toggle('hm-active', it.dataset.tab === active)
    );
  }

  function closeMenu() {
    menu.classList.add('hidden');
    overlay?.classList.remove('show');
    btn?.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu(e) {
    e.stopPropagation();
    menu.classList.contains('hidden') ? openMenu() : closeMenu();
  }

  // Synchronise aria-expanded sur les boutons déclencheurs
  function syncAria() {
    const open = !menu.classList.contains('hidden');
    document.getElementById('header-btn-account')?.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function toggleMenuAria(e) { toggleMenu(e); syncAria(); }
  function closeMenuAria() { closeMenu(); syncAria(); }

  btn?.addEventListener('click',    toggleMenuAria);
  bnBtn?.addEventListener('click',  toggleMenuAria);
  // Le bouton "compte" (avatar + nom + chevron) ouvre aussi ce menu unifié
  document.getElementById('header-btn-account')?.addEventListener('click', toggleMenuAria);
  overlay?.addEventListener('click', closeMenuAria);

  // Liens de navigation dans le drawer (visibles sur mobile)
  menu.querySelectorAll('.hm-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelector(`.nav-tab[data-tab="${item.dataset.tab}"]`)?.click();
      closeMenu();
    });
  });

  // Ferme quand on clique en dehors
  document.addEventListener('click', e => {
    if (!menu.contains(e.target) && e.target !== btn && !btn?.contains(e.target)
        && e.target !== bnBtn && !bnBtn?.contains(e.target)) {
      closeMenu();
    }
  });

  // ── À propos
  document.getElementById('hm-about')?.addEventListener('click', () => {
    closeMenu();
    if (window._openAbout) window._openAbout();
    else {
      document.getElementById('about-overlay')?.classList.remove('hidden');
      document.getElementById('about-modal')?.classList.remove('hidden');
    }
  });

  // ── Accessibilité : taille du texte + voix de lecture (accessible partout).
  // Toujours visible : même sans synthèse vocale, la modale propose la taille
  // du texte (les sections vocales se masquent alors d'elles-mêmes).
  const hmVoice = document.getElementById('hm-voice');
  if (hmVoice) {
    hmVoice.addEventListener('click', () => {
      closeMenu();
      window._openVoiceSettings?.();
    });
  }

  // ── Ajouter à l'écran d'accueil — toujours visible dans le menu ──
  const hmInstall = document.getElementById('hm-install');
  if (hmInstall) {
    // Toujours montrer l'entrée (on la cache uniquement après installation confirmée)
    hmInstall.style.display = '';

    hmInstall.addEventListener('click', async () => {
      closeMenu();
      // Si le prompt natif est dispo (Android/Chrome/Edge) → installation directe
      if (_installPrompt) {
        try {
          const res = await _installPrompt.prompt();
          if (res?.outcome === 'accepted') {
            _installPrompt = null;
            hmInstall.style.display = 'none';
          }
        } catch (_) {
          // Si le prompt échoue, ouvre la modale d'instructions en fallback
          if (window._openInstallModal) window._openInstallModal();
        }
        return;
      }
      // Sinon (iOS Safari, ou autre) → modale avec instructions adaptées
      if (window._openInstallModal) window._openInstallModal();
    });

    // Cache l'entrée install après installation confirmée
    window.addEventListener('appinstalled', () => { hmInstall.style.display = 'none'; });
  }
}


/* ────────────────────────────────────────────
   8a. BLOC BIENVENUE — première visite
──────────────────────────────────────────────*/

function initWelcome() {
  const banner   = document.getElementById('welcome-banner');
  if (!banner) return;

  const KEY = 'pel_welcomed';

  // Déjà vu → supprime immédiatement sans animation
  if (localStorage.getItem(KEY)) {
    banner.remove();
    return;
  }

  // Capture la hauteur réelle avant d'animer (pour la transition max-height)
  banner.style.maxHeight = banner.scrollHeight + 'px';

  function dismiss() {
    banner.classList.add('wb-hiding');
    // Supprime du DOM après la fin de la transition (400 ms)
    setTimeout(() => banner.remove(), 420);
    localStorage.setItem(KEY, '1');
  }

  document.getElementById('wb-close')?.addEventListener('click',   dismiss);
  document.getElementById('wb-start')?.addEventListener('click',   dismiss);
  document.getElementById('wb-dismiss')?.addEventListener('click', dismiss);
}


/* ────────────────────────────────────────────
   8a-bis. ONBOARDING — accueil des nouveaux inscrits
   À la première connexion d'un compte récemment créé, propose de choisir
   ses offices favoris → la page « Aujourd'hui » est personnalisée dès le
   premier jour (sauvegarde locale + compte via _pelSetOfficeFilters).
──────────────────────────────────────────────*/
function initOnboarding() {
  const KEY = 'pel_onboarded';

  const OFFICES = [
    { type: 'laudes',   icon: 'fa-sun',            label: 'Laudes' },
    { type: 'matin',    icon: 'fa-mug-hot',        label: 'Prière du matin' },
    { type: 'messe',    icon: 'fa-church',         label: 'Messe' },
    { type: 'chapelet', icon: 'fa-circle-dot',     label: 'Chapelet' },
    { type: 'vepres',   icon: 'fa-cloud-sun',      label: 'Vêpres' },
    { type: 'soiree',   icon: 'fa-hands-praying',  label: 'Prière du soir' },
    { type: 'complies', icon: 'fa-moon',           label: 'Complies' },
  ];

  function openOnboarding(user) {
    if (document.getElementById('ob-backdrop')) return;
    const name = user?.user_metadata?.name || '';
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const div = document.createElement('div');
    div.id = 'ob-backdrop';
    div.className = 'ob-backdrop';
    div.innerHTML = `
      <div class="ob-modal" role="dialog" aria-modal="true" aria-label="Bienvenue">
        <div class="ob-head">
          <i class="fa-solid fa-hands-praying"></i>
          <h3>Bienvenue${name ? ' ' + esc(name) : ''} 🙏</h3>
          <p>Quelles prières souhaitez-vous voir en priorité sur votre page «&nbsp;Aujourd'hui&nbsp;»&nbsp;?</p>
        </div>
        <div class="ob-grid">
          ${OFFICES.map(o => `
            <label class="ob-office">
              <input type="checkbox" value="${o.type}">
              <span class="ob-office-card"><i class="fa-solid ${o.icon}"></i>${o.label}</span>
            </label>`).join('')}
        </div>
        <div class="ob-foot">
          <button type="button" class="ob-skip" id="ob-skip">Tout afficher</button>
          <button type="button" class="ob-save" id="ob-save" disabled>Valider mes favoris</button>
        </div>
        <p class="ob-hint">Modifiable à tout moment avec les filtres en haut de la page.</p>
      </div>`;
    document.body.appendChild(div);
    document.body.style.overflow = 'hidden';

    const saveBtn = div.querySelector('#ob-save');
    const checked = () => Array.from(div.querySelectorAll('input:checked')).map(i => i.value);
    div.addEventListener('change', () => { saveBtn.disabled = checked().length === 0; });

    function close() {
      try { localStorage.setItem(KEY, '1'); } catch (_) {}
      div.remove();
      document.body.style.overflow = '';
    }
    div.querySelector('#ob-skip').addEventListener('click', () => {
      window._pelSetOfficeFilters?.([]);
      close();
    });
    saveBtn.addEventListener('click', () => {
      window._pelSetOfficeFilters?.(checked());
      close();
    });
  }

  document.addEventListener('pel:authchange', e => {
    const user = e.detail?.user;
    if (!user) return;
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch (_) {}
    if (seen) return;
    // Compte créé il y a moins de 48 h → vrai nouvel inscrit : on lui propose
    // ses favoris. Compte plus ancien : on marque silencieusement (pas de nag).
    const ageMs = Date.now() - new Date(user.created_at || 0).getTime();
    if (ageMs < 48 * 3600 * 1000) {
      setTimeout(() => openOnboarding(user), 600);
    } else {
      try { localStorage.setItem(KEY, '1'); } catch (_) {}
    }
  });
}


/* ────────────────────────────────────────────
   8b. WIDGET — PROCHAIN OFFICE
──────────────────────────────────────────────*/

function initNextOffice() {
  const labelEl     = document.getElementById('no-label');
  const prayerEl    = document.getElementById('no-prayer');
  const timeEl      = document.getElementById('no-time');
  const countdownEl = document.getElementById('no-countdown');
  const srcsEl      = document.getElementById('no-srcs');
  if (!prayerEl) return;

  function update() {
    const now    = getParisDate();
    const dow    = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const slots  = getDaySchedule(now) || [];
    if (!Array.isArray(slots) || slots.length === 0) {
      console.warn('[initNextOffice] slots vide, fallback affiché');
      if (labelEl)     labelEl.textContent     = 'Prochaines Laudes';
      prayerEl.textContent                     = 'Demain matin';
      if (timeEl)      timeEl.textContent      = '7h00';
      if (countdownEl) countdownEl.textContent = '';
      if (srcsEl)      srcsEl.textContent      = 'Radio Maria · Radio N-Dame';
      return;
    }

    let found = null;
    outer: for (const slot of slots) {
      for (const entry of slot.entries) {
        // Convertit en heure de Paris si srcTz présent (sources africaines, etc.)
        const tParis = entry.srcTz ? _convertSrcLocalToParis(entry.t, entry.srcTz, now) : entry.t;
        const [h, m] = tParis.split(':').map(Number);
        if (h * 60 + m > nowMin) { found = { slot, entry, startMin: h * 60 + m }; break outer; }
      }
    }

    if (!found) {
      // Plus rien aujourd'hui → Laudes demain matin
      if (labelEl)  labelEl.textContent     = 'Prochaines Laudes';
      prayerEl.textContent                  = 'Demain matin';
      if (timeEl)   timeEl.textContent      = '7h00';
      if (countdownEl) countdownEl.textContent = '';
      if (srcsEl)   srcsEl.textContent      = 'Radio Maria · Radio N-Dame';
      return;
    }

    const diff = found.startMin - nowMin;
    const h = Math.floor(diff / 60), m = diff % 60;
    const countdown = diff < 60 ? `dans ${diff} min`
                    : m === 0   ? `dans ${h}h`
                    : `dans ${h}h${String(m).padStart(2,'0')}`;

    const srcNames = found.entry.srcs.map(k => SOURCES[k]?.n || k).join(' · ');

    if (labelEl)     labelEl.textContent     = 'Prochain office';
    prayerEl.textContent                     = found.slot.label;
    if (timeEl)      timeEl.textContent      = formatOfficeTime(found.entry.t, undefined, found.entry.srcTz).display;
    if (countdownEl) countdownEl.textContent = countdown;
    if (srcsEl)      srcsEl.textContent      = srcNames;
  }

  update();
  setInterval(update, 60_000);
}


/* ────────────────────────────────────────────
   8c. WIDGET — CHAPELET NUMÉRIQUE
──────────────────────────────────────────────*/

/* ────────────────────────────────────────────
   TEXTES MULTILINGUES DU CHAPELET
──────────────────────────────────────────────*/
const CHAPELET_TEXTS = {
  fr: {
    flag: '🇫🇷', label: 'Français',
    names: {
      credo:  'Je crois en Dieu',
      patre:  'Notre Père',
      ave:    'Je vous salue, Marie',
      gloria: 'Gloire au Père',
    },
    texts: {
      credo: `Je crois en Dieu, le Père tout-puissant,\ncréateur du ciel et de la terre.\nEt en Jésus-Christ, son Fils unique, notre Seigneur,\nqui a été conçu du Saint-Esprit,\nest né de la Vierge Marie,\na souffert sous Ponce Pilate,\na été crucifié, est mort et a été enseveli,\nest descendu aux enfers,\nle troisième jour est ressuscité des morts,\nest monté aux cieux,\nest assis à la droite de Dieu le Père tout-puissant,\nd'où il viendra juger les vivants et les morts.\nJe crois en l'Esprit Saint,\nà la sainte Église catholique,\nà la communion des saints,\nà la rémission des péchés,\nà la résurrection de la chair,\nà la vie éternelle. Amen.`,
      patre: `Notre Père, qui êtes aux cieux,\nque votre Nom soit sanctifié,\nque votre règne vienne,\nque votre volonté soit faite\nsur la terre comme au ciel.\nDonnez-nous aujourd'hui notre pain de ce jour.\nPardonnez-nous nos offenses,\ncomme nous pardonnons aussi\nà ceux qui nous ont offensés.\nEt ne nous soumettez pas à la tentation,\nmais délivrez-nous du Mal. Amen.`,
      ave: `Je vous salue, Marie pleine de grâces,\nle Seigneur est avec vous.\nVous êtes bénie entre toutes les femmes\net Jésus, le fruit de vos entrailles, est béni.\n\nSainte Marie, Mère de Dieu,\npriez pour nous pauvres pécheurs,\nmaintenant et à l'heure de notre mort. Amen.`,
      gloria: `Gloire au Père, et au Fils,\net au Saint-Esprit.\nComme il était au commencement,\nmaintenant et toujours,\ndans les siècles des siècles. Amen.`,
    },
  },
  en: {
    flag: '🇬🇧', label: 'English',
    names: {
      credo:  'I believe in God',
      patre:  'Our Father',
      ave:    'Hail Mary',
      gloria: 'Glory be',
    },
    texts: {
      credo: `I believe in God, the Father Almighty,\nCreator of Heaven and earth;\nand in Jesus Christ, His only Son, Our Lord,\nWho was conceived by the Holy Spirit,\nborn of the Virgin Mary,\nsuffered under Pontius Pilate,\nwas crucified, died, and was buried.\nHe descended into Hell;\nthe third day He rose again from the dead;\nHe ascended into Heaven,\nand sitteth at the right hand of God,\nthe Father Almighty;\nfrom thence He shall come to judge the living and the dead.\nI believe in the Holy Spirit,\nthe Holy Catholic Church,\nthe communion of Saints,\nthe forgiveness of sins,\nthe resurrection of the body\nand life everlasting. Amen.`,
      patre: `Our Father, who art in heaven,\nhallowed be Thy name;\nThy kingdom come,\nThy will be done on earth as it is in heaven.\nGive us this day our daily bread,\nand forgive us our trespasses,\nas we forgive those who trespass against us;\nand lead us not into temptation,\nbut deliver us from evil. Amen.`,
      ave: `Hail Mary, full of grace,\nthe Lord is with thee.\nBlessed art thou among women\nand blessed is the fruit of thy womb, Jesus.\n\nHoly Mary, Mother of God,\npray for us sinners,\nnow and at the hour of our death. Amen.`,
      gloria: `Glory be to the Father,\nand to the Son,\nand to the Holy Spirit.\nAs it was in the beginning,\nis now, and ever shall be,\nworld without end. Amen.`,
    },
  },
  es: {
    flag: '🇪🇸', label: 'Español',
    names: {
      credo:  'Creo en Dios',
      patre:  'Padre nuestro',
      ave:    'Dios te salve, María',
      gloria: 'Gloria al Padre',
    },
    texts: {
      credo: `Creo en Dios, Padre todopoderoso,\ncreador del cielo y de la tierra.\nCreo en Jesucristo, su único Hijo, nuestro Señor,\nque fue concebido por obra del Espíritu Santo,\nnació de la Virgen María,\npadeció bajo el poder de Poncio Pilato,\nfue crucificado, muerto y sepultado,\ndescendió a los infiernos,\nal tercer día resucitó de entre los muertos,\nsubió a los cielos y está sentado\na la derecha de Dios Padre todopoderoso,\ndesde allí ha de venir a juzgar a vivos y muertos.\nCreo en el Espíritu Santo,\nla santa Iglesia católica,\nla comunión de los santos,\nel perdón de los pecados,\nla resurrección de la carne\ny la vida eterna. Amén.`,
      patre: `Padre nuestro, que estás en el cielo,\nsantificado sea tu nombre.\nVenga a nosotros tu reino.\nHágase tu voluntad\nen la tierra como en el cielo.\nDanos hoy nuestro pan de cada día.\nPerdona nuestras ofensas,\ncomo también nosotros perdonamos\na los que nos ofenden.\nNo nos dejes caer en tentación\ny líbranos del mal. Amén.`,
      ave: `Dios te salve, María,\nllena eres de gracia,\nel Señor es contigo.\nBendita tú eres entre todas las mujeres\ny bendito es el fruto de tu vientre, Jesús.\n\nSanta María, Madre de Dios,\nruega por nosotros, pecadores,\nahora y en la hora de nuestra muerte. Amén.`,
      gloria: `Gloria al Padre,\ny al Hijo,\ny al Espíritu Santo.\nComo era en el principio,\nahora y siempre,\npor los siglos de los siglos. Amén.`,
    },
  },
  it: {
    flag: '🇮🇹', label: 'Italiano',
    names: {
      credo:  'Credo in Dio',
      patre:  'Padre nostro',
      ave:    'Ave Maria',
      gloria: 'Gloria al Padre',
    },
    texts: {
      credo: `Credo in Dio, Padre onnipotente,\ncreatore del cielo e della terra.\nE in Gesù Cristo, suo unico Figlio, nostro Signore,\nil quale fu concepito di Spirito Santo,\nnacque da Maria Vergine,\npatì sotto Ponzio Pilato,\nfu crocifisso, morì e fu sepolto;\ndiscese agli inferi;\nil terzo giorno risuscitò dai morti;\nsalì al cielo,\nsiede alla destra di Dio Padre onnipotente;\ndi là verrà a giudicare i vivi e i morti.\nCredo nello Spirito Santo,\nla santa Chiesa cattolica,\nla comunione dei santi,\nla remissione dei peccati,\nla risurrezione della carne\ne la vita eterna. Amen.`,
      patre: `Padre nostro, che sei nei cieli,\nsia santificato il tuo nome;\nvenga il tuo regno;\nsia fatta la tua volontà,\ncome in cielo così in terra.\nDacci oggi il nostro pane quotidiano,\ne rimetti a noi i nostri debiti\ncome noi li rimettiamo ai nostri debitori,\ne non ci indurre in tentazione,\nma liberaci dal male. Amen.`,
      ave: `Ave Maria, piena di grazia,\nil Signore è con te.\nTu sei benedetta fra le donne\ne benedetto è il frutto del tuo seno, Gesù.\n\nSanta Maria, Madre di Dio,\nprega per noi peccatori,\nadesso e nell'ora della nostra morte. Amen.`,
      gloria: `Gloria al Padre\ne al Figlio\ne allo Spirito Santo.\nCome era nel principio\ne ora e sempre\nnei secoli dei secoli. Amen.`,
    },
  },
  pt: {
    flag: '🇵🇹', label: 'Português',
    names: {
      credo:  'Creio em Deus',
      patre:  'Pai nosso',
      ave:    'Ave Maria',
      gloria: 'Glória ao Pai',
    },
    texts: {
      credo: `Creio em Deus Pai todo-poderoso,\ncriador do céu e da terra.\nE em Jesus Cristo, seu único Filho, Nosso Senhor,\nque foi concebido pelo poder do Espírito Santo,\nnasceu da Virgem Maria,\npadeceu sob Pôncio Pilatos,\nfoi crucificado, morreu e foi sepultado,\ndesceu à mansão dos mortos,\nressuscitou ao terceiro dia,\nsubiu ao céu,\nestá sentado à direita de Deus Pai todo-poderoso,\ndonde há-de vir a julgar os vivos e os mortos.\nCreio no Espírito Santo,\nna santa Igreja Católica,\nna comunhão dos Santos,\nna remissão dos pecados,\nna ressurreição da carne\ne na vida eterna. Amém.`,
      patre: `Pai nosso que estais no céu,\nsantificado seja o vosso nome,\nvenha a nós o vosso reino,\nseja feita a vossa vontade\nassim na terra como no céu.\nO pão nosso de cada dia nos dai hoje,\nperdoai-nos as nossas ofensas\nassim como nós perdoamos\na quem nos tem ofendido,\ne não nos deixeis cair em tentação,\nmas livrai-nos do mal. Amém.`,
      ave: `Ave Maria, cheia de graça,\no Senhor é convosco,\nbendita sois vós entre as mulheres\ne bendito é o fruto do vosso ventre Jesus.\n\nSanta Maria, Mãe de Deus,\nrogai por nós pecadores,\nagora e na hora da nossa morte. Amém.`,
      gloria: `Glória ao Pai,\nao Filho\ne ao Espírito Santo,\nassim como era no princípio,\nagora e sempre\ne pelos séculos dos séculos. Amém.`,
    },
  },
  la: {
    flag: '✝', label: 'Latine',
    names: {
      credo:  'Credo',
      patre:  'Pater noster',
      ave:    'Ave Maria',
      gloria: 'Gloria Patri',
    },
    texts: {
      credo: `Credo in Deum, Patrem omnipotentem,\ncreatorem caeli et terrae.\nEt in Iesum Christum, Filium eius unicum, Dominum nostrum,\nqui conceptus est de Spiritu Sancto,\nnatus ex Maria Virgine,\npassus sub Pontio Pilato,\ncrucifixus, mortuus, et sepultus,\ndescendit ad inferos,\ntertia die resurrexit a mortuis,\nascendit ad caelos,\nsedet ad dexteram Dei Patris omnipotentis,\ninde venturus est iudicare vivos et mortuos.\nCredo in Spiritum Sanctum,\nsanctam Ecclesiam catholicam,\nsanctorum communionem,\nremissionem peccatorum,\ncarnis resurrectionem,\nvitam aeternam. Amen.`,
      patre: `Pater noster, qui es in caelis,\nsanctificetur nomen tuum.\nAdveniat regnum tuum.\nFiat voluntas tua,\nsicut in caelo et in terra.\nPanem nostrum quotidianum da nobis hodie,\net dimitte nobis debita nostra\nsicut et nos dimittimus debitoribus nostris.\nEt ne nos inducas in tentationem,\nsed libera nos a malo. Amen.`,
      ave: `Ave Maria, gratia plena,\nDominus tecum.\nBenedicta tu in mulieribus,\net benedictus fructus ventris tui, Iesus.\n\nSancta Maria, Mater Dei,\nora pro nobis peccatoribus,\nnunc et in hora mortis nostrae. Amen.`,
      gloria: `Gloria Patri,\net Filio,\net Spiritui Sancto.\nSicut erat in principio,\net nunc et semper,\net in saecula saeculorum. Amen.`,
    },
  },
};

function initChapelet() {
  const fab     = document.getElementById('chapelet-fab');
  const modal   = document.getElementById('chapelet-modal');
  const closeBtn= document.getElementById('ch-close');
  const tapBtn  = document.getElementById('ch-tap');
  const resetBtn= document.getElementById('ch-reset');
  if (!fab || !modal) return;

  // Mystères selon le jour (tradition catholique)
  const DOW_KEY  = {0:'glorieux',1:'joyeux',2:'douloureux',3:'glorieux',4:'lumineux',5:'douloureux',6:'joyeux'};
  // Mystères multilingues — pour annonce audio dans la langue choisie
  const MYST_DATA = {
    fr: {
      joyeux:    { name:'Mystères Joyeux',     list:["L'Annonciation","La Visitation","La Nativité","La Présentation au Temple","Le Recouvrement au Temple"] },
      douloureux:{ name:'Mystères Douloureux', list:["L'Agonie à Gethsémani","La Flagellation","Le Couronnement d'épines","Le Portement de Croix","La Crucifixion et la Mort"] },
      lumineux:  { name:'Mystères Lumineux',   list:["Le Baptême de Jésus","Les Noces de Cana","L'Annonce du Royaume","La Transfiguration","L'Institution de l'Eucharistie"] },
      glorieux:  { name:'Mystères Glorieux',   list:["La Résurrection","L'Ascension","La Pentecôte","L'Assomption de Marie","Le Couronnement de Marie"] },
    },
    en: {
      joyeux:    { name:'Joyful Mysteries',    list:['The Annunciation','The Visitation','The Nativity','The Presentation in the Temple','The Finding in the Temple'] },
      douloureux:{ name:'Sorrowful Mysteries', list:['The Agony in the Garden','The Scourging at the Pillar','The Crowning with Thorns','The Carrying of the Cross','The Crucifixion'] },
      lumineux:  { name:'Luminous Mysteries',  list:['The Baptism of Jesus','The Wedding at Cana','The Proclamation of the Kingdom','The Transfiguration','The Institution of the Eucharist'] },
      glorieux:  { name:'Glorious Mysteries',  list:['The Resurrection','The Ascension','The Descent of the Holy Spirit','The Assumption of Mary','The Coronation of Mary'] },
    },
    es: {
      joyeux:    { name:'Misterios Gozosos',    list:['La Anunciación','La Visitación','El Nacimiento','La Presentación en el Templo','El Niño perdido y hallado'] },
      douloureux:{ name:'Misterios Dolorosos',  list:['La Oración en el Huerto','La Flagelación','La Coronación de espinas','La Cruz a cuestas','La Crucifixión'] },
      lumineux:  { name:'Misterios Luminosos',  list:['El Bautismo del Señor','Las Bodas de Caná','El Anuncio del Reino','La Transfiguración','La Institución de la Eucaristía'] },
      glorieux:  { name:'Misterios Gloriosos',  list:['La Resurrección','La Ascensión','Pentecostés','La Asunción','La Coronación de María'] },
    },
    it: {
      joyeux:    { name:'Misteri Gaudiosi',     list:["L'Annunciazione","La Visitazione","La Nascita di Gesù","La Presentazione al Tempio","Il Ritrovamento al Tempio"] },
      douloureux:{ name:'Misteri Dolorosi',     list:["L'Agonia nel Getsemani","La Flagellazione","La Coronazione di spine","La Salita al Calvario","La Crocifissione"] },
      lumineux:  { name:'Misteri Luminosi',     list:['Il Battesimo di Gesù','Le Nozze di Cana','L\'Annuncio del Regno','La Trasfigurazione','L\'Istituzione dell\'Eucaristia'] },
      glorieux:  { name:'Misteri Gloriosi',     list:['La Risurrezione','L\'Ascensione','La Pentecoste','L\'Assunzione di Maria','L\'Incoronazione di Maria'] },
    },
    pt: {
      joyeux:    { name:'Mistérios Gozosos',    list:['A Anunciação','A Visitação','O Nascimento','A Apresentação no Templo','O Reencontro no Templo'] },
      douloureux:{ name:'Mistérios Dolorosos',  list:['A Agonia no Horto','A Flagelação','A Coroação de espinhos','O Caminho do Calvário','A Crucificação'] },
      lumineux:  { name:'Mistérios Luminosos',  list:['O Batismo de Jesus','As Bodas de Caná','O Anúncio do Reino','A Transfiguração','A Instituição da Eucaristia'] },
      glorieux:  { name:'Mistérios Gloriosos',  list:['A Ressurreição','A Ascensão','Pentecostes','A Assunção de Maria','A Coroação de Maria'] },
    },
    la: {
      joyeux:    { name:'Mysteria Gaudiosa',    list:['Annuntiatio','Visitatio','Nativitas','Praesentatio in Templo','Inventio in Templo'] },
      douloureux:{ name:'Mysteria Dolorosa',    list:['Agonia in Horto','Flagellatio','Coronatio Spinis','Baiulatio Crucis','Crucifixio'] },
      lumineux:  { name:'Mysteria Luminosa',    list:['Baptismus Christi','Nuptiae Canae','Annuntiatio Regni','Transfiguratio','Institutio Eucharistiae'] },
      glorieux:  { name:'Mysteria Gloriosa',    list:['Resurrectio','Ascensio','Pentecostes','Assumptio','Coronatio Mariae'] },
    },
  };

  // Codes BCP-47 pour Web Speech API
  const SPEECH_LANG = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', la: 'it-IT' };

  // Prénoms attribués aux voix Wavenet recommandées (différents par langue)
  // → l'utilisateur les distingue facilement parmi les voix système
  const RECOMMENDED_NAMES = {
    fr: { f: 'Camille',  m: 'Antoine' },
    en: { f: 'Emily',    m: 'William' },
    es: { f: 'Carmen',   m: 'Miguel'  },
    it: { f: 'Giulia',   m: 'Marco'   },
    pt: { f: 'Beatriz',  m: 'João'    },
    la: { f: 'Lucia',    m: 'Petrus'  },
  };
  // Texte d'annonce de mystère selon la langue
  const ANNOUNCE = {
    fr: (i, m) => `${i+1}ᵉ mystère : ${m}.`,
    en: (i, m) => `${i+1}${['st','nd','rd','th','th'][i]} mystery: ${m}.`,
    es: (i, m) => `${i+1}º misterio: ${m}.`,
    it: (i, m) => `${i+1}° mistero: ${m}.`,
    pt: (i, m) => `${i+1}º mistério: ${m}.`,
    la: (i, m) => `Mysterium ${['primum','secundum','tertium','quartum','quintum'][i]}: ${m}.`,
  };

  // Séquence : intro (6 pas) + 5 décades × 12 pas = 66 pas au total
  const INTRO = 6;
  let step = 0;
  const TOTAL = INTRO + 60; // 66

  // Langue + mystère + mode audio + voix — mémorisés en localStorage
  let lang        = localStorage.getItem('pel_ch_lang') || 'fr';
  const dayMystKey = DOW_KEY[getParisDate().getDay()];
  let mystKey     = localStorage.getItem('pel_ch_myst') || dayMystKey;
  if (!MYST_DATA.fr[mystKey]) mystKey = dayMystKey;
  let audioMode   = localStorage.getItem('pel_ch_audio') === '1';
  let speed       = parseFloat(localStorage.getItem('pel_ch_speed')) || 1;
  let voiceURI    = localStorage.getItem('pel_ch_voice') || '';
  let playing     = false;
  let currentUtterance = null;

  // Renvoie l'objet mystère dans la langue active (fallback fr)
  function mystery() {
    return (MYST_DATA[lang] || MYST_DATA.fr)[mystKey];
  }

  // Retourne la clé de prière pour une étape donnée
  function getPrayerKey(s) {
    if (s === 0) return 'credo';
    if (s === 1) return 'patre';
    if (s >= 2 && s <= 4) return 'ave';
    if (s === 5) return 'gloria';
    const b = (s - INTRO) % 12;
    if (b === 0)  return 'patre';
    if (b === 11) return 'gloria';
    return 'ave';
  }

  // Retourne le libellé court (nom affiché en grand) selon la langue et l'étape
  function getPrayer(s) {
    const L = CHAPELET_TEXTS[lang] || CHAPELET_TEXTS.fr;
    const key = getPrayerKey(s);
    const name = L.names[key];
    if (s === 2) return `${name} · 1/3`;
    if (s === 3) return `${name} · 2/3`;
    if (s === 4) return `${name} · 3/3`;
    if (s > INTRO) {
      const b = (s - INTRO) % 12;
      if (b >= 1 && b <= 10) return `${name} · ${b}/10`;
    }
    return name;
  }

  // Met à jour la zone texte complet
  function updateFullText(s) {
    const el = document.getElementById('ch-prayer-full');
    if (!el) return;
    const L = CHAPELET_TEXTS[lang] || CHAPELET_TEXTS.fr;
    el.textContent = L.texts[getPrayerKey(s)] || '';
    el.scrollTop = 0;
  }

  // Construit le chapelet en VRAIE forme de chapelet (SVG) :
  //   • Boucle ovale = 5 décades × 12 perles = 60 perles
  //   • Pendentif sous la boucle : 5 perles d'intro (Pater + 3 Aves + Gloria)
  //   • Crucifix tout en bas (Credo, étape 0)
  function buildBeads() {
    const c = document.getElementById('ch-beads');
    if (!c) return;
    c.innerHTML = '';

    const NS = 'http://www.w3.org/2000/svg';
    const W = 280, H = 360;
    const cx = W / 2;
    const loopCy = 130, loopRx = 110, loopRy = 95;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'ch-rosary');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Chapelet — cliquez sur une perle pour reprendre à cet endroit');

    // ── Cordon : ovale pointillé qui relie les perles ──
    const loop = document.createElementNS(NS, 'ellipse');
    loop.setAttribute('cx', cx);
    loop.setAttribute('cy', loopCy);
    loop.setAttribute('rx', loopRx);
    loop.setAttribute('ry', loopRy);
    loop.setAttribute('class', 'ch-rosary-thread');
    svg.appendChild(loop);

    // ── 60 perles autour de la boucle (5 décades × 12) ──
    // On commence en bas (jonction avec le pendentif) et on tourne dans le sens horaire
    function placeBead(stepGlobal, x, y, isSpecial) {
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', isSpecial ? 6 : 5);
      circle.setAttribute('class', 'ch-bead' + (isSpecial ? ' ch-bead-sp' : ''));
      circle.setAttribute('data-step', stepGlobal);
      circle.setAttribute('tabindex', '0');
      circle.setAttribute('role', 'button');
      circle.setAttribute('aria-label', `Prière ${stepGlobal + 1}`);
      svg.appendChild(circle);
    }

    for (let i = 0; i < 60; i++) {
      const inDecade = i % 12;
      const isPater  = inDecade === 0;
      const isGloria = inDecade === 11;
      // Angle : on démarre au bas (Math.PI/2 = 90°) et on tourne dans le sens horaire
      const t = (i + 0.5) / 60;
      const angle = Math.PI / 2 + t * 2 * Math.PI;
      const x = cx     + loopRx * Math.cos(angle);
      const y = loopCy + loopRy * Math.sin(angle);
      placeBead(INTRO + i, x, y, isPater || isGloria);
    }

    // ── Pendentif : ligne reliant la boucle au crucifix ──
    const pendantTopY = loopCy + loopRy + 6;
    const pendantBeadGap = 16;

    const cordPendant = document.createElementNS(NS, 'line');
    cordPendant.setAttribute('x1', cx);
    cordPendant.setAttribute('y1', pendantTopY);
    cordPendant.setAttribute('x2', cx);
    cordPendant.setAttribute('y2', pendantTopY + INTRO * pendantBeadGap + 6);
    cordPendant.setAttribute('class', 'ch-rosary-thread ch-rosary-pendant-line');
    svg.appendChild(cordPendant);

    // ── 5 perles d'intro sur le pendentif (Gloria → Pater → 3 Aves → Pater → Credo)
    //    L'ordre dans la séquence : 0=Credo, 1=Pater, 2-4=Aves, 5=Gloria
    //    Visuellement de la boucle vers la croix : Gloria (5) → 3 Aves (4,3,2) → Pater (1)
    //    Le Credo (0) est porté par la croix elle-même (clic sur la croix)
    for (let i = 0; i < 5; i++) {
      // i=0 → Gloria (step 5), i=1..3 → Aves (4,3,2), i=4 → Pater (step 1)
      const stepIdx = 5 - i;
      const isPater  = stepIdx === 1;
      const isGloria = stepIdx === 5;
      const y = pendantTopY + (i + 1) * pendantBeadGap;
      placeBead(stepIdx, cx, y, isPater || isGloria);
    }

    // ── Crucifix : porte le Credo (étape 0) ──
    const crossY = pendantTopY + 6 * pendantBeadGap;
    const crossGroup = document.createElementNS(NS, 'g');
    crossGroup.setAttribute('class', 'ch-rosary-cross-group ch-bead');
    crossGroup.setAttribute('data-step', '0');
    crossGroup.setAttribute('tabindex', '0');
    crossGroup.setAttribute('role', 'button');
    crossGroup.setAttribute('aria-label', 'Prière 1 — Credo');

    // Vertical
    const vbar = document.createElementNS(NS, 'rect');
    vbar.setAttribute('x', cx - 1.6);
    vbar.setAttribute('y', crossY);
    vbar.setAttribute('width', 3.2);
    vbar.setAttribute('height', 22);
    vbar.setAttribute('rx', 1.2);
    vbar.setAttribute('class', 'ch-rosary-cross');
    crossGroup.appendChild(vbar);
    // Horizontal
    const hbar = document.createElementNS(NS, 'rect');
    hbar.setAttribute('x', cx - 7);
    hbar.setAttribute('y', crossY + 6);
    hbar.setAttribute('width', 14);
    hbar.setAttribute('height', 3.2);
    hbar.setAttribute('rx', 1.2);
    hbar.setAttribute('class', 'ch-rosary-cross');
    crossGroup.appendChild(hbar);

    svg.appendChild(crossGroup);

    c.appendChild(svg);
  }

  function render() {
    const el = id => document.getElementById(id);
    const myst = mystery();
    if (el('ch-mystery')) el('ch-mystery').textContent = myst.name;

    if (step < INTRO) {
      if (el('ch-decade-num')) el('ch-decade-num').textContent = 'Introduction';
      if (el('ch-myst-name'))  el('ch-myst-name').textContent  = '';
    } else {
      const decade = Math.floor((step - INTRO) / 12);
      if (el('ch-decade-num')) el('ch-decade-num').textContent = `${decade + 1}ᵉ mystère`;
      if (el('ch-myst-name'))  el('ch-myst-name').textContent  = myst.list[Math.min(decade, 4)];
    }

    if (el('ch-prayer-txt')) el('ch-prayer-txt').textContent = getPrayer(step);
    if (el('ch-progress'))   el('ch-progress').textContent   = `${step + 1} / ${TOTAL}`;
    updateFullText(step);

    // Les perles SVG ne sont plus dans l'ordre du DOM → on utilise data-step
    modal.querySelectorAll('.ch-bead').forEach(bead => {
      const s = parseInt(bead.dataset.step, 10);
      if (isNaN(s)) return;
      bead.classList.toggle('done',    s < step);
      bead.classList.toggle('current', s === step);
    });

    if (tapBtn) {
      const done = step >= TOTAL - 1;
      if (audioMode) {
        tapBtn.innerHTML = done
          ? '<i class="fa-solid fa-check"></i> Chapelet terminé !'
          : (playing
              ? '<i class="fa-solid fa-pause"></i> Pause'
              : '<i class="fa-solid fa-play"></i> Lecture');
        tapBtn.classList.toggle('audio-playing', playing && !done);
        tapBtn.disabled = done;
      } else {
        tapBtn.innerHTML = done
          ? '<i class="fa-solid fa-check"></i> Chapelet terminé !'
          : '<i class="fa-solid fa-hand-point-up"></i> Suivant';
        tapBtn.classList.remove('audio-playing');
        tapBtn.disabled = done;
      }
    }
  }

  // Synchro de tous les boutons (langue, mystère, mode, vitesse)
  function syncLangBtns() {
    modal.querySelectorAll('.ch-lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
  }
  function syncMystBtns() {
    modal.querySelectorAll('.ch-myst-pill').forEach(b => {
      b.classList.toggle('active',     b.dataset.myst === mystKey);
      b.classList.toggle('day-default', b.dataset.myst === dayMystKey);
      b.setAttribute('aria-checked', b.dataset.myst === mystKey ? 'true' : 'false');
    });
  }
  function syncModeBtns() {
    modal.querySelectorAll('.ch-mode-btn').forEach(b => {
      const isActive = (b.dataset.mode === 'audio') === audioMode;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    const ctrls = document.getElementById('ch-audio-ctrls');
    if (ctrls) ctrls.hidden = !audioMode;
  }
  function syncSpeedBtns() {
    modal.querySelectorAll('.ch-speed-pill').forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.speed) === speed);
    });
  }

  /* ── AUDIO — Web Speech API ── */
  const synth = window.speechSynthesis;
  let availableVoices = [];

  // Voix Apple connues comme étant de très bonne qualité (toutes langues)
  const APPLE_QUALITY_VOICES = new Set([
    // FR
    'aurélie','aurelie','marie','thomas','audrey','amélie','amelie','daniel',
    // EN (US/GB/AU/IE/IN/ZA)
    'samantha','alex','karen','daniel','moira','tom','allison','ava','susan',
    'fred','victoria','serena','kate','tessa','rishi','veena',
    // ES (ES/MX)
    'marisol','diego','jorge','monica','mónica','paulina','juan',
    // IT
    'alice','federica','luca','paolo',
    // PT (PT/BR)
    'joana','luciana','catarina','joaquim','felipe','helena',
  ]);

  // Voix féminines connues (pour le filtre genre — toutes plateformes)
  const FEMALE_VOICES = new Set([
    // FR
    'aurélie','aurelie','marie','audrey','amélie','amelie','julie','hortense',
    'virginie','céline','celine','élise','elise',
    // EN
    'samantha','karen','moira','allison','ava','tessa','serena','victoria','kate','susan',
    'aria','jenny','michelle','zira','catherine','susan','linda','heera','veena',
    // ES
    'marisol','monica','mónica','paulina','helena','laura','sabina','marisol','elvira',
    // IT
    'alice','federica','irma','isabella','elsa',
    // PT
    'joana','luciana','catarina','helena','heloisa','heloísa','fernanda','michelle','francisca',
  ]);

  // Voix masculines connues
  const MALE_VOICES = new Set([
    // FR
    'thomas','daniel','paul','claude','henri','olivier','nicolas',
    // EN
    'alex','daniel','tom','fred','rishi','guy','christopher','eric','david','mark',
    'oliver','george','james','william','aaron','arthur',
    // ES
    'diego','jorge','juan','pablo','raul','raúl','enrique','jorge',
    // IT
    'luca','paolo','cosimo',
    // PT
    'joaquim','felipe','duarte','antonio','antônio',
  ]);

  // Voix Microsoft connues (Windows) — qualité variable mais toutes utilisables
  const MS_QUALITY_VOICES = new Set([
    // FR
    'hortense','julie','paul','claude','denise',
    // EN
    'david','zira','mark','aria','jenny','guy','christopher','michelle','eric','amber',
    // ES
    'helena','pablo','laura','sabina','raul',
    // IT
    'elsa','cosimo','irma','isabella',
    // PT
    'fernanda','heloisa','helena','duarte','antonio',
  ]);

  // Voix "novelty" Apple à exclure (drôles mais inutilisables pour prier)
  const APPLE_NOVELTY = /(whisper|bad news|good news|cellos|bubbles|bahh|deranged|trinoids|zarvox|albert|hysterical|pipe organ|jester|organ|bells|boing|junior|kathy|ralph|princess|bahh)/i;

  // Détecte le genre d'une voix (m/f/null si inconnu)
  function voiceGender(v) {
    const n = (v.name || '').toLowerCase();
    const cleaned = n.replace(/^(microsoft|google)\s+/i, '').split(/[\s(]/)[0];
    if (FEMALE_VOICES.has(cleaned)) return 'f';
    if (MALE_VOICES.has(cleaned))   return 'm';
    // Heuristiques pour les voix moins connues
    if (/(female|woman|femme|feminine|femenina|femminile|feminina|mujer|donna|mulher)/.test(n)) return 'f';
    if (/(male|man|homme|masculine|masculino|maschile|hombre|uomo|homem)/.test(n))               return 'm';
    return null;
  }

  // Note de qualité d'une voix (plus = mieux).
  function voiceQuality(v) {
    const n  = (v.name || '').toLowerCase();
    const nT = (v.name || '').trim();
    let s = 0;

    // Voix premium / enhanced / natural / neural (Microsoft Natural, Google Wavenet, etc.)
    if (/(premium|enhanced|natural|neural|wavenet|studio|hd)/.test(n)) s += 110;
    // Voix Siri (iOS 16+) — qualité quasi humaine
    if (n.includes('siri')) s += 100;
    // Voix Apple connues (system voices haute qualité)
    // Récupère le premier mot ASCII (ignore "Microsoft", "Google" préfixes)
    const cleaned = nT.replace(/^(Microsoft|Google)\s+/i, '');
    const firstWord = cleaned.split(/[\s(]/)[0].toLowerCase();
    if (APPLE_QUALITY_VOICES.has(firstWord)) s += 70;
    // Voix Microsoft connues (Windows) — qualité correcte
    if (MS_QUALITY_VOICES.has(firstWord) && n.includes('microsoft')) s += 50;
    // Voix Google (network) — très bonnes pour fr / en / es / it / pt
    if (n.includes('google')) s += 60;
    // Voix Microsoft (souvent qualité correcte mais moins naturelle que Apple/Google)
    if (n.includes('microsoft')) s += 35;
    // Voix réseau (souvent meilleure qualité que locale)
    if (v.localService === false) s += 25;
    // Voix par défaut du système
    if (v.default) s += 10;

    // Pénalisations
    if (APPLE_NOVELTY.test(nT))                  s -= 200;  // voix novelty/blagues
    if (n.includes('espeak'))                    s -= 100;  // synthèse robotique Linux
    if (/^\w+\s+(compact|petite)$/.test(n))      s -= 40;   // versions compactes basse qualité
    if (n.includes('eloquence'))                 s -= 30;   // ancienne voix Apple
    return s;
  }

  // Affichage propre du nom de la voix : prénom + suffixe HD/Natural si premium
  function prettyVoiceName(v) {
    const original = v.name || 'Voix';
    // Détecte si c'est une voix naturelle / premium / neural / wavenet / siri
    const isNatural = /(premium|enhanced|natural|neural|wavenet|studio|\bhd\b|siri)/i.test(original);

    let name = original
      .replace(/^Microsoft\s+/i, '')           // "Microsoft Hortense" → "Hortense"
      .replace(/^Google\s+/i, '')              // "Google français" → "français"
      .replace(/\s+Online\s+\(Natural\)/i, '') // "Hortense Online (Natural)" → "Hortense"
      .replace(/\s+\(Natural\)/i, '')          // "(Natural)" tout court
      .replace(/\s+Premium$/i, '')
      .replace(/\s+Enhanced$/i, '')
      .replace(/\s+Neural$/i, '')
      .replace(/\s+Desktop$/i, '')             // "Hortense Desktop" → "Hortense"
      .replace(/\s+Mobile$/i, '')              // idem
      .replace(/\s+Compact$/i, '')             // "Marie Compact" → "Marie"
      .replace(/\s+\([A-Z][a-zéèà]+\)$/, '')   // " (France)" / " (États-Unis)"
      .replace(/\s+-\s+French.*$/i, '')        // " - French (France)" sur Apple
      .replace(/\s+-\s+English.*$/i, '')
      .replace(/\s+-\s+Spanish.*$/i, '')
      .replace(/\s+-\s+Italian.*$/i, '')
      .replace(/\s+-\s+Portuguese.*$/i, '')
      .trim();
    // Garder uniquement le 1er mot (prénom propre)
    const firstWord = name.split(/\s+/)[0] || name;
    // Suffixe ★ pour les voix naturelles/premium → l'utilisateur voit
    // immédiatement lesquelles sont haute qualité
    return isNatural ? `${firstWord} ★` : firstWord;
  }

  // Liste les voix correspondant à la langue active, triées par qualité
  // (exclut les voix détectées comme cassées + fallback sur toutes les voix
  //  si aucune voix de la langue cible n'est disponible)
  function getMatchingVoices() {
    if (!synth) return [];
    // Re-fetch à chaque appel : Chrome/Opera chargent les voix en async,
    // pas de cache pour éviter de manquer des voix arrivées après l'init
    availableVoices = synth.getVoices() || [];
    if (!availableVoices.length) return [];

    const target = SPEECH_LANG[lang] || 'fr-FR';
    const prefix = target.split('-')[0];   // 'fr', 'en', 'es', 'it'...
    const broken = getBrokenVoices();
    const usable = availableVoices.filter(v => !broken.includes(v.voiceURI));

    // Voix qui matchent strictement la langue cible
    const exact = usable.filter(v =>
      v.lang === target || v.lang.startsWith(prefix + '-') || v.lang === prefix
    );

    if (exact.length) {
      exact.sort((a, b) => voiceQuality(b) - voiceQuality(a));
      return exact;
    }

    // Fallback : aucune voix native pour cette langue → on affiche TOUTES les
    // voix dispos. L'utilisateur peut quand même choisir, le moteur lira le
    // texte étranger avec l'accent de cette voix (mieux que rien).
    usable.sort((a, b) => voiceQuality(b) - voiceQuality(a));
    return usable;
  }

  // Affichage du nom voix — juste le prénom, sans marqueur de genre
  // (le filtre ♀/♂ au-dessus suffit ; les symboles dans la liste pouvaient
  //  être incorrects pour des voix étrangères mal détectées)
  function voiceLabel(v) {
    return prettyVoiceName(v);
  }

  // Remplit le <select> avec les voix disponibles
  function refreshVoiceList() {
    const sel = document.getElementById('ch-voice-select');
    if (!sel) return;
    const voices = getMatchingVoices();
    const previous = voiceURI;
    sel.innerHTML = '';

    // Voix recommandées MP3 Wavenet : 2 options par prénom (femme + homme)
    // value spéciale "" = MP3 femme (défaut), "_pel_mp3_m" = MP3 homme
    const recoNames = RECOMMENDED_NAMES[lang] || RECOMMENDED_NAMES.fr;
    const optGroup = document.createElement('optgroup');
    optGroup.label = '★ Voix recommandées';
    const optF = document.createElement('option');
    optF.value = '';
    optF.textContent = `${recoNames.f} ★`;
    optGroup.appendChild(optF);
    const optM = document.createElement('option');
    optM.value = '_pel_mp3_m';
    optM.textContent = `${recoNames.m} ★`;
    optGroup.appendChild(optM);
    sel.appendChild(optGroup);

    sel.disabled = false;
    if (!voices.length) return;

    // Dédoublonnage agressif par PRÉNOM seul (sans le genre)
    // Ainsi "Marie", "Marie (Compact)", "Marie Premium" comptent comme 1 seule
    const seen = new Map();
    for (const v of voices) {
      const key = prettyVoiceName(v).toLowerCase();
      if (!seen.has(key) || voiceQuality(v) > voiceQuality(seen.get(key))) {
        seen.set(key, v);
      }
    }
    const dedupedVoices = [...seen.values()].sort((a, b) => voiceQuality(b) - voiceQuality(a));

    // Top 5 voix système max (en plus de la "Voix recommandée" déjà présente)
    const TOP_N = 5;
    const top = dedupedVoices.slice(0, TOP_N);

    if (top.length) {
      const group = document.createElement('optgroup');
      group.label = 'Voix du système';
      top.forEach(v => {
        const o = document.createElement('option');
        o.value = v.voiceURI;
        o.textContent = voiceLabel(v);
        group.appendChild(o);
      });
      sel.appendChild(group);
    }

    // Restaure la sélection précédente si elle existe encore dans la liste
    if (previous && [...sel.options].some(o => o.value === previous)) {
      sel.value = previous;
    } else {
      sel.value = '';
      voiceURI  = '';
    }
  }

  // Voix sélectionnée actuellement (ou null)
  function getSelectedVoice() {
    if (!voiceURI || !availableVoices.length) return null;
    return availableVoices.find(v => v.voiceURI === voiceURI) || null;
  }

  // Charge les voix dès qu'elles sont prêtes (Chrome les charge en async)
  if (synth) {
    availableVoices = synth.getVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = () => {
        availableVoices = synth.getVoices();
        refreshVoiceList();
      };
    }
  }

  // Voix qui ont déjà échoué pendant CETTE session (sessionStorage)
  // Cleanup automatique : à la fermeture du navigateur, la liste est vidée
  // → on évite de bannir définitivement une voix à cause d'un blip transient
  // Migration : on supprime l'éventuelle ancienne liste en localStorage
  try { localStorage.removeItem('pel_ch_broken_voices'); } catch(_) {}

  function getBrokenVoices() {
    try { return JSON.parse(sessionStorage.getItem('pel_ch_broken_voices') || '[]'); }
    catch(_) { return []; }
  }
  function markVoiceBroken(uri) {
    if (!uri) return;
    const broken = getBrokenVoices();
    if (!broken.includes(uri)) {
      broken.push(uri);
      try { sessionStorage.setItem('pel_ch_broken_voices', JSON.stringify(broken)); } catch(_) {}
      const hint = document.getElementById('ch-audio-hint');
      if (hint) hint.textContent = '⚠ Voix indisponible — bascule sur la voix recommandée.';
    }
  }

  function speak(text, onEnd) {
    if (!synth) { onEnd && onEnd(); return; }
    try { synth.cancel(); } catch(_) {}
    const u = new SpeechSynthesisUtterance(text);
    const v = getSelectedVoice();
    u.lang  = (v && v.lang) || SPEECH_LANG[lang] || 'fr-FR';
    if (v) u.voice = v;
    u.rate  = speed;
    u.pitch = 1;
    u.volume = 1;

    // Détection souple : on ne bannit la voix qu'en cas d'erreur réelle (onerror).
    // Le watchdog (3s) déclenche juste un fallback silencieux sur la voix recommandée
    // mais NE marque PAS la voix comme cassée (évite bannissement abusif sur lenteurs réseau).
    let started   = false;
    let watchdog  = null;
    const cleanup = () => { if (watchdog) clearTimeout(watchdog); currentUtterance = null; };

    function fallbackToDefault() {
      voiceURI = '';
      const sel = document.getElementById('ch-voice-select');
      if (sel) sel.value = '';
      try { localStorage.setItem('pel_ch_voice', ''); } catch(_) {}
      refreshVoiceList();
    }

    u.onstart = () => { started = true; if (watchdog) clearTimeout(watchdog); };
    u.onend   = () => { cleanup(); onEnd && onEnd(); };
    u.onerror = (ev) => {
      // Vraie erreur du synthétiseur → on bannit la voix pour cette session
      if (v && !started) markVoiceBroken(v.voiceURI);
      cleanup();
      if (!started && v) fallbackToDefault();
      onEnd && onEnd();
    };

    currentUtterance = u;
    synth.speak(u);

    // Watchdog 3s : si rien ne démarre, on rebascule en silence
    // (sans bannir la voix — peut-être un transient)
    watchdog = setTimeout(() => {
      if (!started) {
        try { synth.cancel(); } catch(_) {}
        if (v) fallbackToDefault();
        cleanup();
        onEnd && onEnd();
      }
    }, 3000);
  }

  /* ── Lecture MP3 préenregistrée (Google Cloud TTS) ─────────────
     On essaie d'abord les fichiers /audio/{lang}/{f|m}/{key}.mp3
     (qualité humaine garantie pour TOUS les visiteurs).
     Si le fichier n'existe pas → fallback Web Speech API.
     ────────────────────────────────────────────────────────── */
  let currentAudio = null;

  function tryPlayMp3(url, rate) {
    return new Promise((resolve, reject) => {
      const a = new Audio();
      a.preload = 'auto';
      try { a.preservesPitch = true; } catch(_) {}
      a.playbackRate = rate || 1;
      a.src = url;
      const cleanup = () => {
        a.onended = null; a.onerror = null; a.oncanplay = null;
        currentAudio = null;
      };
      a.onended = () => { cleanup(); resolve(); };
      a.onerror = () => { cleanup(); reject(new Error('audio load failed')); };
      currentAudio = a;
      a.play().catch(err => { cleanup(); reject(err); });
    });
  }

  function getMp3Url(lang, gender, fileKey) {
    return `/audio/${lang}/${gender}/${fileKey}.mp3`;
  }

  async function speakStep() {
    if (!audioMode || !playing) return;
    const L     = CHAPELET_TEXTS[lang] || CHAPELET_TEXTS.fr;
    const myst  = mystery();
    const key   = getPrayerKey(step);

    const isStartOfDecade = step >= INTRO && (step - INTRO) % 12 === 0;
    const decade = isStartOfDecade ? Math.floor((step - INTRO) / 12) : -1;

    // Hint UI : nom du mystère en cours (si début de décade)
    const hint = document.getElementById('ch-audio-hint');
    if (hint) {
      hint.textContent = isStartOfDecade
        ? `Mystère ${decade+1}/5 — ${myst.list[decade]}`
        : '';
    }

    // ── Choix du moteur selon le voiceURI sélectionné ──
    // ""              → MP3 femme (défaut)
    // "_pel_mp3_m"    → MP3 homme
    // autre chose     → Web Speech API avec cette voix système
    const useMp3 = !voiceURI || voiceURI === '_pel_mp3_m';
    const mp3Gender = voiceURI === '_pel_mp3_m' ? 'm' : 'f';
    let mp3Worked = false;

    if (useMp3) {
      try {
        if (isStartOfDecade) {
          await tryPlayMp3(getMp3Url(lang, mp3Gender, `myst-${mystKey}-${decade}`), speed);
          if (!playing) return;
        }
        await tryPlayMp3(getMp3Url(lang, mp3Gender, key), speed);
        mp3Worked = true;
      } catch(_) {
        mp3Worked = false;
      }
    }

    // ── Avance auto si MP3 a réussi ──
    if (mp3Worked) {
      if (!playing) return;
      if (step < TOTAL - 1) {
        step++;
        render();
        setTimeout(() => { if (playing) speakStep(); }, 280);
      } else {
        playing = false;
        render();
      }
      return;
    }

    // ── Fallback Web Speech API (voix système) ──
    let text = L.texts[key] || '';
    if (isStartOfDecade) {
      const announce = (ANNOUNCE[lang] || ANNOUNCE.fr)(decade, myst.list[decade]);
      text = announce + ' ' + text;
    }
    speak(text, () => {
      if (!playing) return;
      if (step < TOTAL - 1) {
        step++;
        render();
        setTimeout(() => { if (playing) speakStep(); }, 280);
      } else {
        playing = false;
        render();
      }
    });
  }

  function startAudio() {
    if (!synth && !window.Audio) {
      const hint = document.getElementById('ch-audio-hint');
      if (hint) hint.textContent = 'Audio non supporté par ce navigateur.';
      return;
    }
    playing = true;
    render();
    speakStep();
  }
  function pauseAudio() {
    playing = false;
    try { synth?.cancel(); } catch(_) {}
    currentUtterance = null;
    if (currentAudio) {
      try { currentAudio.pause(); } catch(_) {}
      currentAudio = null;
    }
    render();
  }
  function stopAudio() {
    playing = false;
    try { synth?.cancel(); } catch(_) {}
    currentUtterance = null;
    if (currentAudio) {
      try { currentAudio.pause(); } catch(_) {}
      currentAudio = null;
    }
  }

  /* ── Listeners UI ── */
  // Sélecteur de langue
  document.getElementById('ch-lang-bar')?.addEventListener('click', e => {
    const btn = e.target.closest('.ch-lang-btn');
    if (!btn) return;
    const wasPlaying = playing;
    if (wasPlaying) pauseAudio();
    lang = btn.dataset.lang;
    localStorage.setItem('pel_ch_lang', lang);
    syncLangBtns();
    refreshVoiceList();   // peut conserver la voix si elle existe dans la nouvelle langue
    localStorage.setItem('pel_ch_voice', voiceURI || '');
    render();
    if (wasPlaying) setTimeout(startAudio, 200);
  });

  // Sélecteur de mystères
  document.getElementById('ch-myst-selector')?.addEventListener('click', e => {
    const btn = e.target.closest('.ch-myst-pill');
    if (!btn || !MYST_DATA.fr[btn.dataset.myst]) return;
    if (playing) pauseAudio();
    mystKey = btn.dataset.myst;
    localStorage.setItem('pel_ch_myst', mystKey);
    step = 0;
    syncMystBtns();
    render();
  });

  // Bascule de mode (tactile / audio)
  document.getElementById('ch-mode-toggle')?.addEventListener('click', e => {
    const btn = e.target.closest('.ch-mode-btn');
    if (!btn) return;
    const newAudio = btn.dataset.mode === 'audio';
    // Dès qu'on touche au mode audio, on considère la découverte faite
    if (newAudio) {
      const discover = document.getElementById('ch-audio-discover');
      if (discover) discover.hidden = true;
      try { localStorage.setItem('pel_ch_audio_discovered', '1'); } catch (_) {}
    }
    if (newAudio === audioMode) return;
    audioMode = newAudio;
    localStorage.setItem('pel_ch_audio', audioMode ? '1' : '0');
    if (!audioMode && playing) pauseAudio();
    syncModeBtns();
    render();
  });

  // Fermeture de l'indice de découverte
  document.getElementById('ch-audio-discover-x')?.addEventListener('click', () => {
    const discover = document.getElementById('ch-audio-discover');
    if (discover) discover.hidden = true;
    try { localStorage.setItem('pel_ch_audio_discovered', '1'); } catch (_) {}
  });

  // Sélecteur de vitesse
  document.getElementById('ch-speed-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('.ch-speed-pill');
    if (!btn) return;
    const newSpeed = parseFloat(btn.dataset.speed);
    if (!newSpeed) return;
    const wasPlaying = playing;
    if (wasPlaying) pauseAudio();
    speed = newSpeed;
    localStorage.setItem('pel_ch_speed', String(speed));
    syncSpeedBtns();
    if (wasPlaying) setTimeout(startAudio, 200);
  });

  // Sélecteur de voix
  document.getElementById('ch-voice-select')?.addEventListener('change', e => {
    const wasPlaying = playing;
    if (wasPlaying) pauseAudio();
    voiceURI = e.target.value || '';
    localStorage.setItem('pel_ch_voice', voiceURI);
    if (wasPlaying) setTimeout(startAudio, 200);
  });

  // Clic direct sur une perle pour reprendre à un endroit précis
  document.getElementById('ch-beads')?.addEventListener('click', e => {
    const bead = e.target.closest('.ch-bead');
    if (!bead) return;
    const newStep = parseInt(bead.dataset.step, 10);
    if (isNaN(newStep) || newStep === step) return;
    const wasPlaying = playing;
    if (wasPlaying) pauseAudio();
    step = newStep;
    render();
    if (wasPlaying && audioMode) setTimeout(startAudio, 200);
  });

  fab.addEventListener('click', () => {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Restaure préférences mémorisées
    lang     = localStorage.getItem('pel_ch_lang')  || 'fr';
    mystKey  = localStorage.getItem('pel_ch_myst')  || dayMystKey;
    if (!MYST_DATA.fr[mystKey]) mystKey = dayMystKey;
    audioMode = localStorage.getItem('pel_ch_audio') === '1';
    speed    = parseFloat(localStorage.getItem('pel_ch_speed')) || 1;
    voiceURI = localStorage.getItem('pel_ch_voice') || '';
    buildBeads();
    syncLangBtns();
    syncMystBtns();
    syncModeBtns();
    syncSpeedBtns();
    refreshVoiceList();
    render();

    // Indice de découverte du mode audio guidé : montré tant que l'utilisateur
    // n'a jamais utilisé l'audio ni fermé l'indice, et seulement en mode tactile.
    const discover = document.getElementById('ch-audio-discover');
    if (discover) {
      let seen = false;
      try { seen = localStorage.getItem('pel_ch_audio_discovered') === '1'; } catch (_) {}
      discover.hidden = (audioMode || seen);
    }
  });

  const closeModal = () => {
    stopAudio();
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  };

  closeBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  tapBtn?.addEventListener('click', () => {
    if (audioMode) {
      // Mode audio : play / pause
      if (step >= TOTAL - 1) return;
      if (playing) pauseAudio();
      else         startAudio();
    } else {
      // Mode tactile : avance d'un cran
      if (step < TOTAL - 1) { step++; render(); }
    }
  });

  resetBtn?.addEventListener('click', () => {
    stopAudio();
    step = 0;
    render();
  });

  // Si l'utilisateur ferme l'onglet ou navigue ailleurs, on coupe l'audio
  window.addEventListener('beforeunload', stopAudio);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) pauseAudio();
  });
}


/* ────────────────────────────────────────────
   8. PRIÈRE QUOTIDIENNE (footer)
──────────────────────────────────────────────*/

const DAILY_PRAYERS = [
  { text: 'Seigneur, fais de moi un instrument de ta paix.', source: 'Saint François d\'Assise' },
  { text: 'Mon âme exalte le Seigneur, exulte mon esprit en Dieu mon Sauveur !', source: 'Magnificat — Lc 1, 46' },
  { text: 'Viens, Esprit Saint, remplis le cœur de tes fidèles et allume en eux le feu de ton amour.', source: 'Séquence de la Pentecôte' },
  { text: 'Seigneur, tu m\'as fait pour toi, et mon cœur est sans repos tant qu\'il ne repose pas en toi.', source: 'Saint Augustin' },
  { text: 'Que votre règne vienne, que votre volonté soit faite sur la terre comme au ciel.', source: 'Notre Père — Mt 6, 10' },
  { text: 'Je suis le chemin, la vérité et la vie. Nul ne vient au Père que par moi.', source: 'Jn 14, 6' },
  { text: 'Dieu est amour, et celui qui demeure dans l\'amour demeure en Dieu et Dieu en lui.', source: '1 Jn 4, 16' },
  { text: 'N\'ayez pas peur ! Ouvrez, ouvrez tout grand les portes au Christ.', source: 'Saint Jean-Paul II' },
  { text: 'Prends, Seigneur, et reçois toute ma liberté, ma mémoire, mon intelligence et toute ma volonté.', source: 'Saint Ignace de Loyola' },
  { text: 'Il faut aimer sans se lasser. Si vous êtes décourageant, l\'autre perd confiance.', source: 'Sainte Teresa de Calcutta' },
  { text: 'La prière est une élévation de l\'âme vers Dieu.', source: 'Saint Jean Damascène' },
  { text: 'Je ne cherche pas à comprendre pour croire, mais je crois pour comprendre.', source: 'Saint Anselme' },
  { text: 'Celui qui chante prie deux fois.', source: 'Saint Augustin' },
  { text: 'Je puis tout en Celui qui me fortifie.', source: 'Ph 4, 13' },
  { text: 'Que la paix du Christ règne dans vos cœurs.', source: 'Col 3, 15' },
  { text: 'Aime et fais ce que tu veux.', source: 'Saint Augustin' },
  { text: 'La Vierge Marie est le plus court chemin vers Jésus.', source: 'Saint Louis-Marie Grignion de Montfort' },
  { text: 'Réjouissez-vous toujours dans le Seigneur ; je le répète, réjouissez-vous.', source: 'Ph 4, 4' },
  { text: 'Demandez et vous recevrez, cherchez et vous trouverez, frappez et l\'on vous ouvrira.', source: 'Mt 7, 7' },
  { text: 'Il n\'y a pas de plus grand amour que de donner sa vie pour ceux qu\'on aime.', source: 'Jn 15, 13' },
  { text: 'Je suis la résurrection et la vie. Celui qui croit en moi vivra, même s\'il est mort.', source: 'Jn 11, 25' },
  { text: 'La paix de Dieu, qui surpasse toute intelligence, gardera vos cœurs et vos pensées.', source: 'Ph 4, 7' },
  { text: 'Voici que je me tiens à la porte, et je frappe. Si quelqu\'un entend ma voix et ouvre la porte, j\'entrerai chez lui.', source: 'Ap 3, 20' },
  { text: 'Le Seigneur est mon berger, je ne manque de rien.', source: 'Ps 23, 1' },
  { text: 'Même si je marche dans la vallée de l\'ombre de la mort, je ne crains aucun mal, car tu es avec moi.', source: 'Ps 23, 4' },
  { text: 'Avec Dieu rien n\'est impossible.', source: 'Lc 1, 37' },
  { text: 'Je vous laisse la paix, je vous donne ma paix. Ce n\'est pas à la manière du monde que je vous la donne.', source: 'Jn 14, 27' },
  { text: 'Heureux les cœurs purs, car ils verront Dieu.', source: 'Mt 5, 8' },
  { text: 'Heureux les artisans de paix, car ils seront appelés fils de Dieu.', source: 'Mt 5, 9' },
  { text: 'Maintenant demeurent la foi, l\'espérance, et l\'amour. Mais la plus grande, c\'est l\'amour.', source: '1 Co 13, 13' },
  { text: 'L\'amour est patient, l\'amour est serviable, il n\'est pas envieux ni fanfaron.', source: '1 Co 13, 4' },
  { text: 'Tout est possible à celui qui croit.', source: 'Mc 9, 23' },
  { text: 'Soyez forts et courageux. Ne craignez rien, car c\'est le Seigneur votre Dieu qui marche avec vous.', source: 'Dt 31, 6' },
  { text: 'Mon Dieu, je vous aime par-dessus toutes choses et mon prochain comme moi-même pour l\'amour de vous.', source: 'Acte d\'amour' },
  { text: 'Enseigne-moi à te chercher et montre-toi à moi qui te cherche.', source: 'Saint Anselme' },
  { text: 'N\'abandonne pas ta prière même si tu n\'en ressens pas la ferveur. La constance est elle-même une prière.', source: 'Saint Jean Chrysostome' },
  { text: 'Toutes choses concourent au bien de ceux qui aiment Dieu.', source: 'Rm 8, 28' },
  { text: 'Que tes yeux soient ouverts sur cette maison nuit et jour, sur ce lieu dont tu as dit : Mon nom y sera.', source: '2 Ch 7, 15' },
  { text: 'Je suis avec vous tous les jours jusqu\'à la fin du monde.', source: 'Mt 28, 20' },
  { text: 'Venez à moi, vous tous qui êtes fatigués et ployez sous le fardeau, et moi je vous donnerai le repos.', source: 'Mt 11, 28' },
];

function initDailyPrayer() {
  const textEl   = document.getElementById('footer-prayer-text');
  const authorEl = document.getElementById('footer-prayer-author');
  if (!textEl || !authorEl) return;

  const now       = getParisDate();
  const start     = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const prayer    = DAILY_PRAYERS[dayOfYear % DAILY_PRAYERS.length];

  textEl.textContent   = `« ${prayer.text} »`;
  authorEl.textContent = `— ${prayer.source}`;
}


/* ────────────────────────────────────────────
   9. VUE SEMAINE — sources & horaires réels
──────────────────────────────────────────────*/

/*
  SOURCES : toutes les webradios / chaînes YouTube catholiques françaises.
    n   → nom affiché dans les boutons
    s   → URL du flux audio direct (vide = pas de lecture intégrée possible)
    w   → URL du site / player web (fallback systématique)
*/
const SOURCES = {
  // Radio Maria France — flux MP3 via dreamsiteradiocp6 (même provider que Radio Maria CI).
  // Note: l'ancien commentaire évoquait un blocage CORS, mais les éléments <audio>
  // HTML5 ne sont pas soumis à la règle CORS → lecture intégrée fonctionnelle.
  rm:  { n: 'Radio Maria',      s: 'https://dreamsiteradiocp6.com/proxy/rmfrance1?mp=/stream', w: 'https://www.radiomaria.fr' },
  nd:  { n: 'RCF Notre-Dame',   s: 'https://windu.radionotredame.net/RadioNotreDame-Fm.mp3', w: 'https://www.rcf.fr/radio-notre-dame' },
  rcf: { n: 'RCF',              s: '', w: 'https://rcf.fr/radios/ecouter-rcf' },
  esp: { n: 'Espérance',        s: 'https://esperance.streamakaci.com/esperance.mp3', w: 'https://radio-esperance.fr' },
  // Flux dédié chant grégorien d'Espérance (même que le bouton "Grégorien" en bas du site)
  espg: { n: 'Espérance Grégorien', s: 'https://esperance.streamakaci.com/gregorien.mp3', w: 'https://radio-esperance.fr' },
  fid: { n: 'Fidélité',         s: 'https://diffusion.lafrap.fr/fidelite.mp3', w: 'https://radio-fidelite.fr' },
  // KTO Télévision : pas de flux audio simple (TV). KTO diffuse son direct 24/7
  // sur YouTube. On embarque l'ID de la vidéo live directement —
  // youtube.com/embed/{videoId} est le SEUL format qui passe sur un domaine
  // tiers (pas de frame-ancestors, contrairement à live_stream?channel= ou à
  // l'iframe imbriqué de la page KTO, tous deux bloqués par CSP).
  //
  // ⚠️ ID du direct 24/7 KTO. Stable tant que KTO ne relance pas son live.
  //    Si KTO affiche "vidéo non disponible", récupérer le nouvel ID sur
  //    youtube.com/@KTOTV/live (clic droit → copier l'URL → l'ID après watch?v=)
  //    et le remplacer ici. Le bouton "ouvrir en externe" de la modale sert
  //    de filet de sécurité en attendant.
  kto: { n: 'KTO',              s: '', w: 'https://www.youtube.com/@KTOTV/live',
         // Marqueur 'kto-live' → la modale résout l'ID du DIRECT actuel via
         // /api/seo?p=kto-live (API YouTube), pour démarrer au point live.
         embed: 'kto-live' },
  lou: { n: 'Lourdes',          s: '', w: 'https://www.lourdes-france.com/lourdesplus/' },
  // jer (Fraternités de Jérusalem) retiré : pas de retransmission live trouvée
  // sol (Solesmes) retiré : ne diffuse pas en live sur internet
  ndp: { n: 'N-D de Paris',     s: '', w: 'https://www.notredamedeparis.fr/la-cathedrale/en-direct/' },
  ars: { n: 'Sct. d\'Ars',      s: '', w: 'https://www.saintcure-ars.fr' },
  // Paroisse Notre-Dame de La Salette (Paris 15e) — YouTube live
  pnds: { n: 'ND La Salette',   s: '', w: 'https://www.youtube.com/@paroissenotre-damedelasale5572/streams' },
  // Sanctuaire Notre-Dame du Laus — YouTube live
  ndlaus: { n: 'ND du Laus',    s: '', w: 'https://www.youtube.com/@NotreDameduLausSanctuaire/streams' },
  // Radio Galilée — Québec (CKJI-FM Saint-Augustin-de-Desmaures) — UTC-5/-4, horaires stockés en heure de Paris (+6h)
  gal: { n: 'Radio Galilée',    f: 'ca', s: 'https://stream.zeno.fm/y9p44u8gn7zuv', w: 'https://radiogalilee.com/ecoute-en-direct/' },
  // Radio Ville-Marie — Montréal (Québec) — UTC-5/-4, horaires stockés en heure de Paris (+6h)
  rvm: { n: 'Radio Ville-Marie', f: 'ca', s: '', w: 'https://radiovm.com/ecoute-en-direct/' },
  // Sel + Lumière TV — Toronto/Montréal (Québec) — chaîne catholique francophone, UTC-5/-4
  slm: { n: 'Sel + Lumière',    f: 'ca', s: '', w: 'https://slmedia.org/fr/slplus/w/2984/en-direct' },
  // RCF Bruxelles — Belgique (Europe/Brussels = même TZ que Paris)
  rcfbe: { n: 'RCF Bruxelles',  f: 'be', s: '', w: 'https://www.rcf.be/wp-content/maradio/RCF-Bruxelles/' },
  // RTS Religion — Suisse (Europe/Zurich = même TZ que Paris)
  rts: { n: 'RTS Religion',     f: 'ch', s: '', w: 'https://www.rts.ch/religion/' },
  // Radio Maria Côte d'Ivoire — Africa/Abidjan (UTC+0 fixe, pas de DST). Horaires
  // stockés en heure locale Abidjan via srcTz : convertis dynamiquement à l'affichage.
  rmci: { n: 'Radio Maria CI',  f: 'ci', s: 'https://dreamsiteradiocp6.com/proxy/rmcosta?mp=/stream', w: 'https://www.radiomaria.ci' },
};

/*
  WEEK_SCHEDULE : grille horaire par type de jour liturgique.
  Chaque slot → { type, label, desc?, mystByDow?, entries: [{ t:'HH:MM', tl:'HHhMM', dur?, srcs:['clé',...] }] }
    - desc       : description courte affichée sous le titre (collapsible)
    - mystByDow  : pour les chapelets, type de mystère selon le jour
                   { 0:'lumineux', 1:'glorieux', ... } (0=dim, 6=sam)
    - dur        : durée en minutes (affichée à côté de l'heure)
*/

// ── Descriptions partagées RCF / Notre-Dame ────────────────────────────
const RCF_DESC = {
  morningPrayer: "Chaque matin, l'Évangile du jour commenté par un prêtre ou un pasteur. Un temps de méditation qui s'achève par la proclamation du Notre Père.",
  malades:       "Messe en direct depuis la Basilique Notre-Dame des Victoires, Paris.",
  lourdes:       "Chapelet de Lourdes diffusé chaque jour sur RCF Notre-Dame.",
};

// ── Descriptions KTO Télévision ────────────────────────────────────────
const KTO_DESC = {
  laudesNDGarde:   "Laudes en direct depuis la basilique Notre-Dame de la Garde à Marseille, diffusées sur KTO du mardi au samedi à 7h25, juste avant la messe. Office matinal de louange centré sur le Benedictus.",
  messeNDGardeLun: "Messe en direct depuis la basilique Notre-Dame de la Garde à Marseille, diffusée sur KTO. Le lundi, la messe seule à 7h25 (sans laudes intégrées).",
  messeNDGarde:    "Messe en direct depuis la basilique Notre-Dame de la Garde à Marseille, diffusée sur KTO du mardi au samedi à la suite des laudes.",
  vepresNDParis:   "Vêpres en direct de la cathédrale Notre-Dame de Paris, diffusées sur KTO. Office du soir centré sur le Magnificat, chanté par les chantres de Notre-Dame.",
  messeNDParis:    "Messe en direct de la cathédrale Notre-Dame de Paris, diffusée chaque jour à 18h sur KTO depuis la réouverture de la cathédrale.",
};

const GAL_DESC = {
  chapeletMatin:  "Chapelet médité en direct sur Radio Galilée (Québec). Diffusé chaque jour à 6h heure du Québec, soit 12h heure de Paris. Animation : abbé Denis Veilleux (du lundi au samedi), familles & communautés le dimanche.",
  chapeletApMidi: "Chapelet médité en direct sur Radio Galilée (Québec). Diffusé du lundi au samedi à 15h30 heure du Québec, soit 21h30 heure de Paris. Provenance occasionnelle de Lourdes (deux fois par mois).",
  chapeletDim:    "Chapelet médité dominical en direct sur Radio Galilée (Québec). Diffusé le dimanche à 11h heure du Québec, soit 17h heure de Paris. Animation par familles, groupes et communautés.",
  messe:          "Messe « En mémoire de Lui » en direct sur Radio Galilée (Québec), célébrée en studio. Tous les mercredis à 14h30 heure du Québec, soit 20h30 heure de Paris.",
};

const RVM_DESC = {
  chapelet: "Chapelet médité en direct sur Radio Ville-Marie (Montréal). Diffusé du lundi au vendredi à 18h35 heure du Québec, soit 00h35 (jour suivant) heure de Paris.",
  messe:    "Messe en direct de la crypte de l'Oratoire Saint-Joseph du Mont-Royal (Montréal), diffusée sur Radio Ville-Marie du lundi au vendredi à 19h00 heure du Québec, soit 01h00 (jour suivant) heure de Paris.",
  complies: "« Signe de nuit » — les Complies en direct de l'Abbaye Saint-Benoît-du-Lac (Québec), avec Henri Laban (coord.), sur Radio Ville-Marie. Diffusées du lundi au vendredi à 23h15 heure du Québec, soit 05h15 (jour suivant) heure de Paris.",
  messeDim: "Messe dominicale en direct de l'Oratoire Saint-Joseph du Mont-Royal (Montréal), diffusée sur Radio Ville-Marie chaque dimanche de 11h00 à 12h30 heure du Québec, soit 17h00 à 18h30 heure de Paris.",
};

const SLM_DESC = {
  joyeux:    "Chapelet — Mystères joyeux. Diffusé en direct sur Sel + Lumière Télévision (Québec) le lundi à 8h heure du Québec, soit 14h heure de Paris. Mystères : Annonciation, Visitation, Nativité, Présentation au temple, Recouvrement au temple.",
  joyeuxSam: "Chapelet — Mystères joyeux. Diffusé en direct sur Sel + Lumière Télévision (Québec) le samedi à 8h heure du Québec, soit 14h heure de Paris.",
  douloureux:"Chapelet — Mystères douloureux. Diffusé en direct sur Sel + Lumière Télévision (Québec) le mardi et le vendredi à 8h heure du Québec, soit 14h heure de Paris. Mystères : Agonie de Jésus, Flagellation, Couronnement d'épines, Portement de Croix, Crucifixion.",
  glorieuxMer:"Chapelet — Mystères glorieux. Diffusé en direct sur Sel + Lumière Télévision (Québec) le mercredi à 8h heure du Québec, soit 14h heure de Paris. Mystères : Résurrection, Ascension, Pentecôte, Assomption, Couronnement de Marie.",
  glorieuxDim:"Chapelet — Mystères glorieux. Diffusé en direct sur Sel + Lumière Télévision (Québec) le dimanche à 7h30 heure du Québec, soit 13h30 heure de Paris. Mystères : Résurrection, Ascension, Pentecôte, Assomption, Couronnement de Marie.",
  lumineux:  "Chapelet — Mystères lumineux. Diffusé en direct sur Sel + Lumière Télévision (Québec) le jeudi à 8h heure du Québec, soit 14h heure de Paris. Mystères : Baptême de Jésus, Noces de Cana, Annonce du Royaume, Transfiguration, Institution de l'Eucharistie.",
  messeSem:  "Messe du jour en la Cathédrale Marie-Reine-du-Monde de Montréal, diffusée en direct sur Sel + Lumière Télévision (Québec) du lundi au samedi à 7h30 heure du Québec, soit 13h30 heure de Paris.",
  messeDim:  "Messe dominicale en la Cathédrale Marie-Reine-du-Monde de Montréal, diffusée en direct sur Sel + Lumière Télévision (Québec) le dimanche à 9h30 heure du Québec, soit 15h30 heure de Paris.",
  messeRediff:    "Rediffusion de la messe du jour en la Cathédrale Marie-Reine-du-Monde de Montréal, sur Sel + Lumière Télévision (Québec). Du lundi au vendredi à 16h heure du Québec, soit 22h heure de Paris.",
  messeRediffSam: "Rediffusion de la messe en la Cathédrale Marie-Reine-du-Monde de Montréal, sur Sel + Lumière Télévision (Québec) le samedi à 14h heure du Québec, soit 20h heure de Paris.",
  messeRediffDim: "Rediffusion de la messe dominicale en la Cathédrale Marie-Reine-du-Monde de Montréal, sur Sel + Lumière Télévision (Québec) le dimanche à 16h heure du Québec, soit 22h heure de Paris.",
  chapeletAprem:  "Chapelet quotidien sur Sel + Lumière Télévision (Québec) à 17h heure du Québec, soit 23h heure de Paris. Mystères selon le jour de la semaine. Diffusion suspendue les jours de solennité et grandes fêtes liturgiques.",
};

const RTS_DESC = {
  messe: "Messe radio-TV diffusée sur RTS Religion (Radio Télévision Suisse) chaque dimanche à 9h03. Célébrée dans une église différente chaque semaine à travers la Suisse romande.",
};

const RMCI_DESC = {
  chapeletMatin: "Chapelet en direct sur Radio Maria Côte d'Ivoire. Diffusé chaque matin à 8h heure locale d'Abidjan, soit 9h en heure de Paris (hiver) ou 10h (été) — le décalage varie selon le changement d'heure en France.",
  chapeletAprem: "Chapelet en direct sur Radio Maria Côte d'Ivoire. Diffusé à 15h15 heure locale d'Abidjan, soit 16h15 Paris (hiver) ou 17h15 (été).",
  chapeletSoir:  "Chapelet en direct sur Radio Maria Côte d'Ivoire. Diffusé en début de soirée à 19h heure locale d'Abidjan, soit 20h Paris (hiver) ou 21h (été).",
};

const RCFBE_DESC = {
  matin:    "Prière du matin diffusée sur RCF Bruxelles (Belgique). En semaine, trois courts moments de prière à 6h50, 7h50 et 8h50 (10 min chacun), aux mêmes horaires qu'à Paris.",
  soir:     "Chapelet suivi de la prière du soir, en direct sur RCF Bruxelles (Belgique). Tous les soirs de 20h à 21h. Belgique et France partagent le même fuseau horaire (Europe/Brussels).",
};

const NDLAUS_DESC = {
  laudes:    "Office des Laudes en direct du Sanctuaire Notre-Dame du Laus (Hautes-Alpes), diffusé chaque jour sur YouTube. Office matinal de louange centré sur le Benedictus.",
  chapelet:  "Chapelet quotidien en direct du Sanctuaire Notre-Dame du Laus, lieu d'apparitions mariales reconnues. Diffusé chaque jour à 9h sur YouTube.",
  messe:     "Messe de semaine en direct du Sanctuaire Notre-Dame du Laus (Hautes-Alpes), lieu d'apparitions mariales à Benoîte Rencurel. Diffusée chaque jour sur YouTube.",
  chapMiseri:"Chapelet de la Miséricorde Divine en direct du Sanctuaire Notre-Dame du Laus, chaque vendredi à 15h sur YouTube — heure de la Miséricorde.",
  vepres:    "Vêpres en direct du Sanctuaire Notre-Dame du Laus, office du soir centré sur le Magnificat. Diffusées chaque jour sur YouTube.",
  complies:  "Complies en direct du Sanctuaire Notre-Dame du Laus, dernier office de la journée centré sur le Nunc dimittis. Diffusées chaque jour sur YouTube.",
};

// ── Description Paroisse Notre-Dame de La Salette (Paris 15ᵉ) ─────────
const PNDLS_DESC = {
  messe:    "Messe en direct depuis la Paroisse Notre-Dame de La Salette (Paris 15ᵉ), diffusée sur la chaîne YouTube de la paroisse. Cliquez pour rejoindre la diffusion en direct.",
  messeDim: "Messe dominicale (1h15) en direct depuis la Paroisse Notre-Dame de La Salette (Paris 15ᵉ). Diffusée sur YouTube — cliquez pour rejoindre la communauté en ligne.",
};

// ── Descriptions Radio Fidélité (Angers) ───────────────────────────────
const FID_DESC = {
  morningPrayer: "Prière du matin sur Radio Fidélité — méditation de l'Évangile du jour, intentions de prière et Notre Père. Diffusée depuis Angers (Maine-et-Loire).",
  morningMass:   "Messe en direct du matin sur Radio Fidélité, depuis une paroisse du diocèse d'Angers. Eucharistie quotidienne accessible à ceux qui ne peuvent se déplacer.",
  complies:      "Office des Complies sur Radio Fidélité — dernière prière de la journée, méditation et confiance avant la nuit. Depuis le diocèse d'Angers.",
};

// ── Descriptions partagées Radio Maria (sources : radiomaria.fr) ────────
const RM_DESC = {
  midnightCh:    "Le Rosaire est l'arme la plus puissante pour toucher le Cœur de Jésus, Notre Rédempteur, qui aime tellement sa Mère. (Saint Louis-Marie Grignion de Montfort)",
  divineMercy3:  "Ne manquez pas le chapelet de la Divine Miséricorde en direct sur Radio Maria France. Inscription au 04 94 20 30 88 ou accueil@radiomaria.fr.",
  divineMercy15: "Avec un auditeur. Le chapelet de la Divine Miséricorde en direct sur Radio Maria France. Inscription au 04 94 20 30 88.",
  morningPrayer: "Credo, prière de consécration à l'Esprit-Saint, prière de Sainte Faustine, prière aux archanges, à Saint Joseph, prière d'intercession, prière de Saint Jean-Paul II pour Radio Maria, Acte de Consécration à Marie.",
  morningCh830:  "En direct avec un auditeur du lundi au samedi. Aux intentions du Pape. Enregistré le dimanche.",
  lourdesCh:     "Le chapelet en direct sur Radio Maria France en communion avec l'un des sanctuaires les plus appréciés des catholiques du monde entier.",
  vespers:       "Venez nous rejoindre pour la prière du soir.",
  kibeho:        "Priez avec tous les auditeurs francophones le chapelet de Notre-Dame des 7 Douleurs en communion avec Kibeho, Rwanda.",
  eveningKids:   "« Pour vous les enfants » : un conte ou une histoire de saint pour aider les enfants à s'endormir le cœur en paix.",
  complines:     "Terminez votre journée en prière avec l'Office des Complies tous les soirs.",
  intentions14:  "Chapelet aux intentions des auditeurs sur Radio Notre-Dame.",
};

// ── Descriptions Radio Espérance ────────────────────────────────────────
const ESP_DESC = {
  laudesGreg: "Laudes en grégorien chantées en direct par les moines de l'abbaye bénédictine Notre-Dame de Triors (Drôme). Premier temps de prière du jour, méditatif et contemplatif.",
  morningPrayer703: "Prière du matin en direct des studios de Saint-Étienne. Louange du Seigneur, offrande de la journée et appui sur les lectures du jour.",
  chapelet830: "Chapelet aux intentions du monde et de l'Église, médité en direct depuis les studios de Saint-Étienne. La base de la prière à Radio Espérance, depuis le premier jour d'émission.",
  messeCrypteSE: "Saint Sacrifice de la messe en direct depuis la crypte Saint-Michel au patronage Saint-Joseph à Saint-Étienne, célébré par les prêtres de la communauté des religieux Saint-Vincent-de-Paul.",
  chapelet1430: "Chapelet aux intentions des auditeurs, médité en direct. Confiez vos intentions et actions de grâce — elles seront présentées à Dieu et à la Vierge Marie.",
  intercession1700: "Temps d'intercession et chapelet de la Miséricorde, en direct de l'oratoire de la radio à Saint-Étienne (du lundi au vendredi) ou des studios de Paray-le-Monial (le samedi).",
  vepresBastia: "Vêpres en direct du couvent Saint-Antoine de Bastia. Office du soir.",
  chapelet2030: "Chapelet pour les vocations, en direct des studios de Paray-le-Monial. La prière du soir pour les futures vocations.",
  complies: "Complies — dernière prière de la journée. En direct des studios de Saint-Étienne (le vendredi : en direct depuis le studio d'Ars, avec les séminaristes).",
  messeDominicale: "Messe dominicale en direct depuis la chapelle de l'Immaculée Conception à Saint-Étienne. Temps fort de l'eucharistie en communion fraternelle.",
  vepresTriors: "Vêpres en grégorien et salut du Saint-Sacrement de l'abbaye bénédictine Notre-Dame de Triors (Drôme), tous les dimanches et les jours de solennité.",
  chapeletMisericordeVend: "Chapelet de la Miséricorde après l'heure de la Miséricorde, depuis l'oratoire de Radio Espérance. (Hors temps de Carême.)",
  messeStWandrille:        "Eucharistie chantée en latin et grégorien depuis l'abbaye Saint-Wandrille de Fontenelle (Normandie), communauté bénédictine fondée en 649. Les lectures du jour sont les mêmes que pour la messe en français (Liturgie de l'AELF).",
  messeStWandrilleDim:     "Messe dominicale solennelle (1h30) chantée en grégorien depuis l'abbaye Saint-Wandrille de Fontenelle. Liturgie romaine en latin. Les jours de solennité, l'office est également à cette heure.",
  vepresStWandrille:       "Office monastique des Vêpres chanté en grégorien depuis l'abbaye Saint-Wandrille de Fontenelle. Office du soir suivant la Règle de saint Benoît : hymne, psalmodie, capitule, répons bref, cantique du Magnificat, intercessions.",
  compliesStWandrille:     "Office monastique des Complies chanté en grégorien depuis l'abbaye Saint-Wandrille de Fontenelle. Dernière prière de la journée monastique : examen de conscience, psaumes du soir (4, 90, 133), hymne, capitule, cantique de Siméon (Nunc Dimittis), antienne mariale.",
  vigilesPentecote:        "Office des Vigiles de la Pentecôte chanté en grégorien depuis l'abbaye Saint-Wandrille de Fontenelle. Veillée solennelle qui prépare la grande fête de l'effusion de l'Esprit-Saint sur les Apôtres au Cénacle.",
};

// ── Mystères selon le jour pour les 3 chapelets RM principaux ──────────
const MYST_DOW = {
  // Chapelet 0h00 — joyeux mar/ven, lumineux mer/dim, glorieux lun/jeu, douloureux sam
  midnight:  { 0:'lumineux',   1:'glorieux',   2:'joyeux',     3:'lumineux',   4:'glorieux',   5:'joyeux',     6:'douloureux' },
  // Chapelet en latin 5h30 — lumineux mar, douloureux mer/ven/dim, joyeux jeu, glorieux lun/sam
  latin:     { 0:'douloureux', 1:'glorieux',   2:'lumineux',   3:'douloureux', 4:'joyeux',     5:'douloureux', 6:'glorieux' },
  // Chapelet 8h30 (avec internaute) — douloureux mar, glorieux mer/dim, lumineux jeu/ven, joyeux lun/sam
  morning830:{ 0:'glorieux',   1:'joyeux',     2:'douloureux', 3:'glorieux',   4:'lumineux',   5:'lumineux',   6:'joyeux' },
  // Kibeho mardi 18h00 — toujours glorieux
  kibeho:    { 2:'glorieux' },
};

// ── Règles récurrentes / dates spéciales ──────────────────────────────
// Permet d'encoder des offices qui ne se répètent PAS chaque semaine :
//   - "1er jeudi du mois"  → { nthWeekday: { ordinal: 1, weekday: 4 } }
//   - "1er vendredi du mois" → { nthWeekday: { ordinal: 1, weekday: 5 } }
//   - "Dernier dimanche du mois" → { nthWeekday: { ordinal: -1, weekday: 0 } }
//   - "Tous les vendredis" → { weekday: 5 }
//   - "Tous les vendredis SAUF Carême" → { weekday: 5, excludeLent: true }
//   - Date précise → { date: '2026-12-25' }
//   - Période → { from: '2026-07-01', to: '2026-08-31', weekday: 0 }
const RECURRING_RULES = [
  // 1er jeudi du mois — Messe à la basilique d'Ars (Radio Espérance)
  {
    nthWeekday: { ordinal: 1, weekday: 4 },
    slot: {
      type: 'messe', label: "Messe à la basilique d'Ars (Espérance)",
      desc: "Eucharistie en direct depuis le sanctuaire d'Ars, diffusée par Radio Espérance le 1er jeudi de chaque mois.",
      entries: [{ t: '11:00', tl: '11h00', dur: 40, srcs: ['esp', 'ars'] }],
    },
  },
  // 1er vendredi du mois — Messe Chapelle de la Visitation (Paray-le-Monial)
  {
    nthWeekday: { ordinal: 1, weekday: 5 },
    slot: {
      type: 'messe', label: 'Messe — Chapelle de la Visitation (Paray-le-Monial)',
      desc: "Eucharistie en direct depuis la chapelle de la Visitation à Paray-le-Monial, lieu où le Cœur de Jésus s'est révélé à sainte Marguerite-Marie. Diffusée par Radio Espérance le 1er vendredi de chaque mois.",
      entries: [{ t: '11:00', tl: '11h00', dur: 40, srcs: ['esp'] }],
    },
  },
  // 1er vendredi du mois — Messe Sanctuaire de la Miséricorde (Vilnius, Lituanie)
  {
    nthWeekday: { ordinal: 1, weekday: 5 },
    slot: {
      type: 'messe', label: 'Messe — Sanctuaire de la Miséricorde (Vilnius)',
      desc: "Eucharistie depuis le sanctuaire de la Miséricorde divine à Vilnius, où est exposée la Sainte Effigie du Christ Miséricordieux peinte selon les visions de sainte Faustine. Diffusée par Radio Espérance le 1er vendredi du mois à 17h.",
      entries: [{ t: '17:00', tl: '17h00', dur: 60, srcs: ['esp'] }],
    },
  },
];

// Renvoie true si la date matche la règle.
function _matchesRule(rule, date) {
  // Date précise (YYYY-MM-DD)
  if (rule.date) {
    const iso = _dateISO ? _dateISO(date) : null;
    if (!iso) return false;
    return rule.date === iso;
  }
  // Plage de dates [from, to]
  if (rule.from && rule.to) {
    const iso = _dateISO ? _dateISO(date) : null;
    if (!iso || iso < rule.from || iso > rule.to) return false;
    // continue à vérifier weekday/nthWeekday si présents
  }
  // N-ième occurrence d'un jour de la semaine dans le mois
  if (rule.nthWeekday) {
    const { ordinal, weekday } = rule.nthWeekday;
    if (date.getDay() !== weekday) return false;
    const dayOfMonth = date.getDate();
    if (ordinal > 0) {
      const nth = Math.ceil(dayOfMonth / 7);
      return nth === ordinal;
    }
    // ordinal négatif (-1 = dernier, -2 = avant-dernier…)
    const lastOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const remaining = Math.ceil((lastOfMonth - dayOfMonth + 1) / 7);
    return remaining === Math.abs(ordinal);
  }
  // Simple jour de la semaine récurrent
  if (typeof rule.weekday === 'number') {
    return date.getDay() === rule.weekday;
  }
  // Si on est ici avec from/to seulement (sans weekday/date), match
  if (rule.from && rule.to) return true;
  return false;
}

// ── Mystères des 3 chapelets quotidiens de Radio Espérance ────────────
const ESP_MYST_DOW = {
  // Chapelet 8h30 — aux intentions du monde et de l'Église
  chapelet830:  { 0:'lumineux',   1:'douloureux', 2:'joyeux',     3:'lumineux',   4:'glorieux',   5:'joyeux',     6:'douloureux' },
  // Chapelet 14h30 — aux intentions des auditeurs
  chapelet1430: { 0:'douloureux', 1:'glorieux',   2:'lumineux',   3:'douloureux', 4:'joyeux',     5:'lumineux',   6:'glorieux' },
  // Chapelet 20h30 — pour les vocations
  chapelet2030: { 0:'glorieux',   1:'joyeux',     2:'douloureux', 3:'glorieux',   4:'lumineux',   5:'douloureux', 6:'joyeux' },
};

// ════════════════════════════════════════════════════════════════════════
// LOCALISATION HORAIRE — Convertit les offices Paris vers l'heure locale
// de l'utilisateur (Québec, Belgique, Cameroun, etc.). Reste référence Paris
// dans la base de données ; conversion uniquement à l'affichage.
// ════════════════════════════════════════════════════════════════════════
function _userTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; }
  catch (_) { return 'Europe/Paris'; }
}

// Zone "Paris" : France, Belgique, Suisse, Italie, Espagne, etc. — toutes
// utilisent CET/CEST donc même heure que Paris. Pas de conversion nécessaire.
function _isParisTimezone(tz) {
  return /^Europe\/(Paris|Brussels|Luxembourg|Madrid|Rome|Berlin|Vienna|Amsterdam|Monaco|Andorra|Malta|Vatican|Vaduz|Zurich|Geneva)$/.test(tz || '');
}

// Convertit "HH:MM" Paris en Date locale équivalente (pour aujourd'hui).
function _convertParisToLocal(parisHHMM, refDate) {
  refDate = refDate || new Date();
  const [h, m] = parisHHMM.split(':').map(Number);
  // Différence entre Paris et heure locale (gère DST automatiquement)
  const parisStr = refDate.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const localStr = refDate.toLocaleString('en-US');
  const diffMs = new Date(parisStr).getTime() - new Date(localStr).getTime();
  // refDate aujourd'hui à HH:MM "comme si local", ajusté du décalage
  const pretend = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), h, m, 0);
  return new Date(pretend.getTime() - diffMs);
}

// Convertit "HH:MM" exprimée dans un fuseau source (ex: 'Africa/Abidjan') en
// heure de Paris ("HH:MM" string). Gère DST côté Paris automatiquement.
// Utilisé pour les sources africaines (UTC fixe) dont l'heure varie en Paris
// selon la saison.
function _convertSrcLocalToParis(srcHHMM, srcTz, refDate) {
  refDate = refDate || new Date();
  const [h, m] = srcHHMM.split(':').map(Number);
  // Décalage entre srcTz et Paris à cette date (gère DST)
  const srcStr   = refDate.toLocaleString('en-US', { timeZone: srcTz });
  const parisStr = refDate.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const diffMs = new Date(parisStr).getTime() - new Date(srcStr).getTime();
  // "Faux" Date à HH:MM (UTC) puis +diffMs pour obtenir l'heure Paris
  const pretendUtc = Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate(), h, m, 0);
  const parisMs = pretendUtc + diffMs;
  const d = new Date(parisMs);
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

// Préférence de l'utilisateur : 'local' (défaut) ou 'paris'
function _getTimeDisplayPref() {
  const meta = window._pelUser?.user_metadata || {};
  return meta.time_display === 'paris' ? 'paris' : 'local';
}

// Formate une heure d'office pour affichage.
// Args :
//   tHHMM   : "HH:MM" — exprimée en heure de Paris par défaut, OU dans srcTz si fourni
//   refDate : Date de référence (pour gérer DST)
//   srcTz   : (optionnel) fuseau source — ex 'Africa/Abidjan'. Si fourni, tHHMM est
//             dans ce fuseau et sera converti en Paris avant le reste du traitement.
// Retourne { display: '10h00', isShifted: bool, parisHHMM, dayShift }
function formatOfficeTime(tHHMM, refDate, srcTz) {
  if (!tHHMM) return { display: '—', isShifted: false };
  // Si la source a un fuseau dédié (Afrique, etc.), on convertit d'abord en Paris
  const parisHHMM = srcTz ? _convertSrcLocalToParis(tHHMM, srcTz, refDate) : tHHMM;
  const tz = _userTimezone();
  const pref = _getTimeDisplayPref();
  // Pad → "10h00"
  const padParis = parisHHMM.replace(':', 'h').replace(/h(\d)$/, 'h0$1');
  // Si l'utilisateur est en zone Paris ou préfère l'heure de Paris → tel quel
  if (pref === 'paris' || _isParisTimezone(tz)) {
    return { display: padParis, isShifted: false, parisHHMM };
  }
  const local = _convertParisToLocal(parisHHMM, refDate);
  const h = local.getHours();
  const m = local.getMinutes();
  const hh = String(h).padStart(1, '0');
  const mm = String(m).padStart(2, '0');
  // Décalage de jour : compare la date locale avec refDate
  const refDay = (refDate || new Date()).getDate();
  let dayShift = local.getDate() - refDay;
  // Si refDate est le 1er et local est le 31 du mois précédent : -1
  // (heuristique simple : si diff > 1 c'est un wrap fin de mois)
  if (Math.abs(dayShift) > 1) dayShift = dayShift > 0 ? -1 : 1;
  return {
    display: `${hh}h${mm}`,
    isShifted: true,
    parisHHMM,
    dayShift,
    tz,
  };
}

// Renvoie un label court de la zone (ex: "Montréal", "Yaoundé", "Dakar")
function _shortTzLabel(tz) {
  const map = {
    'America/Montreal': 'Montréal',
    'America/Toronto':  'Montréal',
    'America/Halifax':  'Halifax',
    'America/Argentina/Buenos_Aires': 'Buenos Aires',
    'Africa/Yaoundé':   'Yaoundé',
    'Africa/Douala':    'Yaoundé',
    'Africa/Dakar':     'Dakar',
    'Africa/Abidjan':   'Abidjan',
    'Africa/Kinshasa':  'Kinshasa',
    'Africa/Lubumbashi':'Kinshasa',
    'Africa/Lome':      'Lomé',
    'Africa/Cotonou':   'Cotonou',
    'Africa/Ouagadougou':'Ouagadougou',
    'Africa/Bangui':    'Bangui',
    'Africa/Brazzaville':'Brazzaville',
    'Africa/Antananarivo':'Tananarive',
    'Indian/Reunion':   'La Réunion',
    'America/Martinique':'Martinique',
    'America/Guadeloupe':'Guadeloupe',
    'America/Port-au-Prince':'Port-au-Prince',
    'America/Cayenne':  'Cayenne',
    'Pacific/Noumea':   'Nouméa',
    'Pacific/Tahiti':   'Papeete',
  };
  if (map[tz]) return map[tz];
  // Fallback : prend la dernière partie du nom (ex: "America/New_York" → "New York")
  const last = (tz || '').split('/').pop() || '';
  return last.replace(/_/g, ' ');
}

window.formatOfficeTime = formatOfficeTime;
window._isParisTimezone = _isParisTimezone;
window._userTimezone = _userTimezone;
window._shortTzLabel = _shortTzLabel;
window._getTimeDisplayPref = _getTimeDisplayPref;
// Helper pour forcer le re-render des vues quand la pref horaire change
window._pelRerenderTimeViews = function () {
  try { initTodayTimeline(); } catch (_) {}
  try { initWeek(); } catch (_) {}
  try { initNextOffice(); } catch (_) {}
};

// ── Surcharges de planning (chargées depuis Supabase) ─────────────────────
// Permet à l'admin d'ajouter/désactiver/modifier des offices sans toucher au code.
// Chaque override s'applique sur une plage [date_start, date_end] et soit
// désactive un office existant, soit en ajoute un nouveau, soit en modifie un.
let _scheduleOverrides = [];        // [{ ...row }]
let _scheduleOverridesFetchedAt = 0;
async function loadScheduleOverrides(force = false) {
  const sb = window._sbClient;
  if (!sb) return [];
  // Rafraîchit toutes les 5 minutes (force pour forcer)
  if (!force && _scheduleOverrides.length && Date.now() - _scheduleOverridesFetchedAt < 5 * 60 * 1000) {
    return _scheduleOverrides;
  }
  try {
    const { data, error } = await sb
      .from('schedule_overrides')
      .select('*')
      .eq('enabled', true);
    if (!error && Array.isArray(data)) {
      _scheduleOverrides = data;
      _scheduleOverridesFetchedAt = Date.now();
    }
  } catch (_) { /* tolérance : on garde le cache précédent */ }
  return _scheduleOverrides;
}
window._pelScheduleOverrides = () => _scheduleOverrides;
window._pelReloadScheduleOverrides = async () => {
  await loadScheduleOverrides(true);
  // Re-render des vues qui dépendent du planning
  try { initTodayTimeline(); } catch (_) {}
  try { initFilters(); } catch (_) {}
  try { initBadges(); } catch (_) {}
  try { initWeek(); } catch (_) {}
};
// (Pas besoin d'exporter manuellement getDaySchedule : les function declarations
//  top-level sont déjà accessibles via window dans les navigateurs.)

// Renvoie une chaîne 'YYYY-MM-DD' d'une Date en heure de Paris
function _dateISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Renvoie le planning d'un jour donné en appliquant les overrides actifs.
// Tolérant aux erreurs : retombe toujours sur le planning de base si quelque
// chose va de travers (overrides corrompus, données manquantes…).
function getDaySchedule(date) {
  try {
    return _getDayScheduleInternal(date);
  } catch (err) {
    console.error('[getDaySchedule] erreur, fallback sur grille de base :', err);
    const d = date || getParisDate();
    const dow = d.getDay();
    const base = WEEK_SCHEDULE[dow] ?? WEEK_SCHEDULE.ordinary;
    return JSON.parse(JSON.stringify(base));
  }
}
// ════════════════════════════════════════════════════════════════════
// SOLENNITÉS LITURGIQUES — Détection automatique des fêtes majeures
// ════════════════════════════════════════════════════════════════════
// Algorithme de Butcher pour calculer la date de Pâques (catholique).
// Source : Astronomical Algorithms (Jean Meeus, 1991).
function _easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Solennités à date fixe (mois-jour)
const _FIXED_SOLEMNITIES = [
  '01-01', // Sainte Marie, Mère de Dieu
  '01-06', // Épiphanie (date traditionnelle ; en France paroisse = dim. proche)
  '03-19', // Saint Joseph
  '03-25', // Annonciation du Seigneur
  '06-24', // Nativité de saint Jean-Baptiste
  '06-29', // Saints Pierre et Paul
  '08-06', // Transfiguration
  '08-15', // Assomption de la Vierge Marie
  '11-01', // Toussaint
  '11-02', // Commémoration des défunts (jour particulier, pas solennité stricte mais souvent honoré ainsi)
  '12-08', // Immaculée Conception
  '12-25', // Nativité du Seigneur (Noël)
  '12-26', // Saint Étienne (octave de Noël)
];

// Renvoie true si la date est une solennité majeure (calendrier monastique romain)
function _isLiturgicalSolemnity(date) {
  if (!date) return false;
  const md = String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  if (_FIXED_SOLEMNITIES.includes(md)) return true;

  // Solennités mobiles dérivées de Pâques
  const easter = _easterDate(date.getFullYear());
  const easterTs = easter.getTime();
  const dayMs = 24 * 3600 * 1000;
  // Toutes ces dates sont jour férié monastique → horaire dominical
  const movableOffsets = [
    0,    // Dimanche de Pâques
    1,    // Lundi de Pâques (octave)
    39,   // Ascension (jeudi)
    49,   // Pentecôte (dimanche)
    50,   // Lundi de Pentecôte
    56,   // Sainte Trinité (dimanche après Pentecôte)
    60,   // Saint Sacrement / Fête-Dieu (jeudi après Trinité, calendrier monastique)
    68,   // Sacré-Cœur de Jésus (vendredi après Fête-Dieu)
  ];
  for (const offset of movableOffsets) {
    const d = new Date(easterTs + offset * dayMs);
    if (d.getFullYear() === date.getFullYear()
        && d.getMonth() === date.getMonth()
        && d.getDate() === date.getDate()) {
      return true;
    }
  }
  return false;
}
window._isLiturgicalSolemnity = _isLiturgicalSolemnity;

function _getDayScheduleInternal(date) {
  date = date || getParisDate();
  const dow = date.getDay();
  // Clone profond du planning de base pour ce jour
  const base = WEEK_SCHEDULE[dow] ?? WEEK_SCHEDULE.ordinary;
  let slots = JSON.parse(JSON.stringify(base));
  const iso = _dateISO(date);

  // Étape 0 : règles récurrentes (1er jeudi du mois, etc.)
  if (Array.isArray(RECURRING_RULES)) {
    for (const rule of RECURRING_RULES) {
      if (_matchesRule(rule, date)) {
        slots.push(JSON.parse(JSON.stringify(rule.slot)));
      }
    }
  }

  // Étape 0.4 : Vigiles de la Pentecôte (samedi avant Pentecôte = Pâques + 48 j)
  // → remplace les Complies de Saint-Wandrille par l'office des Vigiles (1h)
  {
    const easter = _easterDate(date.getFullYear());
    const vigPent = new Date(easter.getTime() + 48 * 24 * 3600 * 1000);
    const isVigilesPent = date.getFullYear() === vigPent.getFullYear()
                       && date.getMonth() === vigPent.getMonth()
                       && date.getDate() === vigPent.getDate();
    if (isVigilesPent) {
      slots = slots.map(slot => {
        if (slot.label === 'Complies en grégorien — Abbaye Saint-Wandrille') {
          return {
            ...slot,
            label: 'Office des Vigiles de la Pentecôte — Abbaye Saint-Wandrille',
            desc:  ESP_DESC.vigilesPentecote,
            officeKind: 'vigiles',
            entries: slot.entries.map(e => ({ ...e, dur: 60 })),
          };
        }
        return slot;
      });
    }
  }

  // Étape 0.5 : ajustement automatique aux solennités liturgiques (hors dimanche)
  // → la messe de Saint-Wandrille passe de 9h45 (45 min) à 10h00 (1h30)
  // → les vêpres de Saint-Wandrille passent à 17h00 (comme le dimanche)
  if (date.getDay() !== 0 && _isLiturgicalSolemnity(date)) {
    slots = slots.map(slot => {
      // Messe : 9h45 → 10h00 / 1h30
      if (slot.label === 'Messe en grégorien — Abbaye Saint-Wandrille') {
        return {
          ...slot,
          label: 'Messe solennelle en grégorien — Abbaye Saint-Wandrille',
          desc:  ESP_DESC.messeStWandrilleDim,
          latinMass: true,
          entries: slot.entries.map(e => ({
            ...e,
            t:   '10:00',
            tl:  '10h00',
            dur: 90,
          })),
        };
      }
      // Vêpres : 17h30 ou 18h45 → 17h00
      if (slot.label === 'Vêpres en grégorien — Abbaye Saint-Wandrille') {
        return {
          ...slot,
          entries: slot.entries.map(e => ({
            ...e,
            t:  '17:00',
            tl: '17h00',
          })),
        };
      }
      return slot;
    });
  }

  // Sélectionne les overrides qui couvrent la date
  const overrides = (_scheduleOverrides || []).filter(o =>
    o.enabled && o.date_start <= iso && o.date_end >= iso
  );
  if (overrides.length === 0) return slots;

  // Étape 1 : désactivations (retirent un office)
  for (const o of overrides) {
    if (o.action !== 'disable' || !o.target_office_id) continue;
    slots = slots.map(slot => ({
      ...slot,
      entries: slot.entries.filter(e =>
        (slot.type + '_' + e.t.replace(':', '')) !== o.target_office_id
      ),
    })).filter(slot => slot.entries.length > 0);
  }

  // Étape 2 : modifications (remplacent un office existant)
  for (const o of overrides) {
    if (o.action !== 'modify' || !o.target_office_id) continue;
    slots = slots.map(slot => ({
      ...slot,
      entries: slot.entries.map(e => {
        const id = slot.type + '_' + e.t.replace(':', '');
        if (id !== o.target_office_id) return e;
        const t = o.time || e.t;
        return {
          ...e,
          t,
          tl: t.replace(':', 'h').replace(/h(\d)$/, 'h0$1'),  // "10:00" → "10h00"
          dur: o.duration || e.dur,
          srcs: (Array.isArray(o.sources) && o.sources.length) ? o.sources : e.srcs,
        };
      }),
    }));
    // Si le label/type/description sont modifiés, on les applique au slot
    slots = slots.map(slot => {
      const stillHasModified = slot.entries.some(e =>
        (slot.type + '_' + e.t.replace(':', '')) === o.target_office_id
        || (o.time && slot.type + '_' + o.time.replace(':', '') === o.target_office_id)
      );
      if (!stillHasModified) return slot;
      return {
        ...slot,
        label:       o.label       || slot.label,
        description: o.description || slot.description || slot.desc,
        desc:        o.description || slot.desc,
      };
    });
  }

  // Étape 3 : ajouts
  for (const o of overrides) {
    if (o.action !== 'add' || !o.type || !o.time) continue;
    const t = o.time;
    const tl = t.replace(':', 'h').replace(/h(\d)$/, 'h0$1');
    slots.push({
      type:  o.type,
      label: o.label || (o.type.charAt(0).toUpperCase() + o.type.slice(1)),
      desc:  o.description || '',
      entries: [{
        t, tl,
        dur:  o.duration || 30,
        srcs: Array.isArray(o.sources) ? o.sources : [],
      }],
    });
  }

  return slots;
}

const WEEK_SCHEDULE = {

  // Jeudi (4) — fallback aussi pour tout jour non défini
  ordinary: [
    { type: 'chapelet', label: 'Chapelet de minuit',
      desc: RM_DESC.midnightCh, mystByDow: MYST_DOW.midnight,
      entries: [{ t: '0:00', tl: '0h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde',
      desc: RM_DESC.divineMercy3,
      entries: [{ t: '3:00', tl: '3h00', dur: 15, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet en latin',
      desc: 'Récité en latin, langue de la liturgie traditionnelle.', mystByDow: MYST_DOW.latin,
      entries: [{ t: '5:30', tl: '5h30', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin (RCF Notre-Dame)',
      desc: RCF_DESC.morningPrayer,
      entries: [
        { t: '5:50', tl: '5h50', dur: 10, srcs: ['nd'] },
        { t: '6:50', tl: '6h50', dur: 10, srcs: ['nd'] },
        { t: '7:50', tl: '7h50', dur: 10, srcs: ['nd'] },
        { t: '8:50', tl: '8h50', dur: 10, srcs: ['nd'] },
      ],
    },
    { type: 'laudes', label: 'Laudes',
      desc: "Office du matin de l'Église — louange à Dieu au lever du jour.",
      entries: [{ t: '7:00', tl: '7h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin',
      desc: RM_DESC.morningPrayer,
      entries: [{ t: '8:00', tl: '8h00', dur: 15, srcs: ['rm', 'esp'] }],
    },
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',
      desc: RM_DESC.morningCh830, mystByDow: MYST_DOW.morning830,
      entries: [{ t: '8:30', tl: '8h30', dur: 40, srcs: ['rm'] }],
    },
    { type: 'messe', label: 'Sainte Messe',
      entries: [
        { t: '9:15',  tl: '9h15',  dur: 45, srcs: ['lou'] },
        { t: '10:00', tl: '10h00', dur: 45, srcs: ['kto'] },
      ],
    },
    // JEUDI : Messe des malades (Radio Maria — La Garde)
    { type: 'messe', label: 'Messe des malades — ND de la Nativité (La Garde)',
      desc: "Messe des malades en direct des studios de Radio Maria ou de la paroisse Notre-Dame de la Nativité, La Garde (83).",
      entries: [{ t: '11:15', tl: '11h15', dur: 45, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Midi',
      entries: [{ t: '12:00', tl: '12h00', dur: 30, srcs: ['rm'] }],
    },
    // JEUDI : Messe pour les malades — Notre-Dame des Victoires (RCF Notre-Dame)
    { type: 'messe', label: 'Messe pour les malades — Notre-Dame des Victoires',
      desc: RCF_DESC.malades + ' Tous les jeudis.',
      entries: [{ t: '14:30', tl: '14h30', dur: 45, srcs: ['nd'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde (avec un auditeur)',
      desc: RM_DESC.divineMercy15,
      entries: [{ t: '15:00', tl: '15h00', dur: 15, srcs: ['rm'] }],
    },
    // JEUDI : Fidélité diffuse la Messe des malades au lieu du Chapelet de Lourdes
    // → fid retiré du Chapelet de Lourdes ce jour, ajouté à la nouvelle messe ci-dessous.
    { type: 'chapelet', label: 'Chapelet de Lourdes',
      desc: RM_DESC.lourdesCh,
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd'] }],
    },
    { type: 'messe', label: 'Messe des malades (Radio Fidélité)',
      desc: "Messe des malades en direct sur Radio Fidélité depuis le diocèse d'Angers. Eucharistie célébrée tous les jeudis aux intentions des personnes malades, des soignants et de leurs familles.",
      entries: [{ t: '15:30', tl: '15h30', dur: 45, srcs: ['fid'] }],
    },
    { type: 'vepres', label: 'Vêpres',
      desc: RM_DESC.vespers,
      entries: [{ t: '17:40', tl: '17h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',
      entries: [{ t: '18:00', tl: '18h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'soiree', label: 'Prière du soir — Pour vous les enfants',
      desc: RM_DESC.eveningKids,
      entries: [{ t: '19:40', tl: '19h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'complies', label: 'Complies',
      desc: RM_DESC.complines,
      entries: [
        { t: '22:00', tl: '22h00', dur: 20, srcs: ['rm'] },
        { t: '22:05', tl: '22h05', dur: 20, srcs: ['esp'] },
      ],
    },
  ],

  // Mardi (2) — Messe Pellevoisin 11h15 + Chapelet Kibeho 18h00
  2: [
    { type: 'chapelet', label: 'Chapelet de minuit',
      desc: RM_DESC.midnightCh, mystByDow: MYST_DOW.midnight,
      entries: [{ t: '0:00', tl: '0h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde',
      desc: RM_DESC.divineMercy3,
      entries: [{ t: '3:00', tl: '3h00', dur: 15, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet en latin',
      desc: 'Récité en latin, langue de la liturgie traditionnelle.', mystByDow: MYST_DOW.latin,
      entries: [{ t: '5:30', tl: '5h30', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin (RCF Notre-Dame)',
      desc: RCF_DESC.morningPrayer,
      entries: [
        { t: '5:50', tl: '5h50', dur: 10, srcs: ['nd'] },
        { t: '6:50', tl: '6h50', dur: 10, srcs: ['nd'] },
        { t: '7:50', tl: '7h50', dur: 10, srcs: ['nd'] },
        { t: '8:50', tl: '8h50', dur: 10, srcs: ['nd'] },
      ],
    },
    { type: 'laudes', label: 'Laudes',
      desc: "Office du matin de l'Église — louange à Dieu au lever du jour.",
      entries: [{ t: '7:00', tl: '7h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin',
      desc: RM_DESC.morningPrayer,
      entries: [{ t: '8:00', tl: '8h00', dur: 15, srcs: ['rm', 'esp'] }],
    },
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',
      desc: RM_DESC.morningCh830, mystByDow: MYST_DOW.morning830,
      entries: [{ t: '8:30', tl: '8h30', dur: 40, srcs: ['rm'] }],
    },
    { type: 'messe', label: 'Sainte Messe',
      entries: [
        { t: '9:15',  tl: '9h15',  dur: 45, srcs: ['lou'] },
        { t: '10:00', tl: '10h00', dur: 45, srcs: ['kto'] },
      ],
    },
    { type: 'messe', label: 'Messe — Sanctuaire ND de Pellevoisin',
      desc: "Messe en direct du Sanctuaire Notre-Dame de Pellevoisin (Indre).",
      entries: [{ t: '11:15', tl: '11h15', dur: 45, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Midi',
      entries: [{ t: '12:00', tl: '12h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde (avec un auditeur)',
      desc: RM_DESC.divineMercy15,
      entries: [{ t: '15:00', tl: '15h00', dur: 15, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Lourdes',
      desc: RM_DESC.lourdesCh,
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd', 'fid'] }],
    },
    { type: 'vepres', label: 'Vêpres',
      desc: RM_DESC.vespers,
      entries: [{ t: '17:40', tl: '17h40', dur: 20, srcs: ['rm'] }],
    },
    // SPÉCIFICITÉ MARDI : Chapelet ND des 7 Douleurs (Kibeho)
    { type: 'chapelet', label: 'Chapelet ND des 7 Douleurs (Kibeho)',
      desc: RM_DESC.kibeho, mystByDow: MYST_DOW.kibeho,
      entries: [{ t: '18:00', tl: '18h00', dur: 45, srcs: ['rm'] }],
    },
    { type: 'soiree', label: 'Prière du soir — Pour vous les enfants',
      desc: RM_DESC.eveningKids,
      entries: [{ t: '19:40', tl: '19h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'complies', label: 'Complies',
      desc: RM_DESC.complines,
      entries: [
        { t: '22:00', tl: '22h00', dur: 20, srcs: ['rm'] },
        { t: '22:05', tl: '22h05', dur: 20, srcs: ['esp'] },
      ],
    },
  ],

  // Mercredi (3) — Audience papale à Rome + Messe ND du Laus
  3: [
    { type: 'chapelet', label: 'Chapelet de minuit',
      desc: RM_DESC.midnightCh, mystByDow: MYST_DOW.midnight,
      entries: [{ t: '0:00', tl: '0h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde',
      desc: RM_DESC.divineMercy3,
      entries: [{ t: '3:00', tl: '3h00', dur: 15, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet en latin',
      desc: 'Récité en latin, langue de la liturgie traditionnelle.', mystByDow: MYST_DOW.latin,
      entries: [{ t: '5:30', tl: '5h30', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin (RCF Notre-Dame)',
      desc: RCF_DESC.morningPrayer,
      entries: [
        { t: '5:50', tl: '5h50', dur: 10, srcs: ['nd'] },
        { t: '6:50', tl: '6h50', dur: 10, srcs: ['nd'] },
        { t: '7:50', tl: '7h50', dur: 10, srcs: ['nd'] },
        { t: '8:50', tl: '8h50', dur: 10, srcs: ['nd'] },
      ],
    },
    { type: 'laudes', label: 'Laudes',
      desc: "Office du matin de l'Église — louange à Dieu au lever du jour.",
      entries: [{ t: '7:00', tl: '7h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin',
      desc: RM_DESC.morningPrayer,
      entries: [{ t: '8:00', tl: '8h00', dur: 15, srcs: ['rm', 'esp'] }],
    },
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',
      desc: RM_DESC.morningCh830, mystByDow: MYST_DOW.morning830,
      entries: [{ t: '8:30', tl: '8h30', dur: 40, srcs: ['rm'] }],
    },
    { type: 'messe', label: 'Sainte Messe',
      entries: [{ t: '9:15',  tl: '9h15',  dur: 45, srcs: ['lou'] }],
    },
    { type: 'messe', label: 'Audience papale',
      desc: "Audience générale du Pape, en direct depuis Rome.",
      entries: [{ t: '10:30', tl: '10h30', dur: 90, srcs: ['kto'] }],
    },
    { type: 'messe', label: 'Messe — Notre-Dame du Laus',
      desc: "Messe en direct du Sanctuaire Notre-Dame du Laus (Hautes-Alpes).",
      entries: [{ t: '11:15', tl: '11h15', dur: 45, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Midi',
      entries: [{ t: '12:00', tl: '12h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde (avec un auditeur)',
      desc: RM_DESC.divineMercy15,
      entries: [{ t: '15:00', tl: '15h00', dur: 15, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Lourdes',
      desc: RM_DESC.lourdesCh,
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd', 'fid'] }],
    },
    { type: 'vepres', label: 'Vêpres',
      desc: RM_DESC.vespers,
      entries: [{ t: '17:40', tl: '17h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',
      entries: [{ t: '18:00', tl: '18h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'soiree', label: 'Prière du soir — Pour vous les enfants',
      desc: RM_DESC.eveningKids,
      entries: [{ t: '19:40', tl: '19h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'complies', label: 'Complies',
      desc: RM_DESC.complines,
      entries: [
        { t: '22:00', tl: '22h00', dur: 20, srcs: ['rm'] },
        { t: '22:05', tl: '22h05', dur: 20, srcs: ['esp'] },
      ],
    },
  ],

  // Vendredi (5) — Messe ND de Valcluse
  5: [
    { type: 'chapelet', label: 'Chapelet de minuit',
      desc: RM_DESC.midnightCh, mystByDow: MYST_DOW.midnight,
      entries: [{ t: '0:00', tl: '0h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde',
      desc: RM_DESC.divineMercy3,
      entries: [{ t: '3:00', tl: '3h00', dur: 15, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet en latin',
      desc: 'Récité en latin, langue de la liturgie traditionnelle.', mystByDow: MYST_DOW.latin,
      entries: [{ t: '5:30', tl: '5h30', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin (RCF Notre-Dame)',
      desc: RCF_DESC.morningPrayer,
      entries: [
        { t: '5:50', tl: '5h50', dur: 10, srcs: ['nd'] },
        { t: '6:50', tl: '6h50', dur: 10, srcs: ['nd'] },
        { t: '7:50', tl: '7h50', dur: 10, srcs: ['nd'] },
        { t: '8:50', tl: '8h50', dur: 10, srcs: ['nd'] },
      ],
    },
    { type: 'laudes', label: 'Laudes',
      desc: "Office du matin de l'Église — louange à Dieu au lever du jour.",
      entries: [{ t: '7:00', tl: '7h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin',
      desc: RM_DESC.morningPrayer,
      entries: [{ t: '8:00', tl: '8h00', dur: 15, srcs: ['rm', 'esp'] }],
    },
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',
      desc: RM_DESC.morningCh830, mystByDow: MYST_DOW.morning830,
      entries: [{ t: '8:30', tl: '8h30', dur: 40, srcs: ['rm'] }],
    },
    { type: 'messe', label: 'Sainte Messe',
      entries: [
        { t: '9:15',  tl: '9h15',  dur: 45, srcs: ['lou'] },
        { t: '10:00', tl: '10h00', dur: 45, srcs: ['kto'] },
      ],
    },
    { type: 'messe', label: 'Messe — Notre-Dame de Valcluse',
      desc: "Messe en direct du Sanctuaire Notre-Dame de Valcluse.",
      entries: [{ t: '11:15', tl: '11h15', dur: 45, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Midi',
      entries: [{ t: '12:00', tl: '12h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde (avec un auditeur)',
      desc: RM_DESC.divineMercy15,
      entries: [{ t: '15:00', tl: '15h00', dur: 15, srcs: ['rm', 'fid'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Lourdes',
      desc: RM_DESC.lourdesCh,
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd', 'fid'] }],
    },
    { type: 'vepres', label: 'Vêpres',
      desc: RM_DESC.vespers,
      entries: [{ t: '17:40', tl: '17h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',
      entries: [{ t: '18:00', tl: '18h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'soiree', label: 'Prière du soir — Pour vous les enfants',
      desc: RM_DESC.eveningKids,
      entries: [{ t: '19:40', tl: '19h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'complies', label: 'Complies',
      desc: RM_DESC.complines,
      entries: [
        { t: '22:00', tl: '22h00', dur: 20, srcs: ['rm', 'fid'] },
        { t: '22:05', tl: '22h05', dur: 20, srcs: ['esp'] },
      ],
    },
  ],

  // Samedi (6) — Jour marial. Pas de Divine Miséricorde à 3h. Messe Saint Louis d'Antin
  6: [
    { type: 'chapelet', label: 'Chapelet de minuit',
      desc: RM_DESC.midnightCh, mystByDow: MYST_DOW.midnight,
      entries: [{ t: '0:00', tl: '0h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet en latin',
      desc: 'Récité en latin, langue de la liturgie traditionnelle.', mystByDow: MYST_DOW.latin,
      entries: [{ t: '5:30', tl: '5h30', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin (RCF Notre-Dame)',
      desc: RCF_DESC.morningPrayer,
      entries: [
        { t: '5:50', tl: '5h50', dur: 10, srcs: ['nd'] },
        { t: '6:50', tl: '6h50', dur: 10, srcs: ['nd'] },
        { t: '7:50', tl: '7h50', dur: 10, srcs: ['nd'] },
        { t: '8:50', tl: '8h50', dur: 10, srcs: ['nd'] },
      ],
    },
    { type: 'laudes', label: 'Laudes',
      desc: "Office du matin de l'Église — louange à Dieu au lever du jour.",
      entries: [{ t: '7:00', tl: '7h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin',
      desc: RM_DESC.morningPrayer,
      entries: [{ t: '8:00', tl: '8h00', dur: 15, srcs: ['rm', 'esp'] }],
    },
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',
      desc: RM_DESC.morningCh830, mystByDow: MYST_DOW.morning830,
      entries: [{ t: '8:30', tl: '8h30', dur: 40, srcs: ['rm'] }],
    },
    { type: 'messe', label: 'Sainte Messe',
      entries: [{ t: '10:00', tl: '10h00', dur: 45, srcs: ['kto', 'ars'] }],
    },
    { type: 'messe', label: 'Messe — Saint Louis d\'Antin (Paris 9e)',
      desc: "Messe en direct de l'église Saint-Louis-d'Antin (Paris 9ᵉ).",
      entries: [{ t: '11:30', tl: '11h30', dur: 45, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde (avec un auditeur)',
      desc: RM_DESC.divineMercy15,
      entries: [{ t: '15:00', tl: '15h00', dur: 15, srcs: ['rm', 'fid'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Lourdes',
      desc: RM_DESC.lourdesCh,
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd', 'fid'] }],
    },
    { type: 'vepres', label: 'Vêpres du dimanche (anticipées)',
      desc: "Vêpres dominicales anticipées le samedi soir.",
      entries: [{ t: '17:40', tl: '17h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',
      entries: [{ t: '18:00', tl: '18h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'soiree', label: 'Prière du soir — Pour vous les enfants',
      desc: RM_DESC.eveningKids,
      entries: [{ t: '19:40', tl: '19h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'complies', label: 'Complies',
      desc: RM_DESC.complines,
      entries: [
        { t: '22:00', tl: '22h00', dur: 20, srcs: ['rm'] },
        { t: '22:05', tl: '22h05', dur: 20, srcs: ['esp'] },
      ],
    },
  ],

  // Lundi (1) — Messe Sanctuaire ND de Grâce à Cotignac
  1: [
    { type: 'chapelet', label: 'Chapelet de minuit',
      desc: RM_DESC.midnightCh, mystByDow: MYST_DOW.midnight,
      entries: [{ t: '0:00', tl: '0h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde',
      desc: RM_DESC.divineMercy3,
      entries: [{ t: '3:00', tl: '3h00', dur: 15, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet en latin',
      desc: 'Récité en latin, langue de la liturgie traditionnelle.', mystByDow: MYST_DOW.latin,
      entries: [{ t: '5:30', tl: '5h30', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin (RCF Notre-Dame)',
      desc: RCF_DESC.morningPrayer,
      entries: [
        { t: '5:50', tl: '5h50', dur: 10, srcs: ['nd'] },
        { t: '6:50', tl: '6h50', dur: 10, srcs: ['nd'] },
        { t: '7:50', tl: '7h50', dur: 10, srcs: ['nd'] },
        { t: '8:50', tl: '8h50', dur: 10, srcs: ['nd'] },
      ],
    },
    { type: 'laudes', label: 'Laudes',
      desc: "Office du matin de l'Église — louange à Dieu au lever du jour.",
      entries: [{ t: '7:00', tl: '7h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin',
      desc: RM_DESC.morningPrayer,
      entries: [{ t: '8:00', tl: '8h00', dur: 15, srcs: ['rm', 'esp'] }],
    },
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',
      desc: RM_DESC.morningCh830, mystByDow: MYST_DOW.morning830,
      entries: [{ t: '8:30', tl: '8h30', dur: 40, srcs: ['rm'] }],
    },
    { type: 'messe', label: 'Sainte Messe',
      entries: [
        { t: '9:15',  tl: '9h15',  dur: 45, srcs: ['lou'] },
        { t: '10:00', tl: '10h00', dur: 45, srcs: ['kto'] },
      ],
    },
    { type: 'messe', label: 'Messe — Sanctuaire ND de Grâce à Cotignac',
      desc: "Messe en direct du Sanctuaire Notre-Dame de Grâce à Cotignac (Var).",
      entries: [{ t: '11:30', tl: '11h30', dur: 45, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Midi',
      entries: [{ t: '12:00', tl: '12h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde (avec un auditeur)',
      desc: RM_DESC.divineMercy15,
      entries: [{ t: '15:00', tl: '15h00', dur: 15, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Lourdes',
      desc: RM_DESC.lourdesCh,
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd', 'fid'] }],
    },
    { type: 'vepres', label: 'Vêpres',
      desc: RM_DESC.vespers,
      entries: [{ t: '17:40', tl: '17h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',
      entries: [{ t: '18:00', tl: '18h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'messe', label: 'Messe Notre-Dame de Boulogne',
      entries: [{ t: '19:00', tl: '19h00', dur: 45, srcs: ['rm'] }],
    },
    { type: 'soiree', label: 'Prière du soir — Pour vous les enfants',
      desc: RM_DESC.eveningKids,
      entries: [{ t: '19:40', tl: '19h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'complies', label: 'Complies',
      desc: RM_DESC.complines,
      entries: [
        { t: '22:00', tl: '22h00', dur: 20, srcs: ['rm'] },
        { t: '22:05', tl: '22h05', dur: 20, srcs: ['esp'] },
      ],
    },
  ],

  // Dimanche (0) — Cœur de la semaine. Pas de Divine Miséricorde à 3h.
  0: [
    { type: 'chapelet', label: 'Chapelet de minuit',
      desc: RM_DESC.midnightCh, mystByDow: MYST_DOW.midnight,
      entries: [{ t: '0:00', tl: '0h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Chapelet en latin',
      desc: 'Récité en latin, langue de la liturgie traditionnelle.', mystByDow: MYST_DOW.latin,
      entries: [{ t: '5:30', tl: '5h30', dur: 30, srcs: ['rm'] }],
    },
    { type: 'matin', label: 'Prière du matin (RCF Notre-Dame)',
      desc: RCF_DESC.morningPrayer,
      entries: [
        { t: '5:50', tl: '5h50', dur: 10, srcs: ['nd'] },
        { t: '6:50', tl: '6h50', dur: 10, srcs: ['nd'] },
        { t: '7:50', tl: '7h50', dur: 10, srcs: ['nd'] },
        { t: '8:50', tl: '8h50', dur: 10, srcs: ['nd'] },
      ],
    },
    { type: 'laudes', label: 'Laudes dominicales',
      desc: "Louange solennelle du dimanche, Jour du Seigneur.",
      entries: [{ t: '8:00', tl: '8h00', dur: 30, srcs: ['rm', 'rcf'] }],
    },
    { type: 'chapelet', label: 'Chapelet du matin (enregistré)',
      desc: RM_DESC.morningCh830, mystByDow: MYST_DOW.morning830,
      entries: [{ t: '8:30', tl: '8h30', dur: 40, srcs: ['rm'] }],
    },
    { type: 'messe', label: "Grand'Messe",
      entries: [
        { t: '10:00', tl: '10h00', dur: 45, srcs: ['ndp', 'kto'] },
        { t: '10:30', tl: '10h30', dur: 45, srcs: ['lou'] },
      ],
    },
    { type: 'messe', label: 'Messe en direct (paroisse ou sanctuaire)',
      desc: "Messe en direct d'une paroisse ou d'un sanctuaire différent chaque dimanche, grâce aux équipes de bénévoles de Radio Maria.",
      entries: [{ t: '10:00', tl: '10h00', dur: 120, srcs: ['rm'] }],
    },
    { type: 'chapelet', label: 'Angélus',
      desc: "Prière mariale traditionnelle de midi, en union avec le Pape depuis Saint-Pierre de Rome.",
      entries: [{ t: '12:00', tl: '12h00', dur: 15, srcs: ['kto'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde',
      desc: "Le chapelet de la Divine Miséricorde diffusé sur plusieurs sources le dimanche.",
      entries: [{ t: '15:00', tl: '15h00', dur: 15, srcs: ['rm', 'lou'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Lourdes',
      desc: RM_DESC.lourdesCh,
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd', 'fid'] }],
    },
    { type: 'vepres', label: 'Vêpres solennelles',
      desc: "Vêpres dominicales solennelles.",
      entries: [
        { t: '17:30', tl: '17h30', dur: 30, srcs: ['ndp'] },
        { t: '17:40', tl: '17h40', dur: 20, srcs: ['rm'] },
      ],
    },
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',
      entries: [{ t: '18:00', tl: '18h00', dur: 30, srcs: ['rm'] }],
    },
    { type: 'soiree', label: 'Prière du soir — Pour vous les enfants',
      desc: RM_DESC.eveningKids,
      entries: [{ t: '19:40', tl: '19h40', dur: 20, srcs: ['rm'] }],
    },
    { type: 'complies', label: 'Complies',
      desc: RM_DESC.complines,
      entries: [
        { t: '22:00', tl: '22h00', dur: 20, srcs: ['rm'] },
        { t: '22:05', tl: '22h05', dur: 20, srcs: ['esp'] },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════
// Injection automatique du planning Radio Espérance dans chaque jour
// (évite la duplication manuelle de ~9 slots × 7 jours)
// ════════════════════════════════════════════════════════════════════════
function _buildEspSlotsForDow(dow) {
  // Slots quotidiens (tous les jours, dimanche inclus)
  const slots = [
    { type: 'laudes', label: 'Laudes en grégorien — Triors (Radio Espérance)',
      desc: ESP_DESC.laudesGreg,
      // monasticOffice : office bénédictin en grégorien (psautier de saint Benoît,
      // hymnes du Liber Hymnarius). Cache le bouton "Bréviaire" (AELF romain
      // incompatible) et affiche un bouton "Office monastique" → panneau pédagogique.
      monasticOffice: true,
      officeKind: 'laudes',  // → cantique du Benedictus dans le panneau
      entries: [{ t: '6:05', tl: '6h05', dur: 40, srcs: ['esp', 'espg'] }],
    },
    { type: 'matin', label: 'Prière du matin (Radio Espérance)',
      desc: ESP_DESC.morningPrayer703,
      entries: [{ t: '7:03', tl: '7h03', dur: 27, srcs: ['esp'] }],
    },
    { type: 'chapelet', label: "Chapelet aux intentions du monde et de l'Église (Espérance)",
      desc: ESP_DESC.chapelet830, mystByDow: ESP_MYST_DOW.chapelet830,
      entries: [{ t: '8:30', tl: '8h30', dur: 30, srcs: ['esp'] }],
    },
    { type: 'chapelet', label: 'Chapelet aux intentions des auditeurs (Espérance)',
      desc: ESP_DESC.chapelet1430, mystByDow: ESP_MYST_DOW.chapelet1430,
      entries: [{ t: '14:30', tl: '14h30', dur: 30, srcs: ['esp'] }],
    },
    { type: 'chapelet', label: 'Chapelet pour les vocations (Espérance)',
      desc: ESP_DESC.chapelet2030, mystByDow: ESP_MYST_DOW.chapelet2030,
      entries: [{ t: '20:30', tl: '20h30', dur: 30, srcs: ['esp'] }],
    },
  ];

  // Messe Saint-Wandrille — grégorien (lun-sam à 9h45, dimanche à 10h00 ci-dessous)
  if (dow >= 1 && dow <= 6) {
    slots.push({
      type: 'messe', label: 'Messe en grégorien — Abbaye Saint-Wandrille',
      desc: ESP_DESC.messeStWandrille,
      latinMass: true,  // → ajoute le bouton "Suivre en latin"
      entries: [{ t: '9:45', tl: '9h45', dur: 45, srcs: ['espg'] }],
    });
  }

  // Vêpres Saint-Wandrille — grégorien (horaire variable selon le jour)
  // dim : 17h00 · mar/jeu : 18h45 · lun/mer/ven/sam : 17h30
  // Sur solennités : ajustement automatique à 17h00 (cf. _getDayScheduleInternal)
  let vepT, vepTl;
  if (dow === 0)                     { vepT = '17:00'; vepTl = '17h00'; }
  else if (dow === 2 || dow === 4)   { vepT = '18:45'; vepTl = '18h45'; }
  else                               { vepT = '17:30'; vepTl = '17h30'; }
  slots.push({
    type: 'vepres', label: 'Vêpres en grégorien — Abbaye Saint-Wandrille',
    desc: ESP_DESC.vepresStWandrille,
    monasticOffice: true,  // → bouton "Office monastique" + cache bréviaire AELF
    officeKind: 'vepres',  // → indique au panneau la structure des vêpres (Magnificat)
    entries: [{ t: vepT, tl: vepTl, dur: 30, srcs: ['espg'] }],
  });

  // Complies Saint-Wandrille — grégorien, tous les jours à 20h30 (15 min)
  // Exception : Vigiles de la Pentecôte (samedi avant Pentecôte) — voir
  // _getDayScheduleInternal pour le remplacement à cette date précise.
  slots.push({
    type: 'complies', label: 'Complies en grégorien — Abbaye Saint-Wandrille',
    desc: ESP_DESC.compliesStWandrille,
    monasticOffice: true,
    officeKind: 'complies',  // → cantique Nunc Dimittis dans le panneau
    entries: [{ t: '20:30', tl: '20h30', dur: 15, srcs: ['espg'] }],
  });

  // Messe crypte Saint-Michel — lun-sam (pas dimanche)
  if (dow !== 0) {
    slots.push(
      { type: 'messe', label: 'Messe — Crypte Saint-Michel (Saint-Étienne)',
        desc: ESP_DESC.messeCrypteSE,
        entries: [{ t: '11:30', tl: '11h30', dur: 30, srcs: ['esp'] }],
      },
      { type: 'chapelet', label: "Temps d'intercession et chapelet de la Miséricorde (Espérance)",
        desc: ESP_DESC.intercession1700,
        entries: [{ t: '17:00', tl: '17h00', dur: 35, srcs: ['esp'] }],
      },
    );
  }

  // Vêpres couvent Saint-Antoine Bastia — lun-ven uniquement
  if (dow >= 1 && dow <= 5) {
    slots.push({
      type: 'vepres', label: 'Vêpres — Couvent Saint-Antoine (Bastia)',
      desc: ESP_DESC.vepresBastia,
      entries: [{ t: '18:35', tl: '18h35', dur: 15, srcs: ['esp'] }],
    });
  }

  // Vendredi : chapelet de la Miséricorde à 15h10 (hors Carême)
  if (dow === 5) {
    slots.push({
      type: 'chapelet', label: 'Chapelet de la Miséricorde (vendredi — Espérance)',
      desc: ESP_DESC.chapeletMisericordeVend,
      entries: [{ t: '15:10', tl: '15h10', dur: 10, srcs: ['esp'] }],
    });
  }

  // Dimanche : messe dominicale + messe grégorienne Saint-Wandrille + vêpres Triors
  if (dow === 0) {
    slots.push(
      { type: 'messe', label: 'Messe dominicale (Saint-Étienne — Espérance)',
        desc: ESP_DESC.messeDominicale,
        entries: [{ t: '10:00', tl: '10h00', dur: 75, srcs: ['esp'] }],
      },
      { type: 'messe', label: 'Messe dominicale en grégorien — Abbaye Saint-Wandrille',
        desc: ESP_DESC.messeStWandrilleDim,
        latinMass: true,  // → ajoute le bouton "Suivre en latin"
        entries: [{ t: '10:00', tl: '10h00', dur: 90, srcs: ['espg'] }],
      },
      { type: 'vepres', label: 'Vêpres en grégorien — Triors (Espérance)',
        desc: ESP_DESC.vepresTriors,
        entries: [{ t: '17:00', tl: '17h00', dur: 50, srcs: ['esp'] }],
      },
    );
  }

  return slots;
}

// Pousse les slots Espérance dans chaque jour défini de WEEK_SCHEDULE.
// `ordinary` sert de fallback pour le jeudi (dow=4) et tout jour non défini.
(function injectEsperanceSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildEspSlotsForDow(dow));
  });
})();

// ════════════════════════════════════════════════════════════════════
// Radio Fidélité (Angers) — slots quotidiens
// ════════════════════════════════════════════════════════════════════
function _buildFidSlotsForDow(dow) {
  const slots = [];
  // Prière du matin : lun-ven 6h30, samedi 7h00, dimanche 8h00 — durée 15 min
  let t, tl;
  if      (dow === 0) { t = '8:00'; tl = '8h00'; }
  else if (dow === 6) { t = '7:00'; tl = '7h00'; }
  else                { t = '6:30'; tl = '6h30'; }
  slots.push({
    type: 'matin', label: 'Prière du matin (Radio Fidélité)',
    desc: FID_DESC.morningPrayer,
    entries: [{ t, tl, dur: 15, srcs: ['fid'] }],
  });
  // Messe du matin : mardi-vendredi à 9h00 (45 min)
  if (dow >= 2 && dow <= 5) {
    slots.push({
      type: 'messe', label: 'Messe du matin (Radio Fidélité)',
      desc: FID_DESC.morningMass,
      entries: [{ t: '9:00', tl: '9h00', dur: 45, srcs: ['fid'] }],
    });
  }
  // Complies : tous les jours à 20h00 (45 min)
  slots.push({
    type: 'complies', label: 'Complies (Radio Fidélité)',
    desc: FID_DESC.complies,
    entries: [{ t: '20:00', tl: '20h00', dur: 45, srcs: ['fid'] }],
  });
  return slots;
}
(function injectFideliteSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildFidSlotsForDow(dow));
  });
})();

// ════════════════════════════════════════════════════════════════════
// Paroisse Notre-Dame de La Salette (Paris 15ᵉ) — YouTube live
// ════════════════════════════════════════════════════════════════════
function _buildPNDLSSlotsForDow(dow) {
  const slots = [];
  // Lun-ven : 19h00 (40 min)
  if (dow >= 1 && dow <= 5) {
    slots.push({
      type: 'messe', label: 'Messe — Paroisse Notre-Dame de La Salette',
      desc: PNDLS_DESC.messe,
      entries: [{ t: '19:00', tl: '19h00', dur: 40, srcs: ['pnds'] }],
    });
  }
  // Samedi : 9h15 (40 min)
  if (dow === 6) {
    slots.push({
      type: 'messe', label: 'Messe — Paroisse Notre-Dame de La Salette',
      desc: PNDLS_DESC.messe,
      entries: [{ t: '9:15', tl: '9h15', dur: 40, srcs: ['pnds'] }],
    });
  }
  // Dimanche : 11h00 (1h15)
  if (dow === 0) {
    slots.push({
      type: 'messe', label: 'Messe dominicale — Paroisse Notre-Dame de La Salette',
      desc: PNDLS_DESC.messeDim,
      entries: [{ t: '11:00', tl: '11h00', dur: 75, srcs: ['pnds'] }],
    });
  }
  return slots;
}
(function injectPNDLSSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildPNDLSSlotsForDow(dow));
  });
})();

// ════════════════════════════════════════════════════════════════════
// KTO — Messe quotidienne depuis Notre-Dame de la Garde (Marseille)
// ════════════════════════════════════════════════════════════════════
function _buildKtoSlotsForDow(dow) {
  const slots = [];
  // Notre-Dame de la Garde (Marseille)
  // Lundi    : Messe seule à 7h25 (30 min)
  // Mar-sam  : Laudes 7h25-7h45 (20 min) puis Messe 7h45-8h10 (25 min)
  if (dow === 1) {
    slots.push({
      type: 'messe', label: 'Messe — Notre-Dame de la Garde (Marseille)',
      desc: KTO_DESC.messeNDGardeLun,
      entries: [{ t: '7:25', tl: '7h25', dur: 30, srcs: ['kto'] }],
    });
  }
  if (dow >= 2 && dow <= 6) {
    slots.push({
      type: 'laudes', label: 'Laudes — Notre-Dame de la Garde (Marseille)',
      desc: KTO_DESC.laudesNDGarde,
      monasticOffice: true, officeKind: 'laudes',
      entries: [{ t: '7:25', tl: '7h25', dur: 20, srcs: ['kto'] }],
    });
    slots.push({
      type: 'messe', label: 'Messe — Notre-Dame de la Garde (Marseille)',
      desc: KTO_DESC.messeNDGarde,
      entries: [{ t: '7:45', tl: '7h45', dur: 25, srcs: ['kto'] }],
    });
  }
  // Vêpres en direct de Notre-Dame de Paris
  // Lun-ven 17h30, samedi 17h15
  if (dow >= 1 && dow <= 5) {
    slots.push({
      type: 'vepres', label: 'Vêpres — Notre-Dame de Paris',
      desc: KTO_DESC.vepresNDParis,
      monasticOffice: true,
      officeKind: 'vepres',
      entries: [{ t: '17:30', tl: '17h30', dur: 25, srcs: ['kto'] }],
    });
  }
  if (dow === 6) {
    slots.push({
      type: 'vepres', label: 'Vêpres — Notre-Dame de Paris',
      desc: KTO_DESC.vepresNDParis,
      monasticOffice: true,
      officeKind: 'vepres',
      entries: [{ t: '17:15', tl: '17h15', dur: 25, srcs: ['kto'] }],
    });
  }
  // Messe en direct de Notre-Dame de Paris — tous les jours à 18h
  slots.push({
    type: 'messe', label: 'Messe — Notre-Dame de Paris',
    desc: KTO_DESC.messeNDParis,
    entries: [{ t: '18:00', tl: '18h00', dur: 45, srcs: ['kto'] }],
  });
  return slots;
}
(function injectKtoSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildKtoSlotsForDow(dow));
  });
})();

// ════════════════════════════════════════════════════════════════════
// Sanctuaire Notre-Dame du Laus (Hautes-Alpes) — YouTube live
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// Radio Galilée (Québec) — horaires en heure de Paris (Québec +6h)
// ════════════════════════════════════════════════════════════════════
function _buildGalSlotsForDow(dow) {
  const slots = [];
  // Chapelet médité matin — tous les jours 6h Québec → 12h00 Paris (30 min)
  slots.push({
    type: 'chapelet', label: 'Chapelet médité — Radio Galilée (Québec)',
    desc: GAL_DESC.chapeletMatin,
    entries: [{ t: '12:00', tl: '12h00', dur: 30, srcs: ['gal'] }],
  });
  // Messe « En mémoire de Lui » — mercredi 14h30 Québec → 20h30 Paris (30 min)
  if (dow === 3) {
    slots.push({
      type: 'messe', label: 'Messe « En mémoire de Lui » — Radio Galilée (Québec)',
      desc: GAL_DESC.messe,
      entries: [{ t: '20:30', tl: '20h30', dur: 30, srcs: ['gal'] }],
    });
  }
  // Chapelet médité après-midi — lun-sam 15h30 Québec → 21h30 Paris (30 min)
  if (dow >= 1 && dow <= 6) {
    slots.push({
      type: 'chapelet', label: 'Chapelet médité — Radio Galilée (Québec)',
      desc: GAL_DESC.chapeletApMidi,
      entries: [{ t: '21:30', tl: '21h30', dur: 30, srcs: ['gal'] }],
    });
  }
  // Chapelet médité dominical — dimanche 11h Québec → 17h00 Paris (30 min)
  if (dow === 0) {
    slots.push({
      type: 'chapelet', label: 'Chapelet médité dominical — Radio Galilée (Québec)',
      desc: GAL_DESC.chapeletDim,
      entries: [{ t: '17:00', tl: '17h00', dur: 30, srcs: ['gal'] }],
    });
  }
  return slots;
}
(function injectGalSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildGalSlotsForDow(dow));
  });
})();

// ════════════════════════════════════════════════════════════════════
// Radio Ville-Marie (Montréal) — horaires en heure de Paris.
// ATTENTION : Québec lun-ven en soirée → Paris mar-sam tôt le matin (+1 jour)
// ════════════════════════════════════════════════════════════════════
function _buildRvmSlotsForDow(dow) {
  const slots = [];
  // Quebec lun-ven (Paris dow 2..6 = mar-sam) :
  if (dow >= 2 && dow <= 6) {
    // Chapelet médité — 18h35 Québec → 00h35 Paris (25 min)
    slots.push({
      type: 'chapelet', label: 'Chapelet médité — Radio Ville-Marie (Montréal)',
      desc: RVM_DESC.chapelet,
      entries: [{ t: '0:35', tl: '0h35', dur: 25, srcs: ['rvm'] }],
    });
    // Messe Oratoire St-Joseph du Mont-Royal — 19h00 Québec → 01h00 Paris (30 min)
    slots.push({
      type: 'messe', label: 'Messe — Oratoire Saint-Joseph du Mont-Royal (Montréal)',
      desc: RVM_DESC.messe,
      entries: [{ t: '1:00', tl: '1h00', dur: 30, srcs: ['rvm'] }],
    });
    // Complies (Abbaye St-Benoît-du-Lac) — 23h15 Québec → 05h15 Paris (15 min)
    slots.push({
      type: 'complies', label: 'Complies — Abbaye Saint-Benoît-du-Lac (Québec)',
      desc: RVM_DESC.complies,
      monasticOffice: true, officeKind: 'complies',
      entries: [{ t: '5:15', tl: '5h15', dur: 15, srcs: ['rvm'] }],
    });
  }
  // Messe dominicale — Québec dim 11h-12h30 → Paris dim 17h00 (90 min, même jour)
  if (dow === 0) {
    slots.push({
      type: 'messe', label: 'Messe dominicale — Oratoire Saint-Joseph du Mont-Royal (Montréal)',
      desc: RVM_DESC.messeDim,
      entries: [{ t: '17:00', tl: '17h00', dur: 90, srcs: ['rvm'] }],
    });
  }
  return slots;
}
(function injectRvmSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildRvmSlotsForDow(dow));
  });
})();

// ════════════════════════════════════════════════════════════════════
// Sel + Lumière TV (Québec) — chapelet quotidien, mystères selon le jour
// Lun-sam 8h Qc → 14h Paris (même jour) / Dim 7h30 Qc → 13h30 Paris
// ════════════════════════════════════════════════════════════════════
function _buildSlmSlotsForDow(dow) {
  const slots = [];
  let desc, label;
  // Messe Cathédrale Marie-Reine-du-Monde de Montréal
  // Lun-sam 7h30 Qc → 13h30 Paris (30 min) / Dim 9h30 Qc → 15h30 Paris (60 min)
  if (dow >= 1 && dow <= 6) {
    slots.push({
      type: 'messe', label: 'Messe — Cathédrale Marie-Reine-du-Monde (Montréal)',
      desc: SLM_DESC.messeSem,
      entries: [{ t: '13:30', tl: '13h30', dur: 30, srcs: ['slm'] }],
    });
  }
  if (dow === 0) {
    slots.push({
      type: 'messe', label: 'Messe dominicale — Cathédrale Marie-Reine-du-Monde (Montréal)',
      desc: SLM_DESC.messeDim,
      entries: [{ t: '15:30', tl: '15h30', dur: 60, srcs: ['slm'] }],
    });
  }
  // Rediffusions messe :
  // Lun-ven 16h Qc → 22h Paris (30 min) / Sam 14h Qc → 20h Paris (30 min) / Dim 16h Qc → 22h Paris (60 min)
  if (dow >= 1 && dow <= 5) {
    slots.push({
      type: 'messe', label: 'Messe (rediffusion) — Cathédrale Marie-Reine-du-Monde (Montréal)',
      desc: SLM_DESC.messeRediff,
      entries: [{ t: '22:00', tl: '22h00', dur: 30, srcs: ['slm'] }],
    });
  }
  if (dow === 6) {
    slots.push({
      type: 'messe', label: 'Messe (rediffusion) — Cathédrale Marie-Reine-du-Monde (Montréal)',
      desc: SLM_DESC.messeRediffSam,
      entries: [{ t: '20:00', tl: '20h00', dur: 30, srcs: ['slm'] }],
    });
  }
  if (dow === 0) {
    slots.push({
      type: 'messe', label: 'Messe dominicale (rediffusion) — Cathédrale Marie-Reine-du-Monde (Montréal)',
      desc: SLM_DESC.messeRediffDim,
      entries: [{ t: '22:00', tl: '22h00', dur: 60, srcs: ['slm'] }],
    });
  }
  // Chapelet quotidien 17h Qc → 23h Paris (30 min) — mystères selon le jour
  // Note : diffusion suspendue les jours de solennité (caveat dans desc)
  {
    let labelChap;
    if (dow === 0) labelChap = 'Chapelet — Mystères glorieux — Sel + Lumière TV (Québec)';
    if (dow === 1) labelChap = 'Chapelet — Mystères joyeux — Sel + Lumière TV (Québec)';
    if (dow === 2) labelChap = 'Chapelet — Mystères douloureux — Sel + Lumière TV (Québec)';
    if (dow === 3) labelChap = 'Chapelet — Mystères glorieux — Sel + Lumière TV (Québec)';
    if (dow === 4) labelChap = 'Chapelet — Mystères lumineux — Sel + Lumière TV (Québec)';
    if (dow === 5) labelChap = 'Chapelet — Mystères douloureux — Sel + Lumière TV (Québec)';
    if (dow === 6) labelChap = 'Chapelet — Mystères joyeux — Sel + Lumière TV (Québec)';
    if (labelChap) {
      slots.push({
        type: 'chapelet', label: labelChap,
        desc: SLM_DESC.chapeletAprem,
        entries: [{ t: '23:00', tl: '23h00', dur: 30, srcs: ['slm'] }],
      });
    }
  }
  // Rotation des mystères selon le jour (rotation traditionnelle SLM)
  if (dow === 0) {
    // Dimanche : glorieux à 7h30 Qc → 13h30 Paris
    slots.push({
      type: 'chapelet', label: 'Chapelet — Mystères glorieux — Sel + Lumière TV (Québec)',
      desc: SLM_DESC.glorieuxDim,
      entries: [{ t: '13:30', tl: '13h30', dur: 30, srcs: ['slm'] }],
    });
    return slots;
  }
  // Lun-sam : 8h Qc → 14h00 Paris
  if (dow === 1) { label = 'Chapelet — Mystères joyeux — Sel + Lumière TV (Québec)';     desc = SLM_DESC.joyeux; }
  if (dow === 2) { label = 'Chapelet — Mystères douloureux — Sel + Lumière TV (Québec)'; desc = SLM_DESC.douloureux; }
  if (dow === 3) { label = 'Chapelet — Mystères glorieux — Sel + Lumière TV (Québec)';   desc = SLM_DESC.glorieuxMer; }
  if (dow === 4) { label = 'Chapelet — Mystères lumineux — Sel + Lumière TV (Québec)';   desc = SLM_DESC.lumineux; }
  if (dow === 5) { label = 'Chapelet — Mystères douloureux — Sel + Lumière TV (Québec)'; desc = SLM_DESC.douloureux; }
  if (dow === 6) { label = 'Chapelet — Mystères joyeux — Sel + Lumière TV (Québec)';     desc = SLM_DESC.joyeuxSam; }
  if (label) {
    slots.push({
      type: 'chapelet', label, desc,
      entries: [{ t: '14:00', tl: '14h00', dur: 30, srcs: ['slm'] }],
    });
  }
  return slots;
}
(function injectSlmSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildSlmSlotsForDow(dow));
  });
})();

// ════════════════════════════════════════════════════════════════════
// RCF Bruxelles (Belgique) — même fuseau que Paris, pas de conversion
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// RTS Religion (Suisse) — Messe radio dominicale (Europe/Zurich = Paris)
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// Radio Maria Côte d'Ivoire — fuseau Africa/Abidjan (UTC+0 fixe).
// Les entries portent srcTz: 'Africa/Abidjan' et les heures sont en local CI.
// La conversion vers Paris se fait dynamiquement (DST-aware) à l'affichage.
// Schedule (chapelets uniquement, aucune messe trouvée publiquement) :
//   Lun  8h00, 15h15
//   Mar  8h00, 15h15
//   Mer  19h00
//   Jeu  8h00, 19h00
//   Ven  8h00, 15h15
//   Sam  15h15
//   Dim  19h00
// ════════════════════════════════════════════════════════════════════
function _buildRmciSlotsForDow(dow) {
  const slots = [];
  const TZ = 'Africa/Abidjan';
  function pushChap(t, tl, descKey) {
    slots.push({
      type: 'chapelet', label: 'Chapelet — Radio Maria Côte d\'Ivoire',
      desc: RMCI_DESC[descKey],
      entries: [{ t, tl, dur: 30, srcs: ['rmci'], srcTz: TZ }],
    });
  }
  // 8h00 local : Lun, Mar, Jeu, Ven
  if (dow === 1 || dow === 2 || dow === 4 || dow === 5) pushChap('8:00', '8h00', 'chapeletMatin');
  // 15h15 local : Lun, Mar, Ven, Sam
  if (dow === 1 || dow === 2 || dow === 5 || dow === 6) pushChap('15:15','15h15','chapeletAprem');
  // 19h00 local : Mer, Jeu, Dim
  if (dow === 3 || dow === 4 || dow === 0) pushChap('19:00','19h00','chapeletSoir');
  return slots;
}
(function injectRmciSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildRmciSlotsForDow(dow));
  });
})();

function _buildRtsSlotsForDow(dow) {
  const slots = [];
  // Messe radio — dimanche 09h03 (50 min) — église variable chaque semaine
  if (dow === 0) {
    slots.push({
      type: 'messe', label: 'Messe radio — RTS Religion (Suisse)',
      desc: RTS_DESC.messe,
      entries: [{ t: '9:03', tl: '9h03', dur: 50, srcs: ['rts'] }],
    });
  }
  return slots;
}
(function injectRtsSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildRtsSlotsForDow(dow));
  });
})();

function _buildRcfBeSlotsForDow(dow) {
  const slots = [];
  // Lun-ven : 3 petites prières du matin (6h50, 7h50, 8h50) — 10 min
  if (dow >= 1 && dow <= 5) {
    slots.push({
      type: 'matin', label: 'Prière du matin — RCF Bruxelles',
      desc: RCFBE_DESC.matin,
      entries: [
        { t: '6:50', tl: '6h50', dur: 10, srcs: ['rcfbe'] },
        { t: '7:50', tl: '7h50', dur: 10, srcs: ['rcfbe'] },
        { t: '8:50', tl: '8h50', dur: 10, srcs: ['rcfbe'] },
      ],
    });
  }
  // Tous les jours : chapelet + prière du soir 20h-21h (60 min)
  slots.push({
    type: 'chapelet', label: 'Chapelet + prière du soir — RCF Bruxelles',
    desc: RCFBE_DESC.soir,
    entries: [{ t: '20:00', tl: '20h00', dur: 60, srcs: ['rcfbe'] }],
  });
  return slots;
}
(function injectRcfBeSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildRcfBeSlotsForDow(dow));
  });
})();

function _buildNDLausSlotsForDow(dow) {
  const slots = [];
  // Laudes — tous les jours 8h10 (30 min)
  slots.push({
    type: 'laudes', label: 'Laudes — Sanctuaire Notre-Dame du Laus',
    desc: NDLAUS_DESC.laudes,
    monasticOffice: true, officeKind: 'laudes',
    entries: [{ t: '8:10', tl: '8h10', dur: 30, srcs: ['ndlaus'] }],
  });
  // Chapelet — tous les jours 9h00 (45 min)
  slots.push({
    type: 'chapelet', label: 'Chapelet — Sanctuaire Notre-Dame du Laus',
    desc: NDLAUS_DESC.chapelet,
    entries: [{ t: '9:00', tl: '9h00', dur: 45, srcs: ['ndlaus'] }],
  });
  // Messe — tous les jours 11h15 (50 min)
  slots.push({
    type: 'messe', label: 'Messe — Sanctuaire Notre-Dame du Laus',
    desc: NDLAUS_DESC.messe,
    entries: [{ t: '11:15', tl: '11h15', dur: 50, srcs: ['ndlaus'] }],
  });
  // Chapelet de la Miséricorde — vendredi 15h00 (15 min)
  if (dow === 5) {
    slots.push({
      type: 'chapelet', label: 'Chapelet de la Miséricorde — Sanctuaire Notre-Dame du Laus',
      desc: NDLAUS_DESC.chapMiseri,
      entries: [{ t: '15:00', tl: '15h00', dur: 15, srcs: ['ndlaus'] }],
    });
  }
  // Vêpres — tous les jours 18h30 (30 min)
  slots.push({
    type: 'vepres', label: 'Vêpres — Sanctuaire Notre-Dame du Laus',
    desc: NDLAUS_DESC.vepres,
    monasticOffice: true, officeKind: 'vepres',
    entries: [{ t: '18:30', tl: '18h30', dur: 30, srcs: ['ndlaus'] }],
  });
  // Complies — tous les jours 21h15 (20 min)
  slots.push({
    type: 'complies', label: 'Complies — Sanctuaire Notre-Dame du Laus',
    desc: NDLAUS_DESC.complies,
    monasticOffice: true, officeKind: 'complies',
    entries: [{ t: '21:15', tl: '21h15', dur: 20, srcs: ['ndlaus'] }],
  });
  return slots;
}
(function injectNDLausSlots() {
  Object.keys(WEEK_SCHEDULE).forEach(key => {
    if (!Array.isArray(WEEK_SCHEDULE[key])) return;
    const dow = (key === 'ordinary') ? 4 : parseInt(key, 10);
    if (isNaN(dow)) return;
    WEEK_SCHEDULE[key].push(..._buildNDLausSlotsForDow(dow));
  });
})();

function initWeek() {
  const wrap = document.getElementById('week-cards');
  if (!wrap) return;

  const today    = getParisDate();
  const todayDow = today.getDay();
  const moOffset = todayDow === 0 ? -6 : 1 - todayDow;
  const monday   = new Date(today);
  monday.setDate(today.getDate() + moOffset);

  const SHORT_DAYS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const LONG_DAYS  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const MONTHS_FR  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const TYPE_ICON  = {
    laudes:'fa-sun', matin:'fa-mug-hot', messe:'fa-church',
    chapelet:'fa-circle-dot', vepres:'fa-cloud-sun',
    complies:'fa-moon', soiree:'fa-hands-praying',
  };

  // Construire les données des 7 jours
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dow     = date.getDay();
    const isToday = date.toDateString() === today.toDateString();
    days.push({ date, dow, isToday });
  }

  // Filtres (pays + type d'office) — état persisté localStorage
  const FILTERS_KEY = 'pel.weekFilters.v4';
  const FILTERS_DEFAULT = { fr: true, be: true, ch: true, ca: false, ci: false, messes: true, offices: true, chapelets: true, autres: true };
  let filters;
  try { filters = Object.assign({}, FILTERS_DEFAULT, JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}')); }
  catch { filters = { ...FILTERS_DEFAULT }; }

  const filtersHtml = `<div class="wk-filters" role="group" aria-label="Filtres">
    <div class="wk-filt-group" data-group="country">
      <span class="wk-filt-label">Pays&nbsp;:</span>
      <button class="wk-filt-pill${filters.fr ? ' active' : ''}" data-filter="fr" aria-pressed="${filters.fr}">
        <img class="src-flag" src="https://flagcdn.com/w20/fr.png" srcset="https://flagcdn.com/w40/fr.png 2x" width="14" height="10" alt="" aria-hidden="true"> France
      </button>
      <button class="wk-filt-pill${filters.be ? ' active' : ''}" data-filter="be" aria-pressed="${filters.be}">
        <img class="src-flag" src="https://flagcdn.com/w20/be.png" srcset="https://flagcdn.com/w40/be.png 2x" width="14" height="10" alt="" aria-hidden="true"> Belgique
      </button>
      <button class="wk-filt-pill${filters.ch ? ' active' : ''}" data-filter="ch" aria-pressed="${filters.ch}">
        <img class="src-flag" src="https://flagcdn.com/w20/ch.png" srcset="https://flagcdn.com/w40/ch.png 2x" width="14" height="10" alt="" aria-hidden="true"> Suisse
      </button>
      <button class="wk-filt-pill${filters.ca ? ' active' : ''}" data-filter="ca" aria-pressed="${filters.ca}">
        <img class="src-flag" src="https://flagcdn.com/w20/ca.png" srcset="https://flagcdn.com/w40/ca.png 2x" width="14" height="10" alt="" aria-hidden="true"> Québec
      </button>
      <button class="wk-filt-pill${filters.ci ? ' active' : ''}" data-filter="ci" aria-pressed="${filters.ci}">
        <img class="src-flag" src="https://flagcdn.com/w20/ci.png" srcset="https://flagcdn.com/w40/ci.png 2x" width="14" height="10" alt="" aria-hidden="true"> Côte d'Ivoire
      </button>
    </div>
    <div class="wk-filt-group" data-group="type">
      <span class="wk-filt-label">Type&nbsp;:</span>
      <button class="wk-filt-pill${filters.messes ? ' active' : ''}" data-filter="messes" aria-pressed="${filters.messes}"><i class="fa-solid fa-church"></i> Messes</button>
      <button class="wk-filt-pill${filters.offices ? ' active' : ''}" data-filter="offices" aria-pressed="${filters.offices}"><i class="fa-solid fa-sun"></i> Offices</button>
      <button class="wk-filt-pill${filters.chapelets ? ' active' : ''}" data-filter="chapelets" aria-pressed="${filters.chapelets}"><i class="fa-solid fa-circle-dot"></i> Chapelets</button>
      <button class="wk-filt-pill${filters.autres ? ' active' : ''}" data-filter="autres" aria-pressed="${filters.autres}"><i class="fa-solid fa-hands-praying"></i> Autres</button>
    </div>
    <div class="wk-filt-hint" id="wk-filt-hint" aria-live="polite"></div>
  </div>`;

  // Onglets de jours
  let tabsHtml = '<div class="wk-tabs" role="tablist">';
  days.forEach(({ date, dow, isToday }, i) => {
    tabsHtml += `<button class="wk-tab${isToday ? ' active' : ''}" data-day="${i}" role="tab" aria-selected="${isToday}">
      <span class="wk-tab-name">${SHORT_DAYS[dow]}</span>
      <span class="wk-tab-num">${date.getDate()}</span>
    </button>`;
  });
  tabsHtml += '</div>';

  // Helpers de classification pour les filtres
  const TYPE_GROUP = { messe: 'messes', laudes: 'offices', vepres: 'offices', complies: 'offices', chapelet: 'chapelets' };
  function slotCountry(slot) {
    // 'fr' si au moins une source française, sinon la première autre nationalité ('ca'...)
    let foreign = null;
    for (const entry of slot.entries) {
      for (const key of entry.srcs) {
        const src = SOURCES[key];
        if (!src) continue;
        if (!src.f) return 'fr';           // une source FR suffit
        if (!foreign) foreign = src.f;
      }
    }
    return foreign || 'fr';
  }
  function slotTypeGroup(slot) { return TYPE_GROUP[slot.type] || 'autres'; }
  // Minutes Paris du 1er créneau, en tenant compte du srcTz éventuel
  function slotMinutes(slot, refDate) {
    const e = slot.entries[0];
    if (!e) return 0;
    const t = e.srcTz ? _convertSrcLocalToParis(e.t, e.srcTz, refDate) : e.t;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  // Panneaux par jour
  let panelsHtml = '<div class="wk-panels">';
  days.forEach(({ date, dow, isToday }, i) => {
    let slots = getDaySchedule(date);
    // Tri chronologique par heure du premier créneau (en heure de Paris)
    slots = [...slots].sort((a, b) => slotMinutes(a, date) - slotMinutes(b, date));

    // Dédupliquer les slots identiques (même type + même heure)
    let slotsHtml = '';
    for (const slot of slots) {
      const icon = TYPE_ICON[slot.type] || 'fa-circle';
      const firstEntry = slot.entries[0];
      // Calcule { display, parisHHMM, isShifted } pour chaque entry
      const timeInfos = slot.entries.map(e => formatOfficeTime(e.t, date, e.srcTz));
      const allTimes = timeInfos.map(ti => ti.display).join(' · ');
      // Badge "Paris" si au moins une entry est convertie (user hors zone CET/CEST,
      // ou source africaine avec srcTz dont l'heure diffère du local user)
      const anyShifted = timeInfos.some(ti => ti.isShifted);
      const parisStrs = timeInfos
        .filter(ti => ti.isShifted)
        .map(ti => (ti.parisHHMM || '').replace(':', 'h').replace(/h(\d)$/, 'h0$1'))
        .filter(Boolean);
      const parisBadge = anyShifted && parisStrs.length
        ? `<span class="wk-row-paris" title="Heure de diffusion : ${parisStrs.join(' · ')} (Paris)">${parisStrs.join(' · ')} Paris</span>`
        : '';
      const country = slotCountry(slot);
      const typeGroup = slotTypeGroup(slot);

      // Sources (tous les entries fusionnés)
      let srcsHtml = '';
      for (const entry of slot.entries) {
        for (const key of entry.srcs) {
          const src = SOURCES[key];
          if (!src) continue;
          const flagHtml = src.f ? `<img class="src-flag" src="https://flagcdn.com/w20/${src.f}.png" srcset="https://flagcdn.com/w40/${src.f}.png 2x" width="14" height="10" alt="" aria-hidden="true">` : '';
          if (src.s) {
            srcsHtml += `<button class="wc-src-btn wc-radio" data-action="radio"
              data-stream="${src.s}" data-web="${src.w}"
              data-name="${src.n}" data-prayer="${slot.label}" data-time="${entry.tl}">
              <i class="fa-solid fa-play"></i>${src.n}${flagHtml}
            </button>`;
          } else if (src.embed) {
            // Source vidéo (KTO, etc.) → ouvre modale iframe avec play inline
            srcsHtml += `<button class="wc-src-btn wc-tv" data-action="tv"
              data-embed="${src.embed}" data-web="${src.w}"
              data-name="${src.n}" data-prayer="${slot.label}" data-time="${entry.tl}">
              <i class="fa-solid fa-tv"></i> ${src.n}${flagHtml}
            </button>`;
          } else {
            srcsHtml += `<a class="wc-src-btn wc-link" href="${src.w}" target="_blank" rel="noopener">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>${src.n}${flagHtml}
            </a>`;
          }
        }
      }

      // Cloche d'abonnement push : visible UNIQUEMENT pour les utilisateurs connectés
      // sur navigateur compatible. Évite les clics ratés et réduit la densité visuelle
      // pour la majorité des visiteurs.
      const pushSupported = window._pelPush?.SUPPORTED;
      const pushUserOk = pushSupported && !!window._pelUser;
      const slotId = pushUserOk ? window._pelPush.getSlotId(slot) : '';
      const isSubscribed = pushUserOk && window._pelPush.isOfficeSubscribed(slot);
      const bellHtml = pushUserOk
        ? `<button class="wk-row-bell${isSubscribed ? ' active' : ''}" data-bell="${slotId}"
            title="${isSubscribed ? 'Désactiver les notifs pour cet office' : 'Activer les notifs pour cet office (10 min avant)'}"
            aria-label="${isSubscribed ? 'Désabonner' : 'S abonner'}" aria-pressed="${isSubscribed}">
            <i class="fa-solid ${isSubscribed ? 'fa-bell' : 'fa-bell-slash'}"></i>
          </button>`
        : '';

      slotsHtml += `<div class="wk-row ${slot.type} country-${country} type-${typeGroup}" data-country="${country}" data-type="${typeGroup}" data-slot-id="${slotId}">
        <div class="wk-row-main" ${srcsHtml ? 'data-expandable' : ''}>
          <span class="wk-row-time">${allTimes}${parisBadge}</span>
          <i class="fa-solid ${icon} wk-row-icon"></i>
          <span class="wk-row-label">${slot.label}</span>
          ${bellHtml}
          ${srcsHtml ? '<i class="fa-solid fa-chevron-right wk-row-arrow"></i>' : ''}
        </div>
        ${srcsHtml ? `<div class="wk-row-srcs hidden">${srcsHtml}</div>` : ''}
      </div>`;
    }

    const dateLabel = `${LONG_DAYS[dow]} ${date.getDate()} ${MONTHS_FR[date.getMonth()]}`;
    panelsHtml += `<div class="wk-panel${isToday ? ' active' : ''}" data-day="${i}" role="tabpanel">
      <div class="wk-panel-date">${dateLabel}</div>
      <div class="wk-rows">${slotsHtml}</div>
    </div>`;
  });
  panelsHtml += '</div>';

  wrap.innerHTML = filtersHtml + tabsHtml + panelsHtml;

  // Application initiale des filtres + handler
  const panelsEl = wrap.querySelector('.wk-panels');
  const hintEl   = wrap.querySelector('#wk-filt-hint');
  function applyFilters() {
    if (!panelsEl) return;
    panelsEl.classList.toggle('hide-fr',         !filters.fr);
    panelsEl.classList.toggle('hide-be',         !filters.be);
    panelsEl.classList.toggle('hide-ch',         !filters.ch);
    panelsEl.classList.toggle('hide-ca',         !filters.ca);
    panelsEl.classList.toggle('hide-ci',         !filters.ci);
    panelsEl.classList.toggle('hide-messes',     !filters.messes);
    panelsEl.classList.toggle('hide-offices',    !filters.offices);
    panelsEl.classList.toggle('hide-chapelets',  !filters.chapelets);
    panelsEl.classList.toggle('hide-autres',     !filters.autres);
    // Compteur de slots cachés dans le panneau actif
    const activePanel = panelsEl.querySelector('.wk-panel.active');
    if (activePanel && hintEl) {
      const total = activePanel.querySelectorAll('.wk-row').length;
      const hidden = [...activePanel.querySelectorAll('.wk-row')]
        .filter(r => getComputedStyle(r).display === 'none').length;
      hintEl.textContent = hidden > 0 ? `${hidden} créneau${hidden > 1 ? 'x' : ''} masqué${hidden > 1 ? 's' : ''} par les filtres` : '';
    }
  }
  applyFilters();

  wrap.querySelectorAll('.wk-filt-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.filter;
      filters[key] = !filters[key];
      btn.classList.toggle('active', filters[key]);
      btn.setAttribute('aria-pressed', String(filters[key]));
      try { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); } catch {}
      applyFilters();
    });
  });

  // Switcher d'onglets
  wrap.querySelectorAll('.wk-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const day = tab.dataset.day;
      wrap.querySelectorAll('.wk-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      wrap.querySelectorAll('.wk-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected','true');
      wrap.querySelector(`.wk-panel[data-day="${day}"]`).classList.add('active');
      applyFilters(); // recalcul du compteur masqué pour le nouveau jour
    });
  });

  // Expand/collapse sources au clic sur une ligne + handler cloche push
  wrap.addEventListener('click', async e => {
    // Cloche push prioritaire (ne pas toggler le panneau sources si on clique la cloche)
    const bellBtn = e.target.closest('[data-bell]');
    if (bellBtn) {
      e.stopPropagation();
      e.preventDefault();
      await _handleBellClick(bellBtn, wrap);
      return;
    }
    const main = e.target.closest('[data-expandable]');
    if (!main) return;
    const row    = main.closest('.wk-row');
    const srcs   = row.querySelector('.wk-row-srcs');
    const arrow  = main.querySelector('.wk-row-arrow');
    if (!srcs) return;
    srcs.classList.toggle('hidden');
    if (arrow) arrow.style.transform = srcs.classList.contains('hidden') ? '' : 'rotate(90deg)';
  });
}

// Helper partagé : toggle l'abonnement d'un office et met à jour TOUTES les
// cloches de cet office dans la page (vue semaine, timeline, etc.)
async function _handleBellClick(bellBtn, scope) {
  const push = window._pelPush;
  if (!push) return;
  const slotId = bellBtn.dataset.bell;
  if (!slotId) return;
  // Trouve un slot correspondant pour récupérer l'objet (depuis la date du jour active)
  // Plus simple : on construit un faux slot avec le slotId déjà calculé, mais la
  // logique de toggleOffice attend un slot. Solution : on cherche dans le schedule.
  let foundSlot = null;
  try {
    const today = (typeof getParisDate === 'function') ? getParisDate() : new Date();
    for (let i = 0; i < 7 && !foundSlot; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const slots = (typeof getDaySchedule === 'function') ? getDaySchedule(d) : [];
      foundSlot = (slots || []).find(s => push.getSlotId(s) === slotId) || null;
    }
  } catch (_) {}
  if (!foundSlot) return;

  // Feedback visuel optimiste
  const wasActive = bellBtn.classList.contains('active');
  bellBtn.disabled = true;
  bellBtn.classList.add('busy');
  try {
    const { subscribed, total } = await push.toggleOffice(foundSlot);
    // Met à jour toutes les cloches qui partagent ce slotId (vue semaine + timeline)
    document.querySelectorAll(`[data-bell="${CSS.escape(slotId)}"]`).forEach(b => {
      b.classList.toggle('active', subscribed);
      b.setAttribute('aria-pressed', String(subscribed));
      const i = b.querySelector('i');
      if (i) i.className = `fa-solid ${subscribed ? 'fa-bell' : 'fa-bell-slash'}`;
      b.title = subscribed ? 'Désactiver les notifs pour cet office' : 'Activer les notifs pour cet office (10 min avant)';
    });
    // Met à jour le badge du profil si présent
    const cnt = document.getElementById('prof-push-count');
    if (cnt) cnt.textContent = total;
    // Petit toast inline
    _showPushToast(subscribed
      ? `🔔 Notification activée (${total} office${total > 1 ? 's' : ''} suivi${total > 1 ? 's' : ''})`
      : `🔕 Notification désactivée (${total} restant${total > 1 ? 's' : ''})`);
  } catch (err) {
    bellBtn.classList.toggle('active', wasActive); // rollback visuel
    _showPushToast(`⚠️ ${err.message || 'Erreur'}`, true);
  } finally {
    bellBtn.disabled = false;
    bellBtn.classList.remove('busy');
  }
}

function _showPushToast(msg, isError) {
  let t = document.getElementById('push-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'push-toast';
    t.className = 'push-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 3000);
}


/* ────────────────────────────────────────────
   9b. TIMELINE AUJOURD'HUI — générée dynamiquement
   Aplatit WEEK_SCHEDULE du jour courant, trie par heure,
   et injecte une carte par créneau (une source ou groupe de sources à la même heure).
──────────────────────────────────────────────*/
// ── ICS / iCalendar ───────────────────────────────────────────
// Format Europe/Paris avec VTIMEZONE complet (compatible iPhone, Mac, Outlook,
// Google Calendar, Android…). Les events sont en heure locale Paris.
function _icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}
function _icsDateTime(date) {
  // YYYYMMDDTHHMMSS (heure locale)
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
}
function _icsUTCStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
function buildICS(events, calName = 'PrionsEnLigne — Prières') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PrionsEnLigne//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${_icsEscape(calName)}`,
    'X-WR-TIMEZONE:Europe/Paris',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Paris',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  const stamp = _icsUTCStamp();
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${_icsEscape(ev.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Paris:${_icsDateTime(ev.start)}`,
      `DTEND;TZID=Europe/Paris:${_icsDateTime(ev.end)}`,
      `SUMMARY:${_icsEscape(ev.summary)}`,
    );
    if (ev.description) lines.push(`DESCRIPTION:${_icsEscape(ev.description)}`);
    if (ev.url)         lines.push(`URL:${_icsEscape(ev.url)}`);
    if (ev.location)    lines.push(`LOCATION:${_icsEscape(ev.location)}`);
    // Récurrence (RRULE) — optionnel : permet aux apps calendrier de répéter
    // l'événement automatiquement (chaque jour, chaque semaine, jusqu'à une date)
    if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
    // Rappel 10 min avant
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT10M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${_icsEscape(ev.summary)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function downloadICS(filename, ics) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

function initTodayTimeline() {
  const container = document.getElementById('timeline');
  if (!container) return;

  const now  = getParisDate();
  const dow  = now.getDay();
  const slots = getDaySchedule(now);

  // Aplatit toutes les entrées {slot, entry} et trie chronologiquement
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const flat  = [];
  for (const slot of slots)
    for (const entry of slot.entries)
      flat.push({ slot, entry });
  flat.sort((a, b) => toMin(a.entry.t) - toMin(b.entry.t));

  const BREV_LABEL = {
    laudes: 'Bréviaire', matin: 'Bréviaire', messe: 'Textes',
    chapelet: 'Mystères', vepres: 'Bréviaire', complies: 'Bréviaire',
    soiree: 'Bréviaire',
  };

  container.innerHTML = '';

  // Note pastorale : injectée UNE SEULE FOIS en tête de timeline si la journée
  // contient au moins une messe. Rappelle (sans culpabiliser) que la
  // participation physique reste irremplaçable. Cf. section "Notre position"
  // dans À propos pour la version longue.
  const hasMass = flat.some(f => f.slot.type === 'messe');
  if (hasMass) {
    const banner = document.createElement('div');
    banner.className = 'tl-pastoral-banner';
    banner.innerHTML = `
      <i class="fa-solid fa-location-dot tl-pastoral-icon"></i>
      <div class="tl-pastoral-text">
        <strong>La participation physique à la messe reste irremplaçable.</strong>
        Les diffusions ci-dessous sont une aide pour ceux qui ne peuvent pas se rendre à leur paroisse (malades, isolés, diaspora). Si votre santé et vos circonstances le permettent, rejoignez votre paroisse.
        <a href="/paroisses" class="tl-pastoral-link"><i class="fa-solid fa-church"></i> Vous animez une paroisse&nbsp;? Affichez PrionsEnLigne (affiche A4 à imprimer)</a>
      </div>`;
    container.appendChild(banner);
  }

  // Helper : échappe les " et < pour les attributs HTML
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  // Helper : formate une durée en minutes → "30 min" / "1 h" / "1 h 30"
  const fmtDur = m => {
    if (!m || m <= 0) return '';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r.toString().padStart(2, '0')}` : `${h} h`;
  };

  flat.forEach(({ slot, entry }, i) => {
    const startMin = toMin(entry.t);

    // Durée : priorité à entry.dur (explicite), sinon estimée par gap
    let duration = entry.dur || 0;
    if (!duration) {
      duration = 60;
      if (i < flat.length - 1) {
        const gap = toMin(flat[i + 1].entry.t) - startMin;
        if (gap > 0 && gap <= 75) duration = gap;
      }
    }

    // Boutons sources
    let srcsHtml = '';
    for (const key of entry.srcs) {
      const src = SOURCES[key];
      if (!src) continue;
      const flagHtml = src.f ? `<img class="src-flag" src="https://flagcdn.com/w20/${src.f}.png" srcset="https://flagcdn.com/w40/${src.f}.png 2x" width="14" height="10" alt="" aria-hidden="true">` : '';
      if (src.s) {
        srcsHtml += `<button class="tl-src radio" data-action="radio"
          data-stream="${src.s}" data-web="${src.w}"
          data-name="${src.n}" data-prayer="${esc(slot.label)}" data-time="${entry.tl}">
          <i class="fa-solid fa-play"></i> ${src.n}${flagHtml}
        </button>`;
      } else if (src.embed) {
        // Source vidéo (KTO TV, etc.) → modale iframe avec player inline
        srcsHtml += `<button class="tl-src tv" data-action="tv"
          data-embed="${src.embed}" data-web="${src.w}"
          data-name="${src.n}" data-prayer="${esc(slot.label)}" data-time="${entry.tl}">
          <i class="fa-solid fa-tv"></i> ${src.n}${flagHtml}
        </button>`;
      } else {
        srcsHtml += `<a class="tl-src youtube" href="${src.w}" target="_blank" rel="noopener">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> ${src.n}${flagHtml}
        </a>`;
      }
    }

    const brevLabel = BREV_LABEL[slot.type];
    // Certains offices (ex: Laudes monastiques en grégorien de Triors) utilisent
    // un bréviaire monastique différent du Romain de l'AELF — on cache le bouton
    // standard et on propose à la place un panneau pédagogique "Office monastique".
    const hideBreviary = slot.noBreviary || slot.monasticOffice;
    let brevHtml = (brevLabel && !hideBreviary)
      ? `<button class="tl-breviary-btn" data-prayer="${slot.type}" data-label="${esc(slot.label)}" data-myst-dow='${slot.mystByDow ? JSON.stringify(slot.mystByDow) : ''}'>
           <i class="fa-solid fa-book-open"></i> ${brevLabel}
         </button>`
      : slot.monasticOffice
        ? `<button class="tl-breviary-btn tl-monastic-btn" data-action="monastic" data-label="${esc(slot.label)}" data-kind="${esc(slot.officeKind || slot.type || 'laudes')}">
             <i class="fa-solid fa-book-quran"></i> Office monastique
           </button>`
        : '';

    // Pour les messes en latin/grégorien : bouton complémentaire "Suivre en latin"
    // (ordinaire de la messe en latin + traduction française) en plus de "Textes"
    if (slot.latinMass) {
      brevHtml += `<button class="tl-breviary-btn tl-latin-btn" data-action="latin-mass" data-label="${esc(slot.label)}" title="Ordinaire de la messe en latin + traduction">
             <i class="fa-solid fa-language"></i> Latin
           </button>`;
    }

    // Identifiant unique pour cet office (type + heure)
    const officeId   = slot.type + '_' + entry.t.replace(':', '');
    const officeName = slot.label + ' — ' + formatOfficeTime(entry.t, undefined, entry.srcTz).display;
    const chatHtml   = `<div class="tl-chat-wrap">
        <button class="tl-chat-btn" data-action="chat"
          data-office-id="${officeId}" data-office-name="${esc(officeName)}"
          data-office-time="${entry.t}" data-office-duration="${duration}">
          <i class="fa-solid fa-dove"></i> Intentions
        </button>
        <div class="tl-chat-time-info">
          <span class="tl-chat-timer"></span>
          <div class="tl-chat-bar"><div class="tl-chat-bar-fill"></div></div>
        </div>
      </div>`;

    // Durée affichée à côté de l'heure
    const durHtml = duration
      ? `<span class="tl-dur">(${fmtDur(duration)})</span>`
      : '';

    // Heure d'affichage : locale par défaut, avec mention discrète (Paris) si décalage
    const timeInfo = formatOfficeTime(entry.t, undefined, entry.srcTz);
    const timeBadge = timeInfo.isShifted
      ? `<span class="tl-time-paris" title="Heure de diffusion : ${esc(timeInfo.parisHHMM)} (Paris)">${esc(timeInfo.parisHHMM).replace(':','h')} Paris</span>`
      : '';

    // Description : phrase discrète toujours visible sous le titre.
    // Plus de bouton "i" / panneau collapsible — trop d'interactions cachées,
    // pas accessible aux utilisateurs moins technophiles.
    const infoBtn = '';
    const descPanel = slot.desc
      ? `<p class="tl-desc-inline">${esc(slot.desc)}</p>`
      : '';

    // Note pastorale : déplacée en haut de la timeline (cf. injection one-shot
    // au début d'initTodayTimeline) pour ne pas se répéter sous chaque messe.
    const pastoralNote = '';

    // Cloche d'abonnement push : visible UNIQUEMENT pour utilisateurs connectés
    // sur navigateur compatible (évite clics ratés + réduit densité visuelle).
    const tlPushOk = window._pelPush?.SUPPORTED && !!window._pelUser;
    const tlSlotId = tlPushOk ? window._pelPush.getSlotId(slot) : '';
    const tlSub    = tlPushOk && window._pelPush.isOfficeSubscribed(slot);
    const tlBellHtml = tlPushOk
      ? `<button class="tl-bell${tlSub ? ' active' : ''}" data-bell="${tlSlotId}"
          title="${tlSub ? 'Désactiver les notifs pour cet office' : 'Activer les notifs pour cet office (10 min avant)'}"
          aria-label="${tlSub ? 'Désabonner' : 'S abonner'}" aria-pressed="${tlSub}">
          <i class="fa-solid ${tlSub ? 'fa-bell' : 'fa-bell-slash'}"></i>
        </button>`
      : '';

    const art = document.createElement('article');
    art.className        = 'tl-item';
    art.dataset.type     = slot.type;
    art.dataset.start    = entry.t;
    art.dataset.duration = String(duration);
    art.dataset.label    = slot.label;
    art.dataset.desc     = slot.desc || '';
    art.dataset.slotId   = tlSlotId;
    art.innerHTML = `
      <div class="tl-time">
        <span class="tl-time-h">${esc(timeInfo.display)}</span>
        ${durHtml}
        ${timeBadge}
        <button class="tl-cal-btn" type="button" data-action="cal-one"
                title="Ajouter cette prière à mon calendrier" aria-label="Ajouter au calendrier">
          <i class="fa-regular fa-calendar-plus"></i>
        </button>
      </div>
      <div class="tl-marker ${slot.type}"></div>
      <div class="tl-body">
        <h3 class="tl-prayer">${slot.label} ${tlBellHtml} ${infoBtn}</h3>
        ${descPanel}
        <div class="tl-sources">${srcsHtml}</div>
        ${pastoralNote}
      </div>
      <div class="tl-actions">
        <span class="tl-badge">—</span>
        ${brevHtml}
        ${chatHtml}
      </div>`;
    container.appendChild(art);
  });

  // ── Bannière de localisation horaire (seulement hors zone Paris) ──
  // Affichée une seule fois en haut de la timeline, peut être fermée.
  if (!_isParisTimezone(_userTimezone()) && _getTimeDisplayPref() === 'local'
      && !sessionStorage.getItem('pel_tz_banner_dismissed')) {
    const existingBanner = document.getElementById('tl-tz-banner');
    if (!existingBanner) {
      const tz = _userTimezone();
      const tzLabel = _shortTzLabel(tz);
      const banner = document.createElement('div');
      banner.id = 'tl-tz-banner';
      banner.className = 'tl-tz-banner';
      banner.innerHTML = `
        <i class="fa-solid fa-globe"></i>
        <span class="tl-tz-text">
          Les horaires affichés sont en <strong>heure locale (${esc(tzLabel)})</strong>.
          Les offices sont diffusés en heure de Paris.
        </span>
        <button class="tl-tz-close" id="tl-tz-close" aria-label="Fermer">&times;</button>
      `;
      container.prepend(banner);
      banner.querySelector('#tl-tz-close')?.addEventListener('click', () => {
        banner.remove();
        sessionStorage.setItem('pel_tz_banner_dismissed', '1');
      });
    }
  }

  // ── Bouton "Ajouter ma journée au calendrier" — au-dessus du flux ──
  // Inséré DANS la colonne timeline (sinon il s'intercale entre filtres et flux en desktop)
  if (!document.getElementById('tl-export-bar')) {
    const bar = document.createElement('div');
    bar.id = 'tl-export-bar';
    bar.className = 'tl-export-bar';
    bar.innerHTML = `
      <button class="tl-export-btn" id="tl-export-day-btn">
        <i class="fa-regular fa-calendar-plus"></i>
        <span>Ajouter ma journée à mon calendrier</span>
      </button>
      <span class="tl-export-hint">iPhone, Android, Google, Outlook…</span>
    `;
    container.prepend(bar);
  }

  // Délégation : clic sur les boutons calendrier (individuel + global) + cloche push
  container.addEventListener('click', async e => {
    const bellBtn = e.target.closest('[data-bell]');
    if (bellBtn) {
      e.preventDefault();
      e.stopPropagation();
      await _handleBellClick(bellBtn, container);
      return;
    }
    const oneBtn = e.target.closest('.tl-cal-btn');
    if (oneBtn) {
      e.preventDefault();
      e.stopPropagation();
      const item = oneBtn.closest('.tl-item');
      if (item) exportTimelineItems([item], 'prière');
    }
  });
  document.getElementById('tl-export-day-btn')?.addEventListener('click', () => {
    const items = Array.from(document.querySelectorAll('#timeline .tl-item'));
    exportTimelineItems(items, 'journée');
  });

  // #7 — Ré-applique les filtres favoris mémorisés sur la timeline fraîchement
  // générée (l'init des filtres a pu tourner avant que les items existent).
  window._pelApplyFilters?.();
  // Ré-applique aussi les badges horaires (Terminé / En direct / Ferme dans…)
  // immédiatement après (re)génération, pour éviter qu'ils restent sur « — »
  // sur les chemins de re-render (restauration de session, overrides, fuseau).
  window._pelUpdateBadges?.();

  // Construit un .ics à partir d'une liste d'items de timeline et déclenche le download
  function exportTimelineItems(items, mode) {
    if (!items.length) return;
    // Ouvre une modale qui demande la récurrence (une fois / quotidien / hebdo)
    // avant de générer et télécharger le .ics.
    openRecurrenceModal(items, mode);
  }

  // Construit un libellé "Tous les lundis", "Tous les jours"…
  const DOW_LABELS = ['dimanches', 'lundis', 'mardis', 'mercredis', 'jeudis', 'vendredis', 'samedis'];

  function openRecurrenceModal(items, mode) {
    const today = getParisDate();
    const todayDow = today.getDay();
    const officeLabel = items.length > 1
      ? `votre journée du ${today.toLocaleDateString('fr-FR')}`
      : (items[0].dataset.label || 'cet office');

    // Si une modale est déjà ouverte, on la retire
    document.getElementById('rec-modal-backdrop')?.remove();

    // #4 — Quand on ajoute TOUTE la journée, on laisse l'utilisateur choisir
    // précisément quels offices exporter (cases à cocher, tout coché par défaut).
    const isDay = items.length > 1;
    const officePickerHtml = isDay ? `
            <div class="rec-section-label">Quels offices inclure&nbsp;?</div>
            <div class="rec-offices" id="rec-offices">
              <label class="rec-office rec-office-all">
                <input type="checkbox" id="rec-office-all" checked>
                <span class="rec-office-name"><strong>Tout sélectionner</strong></span>
              </label>
              ${items.map((it, i) => `
              <label class="rec-office">
                <input type="checkbox" class="rec-office-cb" data-idx="${i}" checked>
                <span class="rec-office-time">${esc(it.dataset.start || '')}</span>
                <span class="rec-office-name">${esc(it.dataset.label || 'Office')}</span>
              </label>`).join('')}
            </div>
    ` : '';

    const html = `
      <div class="rec-modal-backdrop" id="rec-modal-backdrop">
        <div class="rec-modal" role="dialog" aria-modal="true" aria-label="Récurrence">
          <button class="rec-close" id="rec-close" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
          <div class="rec-head">
            <i class="fa-regular fa-calendar-plus"></i>
            <h3>Ajouter au calendrier</h3>
            <p class="rec-sub">${esc(officeLabel)}</p>
          </div>
          <div class="rec-body">
            ${officePickerHtml}
            <div class="rec-section-label">À quelle fréquence ?</div>
            <label class="rec-opt">
              <input type="radio" name="freq" value="once" checked>
              <div><strong>Une seule fois</strong><small>${esc(today.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' }))}</small></div>
            </label>
            <label class="rec-opt">
              <input type="radio" name="freq" value="weekly">
              <div><strong>Tous les ${DOW_LABELS[todayDow]}</strong><small>Chaque semaine à la même heure</small></div>
            </label>
            <label class="rec-opt">
              <input type="radio" name="freq" value="daily">
              <div><strong>Tous les jours</strong><small>Si vous voulez prier quotidiennement à cette heure</small></div>
            </label>

            <div class="rec-section-label rec-section-label--duration">Pendant combien de temps ?</div>
            <div class="rec-duration">
              <label class="rec-pill"><input type="radio" name="duration" value="2"  ><span>2 semaines</span></label>
              <label class="rec-pill"><input type="radio" name="duration" value="4" checked><span>1 mois</span></label>
              <label class="rec-pill"><input type="radio" name="duration" value="12" ><span>3 mois</span></label>
              <label class="rec-pill"><input type="radio" name="duration" value="26" ><span>6 mois</span></label>
              <label class="rec-pill"><input type="radio" name="duration" value="52" ><span>1 an</span></label>
              <label class="rec-pill rec-pill--custom"><input type="radio" name="duration" value="custom"><span><i class="fa-regular fa-calendar"></i> Autre…</span></label>
            </div>
            <div class="rec-custom-wrap" id="rec-custom-wrap" style="display:none">
              <label class="rec-custom-label" for="rec-custom-date">Jusqu'à quelle date ?</label>
              <input type="date" id="rec-custom-date" class="rec-custom-date" min="" max="">
              <small class="rec-custom-hint">Choisissez n'importe quelle date dans les 5 prochaines années.</small>
            </div>
          </div>
          <div class="rec-foot">
            <button class="rec-btn-secondary" id="rec-cancel">Annuler</button>
            <button class="rec-btn-primary" id="rec-confirm">
              <i class="fa-solid fa-download"></i> Télécharger
            </button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const backdrop = document.getElementById('rec-modal-backdrop');
    const close = () => backdrop?.remove();
    backdrop.querySelector('#rec-close')?.addEventListener('click', close);
    backdrop.querySelector('#rec-cancel')?.addEventListener('click', close);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

    // Initialise les bornes du date picker "Autre…"
    const customInput = backdrop.querySelector('#rec-custom-date');
    if (customInput) {
      const min = new Date(today.getTime() + 1 * 24 * 3600 * 1000); // demain min
      const max = new Date(today.getFullYear() + 5, today.getMonth(), today.getDate());
      const iso = d => {
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      };
      customInput.min = iso(min);
      customInput.max = iso(max);
      // Valeur par défaut : dans 2 mois
      const def = new Date(today.getTime() + 60 * 24 * 3600 * 1000);
      customInput.value = iso(def);
    }

    // Désactive la section "durée" si "une seule fois"
    function syncDurationDisabled() {
      const freq = backdrop.querySelector('input[name="freq"]:checked')?.value;
      const isOnce = freq === 'once';
      backdrop.querySelectorAll('input[name="duration"]').forEach(i => i.disabled = isOnce);
      backdrop.querySelectorAll('.rec-pill').forEach(p =>
        p.classList.toggle('rec-pill--disabled', isOnce)
      );
      backdrop.querySelector('.rec-section-label--duration')
        ?.classList.toggle('rec-section-label--disabled', isOnce);
      if (isOnce) {
        backdrop.querySelector('#rec-custom-wrap').style.display = 'none';
      }
    }
    function syncCustomVisibility() {
      const duration = backdrop.querySelector('input[name="duration"]:checked')?.value;
      const wrap = backdrop.querySelector('#rec-custom-wrap');
      if (!wrap) return;
      wrap.style.display = (duration === 'custom') ? '' : 'none';
    }
    backdrop.querySelectorAll('input[name="freq"]').forEach(i =>
      i.addEventListener('change', syncDurationDisabled));
    backdrop.querySelectorAll('input[name="duration"]').forEach(i =>
      i.addEventListener('change', syncCustomVisibility));
    syncDurationDisabled();
    syncCustomVisibility();

    // #4 — Sélecteur d'offices : « Tout sélectionner » pilote les cases,
    // et les cases individuelles remettent à jour l'état du « tout ».
    const allCb = backdrop.querySelector('#rec-office-all');
    const officeCbs = Array.from(backdrop.querySelectorAll('.rec-office-cb'));
    if (allCb && officeCbs.length) {
      allCb.addEventListener('change', () => {
        officeCbs.forEach(cb => { cb.checked = allCb.checked; });
      });
      const syncAllState = () => {
        const checked = officeCbs.filter(cb => cb.checked).length;
        allCb.checked = checked === officeCbs.length;
        allCb.indeterminate = checked > 0 && checked < officeCbs.length;
      };
      officeCbs.forEach(cb => cb.addEventListener('change', syncAllState));
      syncAllState();
    }

    backdrop.querySelector('#rec-confirm')?.addEventListener('click', () => {
      const freq = backdrop.querySelector('input[name="freq"]:checked')?.value || 'once';
      const durationVal = backdrop.querySelector('input[name="duration"]:checked')?.value || '4';
      let untilDate = null;
      let weeks = parseInt(durationVal, 10);
      if (durationVal === 'custom') {
        const iso = customInput?.value;
        if (!iso) {
          alert('Veuillez choisir une date de fin.');
          return;
        }
        const [y, m, d] = iso.split('-').map(Number);
        untilDate = new Date(y, m - 1, d, 23, 59, 59);
        weeks = 0; // sera ignoré au profit de untilDate
      }
      // #4 — Ne garde que les offices cochés (si sélecteur présent)
      let chosen = items;
      if (officeCbs.length) {
        const keep = new Set(officeCbs.filter(cb => cb.checked).map(cb => parseInt(cb.dataset.idx, 10)));
        chosen = items.filter((_, i) => keep.has(i));
        if (!chosen.length) {
          alert('Veuillez cocher au moins un office.');
          return;
        }
      }
      close();
      buildAndDownloadICS(chosen, mode, freq, weeks, untilDate);
    });
  }

  function buildAndDownloadICS(items, mode, freq, durationWeeks, untilDate) {
    const today = getParisDate();
    // Date de fin pour la récurrence (UTC, format YYYYMMDDTHHMMSSZ)
    let untilStr = null;
    if (freq !== 'once') {
      const until = untilDate || new Date(today.getTime() + durationWeeks * 7 * 24 * 3600 * 1000);
      // Toujours fin de journée pour englober l'occurrence du dernier jour
      const finalUntil = new Date(until);
      finalUntil.setHours(23, 59, 59, 999);
      const p = n => String(n).padStart(2, '0');
      untilStr = `${finalUntil.getUTCFullYear()}${p(finalUntil.getUTCMonth() + 1)}${p(finalUntil.getUTCDate())}T235959Z`;
    }
    const rrule = freq === 'weekly' ? `FREQ=WEEKLY;UNTIL=${untilStr}`
                : freq === 'daily'  ? `FREQ=DAILY;UNTIL=${untilStr}`
                : null;

    const events = items.map(item => {
      const [h, m]  = (item.dataset.start || '0:0').split(':').map(Number);
      const dur     = parseInt(item.dataset.duration, 10) || 30;
      const start   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0);
      const end     = new Date(start.getTime() + dur * 60000);
      const label   = item.dataset.label || item.querySelector('.tl-prayer')?.textContent?.trim().replace(/[ⓘ\s]+$/, '') || 'Prière';
      const srcNames = Array.from(item.querySelectorAll('.tl-src'))
        .map(a => a.textContent.trim().replace(/^\s*[▶ ]+/, ''))
        .filter(Boolean)
        .join(' · ');
      const desc = [
        item.dataset.desc || '',
        srcNames ? `Sources : ${srcNames}` : '',
        '',
        'Via prionsenligne.fr',
      ].filter(Boolean).join('\n');
      const isoDay = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      // Suffixe unique pour les UID quand on récurre (évite collision si l'utilisateur
      // ré-importe un fichier différent du même office)
      const recurTag = untilDate
        ? `${freq}-until-${untilDate.getFullYear()}${String(untilDate.getMonth() + 1).padStart(2, '0')}${String(untilDate.getDate()).padStart(2, '0')}`
        : `${freq}-${durationWeeks}w`;
      const recurSuffix = freq === 'once' ? '' : `-${recurTag}`;
      return {
        uid: `pel-${(item.dataset.type || 'priere')}-${item.dataset.start || ''}-${isoDay}${recurSuffix}@prionsenligne.fr`,
        start, end,
        summary: label,
        description: desc,
        url: 'https://prionsenligne.fr/agenda',
        rrule,
      };
    });

    const isoDayStr = today.toISOString().slice(0, 10);
    const recurLabel = freq === 'once' ? '' :
                      freq === 'weekly' ? '-hebdo' :
                      '-quotidien';
    const calName = mode === 'journée'
      ? `PrionsEnLigne — Prières du ${today.toLocaleDateString('fr-FR')}`
      : `PrionsEnLigne — ${events[0].summary}`;
    const filename = mode === 'journée'
      ? `prionsenligne-journee-${isoDayStr}${recurLabel}.ics`
      : `prionsenligne-${(events[0].summary || 'priere').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${isoDayStr}${recurLabel}.ics`;
    downloadICS(filename, buildICS(events, calName));
  }

  // (Ancienne délégation tl-info-btn supprimée — les descriptions sont désormais
  //  toujours visibles inline. Voir .tl-desc-inline dans le rendu.)

  // ── Teaser chat pour les visiteurs non connectés ──────────────
  // Affiché sous la timeline si l'utilisateur n'est pas encore connecté.
  // Disparaît automatiquement à la connexion.
  function renderChatTeaser() {
    const existing = document.getElementById('tl-chat-teaser');
    if (window._pelUser) {
      existing?.remove();
      return;
    }
    if (existing) return; // déjà présent
    const div = document.createElement('div');
    div.id = 'tl-chat-teaser';
    div.className = 'tl-chat-teaser';
    div.innerHTML = `
      <i class="fa-solid fa-dove"></i>
      <span class="tl-chat-teaser-text">
        <strong>Intentions de prière</strong><br>
        Créez un compte gratuit pour partager vos intentions avec la communauté lors de chaque office.
      </span>
      <button class="tl-chat-teaser-btn" id="tl-teaser-cta">Rejoindre</button>`;
    // Insérer APRÈS .today-main (pas après #timeline qui est dans un flex row)
    const todayMain = container.closest('.today-main');
    if (todayMain) todayMain.after(div);
    else container.after(div);

    div.querySelector('#tl-teaser-cta')?.addEventListener('click', () => {
      document.getElementById('header-btn-signup')?.click();
    });
  }

  renderChatTeaser();

  // Re-évaluer quand la session change (connexion / déconnexion)
  window.addEventListener('pel-auth-change', renderChatTeaser);
}


/* ────────────────────────────────────────────
   10. BADGES HORAIRES — temps réel (heure Paris)
──────────────────────────────────────────────*/
function initBadges() {

  // Formate la différence en texte lisible
  function formatDiff(diffMin) {
    if (diffMin <= 0) return null;
    if (diffMin < 60) return `Dans ${diffMin} min`;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return m === 0 ? `Dans ${h}h` : `Dans ${h}h${String(m).padStart(2, '0')}`;
  }

  function updateBadges() {
    const now    = getParisDate();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    document.querySelectorAll('.tl-item[data-start]').forEach(item => {
      const [sh, sm] = item.dataset.start.split(':').map(Number);
      const duration  = parseInt(item.dataset.duration || '60', 10);
      const startMin  = sh * 60 + sm;
      const endMin    = startMin + duration;
      const diffMin   = startMin - nowMin;   // négatif si déjà commencé

      const badgeEl = item.querySelector('.tl-badge');
      if (!badgeEl) return;

      let label, cls;

      if (nowMin >= endMin) {
        // ── Terminé ──
        label = 'Terminé';
        cls   = 'badge-past';
        item.classList.add('tl-past');

      } else if (nowMin >= startMin) {
        // ── En cours ──
        label = 'En direct';
        cls   = 'badge-live';
        item.classList.remove('tl-past');

      } else if (diffMin <= 180) {
        // ── Dans moins de 3h ──
        label = formatDiff(diffMin) || 'Bientôt';
        cls   = diffMin <= 30 ? 'badge-imminent' : 'badge-soon';
        item.classList.remove('tl-past');

      } else {
        // ── Plus tard dans la journée — affiche l'heure de début ──
        const hStr = String(sh);
        const mStr = sm > 0 ? String(sm).padStart(2, '0') : '00';
        label = `À ${hStr}h${mStr === '00' ? '' : mStr}`;
        cls   = 'badge-later';
        item.classList.remove('tl-past');
      }

      badgeEl.textContent = label;
      badgeEl.className   = `tl-badge ${cls}`;

      // ── Bouton chat : minuteur + barre de progression ──
      const chatBtn      = item.querySelector('.tl-chat-btn');
      const chatTimer    = item.querySelector('.tl-chat-timer');
      const chatBarFill  = item.querySelector('.tl-chat-bar-fill');
      const chatBar      = item.querySelector('.tl-chat-bar');

      if (chatBtn) {
        const winStart   = startMin - 30;
        const winEnd     = endMin + 30;
        const winDur     = winEnd - winStart;
        const chatActive = nowMin >= winStart && nowMin <= winEnd;

        chatBtn.classList.toggle('inactive', !chatActive);
        chatBtn.style.pointerEvents = chatActive ? '' : 'none';

        if (chatActive) {
          // Fenêtre ouverte — compte à rebours + barre qui avance
          const remaining = winEnd - nowMin;
          const pct       = Math.min(100, Math.round((nowMin - winStart) / winDur * 100));

          if (chatTimer) {
            chatTimer.textContent = remaining <= 1
              ? 'Ferme dans 1 min'
              : `Ferme dans ${remaining} min`;
            chatTimer.className = 'tl-chat-timer tl-chat-timer--open';
          }
          if (chatBar)     chatBar.style.display     = '';
          if (chatBarFill) chatBarFill.style.width   = pct + '%';

        } else if (nowMin < winStart) {
          // Fenêtre pas encore ouverte
          const minutesToOpen = winStart - nowMin;
          if (chatTimer) {
            chatTimer.textContent = minutesToOpen <= 90
              ? `Ouvre dans ${minutesToOpen} min`
              : '';
            chatTimer.className = 'tl-chat-timer tl-chat-timer--soon';
          }
          if (chatBar) chatBar.style.display = 'none';

        } else {
          // Fenêtre fermée
          if (chatTimer) { chatTimer.textContent = ''; chatTimer.className = 'tl-chat-timer'; }
          if (chatBar)   chatBar.style.display = 'none';
        }
      }
    });
  }

  // Exposé pour ré-appliquer les badges après chaque (re)génération de la
  // timeline (sinon, sur certains chemins de re-render — ex. restauration de
  // session au 1er chargement — les badges restaient figés sur « — »).
  window._pelUpdateBadges = updateBadges;

  updateBadges();
  // Mise à jour automatique toutes les minutes (un seul interval global :
  // initBadges peut être rappelé, on évite d'empiler les timers).
  if (window._pelBadgesInterval) clearInterval(window._pelBadgesInterval);
  window._pelBadgesInterval = setInterval(updateBadges, 60_000);
}


/* ────────────────────────────────────────────
   11. DEEP-LINK — lecture du hash à l'arrivée
   Utilisé par les cartes de la landing page :
     app.html#laudes  → filtre Laudes (onglet Aujourd'hui)
     app.html#messe   → filtre Messe
     app.html#chapelet→ filtre Chapelet
     app.html#semaine → onglet Semaine
     app.html#mois    → onglet Mois / Calendrier
     app.html#sources → onglet Sources
──────────────────────────────────────────────*/
function handleDeepLink() {
  // Query param ?install=1 → ouvre directement la modale d'installation
  // (utilisé par la landing page pour rediriger vers l'agenda + install)
  const params = new URLSearchParams(location.search);
  if (params.get('install') === '1') {
    setTimeout(() => {
      if (window._openInstallModal) window._openInstallModal();
      // Nettoie le query param de l'URL
      const url = new URL(location.href);
      url.searchParams.delete('install');
      history.replaceState(null, '', url.pathname + url.hash);
    }, 350);
    return;
  }

  const hash = location.hash.replace('#', '').toLowerCase();
  if (!hash) return;

  // Ouverture du modal d'inscription (depuis la landing page)
  if (hash === 'signup') {
    // Petit délai pour laisser le DOM et l'auth s'initialiser
    setTimeout(() => {
      const desktopBtn = document.getElementById('header-btn-signup');
      const mobileBtn  = document.getElementById('hm-signup-item');
      // Préférer le bouton visible (desktop si visible, sinon mobile)
      if (desktopBtn && desktopBtn.offsetParent !== null) desktopBtn.click();
      else if (mobileBtn && mobileBtn.offsetParent !== null) mobileBtn.click();
      else (desktopBtn || mobileBtn)?.click();
      // Nettoie le hash de l'URL pour ne pas le réouvrir au refresh
      history.replaceState(null, '', location.pathname);
    }, 250);
    return;
  }

  // Ouverture du modal de connexion
  if (hash === 'login') {
    setTimeout(() => {
      const desktopBtn = document.getElementById('header-btn-login');
      const mobileBtn  = document.getElementById('hm-login-item');
      if (desktopBtn && desktopBtn.offsetParent !== null) desktopBtn.click();
      else if (mobileBtn && mobileBtn.offsetParent !== null) mobileBtn.click();
      else (desktopBtn || mobileBtn)?.click();
      history.replaceState(null, '', location.pathname);
    }, 250);
    return;
  }

  // Ouvre le menu compte (utilisé par la pastille « Mon compte » des pages SEO :
  // /agenda#menu → arrive sur Aujourd'hui et ouvre directement le menu).
  if (hash === 'menu' || hash === 'account') {
    setTimeout(() => {
      const accountBtn = document.getElementById('header-btn-account');
      const burgerBtn  = document.getElementById('hamburger-btn');
      if (accountBtn && accountBtn.offsetParent !== null) accountBtn.click();
      else burgerBtn?.click();
      history.replaceState(null, '', location.pathname);
    }, 300);
    return;
  }

  // Ouvre directement le chapelet numérique (modal)
  if (hash === 'open-chapelet') {
    setTimeout(() => document.getElementById('chapelet-fab')?.click(), 150);
    return;
  }

  // Offices du bréviaire → active laudes + vêpres + complies simultanément
  if (hash === 'breviaire') {
    ['laudes', 'vepres', 'complies'].forEach(f =>
      document.querySelector(`.pf[data-filter="${f}"]`)?.click()
    );
    return;
  }

  // Onglets dédiés simples
  if (['semaine', 'sources', 'bible'].includes(hash)) {
    document.querySelector(`.nav-tab[data-tab="${hash}"]`)?.click();
    return;
  }

  // Calendrier → switch onglet + auto-sélection du saint du jour
  if (hash === 'mois') {
    document.querySelector('.nav-tab[data-tab="mois"]')?.click();
    setTimeout(() => window._calAutoSelectToday?.(), 150);
    return;
  }

  // Filtre sur l'onglet Aujourd'hui
  const pf = document.querySelector(`.pf[data-filter="${hash}"]`);
  if (pf) pf.click();
}


/* ────────────────────────────────────────────
   12. CHAT — INTENTIONS DE PRIÈRES
   Panneau latéral ouvert depuis chaque item de la timeline.
   Nécessite Supabase (window._sbClient) et l'auth (window._pelUser).
   Table SQL requise :
     CREATE TABLE prayer_intentions (
       id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       office_id  text NOT NULL,
       user_id    uuid REFERENCES auth.users NOT NULL,
       user_name  text NOT NULL DEFAULT 'Anonyme',
       message    text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 280),
       created_at timestamptz DEFAULT now()
     );
     ALTER TABLE prayer_intentions ENABLE ROW LEVEL SECURITY;
     CREATE POLICY "Lecture pour tous"  ON prayer_intentions FOR SELECT USING (true);
     CREATE POLICY "Ecriture connecte" ON prayer_intentions FOR INSERT
       WITH CHECK (auth.uid() = user_id);
──────────────────────────────────────────────*/
function initChat() {
  const panel     = document.getElementById('chat-panel');
  const overlay   = document.getElementById('chat-overlay');
  const closeBtn  = document.getElementById('chat-close');
  const msgsEl    = document.getElementById('chat-messages');
  const emptyEl   = document.getElementById('chat-empty');
  const nameEl    = document.getElementById('chat-office-name');
  const formWrap  = document.getElementById('chat-form-wrap');
  const loginProm = document.getElementById('chat-login-prompt');
  const loginBtn  = document.getElementById('chat-login-btn');
  const form      = document.getElementById('chat-form');
  const input     = document.getElementById('chat-input');

  if (!panel) return;

  let currentOfficeId   = null;
  let realtimeChannel   = null;

  // ── Helpers ──────────────────────────────────────────────
  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // Groupe deux messages consécutifs du même auteur si :
  //   - même user_id
  //   - écart < 5 min
  //   - même avatar (icône + palette)  ← permet de voir un changement de perso immédiatement
  function isGrouped(prevMsg, msg) {
    if (!prevMsg || !msg) return false;
    if (prevMsg.user_id !== msg.user_id) return false;
    const aIc = prevMsg.avatar_icon    || 'initial';
    const bIc = msg.avatar_icon        || 'initial';
    const aPa = prevMsg.avatar_palette || 'auto';
    const bPa = msg.avatar_palette     || 'auto';
    if (aIc !== bIc || aPa !== bPa) return false;
    const a = new Date(prevMsg.created_at).getTime();
    const b = new Date(msg.created_at).getTime();
    return Math.abs(b - a) < 5 * 60 * 1000;
  }

  // Calcule le grade d'un membre selon son ancienneté.
  // Renvoie { id, label, icon, cls } ou null si pas de date / Pèlerin (pas de badge).
  function memberRank(memberSinceISO) {
    if (!memberSinceISO) return null;
    const days = (Date.now() - new Date(memberSinceISO).getTime()) / 86400000;
    if (isNaN(days) || days < 30) return null; // Pèlerin : pas de badge
    if (days < 90)  return { id: 'disciple', label: 'Disciple',             icon: 'fa-seedling', cls: 'rk-disciple' };
    if (days < 365) return { id: 'frere',    label: 'Frère/Sœur en prière', icon: 'fa-dove',     cls: 'rk-frere'    };
    if (days < 730) return { id: 'fidele',   label: 'Fidèle',               icon: 'fa-star',     cls: 'rk-fidele'   };
    return                 { id: 'ancien',   label: 'Ancien',               icon: 'fa-crown',    cls: 'rk-ancien'   };
  }

  // Formate joliment une date ISO ("27 avril 2026")
  function formatLongDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('fr-FR', { year:'numeric', month:'long', day:'numeric' });
    } catch (_) { return ''; }
  }

  function buildBubble(msg, prevMsg) {
    const userId = window._pelUser?.id;
    const isOwn  = userId && msg.user_id === userId;
    const grouped = isGrouped(prevMsg, msg);
    const div    = document.createElement('div');
    div.className = 'chat-msg' + (isOwn ? ' own' : '') + (grouped ? ' grouped' : '');
    div.dataset.id = msg.id;
    div.dataset.userId = msg.user_id || '';
    div.dataset.createdAt = msg.created_at || '';
    div.dataset.avatarIcon    = msg.avatar_icon    || 'initial';
    div.dataset.avatarPalette = msg.avatar_palette || 'auto';
    div.dataset.userName      = msg.user_name      || '';
    div.dataset.patronSaint      = msg.patron_saint       || '';
    div.dataset.patronSaintName  = msg.patron_saint_name  || '';
    div.dataset.patronSaintFeast = msg.patron_saint_feast || '';
    div.dataset.favoriteVerse    = msg.favorite_verse     || '';
    div.dataset.memberSince      = msg.member_since       || '';

    // Avatar (caché en mode groupé via CSS)
    const avatar = document.createElement('span');
    avatar.className = 'chat-msg-avatar';
    avatar.setAttribute('role', 'button');
    avatar.setAttribute('tabindex', '0');
    avatar.title = 'Voir le profil';
    if (window.pelRenderAvatar) {
      window.pelRenderAvatar(avatar, {
        icon:    msg.avatar_icon,
        palette: msg.avatar_palette,
        name:    msg.user_name,
      });
    } else {
      avatar.textContent = (msg.user_name || '?').charAt(0).toUpperCase();
    }
    // Click → ouvre le mini-profil
    avatar.addEventListener('click', e => { e.stopPropagation(); openProfilePopover(div, avatar); });
    avatar.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfilePopover(div, avatar); }
    });

    // Couleur d'auteur + accent de bulle basés sur sa palette
    const palBg = getAvatarPalette(msg.avatar_palette, msg.user_name);
    const authorColor = palBg ? palBg.bg : '';
    if (palBg && palBg.bg) {
      // Variable CSS héritée par les enfants (.chat-msg-text)
      div.style.setProperty('--user-palette', palBg.bg);
    }

    // Grade selon ancienneté
    const rank = memberRank(msg.member_since);
    const rankHTML = rank
      ? `<span class="chat-msg-rank ${rank.cls}" title="${rank.label} — membre depuis ${escHtml(formatLongDate(msg.member_since))}"><i class="fa-solid ${rank.icon}"></i></span>`
      : '';

    // Drapeau pays (optionnel) — code ISO-2 stocké dans la colonne country
    const ctry = (msg.country || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
    const countryFlag = (ctry && ctry.length === 2)
      ? `<img class="src-flag chat-msg-flag" src="https://flagcdn.com/w20/${ctry}.png" srcset="https://flagcdn.com/w40/${ctry}.png 2x" width="14" height="10" alt="" aria-hidden="true">`
      : '';

    const body = document.createElement('div');
    body.className = 'chat-msg-body';
    body.innerHTML = `
      <div class="chat-msg-meta">
        <button type="button" class="chat-msg-author" data-popover="1"${authorColor ? ` style="--author-color:${authorColor}"` : ''}>${escHtml(msg.user_name)}</button>
        ${countryFlag}
        ${rankHTML}
        <span class="chat-msg-time">${formatTime(msg.created_at)}</span>
      </div>
      <div class="chat-msg-text">${escHtml(msg.message)}</div>`;

    // Click sur le nom auteur → popover aussi
    body.querySelector('.chat-msg-author')?.addEventListener('click', e => {
      e.stopPropagation();
      openProfilePopover(div, e.currentTarget);
    });

    const row = document.createElement('div');
    row.className = 'chat-msg-row';
    row.appendChild(avatar);
    row.appendChild(body);
    div.appendChild(row);
    return div;
  }

  // Résolution de la palette pour le nom d'auteur (rend la même couleur que l'avatar)
  function getAvatarPalette(paletteKey, name) {
    // Réutilise window.pelGetPalette si exposé par auth.js, sinon palette par hash
    if (window.pelGetPalette) return window.pelGetPalette(paletteKey, name);
    return null;
  }

  // ── Popover mini-profil ─────────────────────────────────────
  let _activePopover = null;
  function closeProfilePopover() {
    if (_activePopover) { _activePopover.remove(); _activePopover = null; }
    document.removeEventListener('click', _closePopoverOnOutside, true);
    document.removeEventListener('keydown', _closePopoverOnEsc);
  }
  function _closePopoverOnOutside(e) {
    if (_activePopover && !_activePopover.contains(e.target)) closeProfilePopover();
  }
  function _closePopoverOnEsc(e) { if (e.key === 'Escape') closeProfilePopover(); }

  function openProfilePopover(bubbleEl, anchorEl) {
    closeProfilePopover();
    const data = bubbleEl.dataset;
    const userName    = data.userName || 'Anonyme';
    const saintId     = data.patronSaint || '';
    const saintName   = data.patronSaintName  || '';
    const saintFeast  = data.patronSaintFeast || '';
    const verse       = data.favoriteVerse || '';
    const memberSince = data.memberSince || '';

    // Priorité aux données dénormalisées (saint custom), fallback sur la liste curated
    let saint = null;
    if (saintName) {
      saint = { id: saintId || 'custom', name: saintName, feast: saintFeast };
    } else if (saintId) {
      saint = (window.pelSaintById && window.pelSaintById(saintId)) || null;
    }
    const rank  = memberRank(memberSince);

    const pop = document.createElement('div');
    pop.className = 'chat-popover';
    // Hérite la palette de l'utilisateur pour teinter le popover
    if (window.pelGetPalette) {
      const pal = window.pelGetPalette(data.avatarPalette, userName);
      if (pal && pal.bg) pop.style.setProperty('--user-palette', pal.bg);
    }
    const avatarHTML = '<span class="chat-pop-avatar"></span>';
    const saintHTML = (saint && saint.id !== 'aucun')
      ? `<div class="chat-pop-row"><i class="fa-solid fa-star"></i> <span>Saint patron : <strong>${escHtml(saint.name)}</strong>${saint.feast ? ' <em>(' + escHtml(saint.feast) + ')</em>' : ''}</span></div>`
      : `<div class="chat-pop-row chat-pop-row--muted"><i class="fa-regular fa-star"></i> Aucun saint patron</div>`;
    const verseHTML = verse
      ? `<blockquote class="chat-pop-verse">« ${escHtml(verse)} »</blockquote>`
      : '';
    const memberHTML = memberSince
      ? `<div class="chat-pop-row"><i class="fa-solid fa-cross"></i> <span>Membre depuis le <strong>${escHtml(formatLongDate(memberSince))}</strong></span></div>`
      : '';
    const rankBadgeHTML = rank
      ? `<div class="chat-pop-rank ${rank.cls}"><i class="fa-solid ${rank.icon}"></i> ${escHtml(rank.label)}</div>`
      : `<div class="chat-pop-rank rk-pelerin"><i class="fa-solid fa-person-walking"></i> Pèlerin</div>`;
    pop.innerHTML = `
      <div class="chat-pop-head">
        ${avatarHTML}
        <div class="chat-pop-name">${escHtml(userName)}</div>
        <button class="chat-pop-close" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="chat-pop-body">
        ${rankBadgeHTML}
        ${memberHTML}
        ${saintHTML}
        ${verseHTML}
      </div>`;

    // Rendu de l'avatar dans le popover
    const popAvatar = pop.querySelector('.chat-pop-avatar');
    if (window.pelRenderAvatar) {
      window.pelRenderAvatar(popAvatar, {
        icon:    data.avatarIcon,
        palette: data.avatarPalette,
        name:    userName,
      });
    }

    // Positionnement : centré horizontalement sur l'ancrage, au-dessus
    document.body.appendChild(pop);
    const ar = anchorEl.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    let top  = ar.top - pr.height - 10;
    let left = ar.left + ar.width / 2 - pr.width / 2;
    if (top < 8) top = ar.bottom + 10;
    left = Math.max(8, Math.min(left, window.innerWidth - pr.width - 8));
    pop.style.top  = top + 'px';
    pop.style.left = left + 'px';

    pop.querySelector('.chat-pop-close')?.addEventListener('click', closeProfilePopover);
    _activePopover = pop;
    setTimeout(() => {
      document.addEventListener('click', _closePopoverOnOutside, true);
      document.addEventListener('keydown', _closePopoverOnEsc);
    }, 0);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Fenêtre active d'un office : [start - 30 min, start + duration + 30 min].
  // Permet au tchat de chaque office d'être indépendant des autres jours,
  // et de gérer correctement les offices qui chevauchent minuit (chapelet
  // de minuit : la fenêtre va de 23h30 à 00h30 en heure de Paris).
  // Si l'office n'a pas eu lieu aujourd'hui, on retombe sur l'occurrence du
  // jour la plus pertinente (la plus récente passée, ou la prochaine à venir).
  function officeWindow(officeTime, durationMin = 60) {
    const now = getParisDate();
    // officeTime "HH:MM" → minutes since midnight
    const m = (officeTime || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {
      // Fallback : pas de temps connu → fenêtre = aujourd'hui Paris entier
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start: today, end: new Date(today.getTime() + 24 * 3600 * 1000) };
    }
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    // Candidat « aujourd'hui à HH:MM »
    let candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
    const winBefore = 30 * 60 * 1000;
    const winAfter  = (durationMin + 30) * 60 * 1000;
    // On choisit l'instance dont la fenêtre couvre maintenant, ou la plus proche
    // S'il est plus tard que (candidate + winAfter), la fenêtre d'aujourd'hui est passée
    // → on regarde demain pour les offices nocturnes (chapelet de minuit ouvert
    //   à 23h30 doit pointer vers l'office du LENDEMAIN 00h00)
    const tomorrow = new Date(candidate.getTime() + 24 * 3600 * 1000);
    const yesterday = new Date(candidate.getTime() - 24 * 3600 * 1000);

    function windowOf(c) {
      return { center: c, start: new Date(c - winBefore), end: new Date(c.getTime() + winAfter) };
    }
    const wToday = windowOf(candidate);
    const wTomorrow = windowOf(tomorrow);
    const wYesterday = windowOf(yesterday);

    // On préfère la fenêtre qui contient maintenant, sinon la plus proche dans le futur
    if (now >= wToday.start && now <= wToday.end) return wToday;
    if (now >= wTomorrow.start && now <= wTomorrow.end) return wTomorrow;
    if (now >= wYesterday.start && now <= wYesterday.end) return wYesterday;
    // Aucune fenêtre active : on retourne la prochaine occurrence
    if (now < wToday.start) return wToday;
    return wTomorrow;
  }

  function toISO(d) { return d.toISOString(); }

  // Affiche un bandeau discret quand la modération bloque un message
  function showChatModerationBlock(reason) {
    const formWrap = document.getElementById('chat-form-wrap');
    if (!formWrap) return;
    let bar = document.getElementById('chat-mod-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'chat-mod-bar';
      bar.className = 'chat-mod-bar';
      formWrap.before(bar);
    }
    bar.innerHTML = `
      <i class="fa-solid fa-shield-halved"></i>
      <span class="chat-mod-text">
        <strong>Message non publié.</strong> ${escHtml(reason)}
      </span>
      <button class="chat-mod-close" aria-label="Fermer">&times;</button>
    `;
    bar.classList.add('visible');
    bar.querySelector('.chat-mod-close')?.addEventListener('click', () => {
      bar.classList.remove('visible');
    });
    // Auto-disparition après 7s
    clearTimeout(bar._timer);
    bar._timer = setTimeout(() => bar?.classList.remove('visible'), 7000);
  }

  function scrollBottom() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  // ── Charger les messages ──────────────────────────────────
  async function loadMessages(officeId) {
    const sb = window._sbClient;
    if (!sb) return;

    msgsEl.innerHTML = '';
    msgsEl.appendChild(emptyEl);

    const win = currentWindow;
    let query = sb
      .from('prayer_intentions')
      .select('*')
      .eq('office_id', officeId);
    if (win) {
      query = query
        .gte('created_at', toISO(win.start))
        .lte('created_at', toISO(win.end));
    }
    const { data, error } = await query
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !data || data.length === 0) {
      emptyEl.style.display = '';
      return;
    }

    emptyEl.style.display = 'none';
    data.forEach((msg, i) => msgsEl.appendChild(buildBubble(msg, data[i - 1])));
    scrollBottom();
  }

  // Récupère le dernier message du DOM pour comparer (utilisé pour optimistic + realtime)
  function lastMsgFromDom() {
    const last = msgsEl.querySelector('.chat-msg:last-child');
    if (!last) return null;
    return {
      user_id:        last.dataset.userId,
      created_at:     last.dataset.createdAt,
      avatar_icon:    last.dataset.avatarIcon,
      avatar_palette: last.dataset.avatarPalette,
    };
  }

  // ── Temps réel + présence ─────────────────────────────────
  function subscribeRealtime(officeId) {
    const sb = window._sbClient;
    if (!sb) return;

    // Désabonner l'ancien canal
    if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }

    const user = window._pelUser;
    const presenceKey = user ? user.id : ('anon_' + Math.random().toString(36).slice(2, 10));

    realtimeChannel = sb.channel('chat_' + officeId, {
      config: { presence: { key: presenceKey } },
    });

    // Inserts (nouveaux messages)
    const winStartISO = currentWindow ? toISO(currentWindow.start) : null;
    const winEndISO   = currentWindow ? toISO(currentWindow.end)   : null;
    realtimeChannel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'prayer_intentions',
      filter: 'office_id=eq.' + officeId,
    }, payload => {
      const msg = payload.new;
      if (!msg) return;
      // Filtre client : on ignore tout message hors de la fenêtre active
      if (winStartISO && msg.created_at < winStartISO) return;
      if (winEndISO   && msg.created_at > winEndISO)   return;
      // Si le visiteur est non connecté, on rafraîchit juste les stats
      if (!window._pelUser) { loadVisitorView(officeId); return; }
      const existing = msgsEl.querySelector('[data-id="' + msg.id + '"]');
      if (existing) return; // déjà affiché (optimistic)
      emptyEl.style.display = 'none';
      msgsEl.appendChild(buildBubble(msg, lastMsgFromDom()));
      scrollBottom();
    });

    // Présence : sync l'état et met à jour le compteur en ligne
    realtimeChannel.on('presence', { event: 'sync' }, () => {
      const state = realtimeChannel.presenceState();
      const count = Object.keys(state).length;
      updatePresenceUI(count);
    });

    realtimeChannel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      // Track sa propre présence (anonyme si non connecté)
      const meta = user?.user_metadata || {};
      await realtimeChannel.track({
        user_id:  user?.id || presenceKey,
        anon:     !user,
        joined_at: new Date().toISOString(),
        // Avatar (utile si on veut afficher une mosaïque "en ligne" plus tard)
        avatar_icon:    meta.avatar_icon    || 'initial',
        avatar_palette: meta.avatar_palette || 'auto',
      });
    });
  }

  function updatePresenceUI(count) {
    const wrap = document.getElementById('chat-presence');
    const val  = document.getElementById('chat-presence-count');
    const lbl  = document.querySelector('.chat-presence-label');
    if (!wrap || !val) return;
    wrap.classList.remove('hidden');
    val.textContent = count;
    if (lbl) lbl.textContent = (count <= 1) ? 'en ligne' : 'en ligne';
  }

  // Bannières d'accueil contextuelles par type d'office.
  // Affichées entre l'en-tête et le fil des intentions, pour mettre en
  // ambiance l'utilisateur sans intervention de bot interactif.
  const WELCOME_BY_TYPE = {
    laudes: {
      title: 'Prière du matin — Laudes',
      body:  "« Que ma prière, comme un encens, monte devant toi. » Confiez ici les intentions qui pèsent sur votre cœur au seuil de cette journée.",
    },
    matin: {
      title: 'Prière du matin',
      body:  "Au lever du jour, déposez ici vos intentions personnelles, professionnelles, familiales. Elles seront portées avec celles de la communauté.",
    },
    messe: {
      title: 'Sainte Messe',
      body:  "Le Christ s'offre pour le monde. Joignez vos intentions à l'offrande eucharistique — pour vos proches, les défunts, l'Église, la paix.",
    },
    chapelet: {
      title: 'Chapelet',
      body:  "« Confions toutes nos peines à Marie. » Partagez ici les intentions que vous souhaitez confier à la Sainte Vierge à travers ce chapelet.",
    },
    vepres: {
      title: 'Prière du soir — Vêpres',
      body:  "Au déclin du jour, l'Église rend grâce. Confiez ici vos intentions pour cette soirée et la nuit qui vient.",
    },
    soiree: {
      title: 'Prière du soir',
      body:  "Avant le repos, prenez un instant pour confier votre journée et celle de vos proches. Vos intentions rejoignent ici la prière commune.",
    },
    complies: {
      title: 'Complies — Prière de la nuit',
      body:  "« Sous ta protection, nous nous réfugions, sainte Mère de Dieu. » Pour les malades, les voyageurs, les âmes en peine — déposez ici vos intentions de la nuit.",
    },
  };

  function showWelcomeBanner(officeId) {
    const banner = document.getElementById('chat-welcome');
    const title  = document.getElementById('chat-welcome-title');
    const body   = document.getElementById('chat-welcome-body');
    if (!banner || !title || !body) return;
    // officeId est de la forme "messe_1000" → extrait le type avant le _
    const type = (officeId || '').split('_')[0];
    const entry = WELCOME_BY_TYPE[type];
    if (!entry) { banner.style.display = 'none'; return; }
    title.textContent = entry.title;
    body.textContent  = entry.body;
    banner.style.display = '';
  }

  // État local : fenêtre active de l'office en cours d'affichage
  let currentWindow = null;

  // ── Ouvrir le panneau ─────────────────────────────────────
  function openChat(officeId, officeName, meta) {
    currentOfficeId = officeId;
    if (nameEl) nameEl.textContent = officeName;
    // Calcule la fenêtre active : par défaut on extrait l'heure de l'officeId
    // (format "type_HHMM") mais si l'appelant a fourni meta.time, on l'utilise.
    let time = (meta && meta.time) || '';
    if (!time) {
      const parts = (officeId || '').split('_');
      const t = parts[1] || '';
      if (/^\d{4}$/.test(t)) time = t.substring(0, 2) + ':' + t.substring(2, 4);
    }
    currentWindow = officeWindow(time, (meta && meta.duration) || 60);

    // Cacher l'indicateur de présence à chaque ouverture (réactivé sur sync)
    document.getElementById('chat-presence')?.classList.add('hidden');

    // Afficher formulaire ou vue visiteur
    const user = window._pelUser;
    const banner = document.getElementById('chat-welcome');
    if (user) {
      if (formWrap)  formWrap.style.display  = '';
      if (loginProm) loginProm.style.display = 'none';
      if (msgsEl)    msgsEl.style.display    = '';
      showWelcomeBanner(officeId);
    } else {
      if (formWrap)  formWrap.style.display  = 'none';
      if (loginProm) loginProm.style.display = '';
      if (msgsEl)    msgsEl.style.display    = 'none'; // pas de lecture sans compte
      if (banner)    banner.style.display    = 'none'; // pas de bannière pour visiteurs
      loadVisitorView(officeId);
    }

    panel.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (user) loadMessages(officeId);
    subscribeRealtime(officeId);
    if (input && user) setTimeout(() => input.focus(), 320);
  }

  // ── Vue visiteur (non connecté) : compte + mini-mosaïque d'avatars ──
  async function loadVisitorView(officeId) {
    const sb = window._sbClient;
    if (!sb) return;
    const countEl  = document.getElementById('chat-visitor-count-value');
    const labelEl  = document.getElementById('chat-visitor-count-label');
    const mosaicEl = document.getElementById('chat-visitor-mosaic');
    if (countEl) countEl.textContent = '…';
    if (mosaicEl) mosaicEl.innerHTML = '';

    // Total des intentions de la fenêtre active de l'office
    const win = currentWindow;
    let cQ = sb.from('prayer_intentions')
      .select('id', { count: 'exact', head: true })
      .eq('office_id', officeId);
    if (win) cQ = cQ.gte('created_at', toISO(win.start)).lte('created_at', toISO(win.end));
    const { count } = await cQ;

    if (countEl) countEl.textContent = (count ?? 0).toString();
    if (labelEl) {
      labelEl.textContent = (count === 1)
        ? 'intention partagée aujourd\'hui'
        : 'intentions partagées aujourd\'hui';
    }

    // Avatars uniques des participants de la fenêtre (max 10)
    let dQ = sb.from('prayer_intentions')
      .select('user_id,avatar_icon,avatar_palette,user_name')
      .eq('office_id', officeId);
    if (win) dQ = dQ.gte('created_at', toISO(win.start)).lte('created_at', toISO(win.end));
    const { data } = await dQ.order('created_at', { ascending: false }).limit(40);

    const seen = new Set();
    const uniqueAvatars = [];
    (data || []).forEach(row => {
      if (seen.has(row.user_id)) return;
      seen.add(row.user_id);
      if (uniqueAvatars.length < 10) uniqueAvatars.push(row);
    });

    if (mosaicEl) {
      uniqueAvatars.forEach(row => {
        const av = document.createElement('span');
        av.className = 'chat-visitor-avatar';
        if (window.pelRenderAvatar) {
          window.pelRenderAvatar(av, {
            icon:    row.avatar_icon,
            palette: row.avatar_palette,
            name:    row.user_name,
          });
        }
        mosaicEl.appendChild(av);
      });
      if (uniqueAvatars.length === 0) {
        mosaicEl.innerHTML = '<div class="chat-visitor-empty">Aucun fidèle n\'a encore confié d\'intention.</div>';
      } else if ((count || 0) > uniqueAvatars.length) {
        const more = document.createElement('span');
        more.className = 'chat-visitor-more';
        more.textContent = '+' + ((count || 0) - uniqueAvatars.length);
        mosaicEl.appendChild(more);
      }
    }
  }

  // ── Fermer le panneau ─────────────────────────────────────
  function closeChat() {
    panel.classList.add('hidden');
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    currentOfficeId = null;

    const sb = window._sbClient;
    if (sb && realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  }

  // ── Envoi d'un message ────────────────────────────────────
  async function sendMessage(text) {
    const sb   = window._sbClient;
    const user = window._pelUser;
    if (!sb || !user || !currentOfficeId || !text.trim()) return;

    // Modération préventive (Claude Haiku) — bloque les messages inappropriés
    // AVANT l'INSERT Supabase. Fail open : si l'API moderation tombe, on
    // laisse passer pour ne pas pénaliser l'utilisateur.
    try {
      const modResp = await fetch('/api/moderate-chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          text:       text.trim(),
          user_id:    user.id,
          user_name:  (user.user_metadata?.pseudo || user.user_metadata?.name || ''),
          office_id:  currentOfficeId,
        }),
      });
      const verdict = modResp.ok ? await modResp.json() : { allow: true };
      if (verdict.allow === false) {
        showChatModerationBlock(verdict.reason || 'Votre message ne respecte pas la charte de la communauté.');
        return false;
      }
    } catch (_) { /* fail open */ }

    const meta = user.user_metadata || {};
    const cleanEmail = (user.email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const userName = (meta.pseudo || meta.name || cleanEmail || 'Pèlerin').trim().slice(0, 30);
    const avatarIcon    = meta.avatar_icon    || 'initial';
    const avatarPalette = meta.avatar_palette || 'auto';
    const patronSaint   = meta.patron_saint   || '';
    const patronSaintName  = meta.patron_saint_name  || '';
    const patronSaintFeast = meta.patron_saint_feast || '';
    const favoriteVerse = (meta.favorite_verse || '').slice(0, 240);
    const memberSince   = user.created_at || null;
    const country       = (meta.country || '').toLowerCase().slice(0, 4) || null;

    // Optimistic UI
    const optimistic = {
      id: 'tmp_' + Date.now(),
      office_id: currentOfficeId,
      user_id: user.id,
      user_name: userName,
      avatar_icon:    avatarIcon,
      avatar_palette: avatarPalette,
      patron_saint:       patronSaint,
      patron_saint_name:  patronSaintName,
      patron_saint_feast: patronSaintFeast,
      favorite_verse:     favoriteVerse,
      member_since:       memberSince,
      country:            country,
      message: text.trim(),
      created_at: new Date().toISOString(),
    };
    emptyEl.style.display = 'none';
    const bubble = buildBubble(optimistic, lastMsgFromDom());
    msgsEl.appendChild(bubble);
    scrollBottom();

    // Tentative avec toutes les colonnes — fallback en cascade si colonnes manquent
    const fullRow = {
      office_id: currentOfficeId,
      user_id:   user.id,
      user_name: userName,
      avatar_icon:    avatarIcon,
      avatar_palette: avatarPalette,
      patron_saint:       patronSaint,
      patron_saint_name:  patronSaintName,
      patron_saint_feast: patronSaintFeast,
      favorite_verse:     favoriteVerse,
      member_since:       memberSince,
      country:            country,
      message:   text.trim(),
    };
    let { data, error } = await sb.from('prayer_intentions').insert(fullRow).select().single();
    // Cascade : retire d'abord 'country' (nouvelle colonne) si l'erreur l'indique
    if (error && /country|column/i.test(error.message || '')) {
      const noCountry = { ...fullRow };
      delete noCountry.country;
      ({ data, error } = await sb.from('prayer_intentions').insert(noCountry).select().single());
    }
    if (error && /patron_saint_name|patron_saint_feast|member_since|patron_saint|favorite_verse|avatar_icon|avatar_palette|column/i.test(error.message || '')) {
      // Cascade de retraits si certaines colonnes ne sont pas (encore) en DB
      const trimmed = { ...fullRow };
      delete trimmed.patron_saint_name;
      delete trimmed.patron_saint_feast;
      ({ data, error } = await sb.from('prayer_intentions').insert(trimmed).select().single());
      if (error && /member_since|column/i.test(error.message || '')) {
        delete trimmed.member_since;
        ({ data, error } = await sb.from('prayer_intentions').insert(trimmed).select().single());
      }
      if (error && /patron_saint|favorite_verse|column/i.test(error.message || '')) {
        delete trimmed.patron_saint;
        delete trimmed.favorite_verse;
        ({ data, error } = await sb.from('prayer_intentions').insert(trimmed).select().single());
      }
      if (error && /avatar_icon|avatar_palette|column/i.test(error.message || '')) {
        delete trimmed.avatar_icon;
        delete trimmed.avatar_palette;
        ({ data, error } = await sb.from('prayer_intentions').insert(trimmed).select().single());
      }
    }

    if (error) {
      bubble.remove();
      // Si la bulle optimiste était la seule, ré-afficher empty
      if (!msgsEl.querySelector('.chat-msg')) emptyEl.style.display = '';
    } else if (data) {
      // Remplace l'ID temporaire par l'ID réel
      bubble.dataset.id = data.id;
    }
  }

  // ── Événements ───────────────────────────────────────────
  // Délégation — ouvre le chat depuis n'importe quel bouton .tl-chat-btn
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="chat"]');
    if (!btn) return;
    openChat(
      btn.dataset.officeId,
      btn.dataset.officeName,
      {
        time:     btn.dataset.officeTime || '',
        duration: parseInt(btn.dataset.officeDuration, 10) || 60,
      }
    );
  });

  if (closeBtn) closeBtn.addEventListener('click', closeChat);
  if (overlay)  overlay.addEventListener('click', closeChat);

  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = input?.value?.trim();
      if (!text) return;
      // Désactive temporairement l'input pendant l'envoi + modération
      if (input) input.disabled = true;
      const sendBtn = document.getElementById('chat-send');
      if (sendBtn) sendBtn.disabled = true;
      try {
        const sent = await sendMessage(text);
        // Vide l'input uniquement si le message a été publié
        if (sent !== false && input) input.value = '';
      } finally {
        if (input)  { input.disabled  = false; input.focus(); }
        if (sendBtn) sendBtn.disabled = false;
      }
    });
  }

  // Bouton connexion dans l'invite
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      closeChat();
      document.getElementById('header-btn-login')?.click();
    });
  }

  // Fermer avec Échap
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.classList.contains('hidden')) closeChat();
  });
}


/* ────────────────────────────────────────────
   13. MODAL À PROPOS + PWA INSTALL
──────────────────────────────────────────────*/

// Capture le prompt natif Android/Desktop
let _installPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
});

window.addEventListener('appinstalled', () => {
  _installPrompt = null;
  // Cache l'entrée install du hamburger après installation réussie
  const hmInstall = document.getElementById('hm-install');
  if (hmInstall) hmInstall.style.display = 'none';
});

/* ────────────────────────────────────────────
   BANNIÈRE INSTALL — bas de la vue Aujourd'hui
   Apparaît quand beforeinstallprompt se déclenche (Android/Desktop)
   ou immédiatement sur iOS (hors standalone).
──────────────────────────────────────────────*/
function initInstallBanner() {
  const bar = document.getElementById('today-install-bar');
  if (!bar) return;

  // Déjà installé ? On ne montre rien.
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) return;

  // L'utilisateur a déjà masqué la suggestion → on respecte son choix.
  const DISMISS_KEY = 'pel_install_hidden';
  try { if (localStorage.getItem(DISMISS_KEY) === '1') return; } catch (_) {}

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
  // Sur iOS, SEUL Safari peut ajouter à l'écran d'accueil (Chrome/Firefox iOS
  // ne le permettent pas) → on ne propose la bannière qu'en Safari iOS.
  const isIOSSafari = isIOS && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);

  const btn      = document.getElementById('tib-btn');
  const btnLabel = document.getElementById('tib-btn-label');
  const sub      = document.getElementById('tib-sub');
  const closeBtn = document.getElementById('tib-close');

  function showBar() {
    bar.style.display = '';
    bar.removeAttribute('aria-hidden');
  }
  function hideBar(remember) {
    bar.style.display = 'none';
    bar.setAttribute('aria-hidden', 'true');
    if (remember) { try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) {} }
  }

  // Bouton « masquer » (× ) : mémorise le choix, ne réapparaîtra plus.
  closeBtn?.addEventListener('click', () => hideBar(true));

  // ── iPhone / iPad (Safari) : pas d'installation programmatique possible.
  // On affiche tout de même la bannière, dont le bouton ouvre le GUIDE pas-à-pas
  // (bouton Partager → « Sur l'écran d'accueil »). C'est LE point d'entrée que
  // les personnes âgées ne trouvaient pas seules dans le menu.
  if (isIOSSafari) {
    if (btnLabel) btnLabel.textContent = 'Voir comment';
    if (sub) sub.textContent = 'Ajoutez l’icône sur votre écran d’accueil';
    btn?.addEventListener('click', () => { window._openInstallModal?.(); });
    showBar();
    return;
  }

  // Autres navigateurs iOS (Chrome/Firefox…) : ils ne peuvent pas installer →
  // pas de bannière (éviterait de frustrer ; le menu reste disponible).
  if (isIOS) return;

  // ── Android / Desktop Chrome / Edge / Opera : prompt natif d'installation.
  if (btn) {
    btn.addEventListener('click', async () => {
      if (_installPrompt) {
        const res = await _installPrompt.prompt();
        if (res?.outcome === 'accepted') {
          _installPrompt = null;
          hideBar(false);
        }
      } else {
        // Pas de prompt natif dispo → ouvre le guide d'instructions.
        window._openInstallModal?.();
      }
    });
  }

  window.addEventListener('beforeinstallprompt', () => showBar());
  if (_installPrompt) showBar();

  // Masquer si installé depuis un autre point d'entrée
  window.addEventListener('appinstalled', () => hideBar(false));
}

// Bannière « hors connexion » — informe l'utilisateur que la connexion est
// perdue (utile pour la diaspora avec un réseau instable). Le contenu déjà mis
// en cache par le Service Worker (coquille de l'app, offices du jour calculés
// côté client, textes déjà consultés) reste accessible.
function initOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  function sync() {
    const offline = !navigator.onLine;
    banner.hidden = !offline;
    banner.classList.toggle('show', offline);
    document.body.classList.toggle('is-offline', offline);
  }
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

function initContact() {
  const overlay  = document.getElementById('contact-overlay');
  const modal    = document.getElementById('contact-modal');
  const closeBtn = document.getElementById('contact-close');
  const trigger  = document.getElementById('hm-contact');
  const form     = document.getElementById('contact-form');
  const textarea = document.getElementById('contact-message');
  const counter  = document.getElementById('contact-count');
  const submitBtn = document.getElementById('contact-submit');
  const feedback = document.getElementById('contact-feedback');
  if (!modal || !form) return;

  function openContact() {
    overlay?.classList.remove('hidden');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Ferme le menu burger si ouvert
    document.getElementById('hamburger-menu')?.classList.add('hidden');
    document.getElementById('hamburger-overlay')?.classList.remove('show');
    setTimeout(() => textarea?.focus(), 100);
  }
  function closeContact() {
    overlay?.classList.add('hidden');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    if (feedback) { feedback.className = 'contact-feedback hidden'; feedback.textContent = ''; }
  }

  trigger?.addEventListener('click', openContact);
  closeBtn?.addEventListener('click', closeContact);
  overlay?.addEventListener('click', closeContact);
  modal?.addEventListener('click', e => { if (e.target === modal) closeContact(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeContact();
  });

  // Compteur de caractères live
  textarea?.addEventListener('input', () => {
    if (counter) counter.textContent = textarea.value.length;
  });

  // Soumission
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!feedback || !submitBtn) return;
    feedback.className = 'contact-feedback hidden';
    feedback.textContent = '';

    const formData = new FormData(form);
    const payload = {
      type:    formData.get('type')    || 'autre',
      email:   (formData.get('email')   || '').toString().trim(),
      message: (formData.get('message') || '').toString().trim(),
      website: (formData.get('website') || '').toString(),  // honeypot
      ua:      navigator.userAgent,
      page:    location.pathname,
    };

    if (!payload.message || payload.message.length < 5) {
      feedback.className = 'contact-feedback err';
      feedback.textContent = 'Merci d\'écrire un message d\'au moins 5 caractères.';
      return;
    }
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      feedback.className = 'contact-feedback err';
      feedback.textContent = 'Adresse email invalide (ou laissez le champ vide).';
      return;
    }

    submitBtn.disabled = true;
    const originalLabel = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi…';

    // Helper : fallback mailto si l'API n'est pas configurée
    const openMailto = () => {
      const TYPE_LBL = { suggestion:'Suggestion', bug:'Bug', merci:'Remerciement', autre:'Message' };
      const subject = encodeURIComponent(`[PrionsEnLigne] ${TYPE_LBL[payload.type] || 'Message'}`);
      const body = encodeURIComponent(
        payload.message +
        '\n\n---\n' +
        (payload.email ? `Email de retour : ${payload.email}\n` : '') +
        `Page : ${payload.page}\n`
      );
      window.location.href = `mailto:contact@prionsenligne.fr?subject=${subject}&body=${body}`;
    };

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Service non configuré → bascule sur mailto
      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        if (data.fallback === 'mailto') {
          feedback.className = 'contact-feedback ok';
          feedback.innerHTML = '<i class="fa-solid fa-envelope"></i> Ouverture de votre application mail…';
          openMailto();
          setTimeout(closeContact, 1500);
          return;
        }
      }

      if (!res.ok) {
        // Tente de récupérer le détail JSON pour afficher la vraie cause
        let detail = '';
        try {
          const errData = await res.json();
          detail = errData.detail || errData.error || '';
        } catch (_) {
          detail = await res.text().catch(() => '');
        }
        throw Object.assign(new Error(detail || `HTTP ${res.status}`), { status: res.status });
      }
      feedback.className = 'contact-feedback ok';
      feedback.textContent = '✓ Message envoyé. Merci pour votre retour !';
      form.reset();
      if (counter) counter.textContent = '0';
      setTimeout(closeContact, 2500);
    } catch (err) {
      console.warn('[contact] erreur envoi:', err);
      // Cas spéciaux où on ne propose PAS le mailto (rate limit, validation)
      if (err.status === 429) {
        feedback.className = 'contact-feedback err';
        feedback.textContent = 'Trop de messages envoyés. Réessayez dans une minute.';
      } else if (err.status === 400) {
        feedback.className = 'contact-feedback err';
        feedback.textContent = err.message || 'Données invalides.';
      } else {
        // Erreur serveur/réseau → fallback mailto
        feedback.className = 'contact-feedback err';
        feedback.innerHTML = 'Problème d\'envoi. <button type="button" id="contact-mailto-fallback" style="background:none;border:none;color:inherit;text-decoration:underline;cursor:pointer;padding:0;font:inherit;">Ouvrir votre app mail</button>';
        document.getElementById('contact-mailto-fallback')?.addEventListener('click', openMailto);
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
    }
  });
}

function initAbout() {
  const overlay = document.getElementById('about-overlay');
  const modal   = document.getElementById('about-modal');
  const closeBtn = document.getElementById('about-close');
  if (!modal) return;

  function openAbout() {
    overlay?.classList.remove('hidden');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeAbout() {
    overlay?.classList.add('hidden');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  closeBtn?.addEventListener('click', closeAbout);
  overlay?.addEventListener('click', closeAbout);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAbout();
  });

  window._openAbout = openAbout;
}

// ════════════════════════════════════════════════════════════════════
// Modal "Office monastique" — panneau pédagogique pour les laudes/vêpres
// en grégorien diffusées en direct depuis l'abbaye de Triors. Le bréviaire
// romain de l'AELF ne correspond pas à ces offices monastiques : ce panneau
// présente la structure et les textes fixes (parties qui ne changent jamais).
// ════════════════════════════════════════════════════════════════════
function initMonasticModal() {
  const overlay = document.getElementById('monastic-overlay');
  const modal   = document.getElementById('monastic-modal');
  const closeBtn = document.getElementById('monastic-close');
  const titleEl  = document.getElementById('monastic-title');
  const bodyEl   = document.getElementById('monastic-body');
  if (!modal || !bodyEl) return;

  function open(officeLabel, kind) {
    if (titleEl) titleEl.textContent = officeLabel || 'Office monastique';
    bodyEl.innerHTML = _renderMonasticContent(kind || 'laudes');
    overlay?.classList.remove('hidden');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Toggle des sections dépliables
    bodyEl.querySelectorAll('.mono-section-title').forEach(t => {
      t.addEventListener('click', () => {
        const sec = t.closest('.mono-section');
        sec?.classList.toggle('mono-section-open');
      });
    });
  }
  function close() {
    overlay?.classList.add('hidden');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });

  window._openMonasticModal = open;
}

// ════════════════════════════════════════════════════════════════════
// Modal "Suivre la messe en latin" — Ordinaire de la messe
// ════════════════════════════════════════════════════════════════════
function initLatinMassModal() {
  const overlay = document.getElementById('latin-mass-overlay');
  const modal   = document.getElementById('latin-mass-modal');
  const closeBtn = document.getElementById('latin-mass-close');
  const titleEl  = document.getElementById('latin-mass-title');
  const bodyEl   = document.getElementById('latin-mass-body');
  if (!modal || !bodyEl) return;

  function open(officeLabel) {
    if (titleEl) titleEl.textContent = officeLabel || 'Suivre la messe en latin';
    bodyEl.innerHTML = _renderLatinMassContent();
    overlay?.classList.remove('hidden');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    bodyEl.querySelectorAll('.mono-section-title').forEach(t => {
      t.addEventListener('click', () => {
        const sec = t.closest('.mono-section');
        sec?.classList.toggle('mono-section-open');
      });
    });
  }
  function close() {
    overlay?.classList.add('hidden');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });
  window._openLatinMassModal = open;
}

function _renderLatinMassContent() {
  return `
    <div class="mono-intro">
      <p>L'<strong>Ordinaire de la messe</strong> (parties qui ne changent jamais) en latin et français. Les <em>lectures du jour</em> et les <em>propres</em> (introït, graduel, alléluia, offertoire, communion) varient — utilisez le bouton <strong>Textes</strong> pour les lire en français.</p>
      <p class="mono-warning"><i class="fa-solid fa-circle-info"></i> Suivez les moines à l'écoute — les chants grégoriens sont magnifiques pour la prière, même sans tout comprendre.</p>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> Rites d'introduction <span class="mono-fixed-tag">Fixe</span></h3>
      <div class="mono-section-body">
        <p class="mono-rubric">Signe de croix</p>
        <p class="mono-latin">℣. In nómine Patris, et Fílii, et Spíritus Sancti.</p>
        <p class="mono-french">℣. Au nom du Père, et du Fils, et du Saint-Esprit.</p>
        <p class="mono-latin">℟. Amen.</p>
        <p class="mono-rubric">Salutation</p>
        <p class="mono-latin">℣. Dóminus vobíscum.</p>
        <p class="mono-french">℣. Le Seigneur soit avec vous.</p>
        <p class="mono-latin">℟. Et cum spíritu tuo.</p>
        <p class="mono-french">℟. Et avec votre esprit.</p>
        <p class="mono-rubric">Acte pénitentiel — Confíteor</p>
        <p class="mono-latin">Confíteor Deo omnipoténti et vobis, fratres, quia peccávi nimis cogitatióne, verbo, ópere et omissióne : mea culpa, mea culpa, mea máxima culpa…</p>
        <p class="mono-french">Je confesse à Dieu tout-puissant et à vous aussi, mes frères, que j'ai péché en pensée, en parole, par action et par omission : oui, j'ai vraiment péché…</p>
        <p class="mono-rubric">Kyrie (le diacre ou prêtre chante)</p>
        <p class="mono-latin">Kýrie, eléison. — Christe, eléison. — Kýrie, eléison.</p>
        <p class="mono-french">Seigneur, prends pitié. — Ô Christ, prends pitié. — Seigneur, prends pitié.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> Gloria <span class="mono-fixed-tag">Fixe — sauf Avent & Carême</span></h3>
      <div class="mono-section-body">
        <p class="mono-latin">Glória in excélsis Deo, et in terra pax homínibus bonæ voluntátis. Laudámus te, benedícimus te, adorámus te, glorificámus te, grátias ágimus tibi propter magnam glóriam tuam. Dómine Deus, Rex cæléstis, Deus Pater omnípotens. Dómine, Fili unigénite, Iesu Christe, Dómine Deus, Agnus Dei, Fílius Patris : qui tollis peccáta mundi, miserére nobis ; qui tollis peccáta mundi, súscipe deprecatiónem nostram ; qui sedes ad déxteram Patris, miserére nobis. Quóniam tu solus Sanctus, tu solus Dóminus, tu solus Altíssimus, Iesu Christe, cum Sancto Spíritu, in glória Dei Patris. Amen.</p>
        <p class="mono-french">Gloire à Dieu, au plus haut des cieux, et paix sur la terre aux hommes qu'il aime. Nous te louons, nous te bénissons, nous t'adorons, nous te glorifions, nous te rendons grâce, pour ton immense gloire, Seigneur Dieu, Roi du ciel, Dieu le Père tout-puissant. Seigneur, Fils unique, Jésus Christ, Seigneur Dieu, Agneau de Dieu, le Fils du Père ; toi qui enlèves les péchés du monde, prends pitié de nous ; toi qui enlèves les péchés du monde, reçois notre prière ; toi qui es assis à la droite du Père, prends pitié de nous. Car toi seul es saint, toi seul es Seigneur, toi seul es le Très-Haut, Jésus Christ, avec le Saint-Esprit, dans la gloire de Dieu le Père. Amen.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> Liturgie de la Parole <span class="mono-var-tag">Lectures variables</span></h3>
      <div class="mono-section-body">
        <p>Les lectures (1<sup>re</sup> lecture, psaume, 2<sup>e</sup> lecture, évangile) varient chaque jour. <strong>Consultez le bouton « Textes »</strong> sur la carte de la messe pour les lire en français.</p>
        <p class="mono-rubric">Avant l'évangile</p>
        <p class="mono-latin">℣. Dóminus vobíscum. ℟. Et cum spíritu tuo.<br>℣. Léctio sancti Evangélii secúndum N. ℟. Glória tibi, Dómine.</p>
        <p class="mono-french">℣. Le Seigneur soit avec vous. ℟. Et avec votre esprit.<br>℣. Évangile de Jésus Christ selon saint N. ℟. Gloire à toi, Seigneur.</p>
        <p class="mono-rubric">Après l'évangile</p>
        <p class="mono-latin">℣. Verbum Dómini. ℟. Laus tibi, Christe.</p>
        <p class="mono-french">℣. Acclamons la Parole de Dieu. ℟. Louange à toi, Seigneur Jésus.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> Credo (Symbole de Nicée) <span class="mono-fixed-tag">Dimanche & solennités</span></h3>
      <div class="mono-section-body">
        <p class="mono-latin">Credo in unum Deum, Patrem omnipoténtem, factórem cæli et terræ, visibílium ómnium et invisibílium. Et in unum Dóminum Iesum Christum, Fílium Dei unigénitum, et ex Patre natum ante ómnia sǽcula. Deum de Deo, lumen de lúmine, Deum verum de Deo vero, génitum, non factum, consubstantiálem Patri : per quem ómnia facta sunt…</p>
        <p class="mono-french">Je crois en un seul Dieu, le Père tout-puissant, créateur du ciel et de la terre, de l'univers visible et invisible. Je crois en un seul Seigneur, Jésus Christ, le Fils unique de Dieu, né du Père avant tous les siècles : il est Dieu, né de Dieu, lumière, née de la lumière, vrai Dieu, né du vrai Dieu, engendré, non pas créé, consubstantiel au Père ; et par lui tout a été fait…</p>
        <p class="mono-rubric">Texte intégral très long — voir <a href="https://www.aelf.org" target="_blank" rel="noopener">aelf.org</a> ou un missel pour la suite (« Et incarnátus est… »).</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> Sanctus <span class="mono-fixed-tag">Fixe</span></h3>
      <div class="mono-section-body">
        <p class="mono-rubric">Dialogue de la préface</p>
        <p class="mono-latin">℣. Dóminus vobíscum. ℟. Et cum spíritu tuo.<br>℣. Sursum corda. ℟. Habémus ad Dóminum.<br>℣. Grátias agámus Dómino Deo nostro. ℟. Dignum et iustum est.</p>
        <p class="mono-french">℣. Le Seigneur soit avec vous. ℟. Et avec votre esprit.<br>℣. Élevons notre cœur. ℟. Nous le tournons vers le Seigneur.<br>℣. Rendons grâce au Seigneur notre Dieu. ℟. Cela est juste et bon.</p>
        <p class="mono-rubric">Sanctus (à la fin de la préface)</p>
        <p class="mono-latin">Sanctus, Sanctus, Sanctus, Dóminus Deus Sábaoth. Pleni sunt cæli et terra glória tua. Hosánna in excélsis. Benedíctus qui venit in nómine Dómini. Hosánna in excélsis.</p>
        <p class="mono-french">Saint, Saint, Saint, le Seigneur, Dieu de l'univers. Le ciel et la terre sont remplis de ta gloire. Hosanna au plus haut des cieux. Béni soit celui qui vient au nom du Seigneur. Hosanna au plus haut des cieux.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> Pater Noster <span class="mono-fixed-tag">Fixe</span></h3>
      <div class="mono-section-body">
        <p class="mono-latin">Pater noster, qui es in cælis : sanctificétur nomen tuum ; advéniat regnum tuum ; fiat volúntas tua, sicut in cælo, et in terra. Panem nostrum cotidiánum da nobis hódie ; et dimítte nobis débita nostra, sicut et nos dimíttimus debitóribus nostris ; et ne nos indúcas in tentatiónem ; sed líbera nos a malo.</p>
        <p class="mono-french">Notre Père, qui es aux cieux, que ton nom soit sanctifié, que ton règne vienne, que ta volonté soit faite sur la terre comme au ciel. Donne-nous aujourd'hui notre pain de ce jour. Pardonne-nous nos offenses, comme nous pardonnons aussi à ceux qui nous ont offensés. Et ne nous laisse pas entrer en tentation, mais délivre-nous du Mal.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> Agnus Dei <span class="mono-fixed-tag">Fixe</span></h3>
      <div class="mono-section-body">
        <p class="mono-latin">Agnus Dei, qui tollis peccáta mundi : miserére nobis.<br>Agnus Dei, qui tollis peccáta mundi : miserére nobis.<br>Agnus Dei, qui tollis peccáta mundi : dona nobis pacem.</p>
        <p class="mono-french">Agneau de Dieu, qui enlèves le péché du monde, prends pitié de nous.<br>Agneau de Dieu, qui enlèves le péché du monde, prends pitié de nous.<br>Agneau de Dieu, qui enlèves le péché du monde, donne-nous la paix.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> Communion <span class="mono-fixed-tag">Fixe</span></h3>
      <div class="mono-section-body">
        <p class="mono-latin">℣. Dómine, non sum dignus ut intres sub tectum meum : sed tantum dic verbo, et sanábitur ánima mea.</p>
        <p class="mono-french">℣. Seigneur, je ne suis pas digne de te recevoir ; mais dis seulement une parole et je serai guéri.</p>
        <p class="mono-rubric">À la communion</p>
        <p class="mono-latin">℣. Corpus Christi. ℟. Amen.</p>
        <p class="mono-french">℣. Le Corps du Christ. ℟. Amen.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> Rites de conclusion <span class="mono-fixed-tag">Fixe</span></h3>
      <div class="mono-section-body">
        <p class="mono-rubric">Bénédiction</p>
        <p class="mono-latin">℣. Benedícat vos omnípotens Deus, Pater, et Fílius, et Spíritus Sanctus.</p>
        <p class="mono-french">℣. Que Dieu tout-puissant vous bénisse, le Père, le Fils, et le Saint-Esprit.</p>
        <p class="mono-latin">℟. Amen.</p>
        <p class="mono-rubric">Renvoi</p>
        <p class="mono-latin">℣. Ite, missa est.</p>
        <p class="mono-french">℣. Allez, dans la paix du Christ.</p>
        <p class="mono-latin">℟. Deo grátias.</p>
        <p class="mono-french">℟. Nous rendons grâce à Dieu.</p>
      </div>
    </div>

    <div class="mono-resources">
      <h3><i class="fa-solid fa-link"></i> Pour aller plus loin</h3>
      <ul>
        <li><a href="https://abbaye-saintwandrille.fr" target="_blank" rel="noopener">Abbaye Saint-Wandrille de Fontenelle</a> — la communauté qui chante cette messe</li>
        <li><em>Graduale Romanum</em> (Solesmes) — livre de chant officiel des propres de la messe</li>
        <li><em>Kyriale</em> — recueil des Ordinaires (Gloria, Sanctus, Agnus, Credo)</li>
      </ul>
    </div>
  `;
}

function _renderMonasticContent(kind) {
  kind = kind || 'laudes';
  // Parties FIXES de l'office monastique (latine + traduction)
  // Sources : Liber Usualis, Liber Hymnarius, Antiphonale Monasticum
  const isVepres   = (kind === 'vepres');
  const isComplies = (kind === 'complies');
  const isVigiles  = (kind === 'vigiles');
  const officeName = isComplies ? 'Complies' : isVigiles ? 'Vigiles' : isVepres ? 'Vêpres' : 'Laudes';
  const officeMoment = isComplies ? 'dernière prière de la journée' : isVigiles ? 'veillée solennelle' : isVepres ? 'office du soir' : 'office matinal';
  return `
    <div class="mono-intro">
      <p>Les ${officeName} monastiques sont l'<strong>${officeMoment}</strong> chanté en grégorien par les moines bénédictins. Elles suivent la <strong>Règle de saint Benoît</strong> (VI<sup>e</sup> siècle) et le <strong>psautier monastique</strong> — distinct du bréviaire romain post-Concile.</p>
      <p class="mono-warning"><i class="fa-solid fa-circle-info"></i> Les psaumes, antiennes et hymnes varient chaque jour selon le temps liturgique. <strong>Suivez les moines à l'écoute</strong> — ce panneau présente uniquement la structure et les parties qui reviennent tous les jours.</p>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 1. Ouverture <span class="mono-fixed-tag">Toujours identique</span></h3>
      <div class="mono-section-body">
        <p class="mono-rubric">Tous se signent en disant :</p>
        <p class="mono-latin">℣. Deus, in adjutórium meum inténde.</p>
        <p class="mono-french">℣. Ô Dieu, viens à mon aide.</p>
        <p class="mono-latin">℟. Dómine, ad adjuvándum me festína.</p>
        <p class="mono-french">℟. Seigneur, à mon secours hâte-toi.</p>
        <p class="mono-latin">Gloria Patri, et Fílio, et Spirítui Sancto. Sicut erat in princípio, et nunc, et semper, et in sǽcula sæculórum. Amen. Alleluia.</p>
        <p class="mono-french">Gloire au Père, et au Fils, et au Saint-Esprit, comme il était au commencement, maintenant et toujours, et dans les siècles des siècles. Amen. Alléluia.</p>
        <p class="mono-rubric">L'« Alleluia » est omis du début du Carême au Samedi Saint.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 2. Hymne <span class="mono-var-tag">Variable</span></h3>
      <div class="mono-section-body">
        <p>Hymne propre au temps liturgique (Avent, Noël, Carême, Pâques, Temps ordinaire, fêtes).</p>
        <p class="mono-rubric">${isComplies
          ? 'Pour les complies, l\'hymne est traditionnellement <em>Te lucis ante términum</em> (anonyme, VIII<sup>e</sup> siècle) — invocation pour une nuit en paix sous la garde de Dieu.'
          : isVepres
            ? 'Pour les vêpres ordinaires, l\'hymne est souvent <em>Deus Creátor ómnium</em> (saint Ambroise) ou <em>Lucis Creátor óptime</em>. Source : <em>Liber Hymnarius</em> (Solesmes).'
            : 'Pour les laudes ordinaires, l\'hymne est souvent <em>Æterne rerum cónditor</em> (saint Ambroise, IV<sup>e</sup> siècle) ou <em>Splendor patérnæ glóriæ</em>. Source : <em>Liber Hymnarius</em> (Solesmes).'}</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 3. Psalmodie <span class="mono-var-tag">Variable</span></h3>
      <div class="mono-section-body">
        <p>Selon le psautier monastique de saint Benoît, chaque jour de la semaine a sa distribution propre des psaumes :</p>
        <ul class="mono-list">
          <li><strong>Lundi à samedi</strong> : 4 psaumes encadrés d'antiennes propres</li>
          <li><strong>Dimanches et solennités</strong> : structure enrichie (psaumes 66, 50, psaumes festifs)</li>
        </ul>
        <p>Chaque psaume est précédé et suivi d'une <em>antienne</em> brève qui en donne la clé d'interprétation pour le jour.</p>
        <p class="mono-rubric">Toute la semaine, les 150 psaumes sont chantés intégralement (vs 4 semaines dans le bréviaire romain).</p>
      </div>
    </div>

    ${isVepres ? `
    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 4. Cantique du Nouveau Testament <span class="mono-var-tag">Variable</span></h3>
      <div class="mono-section-body">
        <p>Un cantique néotestamentaire (épîtres pauliniennes, Apocalypse), propre au jour de la semaine.</p>
      </div>
    </div>
    ` : `
    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 4. Cantique de l'Ancien Testament <span class="mono-var-tag">Variable</span></h3>
      <div class="mono-section-body">
        <p>Un cantique tiré de l'AT, propre au jour de la semaine (par ex. cantique d'Isaïe, de Moïse, des Trois Jeunes Gens dans la fournaise…).</p>
      </div>
    </div>
    `}

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 5. Capitule <span class="mono-var-tag">Variable</span></h3>
      <div class="mono-section-body">
        <p>Lecture brève (1 à 3 versets) tirée de l'Écriture, propre au temps liturgique.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 6. Répons bref <span class="mono-var-tag">Variable</span></h3>
      <div class="mono-section-body">
        <p>Court répons chanté qui prolonge la méditation du capitule.</p>
      </div>
    </div>

    ${isComplies ? `
    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 7. Cantique de Siméon — Nunc Dimittis <span class="mono-fixed-tag">Le sommet de l'office</span></h3>
      <div class="mono-section-body">
        <p class="mono-rubric">Tous se lèvent. (Luc 2, 29-32)</p>
        <p class="mono-latin">Nunc dimíttis servum tuum, Dómine, *<br>
        secúndum verbum tuum in pace ;<br>
        quia vidérunt óculi mei *<br>
        salutáre tuum,<br>
        quod parásti *<br>
        ante fáciem ómnium populórum,<br>
        lumen ad revelatiónem géntium *<br>
        et glóriam plebis tuæ Israel.</p>
        <p class="mono-french">Maintenant, ô Maître souverain, *<br>
        tu peux laisser ton serviteur s'en aller en paix selon ta parole.<br>
        Car mes yeux ont vu *<br>
        le salut<br>
        que tu préparais *<br>
        à la face des peuples :<br>
        lumière qui se révèle aux nations *<br>
        et donne gloire à ton peuple Israël.</p>
        <p class="mono-rubric">Gloria Patri… (comme à l'ouverture)</p>
      </div>
    </div>
    ` : isVepres ? `
    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 7. Cantique de la Vierge — Magnificat <span class="mono-fixed-tag">Le sommet de l'office</span></h3>
      <div class="mono-section-body">
        <p class="mono-rubric">Tous se lèvent et font le signe de croix sur eux-mêmes. (Luc 1, 46-55)</p>
        <p class="mono-latin">Magníficat *<br>
        ánima mea Dóminum,<br>
        et exsultávit spíritus meus *<br>
        in Deo salutári meo,<br>
        quia respéxit humilitátem ancíllæ suæ. *<br>
        Ecce enim ex hoc beátam me dicent omnes generatiónes,<br>
        quia fecit mihi magna qui potens est, *<br>
        et sanctum nomen ejus,<br>
        et misericórdia ejus a progénie in progénies *<br>
        timéntibus eum.<br>
        Fecit poténtiam in bráchio suo, *<br>
        dispérsit supérbos mente cordis sui ;<br>
        depósuit poténtes de sede *<br>
        et exaltávit húmiles ;<br>
        esuriéntes implévit bonis *<br>
        et dívites dimísit inánes.<br>
        Suscépit Israel púerum suum, *<br>
        recordátus misericórdiæ suæ,<br>
        sicut locútus est ad patres nostros, *<br>
        Abraham et sémini ejus in sǽcula.</p>
        <p class="mono-french">Mon âme exalte le Seigneur, *<br>
        exulte mon esprit en Dieu, mon Sauveur !<br>
        Il s'est penché sur son humble servante ; *<br>
        désormais tous les âges me diront bienheureuse.<br>
        Le Puissant fit pour moi des merveilles ; *<br>
        Saint est son nom !<br>
        Son amour s'étend d'âge en âge *<br>
        sur ceux qui le craignent.<br>
        Déployant la force de son bras, *<br>
        il disperse les superbes.<br>
        Il renverse les puissants de leurs trônes, *<br>
        il élève les humbles.<br>
        Il comble de biens les affamés, *<br>
        renvoie les riches les mains vides.<br>
        Il relève Israël, son serviteur, *<br>
        il se souvient de son amour,<br>
        de la promesse faite à nos pères, *<br>
        en faveur d'Abraham et de sa race, à jamais.</p>
        <p class="mono-rubric">Gloria Patri… (comme à l'ouverture)</p>
      </div>
    </div>
    ` : `
    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 7. Cantique de Zacharie — Benedictus <span class="mono-fixed-tag">Le sommet de l'office</span></h3>
      <div class="mono-section-body">
        <p class="mono-rubric">Tous se lèvent et font le signe de croix sur eux-mêmes. (Luc 1, 68-79)</p>
        <p class="mono-latin">Benedíctus Dóminus, Deus Israël, *<br>
        quia visitávit et fecit redemptiónem plebis suæ.<br>
        Et eréxit cornu salútis nobis *<br>
        in domo David, púeri sui.<br>
        Sicut locútus est per os sanctórum, *<br>
        qui a sǽculo sunt, prophetárum ejus :<br>
        Salútem ex inimícis nostris *<br>
        et de manu ómnium qui odérunt nos.<br>
        […]<br>
        Per víscera misericórdiæ Dei nostri, *<br>
        in quibus visitábit nos óriens ex alto,<br>
        illumináre his qui in ténebris et in umbra mortis sedent, *<br>
        ad dirigéndos pedes nostros in viam pacis.</p>
        <p class="mono-french">Béni soit le Seigneur, le Dieu d'Israël, *<br>
        qui visite et rachète son peuple.<br>
        Il a fait surgir la force qui nous sauve *<br>
        dans la maison de David, son serviteur,<br>
        comme il l'avait dit par la bouche des saints, *<br>
        par ses prophètes, depuis les temps anciens :<br>
        salut qui nous arrache à l'ennemi, *<br>
        à la main de tous nos oppresseurs.<br>
        […]<br>
        Grâce à la tendresse, à l'amour de notre Dieu, *<br>
        quand nous visite l'astre d'en haut,<br>
        pour illuminer ceux qui habitent les ténèbres et l'ombre de la mort, *<br>
        pour conduire nos pas au chemin de la paix.</p>
        <p class="mono-rubric">Gloria Patri… (comme à l'ouverture)</p>
      </div>
    </div>
    `}

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 8. Préces / Intercessions <span class="mono-var-tag">Variable</span></h3>
      <div class="mono-section-body">
        <p>Litanie d'intercession pour l'Église, le monde, les vivants et les morts. Les intentions varient.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 9. Notre Père <span class="mono-fixed-tag">Toujours identique</span></h3>
      <div class="mono-section-body">
        <p class="mono-latin">Pater noster, qui es in cælis, sanctificétur nomen tuum.<br>
        Advéniat regnum tuum.<br>
        Fiat volúntas tua, sicut in cælo et in terra.<br>
        Panem nostrum cotidiánum da nobis hódie,<br>
        et dimítte nobis débita nostra, sicut et nos dimíttimus debitóribus nostris.<br>
        Et ne nos indúcas in tentatiónem, sed líbera nos a malo. Amen.</p>
        <p class="mono-french">Notre Père, qui es aux cieux, que ton nom soit sanctifié,<br>
        que ton règne vienne,<br>
        que ta volonté soit faite sur la terre comme au ciel.<br>
        Donne-nous aujourd'hui notre pain de ce jour.<br>
        Pardonne-nous nos offenses, comme nous pardonnons aussi à ceux qui nous ont offensés.<br>
        Et ne nous laisse pas entrer en tentation, mais délivre-nous du Mal. Amen.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 10. Oraison conclusive <span class="mono-var-tag">Variable</span></h3>
      <div class="mono-section-body">
        <p>Oraison liée au temps liturgique ou à la fête du jour.</p>
      </div>
    </div>

    <div class="mono-section">
      <h3 class="mono-section-title"><i class="fa-solid fa-chevron-right mono-chev"></i> 11. Conclusion <span class="mono-fixed-tag">Toujours identique</span></h3>
      <div class="mono-section-body">
        <p class="mono-latin">℣. Benedicámus Dómino.</p>
        <p class="mono-french">℣. Bénissons le Seigneur.</p>
        <p class="mono-latin">℟. Deo grátias.</p>
        <p class="mono-french">℟. Nous rendons grâce à Dieu.</p>
      </div>
    </div>

    <div class="mono-resources">
      <h3><i class="fa-solid fa-link"></i> Pour aller plus loin</h3>
      <ul>
        <li><a href="https://abbayedetriors.com" target="_blank" rel="noopener">Abbaye Notre-Dame de Triors</a> — la communauté qui chante cet office</li>
        <li><a href="https://www.solesmes.com" target="_blank" rel="noopener">Abbaye de Solesmes</a> — référence du chant grégorien et éditeur du <em>Liber Hymnarius</em></li>
        <li><em>Liber Hymnarius</em> et <em>Antiphonale Monasticum</em> (Solesmes) — livres de chant officiels, disponibles à l'achat</li>
        <li><a href="https://www.aelf.org" target="_blank" rel="noopener">AELF</a> — pour le bréviaire <strong>romain</strong> (différent du monastique)</li>
      </ul>
    </div>
  `;
}

// Modal dédiée à l'installation PWA (séparée du À propos pour clarté).
function initInstallModal() {
  const overlay = document.getElementById('install-overlay');
  const modal   = document.getElementById('install-modal');
  const closeBtn = document.getElementById('install-close');
  const instrEl = document.getElementById('install-instructions');
  const promptBtn = document.getElementById('install-prompt-btn');
  if (!modal) return;

  function open() {
    overlay?.classList.remove('hidden');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    _renderInstructions();
  }
  function close() {
    overlay?.classList.add('hidden');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function _renderInstructions() {
    if (!instrEl) return;
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
    const isAndroid = /android/i.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                      || window.navigator.standalone === true;

    if (isStandalone) {
      instrEl.innerHTML = `
        <div class="install-success">
          <i class="fa-solid fa-circle-check"></i>
          <strong>L'application est déjà installée</strong>
          <p>Vous y accédez actuellement via l'écran d'accueil. Rien à faire de plus !</p>
        </div>`;
      if (promptBtn) promptBtn.style.display = 'none';
      return;
    }

    if (_installPrompt) {
      // Android / Chrome desktop : prompt natif disponible
      instrEl.innerHTML = `
        <p class="install-platform"><i class="fa-solid fa-circle-info"></i> Votre navigateur supporte l'installation directe.</p>
        <p>Cliquez sur le bouton ci-dessous pour ajouter PrionsEnLigne à votre écran d'accueil.</p>`;
      if (promptBtn) promptBtn.style.display = '';
      return;
    }

    if (isIOS) {
      instrEl.innerHTML = `
        <p class="install-platform"><i class="fa-brands fa-apple"></i> Sur iPhone / iPad (Safari)</p>
        <ol class="install-steps">
          <li>Appuyez sur le bouton <strong>Partager</strong> <i class="fa-solid fa-arrow-up-from-bracket"></i> en bas de Safari</li>
          <li>Faites défiler et choisissez <strong>« Sur l'écran d'accueil »</strong></li>
          <li>Confirmez avec <strong>« Ajouter »</strong> en haut à droite</li>
        </ol>
        <p class="install-note">Astuce : si vous utilisez un autre navigateur (Chrome, Firefox…), ouvrez d'abord cette page dans Safari pour installer.</p>`;
      if (promptBtn) promptBtn.style.display = 'none';
      return;
    }

    if (isAndroid) {
      instrEl.innerHTML = `
        <p class="install-platform"><i class="fa-brands fa-android"></i> Sur Android (Chrome / Edge / Brave)</p>
        <ol class="install-steps">
          <li>Ouvrez le menu de votre navigateur <strong>⋮</strong> en haut à droite</li>
          <li>Choisissez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong></li>
          <li>Confirmez avec <strong>« Installer »</strong></li>
        </ol>`;
      if (promptBtn) promptBtn.style.display = 'none';
      return;
    }

    // Desktop fallback
    const isFirefox = /firefox/i.test(ua);
    const isSafari  = /safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua);
    if (isFirefox) {
      instrEl.innerHTML = `
        <p class="install-platform"><i class="fa-brands fa-firefox-browser"></i> Sur Firefox</p>
        <p>Firefox ne propose pas d'installation native pour les applications web. Vous pouvez :</p>
        <ol class="install-steps">
          <li>Créer un <strong>raccourci de bureau</strong> classique vers prionsenligne.fr</li>
          <li>Ou utiliser <strong>Chrome ou Edge</strong> pour une installation en un clic</li>
        </ol>`;
    } else if (isSafari) {
      instrEl.innerHTML = `
        <p class="install-platform"><i class="fa-brands fa-safari"></i> Sur Safari (Mac)</p>
        <p>Depuis macOS Sonoma, Safari permet d'installer les applications web :</p>
        <ol class="install-steps">
          <li>Menu <strong>Fichier</strong> → <strong>« Ajouter au Dock »</strong></li>
          <li>Confirmez l'ajout</li>
        </ol>
        <p class="install-note">Sur macOS plus ancien : créez un raccourci classique, ou utilisez Chrome/Edge.</p>`;
    } else {
      // Chrome / Edge / Brave / Opera desktop
      instrEl.innerHTML = `
        <p class="install-platform"><i class="fa-solid fa-desktop"></i> Sur ordinateur (Chrome / Edge / Brave)</p>
        <p class="install-tip"><strong>Le plus rapide :</strong> regardez à droite dans la barre d'adresse. Si vous voyez l'icône <i class="fa-solid fa-circle-down" style="color:#1a2744"></i> ou <strong>⊕</strong>, cliquez dessus → installation en 1 clic.</p>
        <ol class="install-steps">
          <li>Sinon, ouvrez le menu <strong>⋮</strong> en haut à droite</li>
          <li>Cherchez <strong>« Installer PrionsEnLigne »</strong> ou <strong>« Cast, enregistrer et partager → Installer »</strong></li>
          <li>Confirmez avec <strong>« Installer »</strong></li>
        </ol>
        <p class="install-note">💡 Si l'installation directe ne s'est pas proposée auparavant, c'est probablement que vous l'avez déjà refusée ou installée. Vous pouvez quand même l'installer manuellement via le menu ⋮.</p>`;
    }
    if (promptBtn) promptBtn.style.display = 'none';
  }

  promptBtn?.addEventListener('click', async () => {
    if (!_installPrompt) return;
    const r = await _installPrompt.prompt();
    if (r?.outcome === 'accepted') {
      _installPrompt = null;
      close();
    }
  });

  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });

  window._openInstallModal = open;
}


/* ────────────────────────────────────────────
   10. CHANT GRÉGORIEN — Lecteur ambiant
──────────────────────────────────────────────*/
function initGregorianPlayer() {
  const audio = document.getElementById('greg-audio');
  const btn   = document.getElementById('greg-btn');
  const svgEl = btn?.querySelector('.greg-svg');
  const label = btn?.querySelector('.greg-label');
  if (!audio || !btn) return;

  const STREAM   = 'https://esperance.streamakaci.com/gregorien.mp3';
  const FALLBACK = 'https://radio-esperance.fr';
  const LS_KEY   = 'pel_greg'; // partagé avec index.html

  const SVG_MUSIC = '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
  const SVG_PAUSE = '<line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/>';
  const SVG_EXT   = '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>';

  let playing = false;
  let failed  = false;
  let loadTimer = null;

  audio.src    = STREAM;
  audio.volume = 0.28;

  function setUI(on) {
    playing = on;
    localStorage.setItem(LS_KEY, on ? '1' : '0');
    btn.classList.toggle('greg-playing', on);
    if (svgEl) svgEl.innerHTML = on ? SVG_PAUSE : SVG_MUSIC;
    if (label) label.textContent = on ? 'Pause' : 'Grégorien';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function showFallback() {
    failed = true;
    clearTimeout(loadTimer);
    localStorage.setItem(LS_KEY, '0');
    btn.classList.remove('greg-playing');
    if (svgEl) svgEl.innerHTML = SVG_EXT;
    if (label) label.textContent = 'Grégorien ↗';
    btn.title = 'Ouvrir Radio Espérance';
    btn.onclick = () => window.open(FALLBACK, '_blank', 'noopener');
  }

  audio.addEventListener('error',   () => { clearTimeout(loadTimer); showFallback(); });
  audio.addEventListener('playing', () => { clearTimeout(loadTimer); setUI(true); });

  btn.addEventListener('click', () => {
    if (failed) { window.open(FALLBACK, '_blank', 'noopener'); return; }
    // Cas spécial : autoplay bloqué au reload → un clic relance la lecture
    if (btn.classList.contains('greg-needs-resume')) {
      btn.classList.remove('greg-needs-resume');
      if (svgEl) svgEl.innerHTML = '<circle cx="12" cy="12" r="9" stroke-dasharray="2 3"/>';
      if (label) label.textContent = '…';
      loadTimer = setTimeout(showFallback, 5000);
      audio.play().catch(() => { clearTimeout(loadTimer); showFallback(); });
      return;
    }
    if (playing) {
      clearTimeout(loadTimer);
      audio.pause();
      setUI(false);
    } else {
      if (svgEl) svgEl.innerHTML = '<circle cx="12" cy="12" r="9" stroke-dasharray="2 3"/>';
      if (label) label.textContent = '…';
      loadTimer = setTimeout(showFallback, 5000);
      audio.play().catch(() => { clearTimeout(loadTimer); showFallback(); });
    }
  });

  // ── Reprise automatique si lecture en cours sur l'autre page ──
  if (localStorage.getItem(LS_KEY) === '1') {
    audio.play()
      .then(() => setUI(true))
      .catch(() => {
        // Navigateur a bloqué l'autoplay (politique de sécurité depuis reload)
        // → on conserve l'intention en localStorage et on présente le bouton
        //   dans un état "actif en attente" (un seul clic suffira à relancer)
        btn.classList.add('greg-playing', 'greg-needs-resume');
        if (svgEl) svgEl.innerHTML = SVG_MUSIC;
        if (label) label.textContent = 'Reprendre';
        btn.title = 'Cliquez pour reprendre le chant grégorien';
        btn.setAttribute('aria-pressed', 'false');
        // LS_KEY reste à '1' — l'intention est préservée
      });
  }
}


/* ────────────────────────────────────────────
   11. INIT GLOBAL
──────────────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initDate();
  initCalendar();
  initBreviary();        // délégation → doit être avant ou après, peu importe
  initRadioPlayer();
  initHamburger();
  initDailyPrayer();
  initTodayTimeline();   // génère les items de la timeline AVANT les filtres et badges
  initFilters();         // re-requête le DOM → doit être après initTodayTimeline
  initBadges();          // idem
  initWeek();
  initWelcome();
  initOnboarding();
  initNextOffice();
  initChapelet();
  initChat();
  initInstallBanner();
  initOfflineBanner();
  initAbout();
  initInstallModal();
  initMonasticModal();
  initLatinMassModal();
  initContact();
  initGregorianPlayer();
  initPushModule();
  initDayShare();
  handleDeepLink();      // applique le filtre/onglet issu du hash URL (landing page)

  // ════════════════════════════════════════════════════════════════════
  // PARTAGE — carte « Saint du jour » (Canvas + Web Share API)
  // Génère une belle image partageable (WhatsApp, Insta, Facebook…) qui
  // ramène vers le site. Moteur de bouche-à-oreille, 100 % côté client.
  // ════════════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════════════
  // LECTURE À VOIX HAUTE — Web Speech API (accessibilité personnes âgées /
  // malvoyantes). 100 % navigateur : aucune infra, aucun coût, voix FR
  // intégrée à l'appareil. Bouton « Écouter » → Pause → Reprendre.
  // ════════════════════════════════════════════════════════════════════
  const PelReader = {
    voice: null, queue: [], idx: 0, state: 'idle', btn: null,
    rate: 0.95,
    // Score de qualité d'une voix (plus c'est haut, plus c'est naturel)
    _score(v) {
      const n = (v.name || '') + ' ' + (v.voiceURI || '');
      let s = 0;
      if (/natural|neural|enhanced|premium/i.test(n)) s += 100; // voix neurales
      if (/online/i.test(n))                          s += 60;  // Edge "Online (Natural)"
      if (/google/i.test(n))                          s += 50;  // Chrome "Google français"
      if (/siri/i.test(n))                            s += 50;  // iOS Siri
      if (!v.localService)                            s += 40;  // voix réseau = souvent neurales
      if (/amélie|amelie|thomas|aurélie|aurelie|denise|henri|éloïse|eloise|charlotte/i.test(n)) s += 25;
      if (/hortense|paul\b|julie|espeak|compact/i.test(n)) s -= 40; // anciennes voix robotiques
      return s;
    },
    // Liste des voix FR triées par qualité décroissante
    frVoices() {
      if (!this.supported()) return [];
      const vs = (window.speechSynthesis.getVoices() || []).filter(v => /^fr/i.test(v.lang));
      return vs.sort((a, b) => this._score(b) - this._score(a));
    },
    supported() { return typeof window !== 'undefined' && 'speechSynthesis' in window; },
    init() {
      if (!this.supported()) return;
      const pick = () => {
        const ranked = this.frVoices();
        if (ranked.length === 0) return;
        // Respecte le choix sauvegardé, sinon meilleure voix auto
        let saved = null;
        try { saved = localStorage.getItem('pel.voiceURI'); } catch (_) {}
        try { const r = localStorage.getItem('pel.voiceRate'); if (r) this.rate = parseFloat(r) || this.rate; } catch (_) {}
        this.voice = (saved && ranked.find(v => v.voiceURI === saved)) || ranked[0];
      };
      pick();
      try { window.speechSynthesis.onvoiceschanged = pick; } catch (_) {}
    },
    setVoice(uri) {
      const v = this.frVoices().find(x => x.voiceURI === uri);
      if (v) { this.voice = v; try { localStorage.setItem('pel.voiceURI', uri); } catch (_) {} }
    },
    setRate(r) {
      this.rate = Math.max(0.6, Math.min(1.3, parseFloat(r) || 0.95));
      try { localStorage.setItem('pel.voiceRate', String(this.rate)); } catch (_) {}
    },
    // Découpe en phrases pour fiabilité (évite la coupure à ~15 s de Chrome)
    _chunk(text) {
      const clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (!clean) return [];
      return clean.match(/[^.!?…:;]+[.!?…:;]*/g) || [clean];
    },
    read(text, btn) {
      if (!this.supported()) return;
      this.stop();
      this.queue = this._chunk(text);
      if (this.queue.length === 0) return;
      this.idx = 0; this.btn = btn || null; this.state = 'playing';
      this._speakNext();
      this._sync();
    },
    _speakNext() {
      if (this.idx >= this.queue.length) { this.state = 'idle'; this._sync(); return; }
      const u = new SpeechSynthesisUtterance(this.queue[this.idx]);
      if (this.voice) u.voice = this.voice;
      u.lang = 'fr-FR'; u.rate = this.rate;
      u.onend = () => { if (this.state !== 'idle') { this.idx++; this._speakNext(); } };
      u.onerror = () => { if (this.state !== 'idle') { this.idx++; this._speakNext(); } };
      try { window.speechSynthesis.speak(u); } catch (_) {}
    },
    toggle(text, btn) {
      if (!this.supported()) return;
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      else this.read(text, btn);
    },
    pause() { if (this.state === 'playing') { try { window.speechSynthesis.pause(); } catch (_) {} this.state = 'paused'; this._sync(); } },
    resume() { if (this.state === 'paused') { try { window.speechSynthesis.resume(); } catch (_) {} this.state = 'playing'; this._sync(); } },
    stop() { try { window.speechSynthesis.cancel(); } catch (_) {} this.state = 'idle'; this._sync(); },
    // Met à jour l'apparence du bouton selon l'état
    _sync() {
      const b = this.btn;
      if (!b) return;
      const icon = b.querySelector('i');
      const label = b.querySelector('span');
      b.classList.toggle('reading', this.state === 'playing');
      b.classList.toggle('paused', this.state === 'paused');
      if (this.state === 'playing') {
        if (icon) icon.className = 'fa-solid fa-pause';
        if (label) label.textContent = 'Pause';
      } else if (this.state === 'paused') {
        if (icon) icon.className = 'fa-solid fa-play';
        if (label) label.textContent = 'Reprendre';
      } else {
        if (icon) icon.className = 'fa-solid fa-volume-high';
        if (label) label.textContent = 'Écouter';
      }
    },
  };
  PelReader.init();
  window._pelReader = PelReader;

  // Fenêtre de réglages de la voix (choix de la voix + vitesse + test)
  // ── Accessibilité : taille du texte ──
  // Niveaux discrets appliqués via la propriété CSS `zoom` sur la racine.
  // Mémorisé par appareil (localStorage). Cf. script inline dans app.html qui
  // applique la valeur AVANT le rendu pour éviter tout saut visuel.
  const PelTextScale = {
    LEVELS: [1, 1.15, 1.3],
    get() {
      try { return parseFloat(localStorage.getItem('pel.textScale')) || 1; }
      catch (_) { return 1; }
    },
    set(v) {
      v = parseFloat(v) || 1;
      try { localStorage.setItem('pel.textScale', String(v)); } catch (_) {}
      // zoom='' restaure le rendu normal (évite un zoom:1 qui crée un contexte
      // de rendu inutile).
      document.documentElement.style.zoom = v > 1 ? String(v) : '';
    },
  };
  window._pelTextScale = PelTextScale;

  function openVoiceSettings() {
    const reader = window._pelReader;
    const hasVoice = !!reader?.supported();
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let modal = document.getElementById('voice-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'voice-modal';
      modal.className = 'voice-modal hidden';
      modal.innerHTML = `
        <div class="voice-backdrop" data-vc-close></div>
        <div class="voice-panel" role="dialog" aria-modal="true" aria-label="Accessibilité">
          <div class="voice-head">
            <span class="voice-title"><i class="fa-solid fa-universal-access"></i> Accessibilité</span>
            <button class="voice-close" data-vc-close aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="voice-section-label">Taille du texte</div>
          <div class="voice-textsize" id="voice-textsize">
            <button data-scale="1"><span class="ts-a" style="font-size:15px">A</span> Normal</button>
            <button data-scale="1.15"><span class="ts-a" style="font-size:18px">A</span> Grand</button>
            <button data-scale="1.3"><span class="ts-a" style="font-size:22px">A</span> Très grand</button>
          </div>
          <div id="voice-audio-sections">
            <div class="voice-section-label">Vitesse de lecture</div>
            <div class="voice-rates" id="voice-rates">
              <button data-rate="0.8">Lente</button>
              <button data-rate="0.95">Normale</button>
              <button data-rate="1.15">Rapide</button>
            </div>
            <div class="voice-section-label">Voix disponibles <span class="voice-hint">(les plus naturelles en haut)</span></div>
            <div class="voice-list" id="voice-list"></div>
            <button class="voice-test" id="voice-test"><i class="fa-solid fa-play"></i> Tester la voix</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target.closest('[data-vc-close]')) closeVoiceSettings(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeVoiceSettings(); });
      // Test (présent uniquement si la synthèse vocale existe)
      modal.querySelector('#voice-test')?.addEventListener('click', () => {
        window._pelReader?.read('Je vous salue Marie, pleine de grâce, le Seigneur est avec vous.', null);
      });
    }

    // ── Taille du texte (toujours disponible, indépendant de la voix) ──
    const curScale = PelTextScale.get();
    modal.querySelectorAll('#voice-textsize button').forEach(b => {
      b.classList.toggle('active', Math.abs(parseFloat(b.dataset.scale) - curScale) < 0.01);
      b.onclick = () => {
        PelTextScale.set(b.dataset.scale);
        modal.querySelectorAll('#voice-textsize button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
    });

    // ── Sections vocales : masquées si l'appareil n'a pas de synthèse vocale ──
    const audioSections = modal.querySelector('#voice-audio-sections');
    if (audioSections) audioSections.style.display = hasVoice ? '' : 'none';
    if (!hasVoice) {
      modal.classList.remove('hidden');
      document.body.classList.add('voice-modal-open');
      return;
    }
    // Vitesse active
    modal.querySelectorAll('#voice-rates button').forEach(b => {
      b.classList.toggle('active', Math.abs(parseFloat(b.dataset.rate) - reader.rate) < 0.06);
      b.onclick = () => {
        reader.stop();
        reader.setRate(b.dataset.rate);
        modal.querySelectorAll('#voice-rates button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
    });
    // Liste des voix
    const list = modal.querySelector('#voice-list');
    const voices = reader.frVoices();
    if (voices.length === 0) {
      list.innerHTML = '<div class="voice-empty">Aucune voix française détectée sur cet appareil.</div>';
    } else {
      list.innerHTML = voices.map((v, i) => {
        const active = reader.voice && v.voiceURI === reader.voice.voiceURI;
        const quality = reader._score(v) >= 60 ? '<span class="voice-badge">naturelle</span>' : '';
        return `<button class="voice-item${active ? ' active' : ''}" data-uri="${esc(v.voiceURI)}">
          <span class="voice-item-name">${esc(v.name)}</span>${quality}
          ${active ? '<i class="fa-solid fa-check"></i>' : ''}
        </button>`;
      }).join('');
      list.querySelectorAll('.voice-item').forEach(b => {
        b.onclick = () => {
          reader.stop();
          reader.setVoice(b.dataset.uri);
          list.querySelectorAll('.voice-item').forEach(x => { x.classList.remove('active'); const c = x.querySelector('.fa-check'); if (c) c.remove(); });
          b.classList.add('active');
          if (!b.querySelector('.fa-check')) b.insertAdjacentHTML('beforeend', '<i class="fa-solid fa-check"></i>');
          // aperçu auto
          reader.read('Bonjour, voici un aperçu de cette voix.', null);
        };
      });
    }
    modal.classList.remove('hidden');
    document.body.classList.add('voice-modal-open');
  }
  function closeVoiceSettings() {
    const modal = document.getElementById('voice-modal');
    if (!modal) return;
    try { window._pelReader?.stop(); } catch (_) {}
    modal.classList.add('hidden');
    document.body.classList.remove('voice-modal-open');
  }
  window._openVoiceSettings = openVoiceSettings;

  // Fonction GLOBALE réutilisable : génère et partage une carte pour
  // n'importe quel saint. opts = { name, eyebrow, date, btn? }
  function _wrapText(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/);
    const lines = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  // Dessine la carte 1080×1080 → Promise<Blob>
  function _buildSaintCard({ name, eyebrow, date }) {
    const S = 1080;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    const cream = '#f7f3ea', navy = '#1a2744', gold = '#c9a84c', soft = '#6b6357';

    ctx.fillStyle = cream; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = gold; ctx.lineWidth = 4; ctx.strokeRect(48, 48, S - 96, S - 96);
    ctx.lineWidth = 1.5; ctx.strokeRect(64, 64, S - 128, S - 128);

    const cx = S / 2;
    ctx.fillStyle = navy;
    ctx.fillRect(cx - 6, 130, 12, 70);
    ctx.fillRect(cx - 26, 150, 52, 12);
    ctx.strokeStyle = gold; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, 165, 46, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = navy; ctx.textAlign = 'center';
    ctx.font = '600 30px Georgia, serif';
    ctx.fillText('PrionsEnLigne', cx, 268);

    ctx.fillStyle = gold; ctx.font = '700 26px Arial, sans-serif';
    const eb = (eyebrow || 'SAINT DU JOUR').toString().trim().toUpperCase();
    ctx.fillText('★  ' + eb + '  ★', cx, 360);

    const saint = (name || 'Saint du jour').toString().trim();
    ctx.fillStyle = navy;
    let fontSize = 76; ctx.font = `700 ${fontSize}px Georgia, serif`;
    let lines = _wrapText(ctx, saint, S - 220);
    while (lines.length > 3 && fontSize > 42) {
      fontSize -= 8; ctx.font = `700 ${fontSize}px Georgia, serif`;
      lines = _wrapText(ctx, saint, S - 220);
    }
    const lineH = fontSize * 1.18;
    let y = 470 + (3 - lines.length) * 26;
    for (const ln of lines) { ctx.fillText(ln, cx, y); y += lineH; }

    ctx.fillStyle = soft; ctx.font = '400 34px Georgia, serif';
    const d = (date || '').toString().trim();
    if (d && d !== '—') ctx.fillText(d, cx, y + 30);

    ctx.strokeStyle = gold; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 70, 800); ctx.lineTo(cx + 70, 800); ctx.stroke();

    ctx.fillStyle = navy; ctx.font = 'italic 400 32px Georgia, serif';
    ctx.fillText('Prions ensemble, chaque jour', cx, 868);

    ctx.fillStyle = gold; ctx.font = '700 32px Arial, sans-serif';
    ctx.fillText('prionsenligne.fr', cx, 968);

    return new Promise(resolve => c.toBlob(resolve, 'image/png', 0.92));
  }

  async function pelShareSaint(opts) {
    const o = opts || {};
    const name = (o.name || (document.getElementById('js-feast')?.textContent) || 'le saint du jour').trim();
    const eyebrow = o.eyebrow || (document.getElementById('js-feast-type')?.textContent || '').trim() || 'Saint du jour';
    const date = o.date || (document.getElementById('js-date')?.textContent || '').trim();
    const btn = o.btn || null;
    const shareUrl = 'https://prionsenligne.fr/saint-du-jour';
    const shareText = `${name} — prions ensemble aujourd'hui 🙏\n${shareUrl}`;
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'saint';

    if (btn) { btn.disabled = true; btn.classList.add('sharing'); }
    try {
      const blob = await _buildSaintCard({ name, eyebrow, date });
      const file = blob ? new File([blob], `${slug}.png`, { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'PrionsEnLigne', text: shareText });
      } else if (navigator.share) {
        await navigator.share({ title: 'PrionsEnLigne', text: `${name} — prions ensemble aujourd'hui 🙏`, url: shareUrl });
      } else if (blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `${slug}.png`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        try { await navigator.clipboard.writeText(shareUrl); } catch (_) {}
        try { _showPushToast('🖼️ Image téléchargée · lien copié'); } catch (_) {}
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') { try { _showPushToast('⚠️ Partage indisponible'); } catch (_) {} }
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('sharing'); }
    }
  }
  // Exposé pour le calendrier (selectDay) et autres
  window._pelShareSaint = pelShareSaint;

  function initDayShare() {
    const btn = document.getElementById('day-share-btn');
    if (!btn) return;
    btn.addEventListener('click', () => pelShareSaint({ btn }));
  }

  // ════════════════════════════════════════════════════════════════════
  // PUSH NOTIFICATIONS — module client (Web Push API)
  // ════════════════════════════════════════════════════════════════════
  function initPushModule() {
    const SUPPORTED = ('serviceWorker' in navigator) &&
                      ('PushManager' in window) &&
                      ('Notification' in window);

    // Convertit la clé VAPID publique (base64url) en Uint8Array pour pushManager.subscribe
    function urlBase64ToUint8Array(b64) {
      const padding = '='.repeat((4 - (b64.length % 4)) % 4);
      const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(base64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    }

    // Helper : décalage UTC↔Paris à un instant donné (en ms)
    function _parisOffsetMs(date) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Paris',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
      }).formatToParts(date);
      const g = t => parseInt(parts.find(p => p.type === t)?.value, 10);
      const asLocalUTC = Date.UTC(g('year'), g('month') - 1, g('day'),
                                  g('hour'), g('minute'), g('second'));
      return asLocalUTC - date.getTime();
    }

    // Convertit (date Paris naïf + HH:MM Paris) → timestamp UTC (ms)
    function _parisToUTCms(date, hhmm) {
      const [h, m] = String(hhmm).split(':').map(Number);
      const candidate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), h, m || 0);
      const off = _parisOffsetMs(new Date(candidate));
      return candidate - off;
    }

    // Identifiant stable d'un office (slot) — utilisé pour les abonnements
    // individuels par cloche dans l'agenda. Format: "{type}|{slug-label}|{HHMM}".
    // Même office récurrent (ex: Chapelet Lourdes 15h30) = même ID sur tous les jours.
    function _slotId(slot) {
      const firstT = (slot.entries[0]?.t || '0:00').replace(':', '').padStart(4, '0');
      const slug = String(slot.label || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        .slice(0, 60);
      return `${slot.type}|${slug}|${firstT}`;
    }

    // Calcule les prochains pushes selon les office_ids abonnés. Retourne ≤50 entrées.
    function computeNextPushes(prefs) {
      const officeIds = new Set(Array.isArray(prefs?.office_ids) ? prefs.office_ids : []);
      if (officeIds.size === 0) return [];
      const leadMin = Math.max(1, Math.min(60, parseInt(prefs.lead_min, 10) || 10));

      const nowMs = Date.now();
      const horizon = nowMs + 7 * 24 * 3600 * 1000;
      const out = [];
      const start = getParisDate ? getParisDate() : new Date();
      for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        let slots = [];
        try { slots = getDaySchedule(date) || []; } catch (_) { continue; }
        for (const slot of slots) {
          if (!officeIds.has(_slotId(slot))) continue;
          for (const entry of slot.entries) {
            const officeUTC = _parisToUTCms(date, entry.t);
            const pushAt = officeUTC - leadMin * 60 * 1000;
            if (pushAt <= nowMs + 60_000) continue;
            if (pushAt >= horizon) continue;
            out.push({
              at:    new Date(pushAt).toISOString(),
              label: slot.label,
              body:  `Diffusion à ${entry.tl} (heure de Paris) · dans ${leadMin} min`,
              url:   '/agenda',
              type:  slot.type,
              tag:   `pel-${slot.type}-${entry.t}-${date.toDateString()}`,
            });
          }
        }
      }
      out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      return out.slice(0, 50);
    }

    // État
    let _swReg = null;
    let _sub   = null;
    let _ready = SUPPORTED;
    let _officeIdsCache = new Set();    // IDs des offices auxquels l'user est abonné
    let _prefsCache     = { lead_min: 10, office_ids: [] };
    let _toggleQueue    = Promise.resolve();  // sérialise les UPDATEs concurrents

    async function _initReg() {
      if (!_ready) return null;
      if (!_swReg) {
        try { _swReg = await navigator.serviceWorker.ready; }
        catch (_) { _ready = false; return null; }
      }
      return _swReg;
    }
    async function _currentSub() {
      const reg = await _initReg();
      if (!reg) return null;
      try { return await reg.pushManager.getSubscription(); }
      catch (_) { return null; }
    }

    async function getStatus() {
      if (!SUPPORTED) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      const sub = await _currentSub();
      if (!sub) return 'unsubscribed';
      return 'subscribed';
    }

    async function _vapidPublic() {
      try {
        const r = await fetch('/api/config', { credentials: 'omit' });
        const cfg = r.ok ? await r.json() : {};
        return cfg.vapidPublic || '';
      } catch (_) { return ''; }
    }

    async function subscribe(prefs) {
      if (!SUPPORTED) throw new Error('Notifications non supportées par ce navigateur.');
      const reg = await _initReg();
      if (!reg) throw new Error('Service Worker indisponible.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Permission refusée. Activez les notifications dans les paramètres du navigateur.');
      const vapid = await _vapidPublic();
      if (!vapid) throw new Error('Clé VAPID non configurée côté serveur.');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid),
        });
      }
      _sub = sub;
      await syncPrefs(prefs);
      return sub;
    }

    // Upsert dans push_subscriptions (Supabase RLS : user_id = auth.uid())
    async function syncPrefs(prefs) {
      const sb = window._sbClient;
      const user = window._pelUser;
      if (!sb || !user) throw new Error('Vous devez être connecté pour activer les notifications.');
      const sub = _sub || await _currentSub();
      if (!sub) throw new Error('Aucune souscription active.');
      const json = sub.toJSON();
      const userTz = (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; }
        catch (_) { return 'Europe/Paris'; }
      })();
      const safePrefs = {
        lead_min:  Math.max(1, Math.min(60, parseInt(prefs.lead_min, 10) || 10)),
        types:     Array.isArray(prefs.types) ? prefs.types.slice(0, 10) : [],
        countries: Array.isArray(prefs.countries) ? prefs.countries.slice(0, 20) : [],
      };
      const nextPushes = computeNextPushes(safePrefs);
      const row = {
        user_id:     user.id,
        endpoint:    json.endpoint,
        p256dh:      json.keys?.p256dh || '',
        auth_secret: json.keys?.auth   || '',
        user_agent:  navigator.userAgent.slice(0, 240),
        user_tz:     userTz,
        ...safePrefs,
        next_pushes: nextPushes,
        last_sync:   new Date().toISOString(),
      };
      const { error } = await sb.from('push_subscriptions')
        .upsert(row, { onConflict: 'endpoint' });
      if (error) throw new Error(error.message || 'Erreur de sauvegarde.');
      return { row, nextPushes };
    }

    async function unsubscribe() {
      const sub = await _currentSub();
      if (sub) {
        const sb = window._sbClient;
        if (sb) {
          try { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); } catch (_) {}
        }
        try { await sub.unsubscribe(); } catch (_) {}
      }
      _sub = null;
    }

    // Lecture des prefs sauvegardées (depuis Supabase) + mise à jour du cache local
    async function readPrefs() {
      const sb = window._sbClient;
      const user = window._pelUser;
      if (!sb || !user) return null;
      const sub = await _currentSub();
      if (!sub) return null;
      const { data } = await sb.from('push_subscriptions')
        .select('lead_min, office_ids')
        .eq('endpoint', sub.endpoint).maybeSingle();
      if (data) {
        _prefsCache = {
          lead_min: data.lead_min || 10,
          office_ids: Array.isArray(data.office_ids) ? data.office_ids : [],
        };
        _officeIdsCache = new Set(_prefsCache.office_ids);
      }
      return data || null;
    }

    function isOfficeSubscribed(slot) {
      if (!slot) return false;
      return _officeIdsCache.has(_slotId(slot));
    }
    function getSubscribedCount() { return _officeIdsCache.size; }
    function getSlotId(slot) { return _slotId(slot); }

    // Bascule l'abonnement à un office. Auto-subscribe si pas encore activé.
    // Retourne { subscribed: bool, total: int } ou throw.
    function toggleOffice(slot) {
      const id = _slotId(slot);
      // Sérialise les toggles pour éviter les writes concurrents qui s'écrasent
      _toggleQueue = _toggleQueue.then(() => _toggleOfficeImpl(id, slot)).catch(err => {
        console.error('[push] toggleOffice error:', err);
        throw err;
      });
      return _toggleQueue;
    }
    async function _toggleOfficeImpl(id, slot) {
      const sb = window._sbClient;
      const user = window._pelUser;
      if (!sb || !user) throw new Error('Connectez-vous pour activer les notifications.');
      if (!SUPPORTED) throw new Error('Notifications non supportées par ce navigateur.');

      // Auto-subscribe (1ère fois) : demande la permission + crée la souscription PushManager
      let sub = await _currentSub();
      if (!sub) {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error('Permission refusée par le navigateur.');
        const vapid = await _vapidPublic();
        if (!vapid) throw new Error('Clé VAPID non configurée côté serveur.');
        const reg = await _initReg();
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid),
        });
        _sub = sub;
      }

      // Toggle local
      const wasSubscribed = _officeIdsCache.has(id);
      if (wasSubscribed) _officeIdsCache.delete(id);
      else _officeIdsCache.add(id);
      _prefsCache.office_ids = [..._officeIdsCache];

      // Recompute next_pushes + UPSERT
      const nextPushes = computeNextPushes(_prefsCache);
      const userTz = (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; }
        catch (_) { return 'Europe/Paris'; }
      })();
      const json = sub.toJSON();
      const row = {
        user_id:     user.id,
        endpoint:    json.endpoint,
        p256dh:      json.keys?.p256dh || '',
        auth_secret: json.keys?.auth   || '',
        user_agent:  navigator.userAgent.slice(0, 240),
        user_tz:     userTz,
        lead_min:    _prefsCache.lead_min,
        office_ids:  _prefsCache.office_ids,
        next_pushes: nextPushes,
        last_sync:   new Date().toISOString(),
      };
      const { error } = await sb.from('push_subscriptions')
        .upsert(row, { onConflict: 'endpoint' });
      if (error) {
        // Rollback local si l'écriture a échoué
        if (wasSubscribed) _officeIdsCache.add(id);
        else _officeIdsCache.delete(id);
        _prefsCache.office_ids = [..._officeIdsCache];
        throw new Error(error.message || 'Erreur de sauvegarde.');
      }
      return { subscribed: !wasSubscribed, total: _officeIdsCache.size };
    }

    window._pelPush = {
      SUPPORTED, getStatus,
      subscribe, unsubscribe, syncPrefs, readPrefs, computeNextPushes,
      isOfficeSubscribed, toggleOffice, getSubscribedCount, getSlotId,
    };

    // Au load : si déjà abonné, on rafraîchit silencieusement la liste de pushes
    // (couvre le cas où l'utilisateur ouvre l'app après plusieurs jours).
    setTimeout(async () => {
      try {
        const sub = await _currentSub();
        if (!sub) return;
        const prefs = await readPrefs();
        if (!prefs) return;
        await syncPrefs(prefs);
      } catch (_) { /* silent */ }
    }, 3000);
  }

  // Charge les overrides de planning depuis Supabase, puis rafraîchit les vues
  // qui dépendent du planning (timeline du jour + semaine + prochain office).
  (async function reloadScheduleViews() {
    // Attend que le client Supabase soit prêt (init asynchrone par auth.js)
    let tries = 0;
    while (!window._sbClient && tries < 20) {
      await new Promise(r => setTimeout(r, 150));
      tries++;
    }
    if (!window._sbClient) return;
    await loadScheduleOverrides(true);
    // Re-render des vues
    try { initTodayTimeline(); } catch (_) {}
    try { initFilters(); } catch (_) {}
    try { initBadges(); } catch (_) {}
    try { initWeek(); } catch (_) {}
    document.dispatchEvent(new CustomEvent('pel:schedule-updated'));
  })();
});
