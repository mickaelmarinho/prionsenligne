/*
  Vercel Serverless Function — /api/bible-search

  Recherche plein texte dans la Bible catholique Crampon 1923.

  Pourquoi côté serveur : le corpus complet pèse ~1,8 Mo compressé. Le
  télécharger dans le navigateur pour une simple recherche serait pénalisant
  sur les connexions lentes (une bonne part du public du site est en 3G/4G).
  Le texte est donc parcouru ici, et seuls les versets trouvés transitent.

  Paramètres :
    q     mots recherchés (2 caractères minimum)
    limit nombre de résultats (défaut 12, max 50)

  Réponse : { q, total, results: [{ book, abbr, ch, vs, text }] }
*/

import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'bible', 'crampon');

// Corpus chargé une seule fois par instance (réutilisé entre les appels tièdes)
let CORPUS = null;

function accentless(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function loadCorpus() {
  if (CORPUS) return CORPUS;
  const index = JSON.parse(fs.readFileSync(path.join(DIR, '_index.json'), 'utf8'));
  const rows = [];
  for (const b of index.books) {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, `${b.id}.json`), 'utf8'));
    for (const ch of Object.keys(data.v)) {
      const verses = data.v[ch];
      for (const vs of Object.keys(verses)) {
        const text = verses[vs];
        rows.push({ book: b.name, abbr: b.abbr, ch: +ch, vs: +vs, text, n: accentless(text) });
      }
    }
  }
  CORPUS = rows;
  return CORPUS;
}

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);

  if (q.length < 2) {
    res.status(400).json({ error: 'Requête trop courte (2 caractères minimum).' });
    return;
  }

  let corpus;
  try {
    corpus = loadCorpus();
  } catch (err) {
    res.status(500).json({ error: 'Corpus indisponible.', detail: err.message });
    return;
  }

  // Tous les mots doivent être présents dans le verset (recherche « ET »),
  // sans tenir compte des accents ni de la casse.
  const words = accentless(q).split(/\s+/).filter(w => w.length > 1);
  if (!words.length) {
    res.status(400).json({ error: 'Requête trop courte (2 caractères minimum).' });
    return;
  }

  // Parcours complet (~34 600 versets, quelques millisecondes) : on connaît
  // ainsi le nombre exact de passages, tout en n'en renvoyant qu'une page.
  const results = [];
  let total = 0;
  for (const row of corpus) {
    let hit = true;
    for (const w of words) { if (!row.n.includes(w)) { hit = false; break; } }
    if (!hit) continue;
    total++;
    if (results.length < limit) {
      results.push({ book: row.book, abbr: row.abbr, ch: row.ch, vs: row.vs, text: row.text });
    }
  }

  // Les textes ne changent jamais : mise en cache longue côté CDN.
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.status(200).json({ q, total, results });
}
