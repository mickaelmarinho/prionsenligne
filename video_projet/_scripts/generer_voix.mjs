// Génère la voix off via ElevenLabs, une ligne = un fichier mp3.
// Usage : node generer_voix.mjs <chemin/repliques.json> <dossier/sortie>
// Variables d'env requises : ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID

import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

if (!API_KEY || !VOICE_ID) {
  console.error("ERREUR : définis ELEVENLABS_API_KEY et ELEVENLABS_VOICE_ID.");
  process.exit(1);
}

const repliquesPath = process.argv[2];
const outDir = process.argv[3];
if (!repliquesPath || !outDir) {
  console.error("Usage : node generer_voix.mjs <repliques.json> <dossier_sortie>");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const data = JSON.parse(fs.readFileSync(repliquesPath, "utf8"));

for (const ligne of data.lignes) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  const body = {
    text: ligne.texte,
    model_id: MODEL,
    voice_settings: {
      stability: 0.45,
      similarity_boost: 0.8,
      style: 0.5,
      use_speaker_boost: true
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.error(`Ligne ${ligne.id} : erreur ${res.status} — ${await res.text()}`);
    process.exit(1);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(outDir, `ligne_${String(ligne.id).padStart(2, "0")}.mp3`);
  fs.writeFileSync(file, buf);
  console.log(`OK  ligne ${ligne.id}  (start ${ligne.start}s)  -> ${file}`);
}

console.log("\nTerminé. Tous les fichiers voix off sont générés.");
