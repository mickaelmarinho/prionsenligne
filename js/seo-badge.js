/* ═══════════════════════════════════════════════════════════════════
   PRIONSENLIGNE — Badge SEO (administrateurs)

   Une pastille discrète en bas d'écran, sur chaque page, qui dit si la
   page est correctement préparée pour Google : titre, méta-description,
   canonical, H1 unique, données structurées, présence au sitemap.

   Ce que ce badge NE dit PAS : si Google a réellement indexé la page.
   Cela ne se lit que dans la Search Console, et rien d'autre ne le sait
   de façon fiable. Le badge répond à la question utile en amont — « y
   a-t-il quelque chose qui empêche l'indexation ? » — et propose un lien
   direct vers l'inspection Search Console pour la réponse définitive.

   Visible uniquement si localStorage['pel.admin'] vaut '1', posé par
   js/admin.js quand le compte connecté porte is_admin. Ce n'est pas une
   barrière de sécurité et n'a pas à l'être : tout ce qu'affiche le badge
   est déjà dans le code source de la page, visible par n'importe qui.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  try {
    if (localStorage.getItem('pel.admin') !== '1') return;
    if (sessionStorage.getItem('pel.seoBadge') === 'off') return;
  } catch (_) { return; }

  const OK = 'ok', ATTENTION = 'warn', PROBLEME = 'ko';

  function texte(sel, attr) {
    const el = document.querySelector(sel);
    if (!el) return '';
    return (attr ? el.getAttribute(attr) : el.textContent || '').trim();
  }

  /* Le sitemap n'est lu qu'une fois par session : inutile de le
     retélécharger à chaque page visitée. */
  async function urlsDuSitemap() {
    try {
      const cache = sessionStorage.getItem('pel.sitemapUrls');
      if (cache) return JSON.parse(cache);
    } catch (_) {}
    try {
      const r = await fetch('/sitemap.xml', { cache: 'no-cache' });
      if (!r.ok) return null;
      const xml = await r.text();
      /* On ne garde que le chemin : le sitemap contient les adresses de
         production, alors qu'on peut consulter le site en local. */
      const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)]
        .map(m => { try { return new URL(m[1]).pathname.replace(/\/$/, ''); } catch (_) { return ''; } });
      try { sessionStorage.setItem('pel.sitemapUrls', JSON.stringify(urls)); } catch (_) {}
      return urls;
    } catch (_) { return null; }
  }

  async function auditer() {
    const checks = [];
    const ajoute = (nom, etat, detail) => checks.push({ nom, etat, detail });

    // 1. Titre — trop court, il n'accroche pas ; trop long, Google le coupe.
    const titre = document.title.trim();
    if (!titre) ajoute('Titre', PROBLEME, 'absent');
    else if (titre.length < 30) ajoute('Titre', ATTENTION, titre.length + ' caractères — un peu court');
    else if (titre.length > 65) ajoute('Titre', ATTENTION, titre.length + ' caractères — Google le coupera');
    else ajoute('Titre', OK, titre.length + ' caractères');

    // 2. Méta-description — c'est le texte affiché sous le lien dans Google.
    const desc = texte('meta[name="description"]', 'content');
    if (!desc) ajoute('Méta-description', PROBLEME, 'absente');
    else if (desc.length < 70) ajoute('Méta-description', ATTENTION, desc.length + ' caractères — courte');
    else if (desc.length > 165) ajoute('Méta-description', ATTENTION, desc.length + ' caractères — sera coupée');
    else ajoute('Méta-description', OK, desc.length + ' caractères');

    /* 3. Canonical — dit à Google quelle est l'adresse de référence.
       On compare les CHEMINS, pas les adresses entières : sinon le badge
       criait au loup en local et sur les préversions Vercel, où le
       canonical pointe — normalement — vers le domaine de production. */
    const canon = texte('link[rel="canonical"]', 'href');
    const chemin = location.pathname.replace(/\/$/, '');
    const enProd = location.hostname === 'prionsenligne.fr';
    if (!canon) {
      ajoute('Canonical', PROBLEME, 'absent');
    } else {
      let c = null;
      try { c = new URL(canon, location.href); } catch (_) {}
      if (!c) ajoute('Canonical', PROBLEME, 'adresse invalide : ' + canon);
      else if (c.pathname.replace(/\/$/, '') !== chemin) ajoute('Canonical', ATTENTION, 'pointe vers ' + c.pathname);
      else if (enProd && c.host !== location.host) ajoute('Canonical', ATTENTION, 'autre domaine : ' + c.host);
      else ajoute('Canonical', OK, enProd ? 'correct' : 'chemin correct (hors production)');
    }

    // 4. H1 — un seul, qui dit de quoi parle la page.
    const h1 = document.querySelectorAll('h1');
    if (h1.length === 0) ajoute('Titre H1', PROBLEME, 'aucun');
    else if (h1.length > 1) ajoute('Titre H1', ATTENTION, h1.length + ' H1 — il n\'en faut qu\'un');
    else {
      const t = (h1[0].innerText || h1[0].textContent || '').replace(/\s+/g, ' ').trim();
      ajoute('Titre H1', OK, '« ' + t.slice(0, 40) + ' »');
    }

    // 5. Indexable — un noindex oublié rend tout le reste inutile.
    const robots = (texte('meta[name="robots"]', 'content') || '').toLowerCase();
    if (robots.includes('noindex')) ajoute('Indexable', PROBLEME, 'meta robots = noindex');
    else ajoute('Indexable', OK, robots ? robots : 'rien ne l\'empêche');

    // 6. Données structurées — ce qui permet les résultats enrichis.
    const blocs = [...document.querySelectorAll('script[type="application/ld+json"]')];
    let types = [];
    let casse = false;
    blocs.forEach(b => {
      try {
        const j = JSON.parse(b.textContent);
        (Array.isArray(j) ? j : [j]).forEach(o => o && o['@type'] && types.push(o['@type']));
      } catch (_) { casse = true; }
    });
    if (casse) ajoute('Données structurées', PROBLEME, 'JSON invalide');
    else if (!blocs.length) ajoute('Données structurées', ATTENTION, 'aucune');
    else ajoute('Données structurées', OK, types.join(', ') || blocs.length + ' bloc(s)');

    // 7. Partage — l'aperçu quand le lien est envoyé sur WhatsApp ou Facebook.
    const ogT = texte('meta[property="og:title"]', 'content');
    const ogI = texte('meta[property="og:image"]', 'content');
    if (ogT && ogI) ajoute('Aperçu de partage', OK, 'titre + image');
    else if (ogT || ogI) ajoute('Aperçu de partage', ATTENTION, ogT ? 'image manquante' : 'titre manquant');
    else ajoute('Aperçu de partage', PROBLEME, 'aucune balise Open Graph');

    // 8. Sitemap — Google ne devine pas les pages qu'aucun lien n'atteint.
    const urls = await urlsDuSitemap();
    if (urls === null) ajoute('Dans le sitemap', ATTENTION, 'sitemap illisible');
    else if (urls.includes(chemin)) ajoute('Dans le sitemap', OK, 'oui');
    else ajoute('Dans le sitemap', PROBLEME, 'cette page n\'y figure pas');

    /* 9. Images sans alternative textuelle. alt="" est CORRECT pour une
       image décorative : c'est l'absence totale d'attribut qui pose
       problème. Confondre les deux ferait crier au loup sur chaque logo. */
    const sansAlt = [...document.images].filter(i => i.getAttribute('alt') === null && !i.hasAttribute('aria-hidden'));
    if (sansAlt.length) ajoute('Images décrites', ATTENTION, sansAlt.length + ' image(s) sans alt');
    else ajoute('Images décrites', OK, document.images.length + ' image(s)');

    return checks;
  }

  function styles() {
    if (document.getElementById('pelseo-style')) return;
    const s = document.createElement('style');
    s.id = 'pelseo-style';
    s.textContent = `
      /* --pelseo-bas : hauteur à réserver sous la pastille. Vaut la barre de
         navigation du bas quand l'application en affiche une — sinon le badge
         se posait dessus et masquait Calendrier, Bible et Sources. */
      .pelseo-pill{position:fixed;left:14px;bottom:calc(var(--pelseo-bas,0px) + 14px + env(safe-area-inset-bottom,0px));
        z-index:9998;display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 14px;
        border-radius:999px;border:1px solid rgba(255,255,255,.18);background:#1a2744;color:#f5f0e8;
        font:500 13px/1 'Outfit',system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.28)}
      .pelseo-pill:hover{background:#243458}
      /* Réduite à sa pastille de couleur tant qu'on ne s'en sert pas : sur un
         téléphone, une étiquette permanente mange trop de l'écran. */
      .pelseo-pill.repliee{min-height:30px;width:30px;padding:0;justify-content:center;opacity:.75}
      .pelseo-pill.repliee .pelseo-txt{display:none}
      .pelseo-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
      .pelseo-dot.ok{background:#4c9a63}.pelseo-dot.warn{background:#d9a441}.pelseo-dot.ko{background:#c1554b}
      .pelseo-panel{position:fixed;left:14px;bottom:calc(var(--pelseo-bas,0px) + 58px + env(safe-area-inset-bottom,0px));
        z-index:9999;width:min(340px,calc(100vw - 28px));max-height:min(70vh,520px);overflow:auto;
        background:#fff;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.3);
        font:400 13.5px/1.5 'Outfit',system-ui,sans-serif;color:#1e1c18;padding:14px 16px 12px}
      .pelseo-panel[hidden]{display:none}
      .pelseo-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}
      .pelseo-h b{font-size:14px;color:#1a2744}
      .pelseo-h span{font-size:11.5px;color:#6b6357}
      .pelseo-row{display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-top:1px solid rgba(0,0,0,.07)}
      .pelseo-row:first-of-type{border-top:none}
      .pelseo-row .pelseo-dot{margin-top:5px}
      .pelseo-n{font-weight:500;color:#1a2744}
      .pelseo-d{color:#6b6357;font-size:12.5px;word-break:break-word}
      .pelseo-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;padding-top:11px;border-top:1px solid rgba(0,0,0,.07)}
      .pelseo-acts a,.pelseo-acts button{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;
        border-radius:999px;border:1px solid rgba(0,0,0,.14);background:#f7f3ea;color:#1a2744;
        font:500 12.5px 'Outfit',system-ui,sans-serif;text-decoration:none;cursor:pointer}
      .pelseo-acts a:hover,.pelseo-acts button:hover{background:#efe7d6}
      .pelseo-note{margin:10px 0 0;font-size:11.5px;line-height:1.5;color:#6b6357}
    `;
    document.head.appendChild(s);
  }

  function ech(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function afficher() {
    const checks = await auditer();
    const ko   = checks.filter(c => c.etat === PROBLEME).length;
    const warn = checks.filter(c => c.etat === ATTENTION).length;
    const etat = ko ? PROBLEME : (warn ? ATTENTION : OK);
    const resume = ko ? `${ko} problème${ko > 1 ? 's' : ''}`
                 : warn ? `${warn} à revoir`
                 : 'tout est bon';

    styles();

    /* Hauteur de la barre de navigation du bas, quand il y en a une : la
       pastille doit se poser au-dessus, pas devant. Mesurée sur l'élément
       réel plutôt que codée en dur — elle change selon l'écran. */
    const barre = document.querySelector('.bottom-nav');
    if (barre) {
      const h = Math.round(barre.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty('--pelseo-bas', h + 'px');
    }

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pelseo-pill repliee';
    pill.setAttribute('aria-expanded', 'false');
    pill.title = `SEO — ${resume}`;
    pill.innerHTML = `<span class="pelseo-dot ${etat}"></span><span class="pelseo-txt">SEO — ${resume}</span>`;

    const url = location.origin + location.pathname;
    const panel = document.createElement('div');
    panel.className = 'pelseo-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="pelseo-h">
        <b>Préparation de la page</b>
        <span>${checks.length - ko - warn}/${checks.length} au vert</span>
      </div>
      ${checks.map(c => `
        <div class="pelseo-row">
          <span class="pelseo-dot ${c.etat}"></span>
          <div><div class="pelseo-n">${ech(c.nom)}</div><div class="pelseo-d">${ech(c.detail)}</div></div>
        </div>`).join('')}
      <div class="pelseo-acts">
        <a href="https://search.google.com/search-console/inspect?resource_id=sc-domain:prionsenligne.fr&id=${encodeURIComponent(url)}"
           target="_blank" rel="noopener">Search Console</a>
        <a href="https://www.google.com/search?q=site:${encodeURIComponent(url)}"
           target="_blank" rel="noopener">Voir dans Google</a>
        <button type="button" class="pelseo-off">Masquer</button>
      </div>
      <p class="pelseo-note">
        Ces contrôles disent si la page est <em>prête</em> à être indexée.
        Savoir si Google l'a <em>réellement</em> indexée ne se lit que dans la
        Search Console — d'où le lien ci-dessus.
      </p>`;

    // Repliée au repos, dépliée avec son texte tant que le détail est ouvert.
    pill.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      pill.classList.toggle('repliee', panel.hidden);
      pill.setAttribute('aria-expanded', String(!panel.hidden));
    });
    panel.querySelector('.pelseo-off').addEventListener('click', () => {
      try { sessionStorage.setItem('pel.seoBadge', 'off'); } catch (_) {}
      pill.remove(); panel.remove();
    });

    document.body.appendChild(panel);
    document.body.appendChild(pill);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { afficher().catch(() => {}); });
  } else {
    afficher().catch(() => {});
  }
})();
