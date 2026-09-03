/* ═══════════════════════════════════════════════════════════════════
   PRIONSENLIGNE — Mesure d'usage

   Répond à une question simple : pour quoi les gens viennent-ils ?
   Quelles pages, quels onglets, quelles fonctions, à quelles heures,
   et combien de temps restent-ils.

   Ce fichier n'enregistre RIEN qui désigne quelqu'un : pas d'identifiant,
   pas d'adresse, pas de session. Il incrémente des compteurs partagés
   (voir supabase/usage_stats.sql). Deux personnes lisant la même page
   ajoutent 1 à la même ligne, et rien ne les distingue ensuite.

   Il est chargé sur toutes les pages, y compris celles de contenu qui
   n'embarquent pas la bibliothèque Supabase : d'où l'appel direct à
   l'API REST plutôt qu'au client. La clé anon est publique par
   conception — c'est celle que tout visiteur utilise déjà.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const CACHE = 'pel.cfg';
  let cfg = null;

  async function config() {
    if (cfg) return cfg;
    try {
      const brut = sessionStorage.getItem(CACHE);
      if (brut) { cfg = JSON.parse(brut); return cfg; }
    } catch (_) {}
    try {
      const r = await fetch('/api/config');
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.supabaseUrl || !j.supabaseAnon) return null;
      cfg = { url: j.supabaseUrl, key: j.supabaseAnon };
      try { sessionStorage.setItem(CACHE, JSON.stringify(cfg)); } catch (_) {}
      return cfg;
    } catch (_) { return null; }
  }

  /* keepalive : la requête doit survivre à la fermeture de l'onglet,
     sinon la durée de visite ne partirait jamais. */
  async function envoyer(type, cle, valeur) {
    const c = await config();
    if (!c) return;
    try {
      await fetch(c.url + '/rest/v1/rpc/stat_bump', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: c.key,
          Authorization: 'Bearer ' + c.key,
        },
        body: JSON.stringify({ p_type: type, p_cle: String(cle).slice(0, 60), p_valeur: valeur || 0 }),
      });
    } catch (_) {}
  }

  // Exposé pour que l'application signale ses propres actions.
  window.pelStat = function (type, cle, valeur) {
    try { envoyer(type, cle, valeur); } catch (_) {}
  };

  // ── Page consultée ──────────────────────────────────────────────
  // Le chemin seul, jamais les paramètres : ils pourraient contenir
  // autre chose qu'un numéro de page.
  const chemin = location.pathname.replace(/\/$/, '') || '/';
  envoyer('page', chemin);

  // ── Heure d'arrivée ─────────────────────────────────────────────
  envoyer('heure', String(new Date().getHours()));

  // ── Durée de la visite ──────────────────────────────────────────
  // Envoyée une seule fois, au moment où la page se cache ou se ferme.
  // pagehide est le seul événement fiable sur iOS : « beforeunload » n'y
  // part pas quand l'utilisateur bascule d'application.
  const debut = Date.now();
  let envoyee = false;
  function finDeVisite() {
    if (envoyee) return;
    const s = Math.round((Date.now() - debut) / 1000);
    if (s < 3) return;          // un rebond immédiat n'est pas une visite
    envoyee = true;
    envoyer('visite', 'total', s);
  }
  window.addEventListener('pagehide', finDeVisite);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') finDeVisite();
  });
})();
