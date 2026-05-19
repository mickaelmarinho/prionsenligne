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
    if (ddMinor) {
      if (minor) { ddMinor.textContent = 'Aussi celebres : ' + minor; ddMinor.style.display = ''; }
      else { ddMinor.style.display = 'none'; }
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
            ${lien ? `<a class="dd-nominis-link" href="${lien}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Voir sur nominis.cef.fr</a>` : ''}
          </div>
          <div class="dd-nominis-others" id="dd-nominis-others-${dy}" style="display:none"></div>
        `;

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
            const headHTML = head.map(s =>
              `<a class="dd-nominis-other" href="${escapeHtmlSimple(s.url)}" target="_blank" rel="noopener" title="${escapeHtmlSimple(s.bio || '')}">${escapeHtmlSimple(s.name)}</a>`).join('');
            const restHTML = rest.map(s =>
              `<a class="dd-nominis-other" href="${escapeHtmlSimple(s.url)}" target="_blank" rel="noopener" title="${escapeHtmlSimple(s.bio || '')}">${escapeHtmlSimple(s.name)}</a>`).join('');
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
}

function initBreviary() {
  // Délégation d'événement — capture les boutons générés dynamiquement par initTodayTimeline()
  document.addEventListener('click', e => {
    const btn = e.target.closest('.tl-breviary-btn');
    if (!btn) return;
    openBreviary(btn.dataset.prayer, btn.dataset.label || '');
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
    if (newAudio === audioMode) return;
    audioMode = newAudio;
    localStorage.setItem('pel_ch_audio', audioMode ? '1' : '0');
    if (!audioMode && playing) pauseAudio();
    syncModeBtns();
    render();
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
  // Radio Maria : flux bloqué par CORS sur HTTPS → traité comme lien externe
  rm:  { n: 'Radio Maria',      s: '', w: 'https://www.radiomaria.fr' },
  nd:  { n: 'RCF Notre-Dame',   s: 'https://windu.radionotredame.net/RadioNotreDame-Fm.mp3', w: 'https://www.rcf.fr/radio-notre-dame' },
  rcf: { n: 'RCF',              s: '', w: 'https://rcf.fr/radios/ecouter-rcf' },
  esp: { n: 'Espérance',        s: 'https://esperance.streamakaci.com/esperance.mp3', w: 'https://radio-esperance.fr' },
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
function _getDayScheduleInternal(date) {
  date = date || getParisDate();
  const dow = date.getDay();
  // Clone profond du planning de base pour ce jour
  const base = WEEK_SCHEDULE[dow] ?? WEEK_SCHEDULE.ordinary;
  let slots = JSON.parse(JSON.stringify(base));
  const iso = _dateISO(date);

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
    { type: 'chapelet', label: 'Chapelet de Lourdes',
      desc: RM_DESC.lourdesCh,
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd'] }],
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
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd'] }],
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
      entries: [{ t: '10:30', tl: '10h30', dur: 90, srcs: ['vat', 'kto'] }],
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
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd'] }],
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
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd'] }],
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
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd'] }],
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
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd'] }],
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
      entries: [{ t: '12:00', tl: '12h00', dur: 15, srcs: ['vat', 'kto'] }],
    },
    { type: 'chapelet', label: 'Chapelet de la Divine Miséricorde',
      desc: "Le chapelet de la Divine Miséricorde diffusé sur plusieurs sources le dimanche.",
      entries: [{ t: '15:00', tl: '15h00', dur: 15, srcs: ['rm', 'lou'] }],
    },
    { type: 'chapelet', label: 'Chapelet de Lourdes',
      desc: RM_DESC.lourdesCh,
      entries: [{ t: '15:30', tl: '15h30', dur: 40, srcs: ['rm', 'lou', 'nd'] }],
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

  // Onglets de jours
  let tabsHtml = '<div class="wk-tabs" role="tablist">';
  days.forEach(({ date, dow, isToday }, i) => {
    tabsHtml += `<button class="wk-tab${isToday ? ' active' : ''}" data-day="${i}" role="tab" aria-selected="${isToday}">
      <span class="wk-tab-name">${SHORT_DAYS[dow]}</span>
      <span class="wk-tab-num">${date.getDate()}</span>
    </button>`;
  });
  tabsHtml += '</div>';

  // Panneaux par jour
  let panelsHtml = '<div class="wk-panels">';
  days.forEach(({ date, dow, isToday }, i) => {
    const slots = getDaySchedule(date);

    // Dédupliquer les slots identiques (même type + même heure)
    let slotsHtml = '';
    for (const slot of slots) {
      const icon = TYPE_ICON[slot.type] || 'fa-circle';
      const firstEntry = slot.entries[0];
      const allTimes = slot.entries.map(e => e.tl).join(' · ');

      // Sources (tous les entries fusionnés)
      let srcsHtml = '';
      for (const entry of slot.entries) {
        for (const key of entry.srcs) {
          const src = SOURCES[key];
          if (!src) continue;
          if (src.s) {
            srcsHtml += `<button class="wc-src-btn wc-radio" data-action="radio"
              data-stream="${src.s}" data-web="${src.w}"
              data-name="${src.n}" data-prayer="${slot.label}" data-time="${entry.tl}">
              <i class="fa-solid fa-play"></i>${src.n}
            </button>`;
          } else {
            srcsHtml += `<a class="wc-src-btn wc-link" href="${src.w}" target="_blank" rel="noopener">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>${src.n}
            </a>`;
          }
        }
      }

      slotsHtml += `<div class="wk-row ${slot.type}">
        <div class="wk-row-main" ${srcsHtml ? 'data-expandable' : ''}>
          <span class="wk-row-time">${allTimes}</span>
          <i class="fa-solid ${icon} wk-row-icon"></i>
          <span class="wk-row-label">${slot.label}</span>
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

  wrap.innerHTML = tabsHtml + panelsHtml;

  // Switcher d'onglets
  wrap.querySelectorAll('.wk-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const day = tab.dataset.day;
      wrap.querySelectorAll('.wk-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      wrap.querySelectorAll('.wk-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected','true');
      wrap.querySelector(`.wk-panel[data-day="${day}"]`).classList.add('active');
    });
  });

  // Expand/collapse sources au clic sur une ligne
  wrap.addEventListener('click', e => {
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
      if (src.s) {
        srcsHtml += `<button class="tl-src radio" data-action="radio"
          data-stream="${src.s}" data-web="${src.w}"
          data-name="${src.n}" data-prayer="${esc(slot.label)}" data-time="${entry.tl}">
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
      ? `<button class="tl-breviary-btn" data-prayer="${slot.type}" data-label="${esc(slot.label)}" data-myst-dow='${slot.mystByDow ? JSON.stringify(slot.mystByDow) : ''}'>
           <i class="fa-solid fa-book-open"></i> ${brevLabel}
         </button>`
      : '';

    // Identifiant unique pour cet office (type + heure)
    const officeId   = slot.type + '_' + entry.t.replace(':', '');
    const officeName = slot.label + ' — ' + entry.tl;
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

    // Description : bouton "info" inline + panneau collapsible
    const infoBtn = slot.desc
      ? `<button class="tl-info-btn" type="button" aria-expanded="false" aria-label="Voir la description">
           <i class="fa-solid fa-circle-info"></i>
         </button>`
      : '';
    const descPanel = slot.desc
      ? `<div class="tl-desc" hidden>${esc(slot.desc)}</div>`
      : '';

    const art = document.createElement('article');
    art.className        = 'tl-item';
    art.dataset.type     = slot.type;
    art.dataset.start    = entry.t;
    art.dataset.duration = String(duration);
    art.dataset.label    = slot.label;
    art.dataset.desc     = slot.desc || '';
    art.innerHTML = `
      <div class="tl-time">
        <span class="tl-time-h">${entry.tl}</span>
        ${durHtml}
        <button class="tl-cal-btn" type="button" data-action="cal-one"
                title="Ajouter cette prière à mon calendrier" aria-label="Ajouter au calendrier">
          <i class="fa-regular fa-calendar-plus"></i>
        </button>
      </div>
      <div class="tl-marker ${slot.type}"></div>
      <div class="tl-body">
        <h3 class="tl-prayer">${slot.label} ${infoBtn}</h3>
        ${descPanel}
        <div class="tl-sources">${srcsHtml}</div>
      </div>
      <div class="tl-actions">
        <span class="tl-badge">—</span>
        ${brevHtml}
        ${chatHtml}
      </div>`;
    container.appendChild(art);
  });

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

  // Délégation : clic sur les boutons calendrier (individuel + global)
  container.addEventListener('click', e => {
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

  // Construit un .ics à partir d'une liste d'items de timeline et déclenche le download
  function exportTimelineItems(items, mode) {
    if (!items.length) return;
    const today = getParisDate();
    const events = items.map(item => {
      const [h, m]  = (item.dataset.start || '0:0').split(':').map(Number);
      const dur     = parseInt(item.dataset.duration, 10) || 30;
      const start   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0);
      const end     = new Date(start.getTime() + dur * 60000);
      const label   = item.dataset.label || item.querySelector('.tl-prayer')?.textContent?.trim().replace(/[ⓘ\s]+$/, '') || 'Prière';
      // Liste des sources affichées sous chaque office
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
      return {
        uid: `pel-${(item.dataset.type || 'priere')}-${item.dataset.start || ''}-${isoDay}@prionsenligne.fr`,
        start, end,
        summary: label,
        description: desc,
        url: 'https://prionsenligne.fr/agenda',
      };
    });
    const isoDayStr = today.toISOString().slice(0, 10);
    const calName = mode === 'journée'
      ? `PrionsEnLigne — Prières du ${today.toLocaleDateString('fr-FR')}`
      : `PrionsEnLigne — ${events[0].summary}`;
    const filename = mode === 'journée'
      ? `prionsenligne-journee-${isoDayStr}.ics`
      : `prionsenligne-${(events[0].summary || 'priere').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${isoDayStr}.ics`;
    downloadICS(filename, buildICS(events, calName));
  }

  // Délégation : toggle de la description sur clic du bouton info
  container.addEventListener('click', e => {
    const btn = e.target.closest('.tl-info-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const item = btn.closest('.tl-item');
    if (!item) return;
    const desc = item.querySelector('.tl-desc');
    if (!desc) return;
    const isOpen = !desc.hasAttribute('hidden');
    if (isOpen) {
      desc.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('open');
    } else {
      desc.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('open');
    }
  });

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

    const body = document.createElement('div');
    body.className = 'chat-msg-body';
    body.innerHTML = `
      <div class="chat-msg-meta">
        <button type="button" class="chat-msg-author" data-popover="1"${authorColor ? ` style="--author-color:${authorColor}"` : ''}>${escHtml(msg.user_name)}</button>
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
      message:   text.trim(),
    };
    let { data, error } = await sb.from('prayer_intentions').insert(fullRow).select().single();
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

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  // Sur iOS, Apple bloque l'installation programmatique → pas de bannière ici.
  // L'accès à l'option d'installation iOS reste disponible via le menu burger.
  if (isIOS) return;

  const btn = document.getElementById('tib-btn');

  function showBar() {
    bar.style.display = '';
    bar.removeAttribute('aria-hidden');
  }

  // Android / Desktop Chrome / Edge / Opera : attend le prompt natif
  window.addEventListener('beforeinstallprompt', () => showBar());

  // Si le prompt a déjà été capturé avant l'init
  if (_installPrompt) showBar();

  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (_installPrompt) {
      const res = await _installPrompt.prompt();
      if (res?.outcome === 'accepted') {
        _installPrompt = null;
        bar.style.display = 'none';
      }
    }
  });

  // Masquer si installé depuis un autre point d'entrée
  window.addEventListener('appinstalled', () => { bar.style.display = 'none'; });
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
  initNextOffice();
  initChapelet();
  initChat();
  initInstallBanner();
  initAbout();
  initInstallModal();
  initContact();
  initGregorianPlayer();
  handleDeepLink();      // applique le filtre/onglet issu du hash URL (landing page)

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
