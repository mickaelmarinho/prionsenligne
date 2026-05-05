#!/usr/bin/env node
/**
 * generate-tts.js
 *
 * Génère tous les fichiers audio MP3 du chapelet via Google Cloud Text-to-Speech
 * (utilise l'API REST avec une clé API — pas de compte de service requis).
 *
 * PRÉREQUIS :
 *   1. Compte Google Cloud créé
 *   2. API "Cloud Text-to-Speech" activée
 *   3. Clé API créée (APIs & Services → Credentials → Create Credentials → API Key)
 *   4. Clé placée dans scripts/google-api-key.txt (juste la clé, en texte brut)
 *      OU variable d'env : export GOOGLE_TTS_API_KEY="ta-clé"
 *   5. Node.js 18+ requis (utilise fetch natif)
 *
 * USAGE :
 *   cd scripts
 *   node extract-texts.js   # 1ère fois ou si app.js modifié
 *   node generate-tts.js
 *
 * SORTIE : audio/{lang}/{m,f}/{prayerKey}.mp3 + audio/{lang}/{m,f}/myst-{type}-{n}.mp3
 *
 * Coût : ~40 000 caractères × 2 voix → 0 € (tier gratuit Wavenet : 1M chars/mois)
 */

const fs   = require('fs');
const path = require('path');

// ── Récupération de la clé API ───────────────────────────────────────
const localKeyFile = path.join(__dirname, 'google-api-key.txt');
let API_KEY = process.env.GOOGLE_TTS_API_KEY || '';
if (!API_KEY && fs.existsSync(localKeyFile)) {
  API_KEY = fs.readFileSync(localKeyFile, 'utf8').trim();
}
if (!API_KEY) {
  console.error('❌ Aucune clé API trouvée.');
  console.error('   Place ta clé dans scripts/google-api-key.txt');
  console.error('   ou définis la variable d\'env GOOGLE_TTS_API_KEY.');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, '..', 'audio');
const ENDPOINT = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(API_KEY)}`;

// ── Voix Google Cloud TTS Wavenet (qualité quasi-humaine) ────────────
// https://cloud.google.com/text-to-speech/docs/voices
const VOICES = {
  fr: { f: { code:'fr-FR', name:'fr-FR-Wavenet-C' }, m: { code:'fr-FR', name:'fr-FR-Wavenet-D' } },
  en: { f: { code:'en-US', name:'en-US-Wavenet-F' }, m: { code:'en-US', name:'en-US-Wavenet-D' } },
  es: { f: { code:'es-ES', name:'es-ES-Wavenet-C' }, m: { code:'es-ES', name:'es-ES-Wavenet-B' } },
  it: { f: { code:'it-IT', name:'it-IT-Wavenet-A' }, m: { code:'it-IT', name:'it-IT-Wavenet-D' } },
  pt: { f: { code:'pt-PT', name:'pt-PT-Wavenet-A' }, m: { code:'pt-PT', name:'pt-PT-Wavenet-B' } },
  // Latin n'existe pas → fallback voix italiennes (prononciation la plus proche)
  la: { f: { code:'it-IT', name:'it-IT-Wavenet-A' }, m: { code:'it-IT', name:'it-IT-Wavenet-D' } },
};

const TEXTS = require('./tts-texts.json');

// ── Appel REST direct à Google TTS ───────────────────────────────────
async function callTts(text, voice) {
  const body = {
    input: { text },
    voice: { languageCode: voice.code, name: voice.name },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.95,
      pitch: 0,
      sampleRateHertz: 24000,
    },
  };

  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error(`HTTP ${resp.status} : ${errTxt.slice(0, 300)}`);
  }
  const data = await resp.json();
  if (!data.audioContent) throw new Error('Réponse sans audioContent');
  return Buffer.from(data.audioContent, 'base64');
}

async function synthesize(text, voice, outFile) {
  if (fs.existsSync(outFile)) {
    console.log('  ✓ Skip (existe):', path.relative(OUT_DIR, outFile));
    return;
  }
  const audio = await callTts(text, voice);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, audio);
  const sizeKB = (audio.length / 1024).toFixed(1);
  console.log(`  ✓ Généré (${sizeKB} KB):`, path.relative(OUT_DIR, outFile));
}

async function generateAll() {
  let total = 0, generated = 0, errors = 0;

  for (const [lang, prayers] of Object.entries(TEXTS.prayers)) {
    for (const [gender, voice] of Object.entries(VOICES[lang])) {
      console.log(`\n── ${lang.toUpperCase()} / ${gender === 'f' ? 'femme' : 'homme'} (${voice.name}) ──`);

      // Prières fixes
      for (const [key, text] of Object.entries(prayers)) {
        total++;
        const outFile = path.join(OUT_DIR, lang, gender, `${key}.mp3`);
        if (!fs.existsSync(outFile)) generated++;
        try {
          await synthesize(text, voice, outFile);
        } catch (err) {
          errors++;
          console.error(`  ✗ Erreur ${key}:`, err.message);
        }
      }

      // Annonces de mystères
      for (const [mystKey, mystAnnounces] of Object.entries(TEXTS.mysteries[lang] || {})) {
        for (let i = 0; i < mystAnnounces.length; i++) {
          total++;
          const outFile = path.join(OUT_DIR, lang, gender, `myst-${mystKey}-${i}.mp3`);
          if (!fs.existsSync(outFile)) generated++;
          try {
            await synthesize(mystAnnounces[i], voice, outFile);
          } catch (err) {
            errors++;
            console.error(`  ✗ Erreur myst-${mystKey}-${i}:`, err.message);
          }
        }
      }
    }
  }

  console.log(`\n✅ Terminé.`);
  console.log(`   ${generated} nouveaux / ${total} total`);
  if (errors) console.log(`   ⚠ ${errors} erreur(s)`);
  console.log(`   Dossier de sortie : ${OUT_DIR}`);
}

generateAll().catch(err => {
  console.error('\n❌ Erreur fatale :', err.message);
  process.exit(1);
});
