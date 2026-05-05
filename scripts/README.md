# Scripts TTS — Chapelet PrionsEnLigne

Génère les fichiers audio MP3 du chapelet via l'API REST Google Cloud Text-to-Speech.
Une seule génération suffit : les fichiers sont ensuite servis comme ressources
statiques par le site (aucun coût récurrent).

## Setup initial (une seule fois)

### 1. Activer l'API Cloud Text-to-Speech

1. Va sur [console.cloud.google.com](https://console.cloud.google.com/)
2. Sélectionne (ou crée) un projet
3. Dans la barre de recherche : **« Cloud Text-to-Speech API »**
4. Clique sur **« Activer »**

### 2. Créer une clé API

> 💡 **Pourquoi une clé API et non un compte de service ?**
> Beaucoup d'organisations Google Cloud bloquent les clés de compte de service par
> défaut (politique `iam.disableServiceAccountKeyCreation`). Une simple clé API
> est suffisante et plus simple à gérer pour notre usage.

1. **APIs et services → Identifiants** (`APIs & Services → Credentials`)
2. **+ Créer des identifiants → Clé API**
3. Une fenêtre affiche ta clé → **copie-la**
4. Clique sur **« Modifier la clé API »** (recommandé pour la sécurité)
5. Sous **Restrictions liées aux API** :
   - Sélectionne **« Restreindre la clé »**
   - Coche uniquement **« Cloud Text-to-Speech API »**
6. **Enregistrer**

### 3. Placer la clé localement

Crée un fichier `scripts/google-api-key.txt` qui contient **uniquement la clé**
(pas de guillemets, pas de retour à la ligne) :

```
AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

> ⚠️ Ce fichier est dans `.gitignore` — il ne sera jamais commit.

**Ou** définis une variable d'environnement :
```bash
# Linux/macOS
export GOOGLE_TTS_API_KEY="AIzaSyXXX..."

# Windows PowerShell
$env:GOOGLE_TTS_API_KEY="AIzaSyXXX..."
```

### 4. Aucune dépendance npm requise

Le script utilise `fetch` natif de Node.js 18+. Pas besoin de `npm install`.

## Générer les audios

```bash
cd scripts
npm run all
```

Cela exécute :
1. **`extract-texts.js`** → lit `js/app.js` et génère `tts-texts.json`
2. **`generate-tts.js`** → appelle Google Cloud TTS et crée les fichiers MP3

Les fichiers sont déposés dans `audio/{lang}/{m,f}/...mp3` à la racine du projet.

### Détails

- **6 langues** : fr, en, es, it, pt, la (le latin utilise les voix italiennes)
- **2 voix par langue** : femme (`f/`) et homme (`m/`)
- **24 fichiers par langue/voix** = 4 prières + 20 annonces de mystères
- **Total** : ~288 fichiers MP3 (~10 Mo)
- **Coût** : ~80 000 caractères → **0 €** (tier gratuit Wavenet : 1 M chars/mois)

## Régénérer après modification

Le script `generate-tts.js` est **idempotent** : il saute les fichiers déjà existants.
Si tu modifies une prière dans `js/app.js` :

```bash
# Supprime les fichiers à régénérer
rm -rf ../audio/fr/

# Relance
npm run all
```

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

## Sécurité — bonnes pratiques

- ✅ La clé API est **restreinte au TTS uniquement** (étape 2.5)
- ✅ Le fichier `google-api-key.txt` est dans `.gitignore`
- ✅ La clé n'est utilisée que **localement** pour générer les fichiers
- ✅ Une fois les MP3 générés, **la clé peut être supprimée** dans Google Cloud
  (les fichiers audio resteront sur le site, ils sont statiques)

Donc même si la clé fuit après usage, elle ne te coûtera rien tant qu'elle est
restreinte au TTS et que tu la révoques après génération.
