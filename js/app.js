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
  const active = new Set();

  function applyFilters() {
    const showAll = active.size === 0;
    document.querySelectorAll('.tl-item').forEach(item => {
      const show = showAll || active.has(item.dataset.type);
      item.style.display = show ? '' : 'none';
      if (show) item.style.animation = 'fadeIn .2s ease';
    });
  }

  document.querySelectorAll('.pf').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.filter;

      if (type === 'all') {
        // Réinitialise tout → « Tout »
        active.clear();
        document.querySelectorAll('.pf').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else {
        document.querySelector('.pf[data-filter="all"]')?.classList.remove('active');
        if (active.has(type)) {
          active.delete(type);
          btn.classList.remove('active');
          if (active.size === 0) {
            document.querySelector('.pf[data-filter="all"]')?.classList.add('active');
          }
        } else {
          active.add(type);
          btn.classList.add('active');
        }
      }

      applyFilters();
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
  // Feast display handled by initCalendar() → renderCalendar()
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
    1:  { saint: 'Mercredi Saint', type: 'ordinaire', desc: 'Semaine Sainte.', minor: 'Ste Valérie' },
    2:  { saint: 'Jeudi Saint — Cène du Seigneur', type: 'solennite', desc: "Jésus institue l'Eucharistie et le sacerdoce, lave les pieds de ses Apôtres. Début du Triduum Pascal.", minor: 'St François de Paule' },
    3:  { saint: 'Vendredi Saint — Passion du Seigneur', type: 'solennite', desc: "Le Christ est crucifié et meurt sur la Croix. Jour de jeûne et d'abstinence, le seul sans messe de l'année.", minor: 'Ste Agape' },
    4:  { saint: 'Samedi Saint — Vigile pascale', type: 'fete', desc: "Le grand silence du Samedi Saint. La Vigile pascale est la 'mère de toutes les veilles'.", minor: 'St Isidore de Séville' },
    5:  { saint: 'Pâques — Résurrection du Seigneur', type: 'solennite', desc: "'Il n'est pas ici, il est ressuscite !' La plus grande fête de l'Église catholique. Alleluia !", minor: '' },
    6:  { saint: 'Lundi de Pâques', type: 'solennite', desc: "Dans l'octave de Pâques, chaque jour est célébré comme Pâques lui-même.", minor: 'St Marcellin' },
    7:  { saint: 'Saint Jean-Baptiste de la Salle', type: 'memoire', desc: "Fondateur des Frères des Écoles Chrétiennes au XVIIe siècle. Patron des éducateurs.", minor: '' },
    11: { saint: 'Saint Stanislas', type: 'memoire', desc: "Évêque de Cracovie et martyr en 1079. Patron de la Pologne.", minor: '' },
    12: { saint: 'Dimanche de la Miséricorde Divine', type: 'fete', desc: "Instituée par Jean-Paul II. Jésus dit à sainte Faustine : 'Je veux que la fête de la Miséricorde soit le refuge de toutes les âmes.'", minor: '' },
    13: { saint: 'Saint Martin Ier', type: 'memoire', desc: "Pape et martyr du VIIe siècle.", minor: '' },
    14: { saint: 'Sainte Lidwine', type: 'ordinaire', desc: "Mystique néerlandaise du XVe siècle, patronne des malades.", minor: '' },
    17: { saint: 'Saint Anicet', type: 'ordinaire', desc: "Pape et martyr du IIe siècle.", minor: '' },
    18: { saint: 'Saint Parfait', type: 'fete', desc: "Prêtre de Cordoue, martyrisé en 850 pour avoir refusé de renier sa foi.", minor: '' },
    19: { saint: '3e dimanche de Pâques', type: 'ordinaire', desc: 'Temps pascal.', minor: '' },
    20: { saint: 'Sainte Odette', type: 'ordinaire', desc: "Vierge, patronne des aveugles.", minor: '' },
    21: { saint: 'Saint Anselme', type: 'memoire', desc: "Archevêque de Cantorbéry et Docteur de l'Église. Auteur de la preuve ontologique de l'existence de Dieu.", minor: '' },
    22: { saint: 'Saint Alexandre', type: 'ordinaire', desc: "Pape et martyr au IIe siècle.", minor: '' },
    23: { saint: 'Saint Georges', type: 'fete', desc: "Martyr légendaire, patron de l'Angleterre et des soldats.", minor: '' },
    24: { saint: 'Saint Fidèle de Sigmaringen', type: 'memoire', desc: "Premier martyr capucin, missionnaire en Suisse.", minor: '' },
    25: { saint: 'Saint Marc, évangéliste', type: 'fete', desc: "Auteur du 2e Évangile. Compagnon de Pierre à Rome, premier évêque d'Alexandrie.", minor: '' },
    26: { saint: '4e dimanche de Pâques — Bon Pasteur', type: 'fete', desc: "Dimanche du Bon Pasteur. Journée mondiale de prière pour les vocations.", minor: 'St Clet · St Marcellin' },
    27: { saint: 'Sainte Zita', type: 'ordinaire', desc: "Patronne des domestiques et des servantes.", minor: '' },
    28: { saint: 'Saint Pierre Chanel', type: 'memoire', desc: "Prêtre mariste, premier martyr d'Océanie.", minor: 'St Louis-Marie Grignion de Montfort' },
    29: { saint: 'Sainte Catherine de Sienne', type: 'fete', desc: "Docteure de l'Église, co-patronne de l'Europe. Mystique dominicaine.", minor: '' },
    30: { saint: 'Saint Pie V', type: 'memoire', desc: "Pape dominicain (1566-1572), promoteur du saint Rosaire.", minor: '' },
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

  function selectDay(dayEl) {
    const date  = dayEl.dataset.date  || '';
    const type  = dayEl.dataset.type  || 'ordinaire';
    const saint = dayEl.dataset.saint || '';
    const desc  = dayEl.dataset.desc  || '';
    const minor = dayEl.dataset.minor || '';

    if (ddDate)  ddDate.textContent  = date;
    if (ddType) { ddType.textContent = TYPE_LABELS[type] || type; ddType.className = 'dd-type ' + type; }
    if (ddSaint) ddSaint.textContent = saint;
    if (ddDesc)  ddDesc.textContent  = desc;
    if (ddMinor) {
      if (minor) { ddMinor.textContent = 'Aussi celebres : ' + minor; ddMinor.style.display = ''; }
      else { ddMinor.style.display = 'none'; }
    }
    detail.classList.remove('hidden');
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    grid.querySelectorAll('.cal-day:not(.other)').forEach(d => d.style.outline = '');
    dayEl.style.outline = '2px solid #c9a84c';
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
      div.className = 'cal-day' + (type !== 'ordinaire' ? ' ' + type : '') + (isToday ? ' today' : '');
      div.dataset.date  = dateLabel;
      div.dataset.type  = type;
      div.dataset.saint = saint;
      div.dataset.desc  = desc;
      div.dataset.minor = minor;
      div.innerHTML = '<span class="cal-num">' + d + '</span>' +
        (saint ? '<span class="cal-saint">' + shortSaint + '</span>' : '') + dotHtml;
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
  const MYST = {
    joyeux:    { name:'Mystères Joyeux',     list:["L'Annonciation","La Visitation","La Nativité","La Présentation au Temple","Le Recouvrement au Temple"] },
    douloureux:{ name:'Mystères Douloureux', list:["L'Agonie à Gethsémani","La Flagellation","Le Couronnement d'épines","Le Portement de Croix","La Crucifixion et la Mort"] },
    lumineux:  { name:'Mystères Lumineux',   list:["Le Baptême de Jésus","Les Noces de Cana","L'Annonce du Royaume","La Transfiguration","L'Institution de l'Eucharistie"] },
    glorieux:  { name:'Mystères Glorieux',   list:["La Résurrection","L'Ascension","La Pentecôte","L'Assomption de Marie","Le Couronnement de Marie"] },
  };

  const mystery = MYST[DOW_KEY[getParisDate().getDay()]];

  // Séquence : intro (6 pas) + 5 décades × 12 pas = 66 pas au total
  const INTRO = 6;
  let step = 0;
  const TOTAL = INTRO + 60; // 66

  // Langue courante — mémorisée en localStorage
  let lang = localStorage.getItem('pel_ch_lang') || 'fr';

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
    updateFullText(step);

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

  // Initialise l'état actif du sélecteur de langue
  function syncLangBtns() {
    modal.querySelectorAll('.ch-lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
  }

  // Sélecteur de langue
  document.getElementById('ch-lang-bar')?.addEventListener('click', e => {
    const btn = e.target.closest('.ch-lang-btn');
    if (!btn) return;
    lang = btn.dataset.lang;
    localStorage.setItem('pel_ch_lang', lang);
    syncLangBtns();
    render(); // remet à jour nom + texte
  });

  fab.addEventListener('click', () => {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Restaure la langue mémorisée
    lang = localStorage.getItem('pel_ch_lang') || 'fr';
    buildBeads();
    syncLangBtns();
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
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',  entries: [
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
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',   entries: [
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
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',  entries: [
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
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',   entries: [
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
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',              entries: [
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
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',               entries: [
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
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',   entries: [
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
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',    entries: [
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
    { type: 'chapelet', label: 'Chapelet du matin (avec un internaute)',  entries: [
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
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',   entries: [
      { t: '18:00', tl: '18h00', srcs: ['rm'] },
    ]},
    { type: 'messe',    label: 'Messe Notre-Dame de Boulogne', entries: [
      { t: '19:00', tl: '19h00', srcs: ['rm'] },
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
    { type: 'chapelet', label: 'Chapelet du soir (avec un internaute)',   entries: [
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

    // Identifiant unique pour cet office (type + heure)
    const officeId   = slot.type + '_' + entry.t.replace(':', '');
    const officeName = slot.label + ' — ' + entry.tl;
    const chatHtml   = `<button class="tl-chat-btn" data-action="chat"
        data-office-id="${officeId}" data-office-name="${officeName}">
        <i class="fa-solid fa-dove"></i> Intentions
      </button>`;

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
        ${chatHtml}
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
  if (['semaine', 'sources'].includes(hash)) {
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

  function buildBubble(msg) {
    const userId = window._pelUser?.id;
    const isOwn  = userId && msg.user_id === userId;
    const div    = document.createElement('div');
    div.className = 'chat-msg' + (isOwn ? ' own' : '');
    div.dataset.id = msg.id;
    div.innerHTML = `
      <div class="chat-msg-meta">
        <span class="chat-msg-author">${escHtml(msg.user_name)}</span>
        <span class="chat-msg-time">${formatTime(msg.created_at)}</span>
      </div>
      <div class="chat-msg-text">${escHtml(msg.message)}</div>`;
    return div;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

    const { data, error } = await sb
      .from('prayer_intentions')
      .select('*')
      .eq('office_id', officeId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !data || data.length === 0) {
      emptyEl.style.display = '';
      return;
    }

    emptyEl.style.display = 'none';
    data.forEach(msg => msgsEl.appendChild(buildBubble(msg)));
    scrollBottom();
  }

  // ── Temps réel ───────────────────────────────────────────
  function subscribeRealtime(officeId) {
    const sb = window._sbClient;
    if (!sb) return;

    // Désabonner l'ancien canal
    if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }

    realtimeChannel = sb.channel('chat_' + officeId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'prayer_intentions',
        filter: 'office_id=eq.' + officeId,
      }, payload => {
        const msg = payload.new;
        if (!msg) return;
        const existing = msgsEl.querySelector('[data-id="' + msg.id + '"]');
        if (existing) return; // déjà affiché (optimistic)
        emptyEl.style.display = 'none';
        msgsEl.appendChild(buildBubble(msg));
        scrollBottom();
      })
      .subscribe();
  }

  // ── Ouvrir le panneau ─────────────────────────────────────
  function openChat(officeId, officeName) {
    currentOfficeId = officeId;
    if (nameEl) nameEl.textContent = officeName;

    // Afficher formulaire ou invitation
    const user = window._pelUser;
    if (user) {
      if (formWrap)  formWrap.style.display  = '';
      if (loginProm) loginProm.style.display  = 'none';
    } else {
      if (formWrap)  formWrap.style.display  = 'none';
      if (loginProm) loginProm.style.display  = '';
    }

    panel.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    loadMessages(officeId);
    subscribeRealtime(officeId);
    if (input) setTimeout(() => input.focus(), 320);
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

    const userName = user.user_metadata?.prenom || user.email?.split('@')[0] || 'Pèlerin';

    // Optimistic UI
    const optimistic = {
      id: 'tmp_' + Date.now(),
      office_id: currentOfficeId,
      user_id: user.id,
      user_name: userName,
      message: text.trim(),
      created_at: new Date().toISOString(),
    };
    emptyEl.style.display = 'none';
    const bubble = buildBubble(optimistic);
    msgsEl.appendChild(bubble);
    scrollBottom();

    const { data, error } = await sb.from('prayer_intentions').insert({
      office_id: currentOfficeId,
      user_id:   user.id,
      user_name: userName,
      message:   text.trim(),
    }).select().single();

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
    openChat(btn.dataset.officeId, btn.dataset.officeName);
  });

  if (closeBtn) closeBtn.addEventListener('click', closeChat);
  if (overlay)  overlay.addEventListener('click', closeChat);

  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = input?.value?.trim();
      if (!text) return;
      if (input) input.value = '';
      await sendMessage(text);
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
  initChat();
  handleDeepLink();      // applique le filtre/onglet issu du hash URL (landing page)
});
