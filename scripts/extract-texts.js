#!/usr/bin/env node
/**
 * extract-texts.js
 *
 * Extrait les textes du chapelet directement depuis js/app.js
 * et génère scripts/tts-texts.json (utilisé par generate-tts.js).
 *
 * Permet d'éviter de dupliquer les prières — la source de vérité
 * reste app.js. Lance ce script à chaque fois que les prières
 * sont modifiées.
 *
 * USAGE : cd scripts && node extract-texts.js
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const appJsPath = path.join(__dirname, '..', 'js', 'app.js');
const outPath   = path.join(__dirname, 'tts-texts.json');

const src = fs.readFileSync(appJsPath, 'utf8');

// ── Extraction de CHAPELET_TEXTS ─────────────────────────────────
function extractBlock(varName) {
  const startMarker = `const ${varName} = {`;
  const startIdx    = src.indexOf(startMarker);
  if (startIdx === -1) throw new Error(`Bloc ${varName} introuvable dans app.js`);

  // Compteur d'accolades pour trouver la fin du bloc
  let i = startIdx + startMarker.length - 1;
  let depth = 1;
  let inStr = null;
  let inTpl = false;
  i++;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === inStr) inStr = null;
    } else if (inTpl) {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') inTpl = false;
    } else {
      if (c === '"' || c === "'") inStr = c;
      else if (c === '`')         inTpl = true;
      else if (c === '{')         depth++;
      else if (c === '}')         depth--;
    }
    i++;
  }
  return src.slice(startIdx, i) + ';';
}

// On évalue les deux blocs dans une sandbox isolée
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(extractBlock('CHAPELET_TEXTS'), sandbox);

// MYST_DATA est imbriqué dans initChapelet → on l'extrait au regex
function extractMystData() {
  const marker = 'const MYST_DATA = {';
  const startIdx = src.indexOf(marker);
  if (startIdx === -1) throw new Error('MYST_DATA introuvable');
  let i = startIdx + marker.length - 1;
  let depth = 1;
  let inStr = null, inTpl = false;
  i++;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (inStr)      { if (c === '\\') { i += 2; continue; } if (c === inStr) inStr = null; }
    else if (inTpl) { if (c === '\\') { i += 2; continue; } if (c === '`') inTpl = false; }
    else {
      if (c === '"' || c === "'") inStr = c;
      else if (c === '`')         inTpl = true;
      else if (c === '{')         depth++;
      else if (c === '}')         depth--;
    }
    i++;
  }
  vm.runInContext(src.slice(startIdx, i) + ';', sandbox);
}
extractMystData();

const CHAPELET_TEXTS = sandbox.CHAPELET_TEXTS;
const MYST_DATA      = sandbox.MYST_DATA;

// ── Génération des annonces de mystères (selon ANNOUNCE dans app.js) ──
const ANNOUNCE = {
  fr: (i, m) => `${i+1}ᵉ mystère : ${m}.`,
  en: (i, m) => `${i+1}${['st','nd','rd','th','th'][i]} mystery: ${m}.`,
  es: (i, m) => `${i+1}º misterio: ${m}.`,
  it: (i, m) => `${i+1}° mistero: ${m}.`,
  pt: (i, m) => `${i+1}º mistério: ${m}.`,
  la: (i, m) => `Mysterium ${['primum','secundum','tertium','quartum','quintum'][i]}: ${m}.`,
};

// ── Construction du JSON de sortie ────────────────────────────────
const out = { prayers: {}, mysteries: {} };

for (const [lang, data] of Object.entries(CHAPELET_TEXTS)) {
  // Texte des prières — on supprime les retours à la ligne pour TTS
  out.prayers[lang] = {};
  for (const [key, txt] of Object.entries(data.texts)) {
    out.prayers[lang][key] = txt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Annonces de mystères
  out.mysteries[lang] = {};
  const mystSet = MYST_DATA[lang] || MYST_DATA.fr;
  for (const [mystKey, mystObj] of Object.entries(mystSet)) {
    out.mysteries[lang][mystKey] = mystObj.list.map((m, i) => ANNOUNCE[lang](i, m));
  }
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

const langs = Object.keys(out.prayers);
let totalChars = 0, totalEntries = 0;
for (const l of langs) {
  for (const v of Object.values(out.prayers[l])) { totalChars += v.length; totalEntries++; }
  for (const arr of Object.values(out.mysteries[l] || {})) {
    for (const v of arr) { totalChars += v.length; totalEntries++; }
  }
}

console.log(`✓ Généré : ${outPath}`);
console.log(`  Langues : ${langs.join(', ')}`);
console.log(`  Entrées : ${totalEntries} (× 2 voix = ${totalEntries * 2} fichiers MP3)`);
console.log(`  Caractères : ${totalChars} (× 2 voix = ${totalChars * 2})`);
console.log(`  Coût Wavenet estimé : 0 € (tier gratuit : 1M chars/mois)`);
