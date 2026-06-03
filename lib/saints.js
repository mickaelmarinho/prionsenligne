/*
  Dataset des saints francophones pour les pages SEO /saints/[slug].
  Hors /api → n'est PAS une fonction serverless (importé par api/seo.js).

  Chaque saint : slug, name, feast (date de fête), country (code ISO-2 ou
  'universel'), region (libellé), patron (patronage), desc (3-5 phrases,
  contenu unique pour le SEO).

  Angle : saints fortement vénérés dans la francophonie, dont beaucoup ont
  peu de concurrence SEO (Kibeho, Frère André, Beauraing…) → portes d'entrée
  Google evergreen qui ne dépendent d'aucune API externe.
*/

export const SAINTS = [
  // ─── Universels très recherchés ───
  {
    slug: 'sainte-therese-de-lisieux', name: 'Sainte Thérèse de Lisieux',
    feast: '1er octobre', country: 'fr', region: 'France',
    patron: 'Patronne des missions, Docteur de l\'Église',
    desc: "Carmélite normande (1873-1897) morte à 24 ans, sainte Thérèse de l'Enfant-Jésus est l'une des figures les plus aimées du catholicisme. Sa « petite voie » d'enfance spirituelle — faire les petites choses avec un grand amour — a touché des millions de fidèles. Proclamée Docteur de l'Église en 1997, elle est co-patronne de la France et patronne universelle des missions. Son autobiographie, « Histoire d'une âme », reste un best-seller spirituel mondial.",
  },
  {
    slug: 'saint-francois-d-assise', name: 'Saint François d\'Assise',
    feast: '4 octobre', country: 'universel', region: 'Italie',
    patron: 'Patron de l\'écologie et des animaux',
    desc: "Fils d'un riche marchand d'Assise (1182-1226), François renonça à tout pour épouser « Dame Pauvreté » et suivre le Christ dans le dénuement. Fondateur de l'ordre des Frères mineurs (franciscains), il prêcha la fraternité universelle avec toute la création — d'où son patronage de l'écologie, repris par le pape François dans l'encyclique Laudato Si'. Premier saint à recevoir les stigmates, il composa le Cantique des créatures, l'un des plus anciens textes poétiques en langue italienne.",
  },
  {
    slug: 'saint-joseph', name: 'Saint Joseph',
    feast: '19 mars', country: 'universel', region: 'Nazareth',
    patron: 'Patron de l\'Église universelle, des travailleurs et de la bonne mort',
    desc: "Époux de la Vierge Marie et père nourricier de Jésus, saint Joseph est le modèle des pères de famille et des travailleurs. Charpentier de Nazareth, homme juste et silencieux, il protégea la Sainte Famille lors de la fuite en Égypte. Proclamé patron de l'Église universelle par Pie IX en 1870, il est invoqué pour une bonne mort, ayant rendu l'âme entouré de Jésus et Marie. Sa fête du 1er mai (saint Joseph travailleur) honore la dignité du travail humain.",
  },
  {
    slug: 'sainte-bernadette-soubirous', name: 'Sainte Bernadette Soubirous',
    feast: '16 avril', country: 'fr', region: 'Lourdes, France',
    patron: 'Patronne des malades et des bergers',
    desc: "Humble fille de meunier de Lourdes (1844-1879), Bernadette reçut dix-huit apparitions de la Vierge Marie à la grotte de Massabielle en 1858. La « Belle Dame » s'y présenta comme « l'Immaculée Conception ». Malgré la célébrité, Bernadette choisit la vie cachée chez les Sœurs de la Charité de Nevers, où son corps repose, demeuré intact. Lourdes est devenu le plus grand sanctuaire de guérison au monde, accueillant des millions de pèlerins, notamment des malades.",
  },
  {
    slug: 'saint-jean-marie-vianney-cure-d-ars', name: 'Saint Jean-Marie Vianney (le Curé d\'Ars)',
    feast: '4 août', country: 'fr', region: 'Ars, France',
    patron: 'Patron des prêtres',
    desc: "Curé du petit village d'Ars (1786-1859), Jean-Marie Vianney transforma une paroisse indifférente en foyer de sainteté. Doté d'un discernement surnaturel, il passait jusqu'à seize heures par jour au confessionnal, attirant des pèlerins de toute l'Europe. Patron de tous les curés du monde, il incarne le don total du prêtre à ses fidèles. Le sanctuaire d'Ars, dans l'Ain, conserve son corps et perpétue son rayonnement spirituel.",
  },
  {
    slug: 'sainte-jeanne-d-arc', name: 'Sainte Jeanne d\'Arc',
    feast: '30 mai', country: 'fr', region: 'France',
    patron: 'Patronne secondaire de la France',
    desc: "Bergère de Domrémy (1412-1431), Jeanne entendit dès treize ans les voix de saint Michel, sainte Catherine et sainte Marguerite l'appelant à délivrer la France. Conduisant les armées royales, elle fit lever le siège d'Orléans et mena Charles VII au sacre de Reims. Capturée puis brûlée à Rouen à dix-neuf ans, réhabilitée puis canonisée en 1920, elle est patronne secondaire de la France et figure d'un courage inspiré par la foi.",
  },
  {
    slug: 'saint-vincent-de-paul', name: 'Saint Vincent de Paul',
    feast: '27 septembre', country: 'fr', region: 'France',
    patron: 'Patron des œuvres de charité',
    desc: "Prêtre landais (1581-1660), Vincent de Paul consacra sa vie aux pauvres, aux galériens, aux enfants abandonnés et aux malades. Fondateur des Lazaristes et, avec sainte Louise de Marillac, des Filles de la Charité, il organisa la charité à grande échelle bien avant l'État-providence. Patron de toutes les associations caritatives catholiques, il inspira la Société de Saint-Vincent-de-Paul, présente aujourd'hui dans le monde entier.",
  },

  // ─── Québec / Canada ───
  {
    slug: 'saint-frere-andre', name: 'Saint Frère André (Alfred Bessette)',
    feast: '6 janvier', country: 'ca', region: 'Montréal, Québec',
    patron: 'Patron des aidants naturels',
    desc: "Religieux de la Congrégation de Sainte-Croix (1845-1937), le Frère André fut longtemps simple portier du collège Notre-Dame de Montréal. Surnommé « le portier de Dieu », il opéra d'innombrables guérisons attribuées à saint Joseph, sa grande dévotion. Il fit construire l'Oratoire Saint-Joseph du Mont-Royal, aujourd'hui le plus grand sanctuaire dédié à saint Joseph au monde. Canonisé en 2010, il est le premier saint masculin né au Canada.",
  },
  {
    slug: 'sainte-kateri-tekakwitha', name: 'Sainte Kateri Tekakwitha',
    feast: '17 avril', country: 'ca', region: 'Québec / Amérique du Nord',
    patron: 'Patronne de l\'écologie et des peuples autochtones',
    desc: "Première sainte amérindienne (1656-1680), Kateri Tekakwitha était d'origine mohawk et algonquine. Convertie au catholicisme malgré l'hostilité de son entourage, elle mena une vie de prière et de pénitence d'une grande intensité, surnommée « le lys des Mohawks ». Morte à vingt-quatre ans, canonisée en 2012, elle est devenue une figure de réconciliation entre les peuples autochtones et l'Église, et patronne de l'écologie.",
  },
  {
    slug: 'sainte-anne', name: 'Sainte Anne',
    feast: '26 juillet', country: 'ca', region: 'Patronne du Québec et du Canada',
    patron: 'Patronne du Canada, des grands-mères et des marins',
    desc: "Mère de la Vierge Marie et grand-mère de Jésus, sainte Anne est la patronne principale du Québec et du Canada. Le sanctuaire de Sainte-Anne-de-Beaupré, près de Québec, est le plus ancien lieu de pèlerinage d'Amérique du Nord (depuis 1658) et un haut lieu de guérison. Sainte Anne est particulièrement aimée des familles, des grands-mères et des marins bretons et acadiens, qui la portèrent jusqu'en Nouvelle-France.",
  },
  {
    slug: 'saints-martyrs-canadiens', name: 'Saints Martyrs canadiens',
    feast: '19 octobre', country: 'ca', region: 'Huronie, Nouvelle-France',
    patron: 'Patrons secondaires du Canada',
    desc: "Huit missionnaires jésuites — dont Jean de Brébeuf, Isaac Jogues et Gabriel Lalemant — furent martyrisés entre 1642 et 1649 alors qu'ils évangélisaient les Hurons et affrontaient les guerres iroquoises. Endurant des supplices effroyables avec une foi héroïque, ils sont les premiers martyrs canonisés du continent nord-américain (1930). Le sanctuaire des Martyrs à Midland (Ontario) honore leur mémoire. Ils sont patrons secondaires du Canada.",
  },

  // ─── Belgique ───
  {
    slug: 'notre-dame-de-beauraing', name: 'Notre-Dame de Beauraing',
    feast: '29 novembre', country: 'be', region: 'Namur, Belgique',
    patron: 'La Vierge au Cœur d\'Or',
    desc: "Entre novembre 1932 et janvier 1933, la Vierge Marie apparut trente-trois fois à cinq enfants à Beauraing, en province de Namur. Se montrant le cœur rayonnant d'or, elle demanda la prière et la conversion des pécheurs. Reconnues officiellement par l'Église en 1949, ces apparitions ont fait de Beauraing l'un des grands sanctuaires mariaux de Belgique, où la « Vierge au Cœur d'Or » est invoquée pour la paix et la conversion.",
  },
  {
    slug: 'notre-dame-de-banneux', name: 'Notre-Dame de Banneux',
    feast: '15 janvier', country: 'be', region: 'Liège, Belgique',
    patron: 'La Vierge des Pauvres',
    desc: "En 1933, la Vierge apparut huit fois à Mariette Beco, une fillette de douze ans, dans le hameau de Banneux près de Liège. Se présentant comme « la Vierge des Pauvres », elle conduisit l'enfant à une source destinée « à toutes les nations, pour soulager les malades ». Reconnu par l'Église, le sanctuaire de Banneux attire des pèlerins du monde entier, particulièrement les malades et les plus démunis.",
  },
  {
    slug: 'saint-damien-de-veuster', name: 'Saint Damien de Veuster (Molokai)',
    feast: '10 mai', country: 'be', region: 'Flandre, Belgique',
    patron: 'Patron des lépreux et des personnes atteintes du VIH',
    desc: "Missionnaire belge des Sacrés-Cœurs (1840-1889), le Père Damien se porta volontaire pour servir les lépreux exilés sur l'île de Molokai, à Hawaï. Pendant seize ans, il soigna, logea et évangélisa les malades, avant de contracter lui-même la lèpre et d'en mourir. Canonisé en 2009, élu « plus grand Belge de tous les temps » en 2005, il est patron des malades de la lèpre et un modèle de charité héroïque jusqu'au don de sa propre vie.",
  },

  // ─── Suisse ───
  {
    slug: 'saint-nicolas-de-flue', name: 'Saint Nicolas de Flüe',
    feast: '25 septembre', country: 'ch', region: 'Obwald, Suisse',
    patron: 'Patron de la Suisse',
    desc: "Paysan, magistrat et père de dix enfants (1417-1487), Nicolas de Flüe quitta tout à cinquante ans pour devenir ermite à Ranft. Mystique vivant des années sans autre nourriture que l'Eucharistie, il fut consulté comme conseiller de paix. En 1481, son intervention décisive à la Diète de Stans évita une guerre civile et préserva l'unité de la Confédération suisse. Canonisé en 1947, « Frère Nicolas » est le saint patron de la Suisse et un symbole de réconciliation.",
  },
  {
    slug: 'saint-maurice-d-agaune', name: 'Saint Maurice et les martyrs d\'Agaune',
    feast: '22 septembre', country: 'ch', region: 'Valais, Suisse',
    patron: 'Patron des soldats et de plusieurs régions alpines',
    desc: "Officier chrétien commandant la légion thébaine, Maurice et ses compagnons furent martyrisés vers 286 à Agaune (l'actuelle Saint-Maurice, en Valais) pour avoir refusé de persécuter d'autres chrétiens. L'abbaye fondée sur leur tombeau au VIe siècle est le plus ancien monastère d'Occident encore en activité. Saint Maurice est patron des soldats, des fantassins et de nombreuses régions alpines, et donne son nom à des lieux à travers toute l'Europe.",
  },
  {
    slug: 'bienheureuse-marguerite-bays', name: 'Bienheureuse Marguerite Bays',
    feast: '27 juin', country: 'ch', region: 'Fribourg, Suisse',
    patron: 'Modèle des laïcs et des couturières',
    desc: "Humble couturière fribourgeoise (1815-1879), Marguerite Bays vécut une sainteté toute simple au cœur du quotidien, sans quitter son village de La Pierraz. Tertiaire franciscaine, guérie d'un cancer le jour de la définition du dogme de l'Immaculée Conception, elle porta ensuite les stigmates de la Passion. Canonisée en 2019, elle montre que la sainteté est accessible dans la vie ordinaire d'une laïque, par la prière, le travail et la charité.",
  },

  // ─── Afrique francophone ───
  {
    slug: 'saints-charles-lwanga-martyrs-ouganda', name: 'Saints Charles Lwanga et les martyrs de l\'Ouganda',
    feast: '3 juin', country: 'universel', region: 'Ouganda / Afrique',
    patron: 'Patrons de la jeunesse africaine',
    desc: "Entre 1885 et 1887, vingt-deux jeunes pages de la cour du roi Mwanga II du Buganda furent martyrisés — beaucoup brûlés vifs à Namugongo — pour avoir refusé de renier leur foi et résisté à la corruption. Conduits par Charles Lwanga, ces jeunes catholiques (et leurs compagnons anglicans) sont les premiers saints d'Afrique noire moderne, canonisés en 1964. Patrons de la jeunesse africaine, ils attirent chaque 3 juin des millions de pèlerins à Namugongo.",
  },
  {
    slug: 'bienheureux-isidore-bakanja', name: 'Bienheureux Isidore Bakanja',
    feast: '12 août', country: 'cd', region: 'Congo (RDC)',
    patron: 'Martyr du scapulaire, modèle des laïcs africains',
    desc: "Jeune laïc congolais (vers 1885-1909), Isidore Bakanja était maçon et catéchiste, portant fidèlement le scapulaire du Carmel. Un colon européen, hostile à sa foi, le fit battre à mort pour avoir refusé d'ôter ce signe religieux et continué à évangéliser ses compagnons. Pardonnant à son bourreau avant de mourir, il fut béatifié en 1994 par Jean-Paul II. Il est un modèle de fidélité des laïcs africains et un témoin de la foi face à la persécution.",
  },
  {
    slug: 'bienheureux-cyprien-tansi', name: 'Bienheureux Cyprien Iwene Tansi',
    feast: '20 janvier', country: 'universel', region: 'Nigeria / Afrique',
    patron: 'Modèle du clergé africain',
    desc: "Prêtre nigérian (1903-1964), Cyprien Tansi fut un pasteur zélé avant d'embrasser la vie contemplative chez les trappistes, en Angleterre, pour fonder un monastère en Afrique. Mort en exil, il est le premier moine d'Afrique noire moderne à être béatifié (1998, par Jean-Paul II au Nigeria). Sa vie unit l'ardeur missionnaire et la quête de Dieu dans le silence monastique, inspirant le clergé et les vocations contemplatives africaines.",
  },
  {
    slug: 'notre-dame-d-afrique', name: 'Notre-Dame d\'Afrique',
    feast: '30 avril', country: 'universel', region: 'Alger / Afrique du Nord',
    patron: 'Patronne de l\'Afrique du Nord',
    desc: "Vénérée dans la basilique d'Alger édifiée en 1872, Notre-Dame d'Afrique est la patronne des chrétiens d'Afrique du Nord. Sa statue porte l'inscription « Priez pour nous et pour les musulmans », symbole d'un sanctuaire devenu haut lieu de dialogue et d'amitié entre chrétiens et musulmans. Repère spirituel pour les communautés catholiques du Maghreb et la diaspora africaine, elle veille sur la Méditerranée et ceux qui la traversent.",
  },
  {
    slug: 'notre-dame-de-kibeho', name: 'Notre-Dame de Kibeho',
    feast: '28 novembre', country: 'rw', region: 'Rwanda',
    patron: 'Mère du Verbe, Notre-Dame des Douleurs',
    desc: "À Kibeho, au Rwanda, la Vierge Marie apparut à plusieurs jeunes filles à partir de 1981, se présentant comme « Mère du Verbe ». Elle appela à la prière, à la conversion et au jeûne, montrant des visions prophétiques de violences à venir — perçues après coup comme l'annonce du génocide de 1994. Premières apparitions mariales officiellement reconnues en Afrique (2001), Kibeho est aujourd'hui un sanctuaire majeur du continent, où l'on prie le chapelet des Sept Douleurs.",
  },
  {
    slug: 'notre-dame-de-la-paix-yamoussoukro', name: 'Notre-Dame de la Paix de Yamoussoukro',
    feast: '8 décembre', country: 'ci', region: 'Côte d\'Ivoire',
    patron: 'Notre-Dame de la Paix',
    desc: "Consacrée par Jean-Paul II en 1990, la basilique Notre-Dame de la Paix de Yamoussoukro est la plus grande église catholique du monde, inspirée de Saint-Pierre de Rome. Dédiée à la Vierge sous le vocable de la Paix et célébrée à l'Immaculée Conception, elle est un signe de la vitalité de l'Église en Côte d'Ivoire et en Afrique de l'Ouest. Elle accueille pèlerins et fidèles venus prier pour la paix du continent.",
  },

  // ─── Haïti / Antilles ───
  {
    slug: 'notre-dame-du-perpetuel-secours', name: 'Notre-Dame du Perpétuel Secours',
    feast: '27 juin', country: 'ht', region: 'Patronne d\'Haïti',
    patron: 'Patronne d\'Haïti',
    desc: "Vénérée à travers une ancienne icône byzantine montrant Marie tenant l'Enfant Jésus saisi par la vision de sa Passion, Notre-Dame du Perpétuel Secours est la patronne principale d'Haïti depuis 1942. La dévotion s'y est enracinée après l'épidémie de variole de 1882, dont la fin fut attribuée à son intercession. Mère secourable et toujours prompte à aider, elle est invoquée avec une ferveur intense par le peuple haïtien et la diaspora.",
  },
];

// Index par slug pour accès rapide
export const SAINTS_BY_SLUG = Object.fromEntries(SAINTS.map(s => [s.slug, s]));
