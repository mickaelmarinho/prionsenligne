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
  document.querySelectorAll('.pf').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pf').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const type = btn.dataset.filter;
      document.querySelectorAll('.tl-item').forEach(item => {
        if (type === 'all' || item.dataset.type === type) {
          item.style.display = '';
          item.style.animation = 'fadeIn .2s ease';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });
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

  // Highlight dynamique du jour courant dans le calendrier du mois affiché
  // + mise à jour de la fête du jour et de la légende du calendrier
  const todayNum = now.getDate();
  const typeLabels = { ordinaire: 'Temps ordinaire', memoire: 'Mémoire', fete: 'Fête liturgique', solennite: 'Solennité' };
  document.querySelectorAll('.cal-day:not(.other)').forEach(day => {
    const numEl = day.querySelector('.cal-num');
    if (!numEl) return;
    const isToday = parseInt(numEl.textContent) === todayNum;
    day.classList.toggle('today', isToday);
    if (isToday) {
      const saintEl  = document.getElementById('js-feast');
      const typeEl   = document.getElementById('js-feast-type');
      const legendEl = document.querySelector('.today-legend');
      if (saintEl)  saintEl.textContent  = day.dataset.saint || '';
      if (typeEl)   typeEl.textContent   = typeLabels[day.dataset.type] || '';
      if (legendEl) { legendEl.dataset.day = String(todayNum); legendEl.textContent = ' Aujourd’hui'; }
    }
  });
}


/* ────────────────────────────────────────────
   4. CALENDRIER — clic sur un jour
──────────────────────────────────────────────*/
function initCalendar() {
  const days   = document.querySelectorAll('.cal-day:not(.other)');
  const detail = document.getElementById('day-detail');
  const ddDate = document.getElementById('dd-date');
  const ddType = document.getElementById('dd-type');
  const ddSaint= document.getElementById('dd-saint');
  const ddDesc = document.getElementById('dd-desc');

  if (!detail) return;

  const typeLabels = {
    ordinaire: 'Temps ordinaire',
    memoire:   'Mémoire',
    fete:      'Fête liturgique',
    solennite: 'Solennité',
  };

  days.forEach(day => {
    day.addEventListener('click', () => {
      ddDate.textContent  = day.dataset.date  || '';
      ddType.textContent  = typeLabels[day.dataset.type] || day.dataset.type || '';
      ddType.className    = 'dd-type ' + (day.dataset.type || 'ordinaire');
      ddSaint.textContent = day.dataset.saint || '';
      ddDesc.textContent  = day.dataset.desc  || '';

      detail.classList.remove('hidden');
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      days.forEach(d => d.style.outline = '');
      day.style.outline = '2px solid #c9a84c';
    });
  });
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

function openBreviary(prayerKey) {
  const panel   = document.getElementById('breviary-panel');
  const overlay = document.getElementById('breviary-overlay');
  const nameEl  = document.getElementById('brev-prayer-name');
  const dateEl  = document.getElementById('brev-date');
  const bodyEl  = document.getElementById('brev-body');

  if (!panel) return;

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
    matin:    null,
    chapelet: null,
  };

  const aelfOffice = aelfMap[prayerKey];

  if (aelfOffice) {
    const d = getParisDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    const url = `https://api.aelf.org/v1/${aelfOffice}/${y}/${m}/${j}/france`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error('API AELF non disponible');
        return r.json();
      })
      .then(data => renderAelfData(data, prayerKey, bodyEl))
      .catch(() => renderFallback(prayerKey, bodyEl));
  } else {
    setTimeout(() => renderFallback(prayerKey, bodyEl), 600);
  }
}

