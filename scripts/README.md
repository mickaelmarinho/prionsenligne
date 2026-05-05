# Scripts TTS — Chapelet PrionsEnLigne

Génère les fichiers audio MP3 du chapelet via Google Cloud Text-to-Speech.
Une seule génération suffit : les fichiers sont ensuite servis comme
ressources statiques par le site.

## Setup initial (une seule fois)

### 1. Activer l'API Google Cloud TTS

1. Va sur [console.cloud.google.com](https://console.cloud.google.com/)
2. Crée (ou sélectionne) un projet
3. Dans la barre de recherche, tape **« Cloud Text-to-Speech API »**
4. Clique sur **« Activer »**

### 2. Créer une clé de compte de service

1. **IAM et administration → Comptes de service → Créer un compte de service**
2. Nom au choix (ex: `tts-chapelet`)
3. Rôle : **« Synthétiseur vocal Cloud Text-to-Speech »** (ou Editor)
4. Une fois créé, clique sur le compte → **Clés → Ajouter une clé → JSON**
5. Le navigateur télécharge un fichier `*.json`

### 3. Placer la clé

**Option A (recommandée — locale, jamais commit)** :
Renomme le JSON en `google-credentials.json` et place-le dans `scripts/`.

**Option B** : définir la variable d'environnement
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/chemin/vers/cle.json"
```

> ⚠️ Le `.gitignore` exclut automatiquement `google-credentials.json`
> et tout fichier `*-credentials*.json` pour éviter une fuite de clé.

### 4. Installer les dépendances

```bash
cd scripts
npm install
```

## Générer les audios

```bash
cd scripts
npm run all
```

Cela exécute :
1. `extract-texts.js` → lit `js/app.js` et génère `tts-texts.json`
2. `generate-tts.js` → appelle Google Cloud TTS et crée les fichiers MP3

Les fichiers sont déposés dans `audio/{lang}/{m,f}/...mp3` à la racine du projet.

### Détails

- **6 langues** : fr, en, es, it, pt, la (le latin utilise les voix italiennes)
- **2 voix par langue** : femme (`f/`) et homme (`m/`)
- **24 fichiers par langue/voix** = 4 prières + 20 annonces de mystères
- **Total : ~288 fichiers MP3 (~10 Mo)**
- **Coût** : ~40 000 caractères au total → 0 € (tier gratuit Wavenet : 1 M chars/mois)

## Régénérer après modification

Si les prières dans `js/app.js` sont modifiées :

```bash
# Supprime les anciens fichiers du langage modifié si besoin
rm -rf ../audio/fr/

# Re-génère
npm run all
```

Le script `generate-tts.js` est **idempotent** : il saute les fichiers déjà
existants. Donc tu peux le relancer sans tout regénérer.

## Voix utilisées

| Langue | Femme | Homme |
|--------|-------|-------|
| Français | fr-FR-Wavenet-C | fr-FR-Wavenet-D |
| Anglais  | en-US-Wavenet-F | en-US-Wavenet-D |
| Espagnol | es-ES-Wavenet-C | es-ES-Wavenet-B |
| Italien  | it-IT-Wavenet-A | it-IT-Wavenet-D |
| Portugais| pt-PT-Wavenet-A | pt-PT-Wavenet-B |
| Latin    | (italien)       | (italien)       |

Pour changer une voix : édite `VOICES` en haut de `generate-tts.js`.
[Liste complète des voix disponibles](https://cloud.google.com/text-to-speech/docs/voices)
