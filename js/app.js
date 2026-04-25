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
──────────────────────────────────────────────*/
function initFilters() {
  const filters = document.querySelectorAll('.pf');
  const items   = document.querySelectorAll('.tl-item');

  filters.forEach(btn => {
    btn.addEventListener('click', () => {
      filters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const type = btn.dataset.filter;
      items.forEach(item => {
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
   3. DATE AUTOMATIQUE
──────────────────────────────────────────────*/
function initDate() {
  const now    = new Date();
  const days   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const label  = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  const el = document.getElementById('js-date');
  if (el) el.textContent = label;
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

  const now    = new Date();
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
    const d = new Date();
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
  document.querySelectorAll('.tl-breviary-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openBreviary(btn.dataset.prayer);
    });
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

  document.querySelectorAll('.tl-src.radio').forEach(btn => {
    btn.addEventListener('click', () => {
      const stream = btn.dataset.stream || '';
      const web    = btn.dataset.web    || '';
      const name   = btn.dataset.name   || '';
      const prayer = btn.dataset.prayer || '';
      const time   = btn.dataset.time   || '';

      currentWeb = web;

      // Pas de stream direct → ouvre le player web dans un nouvel onglet
      if (!stream) {
        window.open(web, '_blank', 'noopener');
        return;
      }

      // Charge le nouveau flux uniquement s'il est différent du courant
      if (stream !== currentStream) {
        audio.pause();
        audio.src   = stream;
        currentStream = stream;
        audio.load();
      }

      showPlayer(name, prayer, time);
      audio.play()
        .then(() => setIcon(true))
        .catch(() => {
          // Mixed content ou flux non disponible → ouvre le site
          closePlayer();
          if (web) window.open(web, '_blank', 'noopener');
        });
    });
  });
}


/* ────────────────────────────────────────────
   7. MENU BURGER
──────────────────────────────────────────────*/

function initHamburger() {
  const btn  = document.getElementById('hamburger-btn');
  const menu = document.getElementById('hamburger-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = !menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!isOpen));
  });

  // Ferme en cliquant ailleurs
  document.addEventListener('click', () => {
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  });
}


/* ────────────────────────────────────────────
   7. INIT GLOBAL
──────────────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initFilters();
  initDate();
  initCalendar();
  initBreviary();
  initRadioPlayer();
  initHamburger();
});