function renderAelfData(data, prayerKey, bodyEl) {
  let html = '';

  const office = data.laudes || data.messes || data.vepres || data.complies || null;

  if (!office || !office.informations) {
    renderFallback(prayerKey, bodyEl);
    return;
  }

  const info = office.informations;
  if (info.jour_liturgique_nom) {
    html += `<div class="brev-section">
      <div class="brev-section-title">Aujourd'hui</div>
      <div class="brev-text"><p>${info.jour_liturgique_nom}</p></div>
    </div>`;
  }

  const lectures = office.messes || office.laudes || office.vepres || office.complies || [];
  const sections = Array.isArray(lectures) ? lectures : Object.values(lectures);

  sections.forEach(section => {
    if (!section || typeof section !== 'object') return;
    const titre = section.titre || section.type || '';
    const texte = section.texte || '';
    const ref   = section.ref   || '';

    if (!texte) return;

    html += `<div class="brev-section">
      ${titre ? `<div class="brev-section-title">${titre}</div>` : ''}
      <div class="brev-text">${texte.replace(/\n/g, '<br>')}</div>
      ${ref ? `<span class="brev-ref">${ref}</span>` : ''}
    </div>`;
  });

  if (!html) {
    renderFallback(prayerKey, bodyEl);
    return;
  }

  html += `<p class="brev-aelf-link">Textes fournis par <a href="https://www.aelf.org" target="_blank" rel="noopener">l'AELF</a> — Association Épiscopale Liturgique Francophone</p>`;
  bodyEl.innerHTML = html;
}

function renderFallback(prayerKey, bodyEl) {
  const data = FALLBACK_TEXTS[prayerKey];
  if (!data) { bodyEl.innerHTML = '<p style="padding:20px;color:#7a756e;">Textes non disponibles.</p>'; return; }

  let html = `<div class="brev-section">
    <div class="brev-section-title">${data.title}</div>
  </div>`;

  data.sections.forEach(s => {
    html += `<div class="brev-section">
      <div class="brev-section-title">${s.heading}</div>
      <div class="brev-text"><p>${s.text.replace(/\n/g, '<br>')}</p></div>
      ${s.ref ? `<span class="brev-ref">${s.ref}</span>` : ''}
    </div>`;
  });

  html += `<p class="brev-aelf-link">
    Texte d'exemple. Les textes officiels du jour seront disponibles<br>
    après autorisation de <a href="https://www.aelf.org/abonnement" target="_blank" rel="noopener">l'AELF</a>.
  </p>`;

  bodyEl.innerHTML = html;
}

function closeBreviary() {
  const panel   = document.getElementById('breviary-panel');
  const overlay = document.getElementById('breviary-overlay');
  if (!panel) return;
  panel.classList.remove('open');
  overlay.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
}

