#!/usr/bin/env node
/**
 * generate-tts.js
 *
 * Génère tous les fichiers audio MP3 du chapelet via Google Cloud Text-to-Speech.
 *
 * PRÉREQUIS :
 *   1. Compte Google Cloud créé
 *   2. API "Cloud Text-to-Speech" activée
 *   3. Clé de compte de service téléchargée (JSON)
 *   4. Variable d'env GOOGLE_APPLICATION_CREDENTIALS pointant vers le JSON
 *      OU placer le JSON dans scripts/google-credentials.json
 *   5. npm install @google-cloud/text-to-speech (depuis le dossier scripts/)
 *
 * USAGE :
 *   cd scripts && node generate-tts.js
 *
 * SORTIE : fichiers MP3 dans /audio/{lang}/{m,f}/{prayerKey}.mp3
 *           et /audio/{lang}/{m,f}/myst-{type}-{n}.mp3
 *
 * Coût estimé : ~20 000 caractères × 2 voix = 40 000 chars
 *               → bien dans le tier gratuit (1M chars/mois Wavenet/Neural)
 */

const fs   = require('fs');
const path = require('path');
const textToSpeech = require('@google-cloud/text-to-speech');

// Si pas de variable d'env, on cherche un fichier local
const localCreds = path.join(__dirname, 'google-credentials.json');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(localCreds)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = localCreds;
}

const client  = new textToSpeech.TextToSpeechClient();
const OUT_DIR = path.join(__dirname, '..', 'audio');

// ── Voix Google Cloud TTS Wavenet (qualité quasi-humaine) ─────────────
// Voir : https://cloud.google.com/text-to-speech/docs/voices
const VOICES = {
  fr: { f: { code:'fr-FR', name:'fr-FR-Wavenet-C' }, m: { code:'fr-FR', name:'fr-FR-Wavenet-D' } },
  en: { f: { code:'en-US', name:'en-US-Wavenet-F' }, m: { code:'en-US', name:'en-US-Wavenet-D' } },
  es: { f: { code:'es-ES', name:'es-ES-Wavenet-C' }, m: { code:'es-ES', name:'es-ES-Wavenet-B' } },
  it: { f: { code:'it-IT', name:'it-IT-Wavenet-A' }, m: { code:'it-IT', name:'it-IT-Wavenet-D' } },
  pt: { f: { code:'pt-PT', name:'pt-PT-Wavenet-A' }, m: { code:'pt-PT', name:'pt-PT-Wavenet-B' } },
  // Latin n'existe pas → fallback voix italiennes (prononciation la plus proche)
  la: { f: { code:'it-IT', name:'it-IT-Wavenet-A' }, m: { code:'it-IT', name:'it-IT-Wavenet-D' } },
};

// ── Données : chargées depuis le fichier JSON séparé pour propreté ──
const TEXTS = require('./tts-texts.json');

// ── Génération ───────────────────────────────────────────────────────
async function synthesize(text, voice, outFile) {
  if (fs.existsSync(outFile)) {
    console.log('  ✓ Skip (existe déjà):', path.relative(OUT_DIR, outFile));
    return;
  }

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: { languageCode: voice.code, name: voice.name },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.95,    // léger ralentissement pour la prière
      pitch: 0,
      sampleRateHertz: 24000,
    },
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, response.audioContent, 'binary');
  const sizeKB = (response.audioContent.length / 1024).toFixed(1);
  console.log(`  ✓ Généré (${sizeKB} KB):`, path.relative(OUT_DIR, outFile));
}

async function generateAll() {
  let total = 0, generated = 0;

  for (const [lang, prayers] of Object.entries(TEXTS.prayers)) {
    for (const [gender, voice] of Object.entries(VOICES[lang])) {
      console.log(`\n── ${lang.toUpperCase()} / ${gender === 'f' ? 'femme' : 'homme'} (${voice.name}) ──`);

      // Prières fixes
      for (const [key, text] of Object.entries(prayers)) {
        total++;
        const outFile = path.join(OUT_DIR, lang, gender, `${key}.mp3`);
        if (!fs.existsSync(outFile)) generated++;
        await synthesize(text, voice, outFile);
      }

      // Annonces de mystères
      for (const [mystKey, mystAnnounces] of Object.entries(TEXTS.mysteries[lang] || {})) {
        for (let i = 0; i < mystAnnounces.length; i++) {
          total++;
          const outFile = path.join(OUT_DIR, lang, gender, `myst-${mystKey}-${i}.mp3`);
          if (!fs.existsSync(outFile)) generated++;
          await synthesize(mystAnnounces[i], voice, outFile);
        }
      }
    }
  }

  console.log(`\n✅ Terminé : ${generated} nouveaux fichiers / ${total} total`);
  console.log(`   Dossier de sortie : ${OUT_DIR}`);
}

generateAll().catch(err => {
  console.error('\n❌ Erreur :', err.message);
  if (err.code === 'ENOENT' || /credential/i.test(err.message)) {
    console.error('\nVérifie que GOOGLE_APPLICATION_CREDENTIALS pointe vers ton fichier JSON,');
    console.error('ou que scripts/google-credentials.json existe.');
  }
  process.exit(1);
});
