# PrionsEnLigne

Site catholique de prière en ligne — radios, chapelet, messe, bréviaire.

## Structure du projet

```
prionsenligne/
├── index.html          ← Page principale
├── css/
│   └── style.css       ← Styles
├── js/
│   └── app.js          ← Navigation, filtres, bréviaire
├── MAIL-AELF.txt       ← Mail à envoyer à l'AELF pour l'API
└── README.md
```

## Déploiement sur GitHub + Vercel

### Étape 1 — Pousser sur GitHub
1. Aller sur github.com → bouton vert "New repository"
2. Nom : `prionsenligne`
3. Visibilité : Public
4. Cliquer "Create repository"
5. Suivre les instructions affichées pour uploader les fichiers

### Étape 2 — Connecter à Vercel
1. Aller sur vercel.com → "Add New Project"
2. Choisir le repo GitHub `prionsenligne`
3. Cliquer "Deploy" — c'est tout !
4. Votre site sera disponible sur une URL `.vercel.app`

### Étape 3 — Connecter le domaine prionsenligne.fr
1. Dans Vercel → Settings → Domains
2. Ajouter `prionsenligne.fr`
3. Vercel vous donnera des enregistrements DNS à modifier chez Hostinger
4. Modifier les serveurs DNS dans Hostinger pour pointer vers Vercel

### Étape 4 — API AELF (bréviaire)
Envoyer le mail dans `MAIL-AELF.txt` à contact@aelf.org
Une fois l'autorisation reçue, l'API s'active automatiquement.

## Radios intégrées
- Radio Maria France : http://stream.radiomaria.fr/radiomariafrance-hd.mp3
- Radio Notre-Dame : http://windu.radionotredame.net/RadioNotreDame-Fm.mp3
- Radio Espérance : via player.radio-esperance.fr

## Prochaines étapes
- [ ] Système de comptes utilisateurs
- [ ] Chat communautaire par prière
- [ ] Abonnement (contenu premium)
- [ ] Notifications push pour les heures de prière