function initBreviary() {
  // Délégation d'événement — capture les boutons générés dynamiquement par initTodayTimeline()
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tl-breviary-btn');
    if (!btn) return;
    openBreviary(btn.dataset.prayer);
  });

  const closeBtn = document.getElementById('brev-close');
  const overlay  = document.getElementById('breviary-overlay');
  if (closeBtn) closeBtn.addEventListener('click', closeBreviary);
  if (overlay)  overlay.addEventListener('click', closeBreviary);

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
    player.classList.remove('visible');
    document.body.classList.remove('player-open');
    setIcon(false);
  }

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play().then(() => setIcon(true)).catch(() => {});
    } else {
      audio.pause();
      setIcon(false);
    }
  });

  closeBtn.addEventListener('click', closePlayer);

  volSlider.addEventListener('input', () => {
    audio.volume = parseFloat(volSlider.value);
  });

  audio.addEventListener('error', () => {
    closePlayer();
    if (currentWeb) window.open(currentWeb, '_blank', 'noopener');
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

  btn?.addEventListener('click',    toggleMenu);
  bnBtn?.addEventListener('click',  toggleMenu);
  overlay?.addEventListener('click', closeMenu);

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
    const slots  = WEEK_SCHEDULE[dow] ?? WEEK_SCHEDULE.ordinary;

    let found = null;
    outer: for (const slot of slots) {
      for (const entry of slot.entries) {
        const [h, m] = entry.t.split(':').map(Number);
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
    if (timeEl)      timeEl.textContent      = found.entry.tl;
    if (countdownEl) countdownEl.textContent = countdown;
    if (srcsEl)      srcsEl.textContent      = srcNames;
  }

  update();
  setInterval(update, 60_000);
}


/* ────────────────────────────────────────────
   8c. WIDGET — CHAPELET NUMÉRIQUE
──────────────────────────────────────────────*/

function initChapelet() {
  const fab     = document.getElementById('chapelet-fab');
  const modal   = document.getElementById('chapelet-modal');
  const closeBtn= document.getElementById('ch-close');
  const tapBtn  = document.getElementById('ch-tap');
  const resetBtn= document.getElementById('ch-reset');
  if (!fab || !modal) return;

  // Mystères selon le jour (tradition catholique)
  const DOW_KEY  = {0:'glorieux',1:'joyeux',2:'douloureux',3:'glorieux',4:'lumineux',5:'douloureux',6:'joyeux'};
  const MYST = {
    joyeux:    { name:'Mystères Joyeux',     list:["L'Annonciation","La Visitation","La Nativité","La Présentation au Temple","Le Recouvrement au Temple"] },
    douloureux:{ name:'Mystères Douloureux', list:["L'Agonie à Gethsémani","La Flagellation","Le Couronnement d'épines","Le Portement de Croix","La Crucifixion et la Mort"] },
    lumineux:  { name:'Mystères Lumineux',   list:["Le Baptême de Jésus","Les Noces de Cana","L'Annonce du Royaume","La Transfiguration","L'Institution de l'Eucharistie"] },
    glorieux:  { name:'Mystères Glorieux',   list:["La Résurrection","L'Ascension","La Pentecôte","L'Assomption de Marie","Le Couronnement de Marie"] },
  };

  const mystery = MYST[DOW_KEY[getParisDate().getDay()]];

  // Séquence : intro (6 pas) + 5 décades × 12 pas = 66 pas au total
  //   Intro : Je crois en Dieu · Notre Père · JvsM ×3 · Gloire au Père
  //   Décades : Notre Père + 10 Je vous salue Marie + Gloire au Père
  const INTRO = 6;
  let step = 0;
  const TOTAL = INTRO + 60; // 66

  function getPrayer(s) {
    if (s === 0) return 'Je crois en Dieu';
    if (s === 1) return 'Notre Père';
    if (s === 2) return 'Je vous salue Marie · 1/3';
    if (s === 3) return 'Je vous salue Marie · 2/3';
    if (s === 4) return 'Je vous salue Marie · 3/3';
    if (s === 5) return 'Gloire au Père';
    const b = (s - INTRO) % 12;
    if (b === 0)  return 'Notre Père';
    if (b === 11) return 'Gloire au Père';
    return `Je vous salue Marie · ${b}/10`;
  }

  function buildBeads() {
    const c = document.getElementById('ch-beads');
    if (!c) return;
    c.innerHTML = '';
    // Rangée d'intro (6 perles) visuellement séparée des décades
    const introRow = document.createElement('div');
    introRow.className = 'ch-decade-dots ch-intro-row';
    for (let b = 0; b < INTRO; b++) {
      const bead = document.createElement('div');
      bead.className = 'ch-bead ch-bead-sp';
      introRow.appendChild(bead);
    }
    c.appendChild(introRow);
    // 5 décades
    for (let d = 0; d < 5; d++) {
      const row = document.createElement('div');
      row.className = 'ch-decade-dots';
      for (let b = 0; b < 12; b++) {
        const bead = document.createElement('div');
        bead.className = 'ch-bead' + (b === 0 || b === 11 ? ' ch-bead-sp' : '');
        row.appendChild(bead);
      }
      c.appendChild(row);
    }
  }

  function render() {
    const el = id => document.getElementById(id);
    if (el('ch-mystery')) el('ch-mystery').textContent = mystery.name;

    if (step < INTRO) {
      if (el('ch-decade-num')) el('ch-decade-num').textContent = 'Introduction';
      if (el('ch-myst-name'))  el('ch-myst-name').textContent  = '';
    } else {
      const decade = Math.floor((step - INTRO) / 12);
      if (el('ch-decade-num')) el('ch-decade-num').textContent = `${decade + 1}ᵉ mystère`;
      if (el('ch-myst-name'))  el('ch-myst-name').textContent  = mystery.list[Math.min(decade, 4)];
    }

    if (el('ch-prayer-txt')) el('ch-prayer-txt').textContent = getPrayer(step);
    if (el('ch-progress'))   el('ch-progress').textContent   = `${step + 1} / ${TOTAL}`;

    modal.querySelectorAll('.ch-bead').forEach((bead, i) => {
      bead.classList.toggle('done',    i < step);
      bead.classList.toggle('current', i === step);
    });

    if (tapBtn) {
      const done = step >= TOTAL - 1;
      tapBtn.innerHTML = done
        ? '<i class="fa-solid fa-check"></i> Chapelet terminé !'
        : '<i class="fa-solid fa-hand-point-up"></i> Suivant';
      tapBtn.disabled = done;
    }
  }

  fab.addEventListener('click', () => {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    buildBeads();
    render();
  });

  const closeModal = () => {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  };

  closeBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  tapBtn?.addEventListener('click',  () => { if (step < TOTAL - 1) { step++; render(); } });
  resetBtn?.addEventListener('click',() => { step = 0; render(); });
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
  // Radio Maria : flux bloqué par CORS sur HTTPS → traité comme lien externe
  rm:  { n: 'Radio Maria',      s: '', w: 'https://www.radiomaria.fr' },
  nd:  { n: 'Radio N-Dame',     s: 'https://windu.radionotredame.net/RadioNotreDame-Fm.mp3', w: 'https://www.radionotredame.net' },
  rcf: { n: 'RCF',              s: '', w: 'https://rcf.fr/radios/ecouter-rcf' },
  esp: { n: 'Espérance',        s: '', w: 'https://radio-esperance.fr' },
  fid: { n: 'Fidélité',         s: '', w: 'https://www.radiofidelite.fr/player/' },
  kto: { n: 'KTO',              s: '', w: 'https://www.ktotv.com' },
  lou: { n: 'Lourdes',          s: '', w: 'https://www.lourdes-france.com/lourdesplus/' },
  vat: { n: 'Vatican News',     s: '', w: 'https://www.vaticannews.va/fr/video.html' },
  // jer (Fraternités de Jérusalem) retiré : pas de retransmission live trouvée
  // sol (Solesmes) retiré : ne diffuse pas en live sur internet
  ndp: { n: 'N-D de Paris',     s: '', w: 'https://www.notredamedeparis.fr/la-cathedrale/en-direct/' },
  ars: { n: 'Sct. d\'Ars',      s: '', w: 'https://www.saintcure-ars.fr' },
};

/*
  WEEK_SCHEDULE : grille horaire par type de jour liturgique.
  Chaque slot → { type, label, entries: [{ t:'HH:MM', tl:'HHhMM', srcs:['clé',...] }] }
  Les jours non définis (Lun=1, Mar=2, Jeu=4) utilisent `ordinary`.
*/
const WEEK_SCHEDULE = {

  // Mar / Jeu — jours ordinaires (Lun : voir clé 1)
  // Sources RM : Vêpres 17h40, Complies 22h, Chapelet 8h30 + 18h (confirmés radiomaria.fr)
  // Sources ND : Vêpres 18h (N-D des Victoires mar-ven), Complies 21h
  ordinary: [
    { type: 'chapelet', label: 'Chapelet de minuit',  entries: [
      { t: '0:00',  tl: '0h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de nuit',    entries: [
      { t: '3:00',  tl: '3h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet en latin',   entries: [
      { t: '5:30',  tl: '5h30',  srcs: ['rm'] },
    ]},
    { type: 'laudes',   label: 'Laudes',             entries: [
      { t: '7:00',  tl: '7h00',  srcs: ['rm', 'nd'] },
    ]},
    { type: 'matin',    label: 'Prière du matin',    entries: [
      { t: '7:30',  tl: '7h30',  srcs: ['rcf'] },
      { t: '8:00',  tl: '8h00',  srcs: ['rm', 'esp'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du matin (avec internautes)',  entries: [
      { t: '8:30',  tl: '8h30',  srcs: ['rm'] },
    ]},
    { type: 'messe',    label: 'Sainte Messe',       entries: [
      { t: '9:15',  tl: '9h15',  srcs: ['lou'] },
      { t: '10:00', tl: '10h00', srcs: ['nd', 'kto'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de Midi',   entries: [
      { t: '12:00', tl: '12h00', srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde', entries: [
      { t: '15:00', tl: '15h00', srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de Lourdes', entries: [
      { t: '15:30', tl: '15h30', srcs: ['rm', 'lou'] },
    ]},
    { type: 'vepres',   label: 'Vêpres',             entries: [
      { t: '17:40', tl: '17h40', srcs: ['rm'] },
      { t: '18:00', tl: '18h00', srcs: ['nd'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du soir (avec auditeurs)',   entries: [
      { t: '18:00', tl: '18h00', srcs: ['rm'] },
    ]},
    { type: 'complies', label: 'Complies',            entries: [
      { t: '21:00', tl: '21h00', srcs: ['nd'] },
      { t: '22:00', tl: '22h00', srcs: ['rm', 'esp'] },
    ]},
  ],

  // Mercredi — Audience papale à Rome
  3: [
    { type: 'chapelet', label: 'Chapelet de minuit',  entries: [
      { t: '0:00',  tl: '0h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de nuit',    entries: [
      { t: '3:00',  tl: '3h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet en latin',   entries: [
      { t: '5:30',  tl: '5h30',  srcs: ['rm'] },
    ]},
    { type: 'laudes',   label: 'Laudes',             entries: [
      { t: '7:00',  tl: '7h00',  srcs: ['rm', 'nd'] },
    ]},
    { type: 'matin',    label: 'Prière du matin',    entries: [
      { t: '7:30',  tl: '7h30',  srcs: ['rcf'] },
      { t: '8:00',  tl: '8h00',  srcs: ['rm', 'esp'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du matin (avec internautes)',  entries: [
      { t: '8:30',  tl: '8h30',  srcs: ['rm'] },
    ]},
    { type: 'messe',    label: 'Sainte Messe',       entries: [
      { t: '9:15',  tl: '9h15',  srcs: ['lou'] },
      { t: '10:00', tl: '10h00', srcs: ['nd'] },
    ]},
    { type: 'messe',    label: 'Audience papale',    entries: [
      { t: '10:30', tl: '10h30', srcs: ['vat', 'kto'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de Midi',   entries: [
      { t: '12:00', tl: '12h00', srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde', entries: [
      { t: '15:00', tl: '15h00', srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de Lourdes', entries: [
      { t: '15:30', tl: '15h30', srcs: ['rm', 'lou'] },
    ]},
    { type: 'vepres',   label: 'Vêpres',             entries: [
      { t: '17:40', tl: '17h40', srcs: ['rm'] },
      { t: '18:00', tl: '18h00', srcs: ['nd'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du soir (avec auditeurs)',   entries: [
      { t: '18:00', tl: '18h00', srcs: ['rm'] },
    ]},
    { type: 'complies', label: 'Complies',            entries: [
      { t: '21:00', tl: '21h00', srcs: ['nd'] },
      { t: '22:00', tl: '22h00', srcs: ['rm', 'esp'] },
    ]},
  ],

  // Vendredi — Chapelet de la Divine Miséricorde (15h)
  5: [
    { type: 'chapelet', label: 'Chapelet de minuit',              entries: [
      { t: '0:00',  tl: '0h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de nuit',                entries: [
      { t: '3:00',  tl: '3h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet en latin',               entries: [
      { t: '5:30',  tl: '5h30',  srcs: ['rm'] },
    ]},
    { type: 'laudes',   label: 'Laudes',                         entries: [
      { t: '7:00',  tl: '7h00',  srcs: ['rm', 'nd'] },
    ]},
    { type: 'matin',    label: 'Prière du matin',                entries: [
      { t: '7:30',  tl: '7h30',  srcs: ['rcf'] },
      { t: '8:00',  tl: '8h00',  srcs: ['rm', 'esp'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du matin (avec internautes)',              entries: [
      { t: '8:30',  tl: '8h30',  srcs: ['rm'] },
    ]},
    { type: 'messe',    label: 'Sainte Messe',                   entries: [
      { t: '9:15',  tl: '9h15',  srcs: ['lou'] },
      { t: '10:00', tl: '10h00', srcs: ['nd', 'kto'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de Midi',               entries: [
      { t: '12:00', tl: '12h00', srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde',     entries: [
      { t: '15:00', tl: '15h00', srcs: ['rm', 'fid'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de Lourdes',            entries: [
      { t: '15:30', tl: '15h30', srcs: ['rm', 'lou'] },
    ]},
    { type: 'vepres',   label: 'Vêpres',                         entries: [
      { t: '17:40', tl: '17h40', srcs: ['rm'] },
      { t: '18:00', tl: '18h00', srcs: ['nd'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du soir (avec auditeurs)',               entries: [
      { t: '18:00', tl: '18h00', srcs: ['rm'] },
    ]},
    { type: 'complies', label: 'Complies',                       entries: [
      { t: '21:00', tl: '21h00', srcs: ['nd'] },
      { t: '22:00', tl: '22h00', srcs: ['rm', 'esp', 'fid'] },
    ]},
  ],

  // Samedi — Jour marial, Vêpres du dimanche anticipées
  // ND : Vêpres anticipées 17h (N-D des Victoires samedi)
  6: [
    { type: 'chapelet', label: 'Chapelet de minuit',   entries: [
      { t: '0:00',  tl: '0h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de nuit',     entries: [
      { t: '3:00',  tl: '3h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet en latin',    entries: [
      { t: '5:30',  tl: '5h30',  srcs: ['rm'] },
    ]},
    { type: 'laudes',   label: 'Laudes',              entries: [
      { t: '7:00',  tl: '7h00',  srcs: ['rm', 'nd'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du matin (avec internautes)',   entries: [
      { t: '8:30',  tl: '8h30',  srcs: ['rm'] },
    ]},
    { type: 'messe',    label: 'Sainte Messe',        entries: [
      { t: '10:00', tl: '10h00', srcs: ['nd', 'kto', 'ars'] },
    ]},
    { type: 'chapelet', label: 'Chapelet marial',     entries: [
      { t: '12:00', tl: '12h00', srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde', entries: [
      { t: '15:00', tl: '15h00', srcs: ['rm', 'fid'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de Lourdes', entries: [
      { t: '15:30', tl: '15h30', srcs: ['rm', 'lou'] },
    ]},
    { type: 'vepres',   label: 'Vêpres du dimanche', entries: [
      { t: '17:00', tl: '17h00', srcs: ['nd'] },
      { t: '17:40', tl: '17h40', srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du soir (avec auditeurs)',    entries: [
      { t: '18:00', tl: '18h00', srcs: ['rm'] },
    ]},
    { type: 'complies', label: 'Complies',            entries: [
      { t: '21:00', tl: '21h00', srcs: ['nd'] },
      { t: '22:00', tl: '22h00', srcs: ['rm', 'esp'] },
    ]},
  ],

  // Lundi — Messe N-D de Boulogne (19h40) + Prière du soir avec enfants
  1: [
    { type: 'chapelet', label: 'Chapelet de minuit',  entries: [
      { t: '0:00',  tl: '0h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de nuit',    entries: [
      { t: '3:00',  tl: '3h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet en latin',   entries: [
      { t: '5:30',  tl: '5h30',  srcs: ['rm'] },
    ]},
    { type: 'laudes',   label: 'Laudes',             entries: [
      { t: '7:00',  tl: '7h00',  srcs: ['rm', 'nd'] },
    ]},
    { type: 'matin',    label: 'Prière du matin',    entries: [
      { t: '7:30',  tl: '7h30',  srcs: ['rcf'] },
      { t: '8:00',  tl: '8h00',  srcs: ['rm', 'esp'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du matin (avec internautes)',  entries: [
      { t: '8:30',  tl: '8h30',  srcs: ['rm'] },
    ]},
    { type: 'messe',    label: 'Sainte Messe',       entries: [
      { t: '9:15',  tl: '9h15',  srcs: ['lou'] },
      { t: '10:00', tl: '10h00', srcs: ['nd', 'kto'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de Midi',   entries: [
      { t: '12:00', tl: '12h00', srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde', entries: [
      { t: '15:00', tl: '15h00', srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de Lourdes', entries: [
      { t: '15:30', tl: '15h30', srcs: ['rm', 'lou'] },
    ]},
    { type: 'vepres',   label: 'Vêpres',             entries: [
      { t: '17:40', tl: '17h40', srcs: ['rm'] },
      { t: '18:00', tl: '18h00', srcs: ['nd'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du soir (avec auditeurs)',   entries: [
      { t: '18:00', tl: '18h00', srcs: ['rm'] },
    ]},
    { type: 'messe',    label: 'Messe Notre-Dame de Boulogne', entries: [
      { t: '19:40', tl: '19h40', srcs: ['rm'] },
    ]},
    { type: 'soiree',   label: 'Prière du soir avec enfants', entries: [
      { t: '19:40', tl: '19h40', srcs: ['rm'] },
    ]},
    { type: 'complies', label: 'Complies',            entries: [
      { t: '21:00', tl: '21h00', srcs: ['nd'] },
      { t: '22:00', tl: '22h00', srcs: ['rm', 'esp'] },
    ]},
  ],

  // Dimanche — Cœur de la semaine liturgique
  0: [
    { type: 'chapelet', label: 'Chapelet de minuit',  entries: [
      { t: '0:00',  tl: '0h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de nuit',    entries: [
      { t: '3:00',  tl: '3h00',  srcs: ['rm'] },
    ]},
    { type: 'chapelet', label: 'Chapelet en latin',   entries: [
      { t: '5:30',  tl: '5h30',  srcs: ['rm'] },
    ]},
    { type: 'laudes',   label: 'Laudes dominicales', entries: [
      { t: '8:00',  tl: '8h00',  srcs: ['rm', 'nd', 'rcf'] },
    ]},
    { type: 'messe',    label: "Grand'Messe",         entries: [
      { t: '10:00', tl: '10h00', srcs: ['nd', 'ndp', 'kto'] },
      { t: '10:30', tl: '10h30', srcs: ['rm', 'lou'] },
    ]},
    { type: 'chapelet', label: 'Angélus',             entries: [
      { t: '12:00', tl: '12h00', srcs: ['vat', 'kto', 'nd'] },
    ]},
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde', entries: [
      { t: '15:00', tl: '15h00', srcs: ['rm', 'lou', 'nd'] },
    ]},
    { type: 'vepres',   label: 'Vêpres solennelles', entries: [
      { t: '17:30', tl: '17h30', srcs: ['ndp'] },
      { t: '17:40', tl: '17h40', srcs: ['rm'] },
      { t: '18:00', tl: '18h00', srcs: ['nd'] },
    ]},
    { type: 'chapelet', label: 'Chapelet du soir (avec auditeurs)',   entries: [
      { t: '18:00', tl: '18h00', srcs: ['rm'] },
    ]},
    { type: 'complies', label: 'Complies',            entries: [
      { t: '22:00', tl: '22h00', srcs: ['rm', 'nd', 'esp', 'rcf'] },
    ]},
  ],
};

function initWeek() {
  const container = document.getElementById('week-cards');
  if (!container) return;

  const today    = getParisDate();
  const todayDow = today.getDay();                          // 0=Dim … 6=Sam
  const moOffset = todayDow === 0 ? -6 : 1 - todayDow;    // France : semaine Lun→Dim
  const monday   = new Date(today);
  monday.setDate(today.getDate() + moOffset);

  const SHORT_DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  container.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dow     = date.getDay();
    const isToday = date.getDate()     === today.getDate()  &&
                    date.getMonth()    === today.getMonth()  &&
                    date.getFullYear() === today.getFullYear();

    const daySlots = WEEK_SCHEDULE[dow] ?? WEEK_SCHEDULE.ordinary;

    let slotsHtml = '';
    for (const slot of daySlots) {
      let entriesHtml = '';
      for (const entry of slot.entries) {
        let btnsHtml = '';
        for (const key of entry.srcs) {
          const src = SOURCES[key];
          if (!src) continue;
          if (src.s) {
            // Flux audio direct → bouton lecture intégrée
            btnsHtml += `<button class="wc-src-btn wc-radio" data-action="radio"
              data-stream="${src.s}" data-web="${src.w}"
              data-name="${src.n}" data-prayer="${slot.label}" data-time="${entry.tl}"
              title="Écouter ${src.n}">
              <i class="fa-solid fa-play"></i>${src.n}
            </button>`;
          } else {
            // Pas de flux → lien vers le site dans un nouvel onglet
            btnsHtml += `<a class="wc-src-btn wc-link" href="${src.w}"
              target="_blank" rel="noopener" title="Ouvrir ${src.n}">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>${src.n}
            </a>`;
          }
        }
        entriesHtml += `<div class="wc-entry">
          <span class="wc-etime">${entry.tl}</span>
          <div class="wc-src-list">${btnsHtml}</div>
        </div>`;
      }
      slotsHtml += `<div class="wc-slot ${slot.type}">
        <div class="wc-slot-label">${slot.label}</div>
        ${entriesHtml}
      </div>`;
    }

    const card = document.createElement('div');
    card.className = `wc-day${isToday ? ' today-day' : ''}`;
    card.innerHTML = `
      <div class="wc-head">
        <span class="wc-dayname">${SHORT_DAYS[dow]}</span>
        <span class="wc-daynum">${date.getDate()}</span>
      </div>
      <div class="wc-slots">${slotsHtml}</div>`;
    container.appendChild(card);
  }
}


/* ────────────────────────────────────────────
   9b. TIMELINE AUJOURD'HUI — générée dynamiquement
   Aplatit WEEK_SCHEDULE du jour courant, trie par heure,
   et injecte une carte par créneau (une source ou groupe de sources à la même heure).
──────────────────────────────────────────────*/
function initTodayTimeline() {
  const container = document.getElementById('timeline');
  if (!container) return;

  const now  = getParisDate();
  const dow  = now.getDay();
  const slots = WEEK_SCHEDULE[dow] ?? WEEK_SCHEDULE.ordinary;

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

  flat.forEach(({ slot, entry }, i) => {
    const startMin = toMin(entry.t);

    // Durée estimée : gap jusqu'au prochain créneau, plafonné à 75 min
    let duration = 60;
    if (i < flat.length - 1) {
      const gap = toMin(flat[i + 1].entry.t) - startMin;
      if (gap > 0 && gap <= 75) duration = gap;
    }

    // Boutons sources
    let srcsHtml = '';
    for (const key of entry.srcs) {
      const src = SOURCES[key];
      if (!src) continue;
      if (src.s) {
        srcsHtml += `<button class="tl-src radio" data-action="radio"
          data-stream="${src.s}" data-web="${src.w}"
          data-name="${src.n}" data-prayer="${slot.label}" data-time="${entry.tl}">
          <i class="fa-solid fa-play"></i> ${src.n}
        </button>`;
      } else {
        srcsHtml += `<a class="tl-src youtube" href="${src.w}" target="_blank" rel="noopener">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> ${src.n}
        </a>`;
      }
    }

    const brevLabel = BREV_LABEL[slot.type];
    const brevHtml  = brevLabel
      ? `<button class="tl-breviary-btn" data-prayer="${slot.type}">
           <i class="fa-solid fa-book-open"></i> ${brevLabel}
         </button>`
      : '';

    const art = document.createElement('article');
    art.className        = 'tl-item';
    art.dataset.type     = slot.type;
    art.dataset.start    = entry.t;
    art.dataset.duration = String(duration);
    art.innerHTML = `
      <div class="tl-time">${entry.tl}</div>
      <div class="tl-marker ${slot.type}"></div>
      <div class="tl-body">
        <h3 class="tl-prayer">${slot.label}</h3>
        <div class="tl-sources">${srcsHtml}</div>
      </div>
      <div class="tl-actions">
        <span class="tl-badge">—</span>
        ${brevHtml}
      </div>`;
    container.appendChild(art);
  });
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
    });
  }

  updateBadges();
  // Mise à jour automatique toutes les minutes
  setInterval(updateBadges, 60_000);
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
  const hash = location.hash.replace('#', '').toLowerCase();
  if (!hash) return;

  // Onglets dédiés
  if (['semaine', 'mois', 'sources'].includes(hash)) {
    document.querySelector(`.nav-tab[data-tab="${hash}"]`)?.click();
    return;
  }

  // Filtre sur l'onglet Aujourd'hui (déjà actif par défaut)
  const pf = document.querySelector(`.pf[data-filter="${hash}"]`);
  if (pf) pf.click();
}


/* ────────────────────────────────────────────
   10. INIT GLOBAL
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
  initNextOffice();
  initChapelet();
  handleDeepLink();      // applique le filtre/onglet issu du hash URL (landing page)
});
