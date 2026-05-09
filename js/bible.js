/* ════════════════════════════════════════════════════════════
   PRIONSENLIGNE — Bible interactive (Louis Segond 1910)
   ─────────────────────────────────────────────────────────────
   • API : bible-api.com (LSG public domain) avec cache localStorage
   • Surlignages : par verset, mémorisés (localStorage + Supabase si connecté)
   • Favoris : références (livre, chapitre, verset) avec note optionnelle
   • Recherche : par référence (ex: Jean 3:16) OU plein texte (à venir v2)
   ════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Liste des livres bibliques (LSG) ──────────────────────
  // id : numéro 1-66 utilisé par bolls.life (Genesis=1, Apocalypse=66)
  const BOOKS = {
    ot: [
      { name: 'Genèse',         id: 1,  ch: 50 },
      { name: 'Exode',          id: 2,  ch: 40 },
      { name: 'Lévitique',      id: 3,  ch: 27 },
      { name: 'Nombres',        id: 4,  ch: 36 },
      { name: 'Deutéronome',    id: 5,  ch: 34 },
      { name: 'Josué',          id: 6,  ch: 24 },
      { name: 'Juges',          id: 7,  ch: 21 },
      { name: 'Ruth',           id: 8,  ch: 4  },
      { name: '1 Samuel',       id: 9,  ch: 31 },
      { name: '2 Samuel',       id: 10, ch: 24 },
      { name: '1 Rois',         id: 11, ch: 22 },
      { name: '2 Rois',         id: 12, ch: 25 },
      { name: '1 Chroniques',   id: 13, ch: 29 },
      { name: '2 Chroniques',   id: 14, ch: 36 },
      { name: 'Esdras',         id: 15, ch: 10 },
      { name: 'Néhémie',        id: 16, ch: 13 },
      { name: 'Esther',         id: 17, ch: 10 },
      { name: 'Job',            id: 18, ch: 42 },
      { name: 'Psaumes',        id: 19, ch: 150 },
      { name: 'Proverbes',      id: 20, ch: 31 },
      { name: 'Ecclésiaste',    id: 21, ch: 12 },
      { name: 'Cantique',       id: 22, ch: 8  },
      { name: 'Ésaïe',          id: 23, ch: 66 },
      { name: 'Jérémie',        id: 24, ch: 52 },
      { name: 'Lamentations',   id: 25, ch: 5  },
      { name: 'Ézéchiel',       id: 26, ch: 48 },
      { name: 'Daniel',         id: 27, ch: 12 },
      { name: 'Osée',           id: 28, ch: 14 },
      { name: 'Joël',           id: 29, ch: 3  },
      { name: 'Amos',           id: 30, ch: 9  },
      { name: 'Abdias',         id: 31, ch: 1  },
      { name: 'Jonas',          id: 32, ch: 4  },
      { name: 'Michée',         id: 33, ch: 7  },
      { name: 'Nahum',          id: 34, ch: 3  },
      { name: 'Habakuk',        id: 35, ch: 3  },
      { name: 'Sophonie',       id: 36, ch: 3  },
      { name: 'Aggée',          id: 37, ch: 2  },
      { name: 'Zacharie',       id: 38, ch: 14 },
      { name: 'Malachie',       id: 39, ch: 4  },
    ],
    nt: [
      { name: 'Matthieu',       id: 40, ch: 28 },
      { name: 'Marc',           id: 41, ch: 16 },
      { name: 'Luc',            id: 42, ch: 24 },
      { name: 'Jean',           id: 43, ch: 21 },
      { name: 'Actes',          id: 44, ch: 28 },
      { name: 'Romains',        id: 45, ch: 16 },
      { name: '1 Corinthiens',  id: 46, ch: 16 },
      { name: '2 Corinthiens',  id: 47, ch: 13 },
      { name: 'Galates',        id: 48, ch: 6  },
      { name: 'Éphésiens',      id: 49, ch: 6  },
      { name: 'Philippiens',    id: 50, ch: 4  },
      { name: 'Colossiens',     id: 51, ch: 4  },
      { name: '1 Thessaloniciens', id: 52, ch: 5 },
      { name: '2 Thessaloniciens', id: 53, ch: 3 },
      { name: '1 Timothée',     id: 54, ch: 6  },
      { name: '2 Timothée',     id: 55, ch: 4  },
      { name: 'Tite',           id: 56, ch: 3  },
      { name: 'Philémon',       id: 57, ch: 1  },
      { name: 'Hébreux',        id: 58, ch: 13 },
      { name: 'Jacques',        id: 59, ch: 5  },
      { name: '1 Pierre',       id: 60, ch: 5  },
      { name: '2 Pierre',       id: 61, ch: 3  },
      { name: '1 Jean',         id: 62, ch: 5  },
      { name: '2 Jean',         id: 63, ch: 1  },
      { name: '3 Jean',         id: 64, ch: 1  },
      { name: 'Jude',           id: 65, ch: 1  },
      { name: 'Apocalypse',     id: 66, ch: 22 },
    ],
  };

  // ── Index inverse : nom français (normalisé) → entrée livre ──
  const BOOK_INDEX = {};
  function norm(s) {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // retire accents
      .replace(/[\s.]+/g, '');                             // retire espaces/points
  }
  [...BOOKS.ot, ...BOOKS.nt].forEach(b => {
    BOOK_INDEX[norm(b.name)] = b;
    // Alias courts
    if (b.name === 'Psaumes')      BOOK_INDEX['ps']  = b;
    if (b.name === 'Genèse')       BOOK_INDEX['gn']  = b;
    if (b.name === 'Matthieu')     BOOK_INDEX['mt']  = b;
    if (b.name === 'Marc')         BOOK_INDEX['mc']  = b;
    if (b.name === 'Luc')          BOOK_INDEX['lc']  = b;
    if (b.name === 'Jean')         BOOK_INDEX['jn']  = b;
  });

  // ── État courant ──────────────────────────────────────────
  let currentBook = null;
  let currentChapter = null;
  let currentVerseHighlight = null;   // numéro de verset à scroller
  let initialized = false;

  // ── Auth : la personnalisation (highlights / favoris) requiert un compte ──
  function isLoggedIn() { return !!window._pelUser; }

  // Affiche un message éphémère invitant à se connecter
  let _loginToastEl = null;
  function showLoginRequiredToast(msg) {
    if (_loginToastEl) { _loginToastEl.remove(); _loginToastEl = null; }
    const toast = document.createElement('div');
    toast.className = 'bible-login-toast';
    toast.innerHTML = `
      <i class="fa-solid fa-lock"></i>
      <span>${escapeHtml(msg || 'Connectez-vous pour personnaliser votre Bible')}</span>
      <button type="button" class="bible-login-toast-cta" id="bible-login-toast-cta">Créer un compte</button>
    `;
    document.body.appendChild(toast);
    _loginToastEl = toast;
    requestAnimationFrame(() => toast.classList.add('show'));
    document.getElementById('bible-login-toast-cta')?.addEventListener('click', () => {
      // Ouvre le modal d'inscription via le header
      document.getElementById('header-btn-signup')?.click();
      // Sur mobile, ouvre via le menu burger
      document.getElementById('hm-signup-item')?.click();
      hideLoginToast();
    });
    setTimeout(hideLoginToast, 4500);
  }
  function hideLoginToast() {
    if (!_loginToastEl) return;
    _loginToastEl.classList.remove('show');
    setTimeout(() => { _loginToastEl?.remove(); _loginToastEl = null; }, 300);
  }

  // ── Cache localStorage (indexé par traduction + livre + chapitre) ─
  const CACHE_PREFIX = 'pel_bible_ch_';
  function cacheGet(book, ch) {
    try { return JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${currentTranslation}_${book.id}_${ch}`) || 'null'); }
    catch (_) { return null; }
  }
  function cacheSet(book, ch, data) {
    try { localStorage.setItem(`${CACHE_PREFIX}${currentTranslation}_${book.id}_${ch}`, JSON.stringify(data)); }
    catch (_) { /* quota plein, ignore */ }
  }

  // ── Traductions disponibles (bolls.life) ─────────────────
  const TRANSLATIONS = {
    FRLSG: {
      code:  'FRLSG',
      short: 'LSG',
      full:  'Bible Segond 1910',
      year:  '1910',
      desc:  "Traduction historique de référence dans le monde francophone, par Louis Segond. Texte limpide et fidèle aux originaux hébreux et grecs.",
      cover: 'navy',  // style de couverture
    },
    BDS: {
      code:  'BDS',
      short: 'BDS',
      full:  'Bible du Semeur',
      year:  '2015',
      desc:  "Traduction moderne et accessible, soucieuse d'une lecture fluide tout en restant fidèle aux textes originaux.",
      cover: 'leather',
    },
    NBS: {
      code:  'NBS',
      short: 'NBS',
      full:  'Nouvelle Bible Segond',
      year:  '2002',
      desc:  "Révision savante de la Segond avec un appareil critique poussé. Idéale pour l'étude approfondie des Écritures.",
      cover: 'minimal',
    },
  };
  const TRANSLATION_ORDER = ['FRLSG', 'BDS', 'NBS'];

  let currentTranslation = localStorage.getItem('pel_bible_translation') || 'FRLSG';
  if (!TRANSLATIONS[currentTranslation]) currentTranslation = 'FRLSG';

  // Source unique selon la traduction active. Fallback automatique
  // sur les autres traductions si la source primaire échoue.
  function fetchChapter(book, ch) {
    const order = [currentTranslation, ...TRANSLATION_ORDER.filter(t => t !== currentTranslation)];
    return (async () => {
      let lastErr = '';
      for (const t of order) {
        try {
          const url = `https://bolls.life/get-text/${t}/${book.id}/${ch}/`;
          const resp = await fetch(url);
          if (!resp.ok) { lastErr = `${t}: HTTP ${resp.status}`; continue; }
          const raw = await resp.json();
          if (!Array.isArray(raw) || !raw.length) { lastErr = `${t}: réponse vide`; continue; }
          return {
            translation: t,
            verses: raw.map(v => ({
              verse: parseInt(v.verse, 10),
              text:  String(v.text || '').replace(/<[^>]+>/g, '').trim(),
            })).filter(v => !isNaN(v.verse) && v.text),
          };
        } catch (err) {
          lastErr = `${t}: ${err.message}`;
        }
      }
      throw new Error(lastErr);
    })();
  }

  // ── Surlignages PAR VERSET ────────────────────────────────
  // Forme : { "Jean_3:16": true, "Psaumes_23:1": true, ... }
  function getHighlights() {
    try { return JSON.parse(localStorage.getItem('pel_bible_highlights') || '{}'); }
    catch (_) { return {}; }
  }
  function saveHighlights(obj) {
    try { localStorage.setItem('pel_bible_highlights', JSON.stringify(obj)); } catch (_) {}
  }
  function toggleHighlight(bookName, ch, verse) {
    const key = `${bookName}_${ch}:${verse}`;
    const h = getHighlights();
    if (h[key]) delete h[key]; else h[key] = Date.now();
    saveHighlights(h);
    const isOn = !!h[key];
    // Sync background → Supabase si connecté
    syncToggleHighlight(bookName, ch, verse, isOn);
    return isOn;
  }
  function isHighlighted(bookName, ch, verse) {
    return !!getHighlights()[`${bookName}_${ch}:${verse}`];
  }

  // ── Surlignages PAR MOT (granulaire) ──────────────────────
  // Forme : { "Jean_3:16:5": true } → 5e mot du verset Jn 3:16
  function getWordHighlights() {
    try { return JSON.parse(localStorage.getItem('pel_bible_word_hi') || '{}'); }
    catch (_) { return {}; }
  }
  function saveWordHighlights(obj) {
    try { localStorage.setItem('pel_bible_word_hi', JSON.stringify(obj)); } catch (_) {}
  }
  function toggleWordHighlight(bookName, ch, verse, wordIdx) {
    const key = `${bookName}_${ch}:${verse}:${wordIdx}`;
    const h = getWordHighlights();
    if (h[key]) delete h[key]; else h[key] = Date.now();
    saveWordHighlights(h);
    const isOn = !!h[key];
    syncToggleWordHighlight(bookName, ch, verse, wordIdx, isOn);
    return isOn;
  }
  function isWordHighlighted(bookName, ch, verse, wordIdx) {
    return !!getWordHighlights()[`${bookName}_${ch}:${verse}:${wordIdx}`];
  }

  // ── Favoris ──────────────────────────────────────────────
  // [{book, ch, verse, label, ts}]
  function getFavs() {
    try { return JSON.parse(localStorage.getItem('pel_bible_favs') || '[]'); }
    catch (_) { return []; }
  }
  function saveFavs(arr) {
    try { localStorage.setItem('pel_bible_favs', JSON.stringify(arr)); } catch (_) {}
  }
  function toggleFav(bookName, ch, verse) {
    const favs = getFavs();
    const idx = favs.findIndex(f => f.book === bookName && f.ch === ch && f.verse === verse);
    const label = `${bookName} ${ch}:${verse}`;
    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.unshift({ book: bookName, ch, verse, label, ts: Date.now() });
    }
    saveFavs(favs);
    renderFavList();
    const isOn = idx < 0;
    syncToggleFav(bookName, ch, verse, isOn, label);
    return isOn;
  }
  function isFav(bookName, ch, verse) {
    return getFavs().some(f => f.book === bookName && f.ch === ch && f.verse === verse);
  }

  // ── UI : sidebar livres ──────────────────────────────────
  function renderBookList() {
    const otEl = document.getElementById('bible-books-ot');
    const ntEl = document.getElementById('bible-books-nt');
    if (!otEl || !ntEl) return;

    function renderBooks(container, list) {
      container.innerHTML = '';
      list.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'bible-book-btn';
        btn.type = 'button';
        btn.textContent = b.name;
        btn.dataset.book = b.name;
        btn.addEventListener('click', () => openBook(b));
        container.appendChild(btn);
      });
    }
    renderBooks(otEl, BOOKS.ot);
    renderBooks(ntEl, BOOKS.nt);
  }

  // ── Ouvre un livre → liste de chapitres ──────────────────
  function openBook(book) {
    currentBook = book;
    currentChapter = null;
    syncActiveBookBtn();
    const reader = document.getElementById('bible-reader');
    if (!reader) return;

    let html = `<div class="bible-chapter-list-wrap">
      <h3 class="bible-current-book">${escapeHtml(book.name)}</h3>
      <p class="bible-chapter-list-hint">Choisissez un chapitre :</p>
      <div class="bible-chapter-grid">`;
    for (let i = 1; i <= book.ch; i++) {
      html += `<button class="bible-chapter-btn" data-ch="${i}">${i}</button>`;
    }
    html += '</div></div>';
    reader.innerHTML = html;

    reader.querySelectorAll('.bible-chapter-btn').forEach(btn => {
      btn.addEventListener('click', () => loadChapter(book, parseInt(btn.dataset.ch, 10)));
    });
  }

  function syncActiveBookBtn() {
    document.querySelectorAll('.bible-book-btn').forEach(b => {
      b.classList.toggle('active', currentBook && b.dataset.book === currentBook.name);
    });
  }

  // ── Charge un chapitre depuis le cache ou bible-api.com ──
  async function loadChapter(book, chapter, opts) {
    opts = opts || {};
    currentBook = book;
    currentChapter = chapter;
    syncActiveBookBtn();

    const reader = document.getElementById('bible-reader');
    if (!reader) return;

    // Si déjà en cache (pour la traduction active), on affiche immédiatement
    let data = cacheGet(book, chapter);
    if (!data) {
      reader.innerHTML = `<div class="bible-loading">
        <div class="bible-spinner"></div>
        <p>Chargement de ${escapeHtml(book.name)} ${chapter}…</p>
        <p class="bible-loading-trans">${escapeHtml(TRANSLATIONS[currentTranslation].full)}</p>
      </div>`;

      try {
        data = await fetchChapter(book, chapter);
        cacheSet(book, chapter, data);
      } catch (err) {
        console.warn('[bible] Toutes les sources ont échoué :', err.message);
        reader.innerHTML = `<div class="bible-error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <p>Impossible de charger ce chapitre. Vérifiez votre connexion internet.</p>
          <p class="bible-error-detail">${escapeHtml(err.message || '')}</p>
          <button class="bible-retry" id="bible-retry">Réessayer</button>
        </div>`;
        document.getElementById('bible-retry')?.addEventListener('click', () => loadChapter(book, chapter, opts));
        return;
      }
    }

    renderChapter(book, chapter, data, opts.scrollToVerse);
  }

  function renderChapter(book, chapter, data, scrollToVerse) {
    const reader = document.getElementById('bible-reader');
    if (!reader) return;

    const verses = data.verses || [];
    const prevCh = chapter > 1 ? chapter - 1 : null;
    const nextCh = chapter < book.ch ? chapter + 1 : null;

    const trShort = TRANSLATIONS[currentTranslation]?.short || '';
    const loggedIn = isLoggedIn();
    let html = `<div class="bible-chapter${loggedIn ? '' : ' guest-mode'}">
      <div class="bible-chapter-toprow">
        <button class="bible-home-btn" id="bible-home" type="button" title="Retour à la sélection des Bibles">
          <i class="fa-solid fa-house"></i>
          <span>Choisir une autre Bible</span>
        </button>
        <span class="bible-current-trans-badge">${escapeHtml(trShort)}</span>
      </div>
      ${!loggedIn ? `
      <div class="bible-guest-banner">
        <i class="fa-solid fa-lock"></i>
        <span>Lecture libre. <strong>Créez un compte gratuit</strong> pour surligner vos versets, marquer des favoris et personnaliser votre Bible.</span>
        <button type="button" class="bible-guest-banner-cta" id="bible-guest-signup">Créer un compte</button>
      </div>` : ''}
      <div class="bible-chapter-header">
        <button class="bible-back-btn" id="bible-back" aria-label="Retour à la liste des chapitres" title="Liste des chapitres">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <h2 class="bible-chapter-title">${escapeHtml(book.name)} <span class="bible-chapter-num">${chapter}</span></h2>
        <div class="bible-chapter-nav">
          ${prevCh ? `<button class="bible-nav-btn" data-prev="${prevCh}" aria-label="Chapitre précédent"><i class="fa-solid fa-chevron-left"></i></button>` : ''}
          ${nextCh ? `<button class="bible-nav-btn" data-next="${nextCh}" aria-label="Chapitre suivant"><i class="fa-solid fa-chevron-right"></i></button>` : ''}
        </div>
      </div>
      <div class="bible-verses">`;

    verses.forEach(v => {
      const num = v.verse;
      const txt = (v.text || '').trim();
      const hi  = isHighlighted(book.name, chapter, num);
      const fav = isFav(book.name, chapter, num);

      // Découpe le verset en mots cliquables individuellement
      // (chaque mot peut être surligné séparément du reste du verset)
      const words = txt.split(/(\s+)/);   // garde les espaces
      let wordIdx = 0;
      const wordsHtml = words.map(w => {
        if (/^\s+$/.test(w)) return w;            // pur whitespace → on garde tel quel
        const idx = wordIdx++;
        const isHi = isWordHighlighted(book.name, chapter, num, idx);
        return `<span class="bible-word${isHi ? ' word-highlighted' : ''}" data-w="${idx}">${escapeHtml(w)}</span>`;
      }).join('');

      html += `<div class="bible-verse${hi ? ' highlighted' : ''}" id="v-${num}" data-verse="${num}">
        <span class="bible-verse-num">${num}</span>
        <span class="bible-verse-text">${wordsHtml}</span>
        <div class="bible-verse-actions">
          <button class="bible-verse-action bible-hi-btn${hi ? ' active' : ''}" data-action="hi" data-verse="${num}" aria-label="Surligner tout le verset" title="Surligner le verset">
            <i class="fa-solid fa-highlighter"></i>
          </button>
          <button class="bible-verse-action bible-fav-btn${fav ? ' active' : ''}" data-action="fav" data-verse="${num}" aria-label="Ajouter aux favoris" title="Favori">
            <i class="fa-solid fa-bookmark"></i>
          </button>
          <button class="bible-verse-action bible-share-btn" data-action="share" data-verse="${num}" aria-label="Copier la référence" title="Copier">
            <i class="fa-solid fa-link"></i>
          </button>
        </div>
      </div>`;
    });

    html += '</div></div>';
    reader.innerHTML = html;

    // Event handlers
    reader.querySelector('#bible-guest-signup')?.addEventListener('click', () => {
      // Ouvre le modal d'inscription (header desktop OU menu burger mobile)
      const desktopBtn = document.getElementById('header-btn-signup');
      const mobileBtn  = document.getElementById('hm-signup-item');
      // Préférer le visible
      if (desktopBtn && desktopBtn.offsetParent !== null) desktopBtn.click();
      else if (mobileBtn) mobileBtn.click();
      else desktopBtn?.click();
    });
    reader.querySelector('#bible-home')?.addEventListener('click', () => {
      currentBook = null;
      currentChapter = null;
      syncActiveBookBtn();
      renderWelcome();
    });
    reader.querySelector('#bible-back')?.addEventListener('click', () => openBook(book));
    reader.querySelectorAll('.bible-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ch = parseInt(btn.dataset.prev || btn.dataset.next, 10);
        if (!isNaN(ch)) {
          loadChapter(book, ch);
          reader.scrollTop = 0;
        }
      });
    });

    // Délégation : clic sur action OU sur un mot
    reader.querySelector('.bible-verses')?.addEventListener('click', e => {
      // 1. Action (surligner verset, favori, copier)
      const btn = e.target.closest('.bible-verse-action');
      if (btn) {
        e.stopPropagation();
        const verse = parseInt(btn.dataset.verse, 10);
        const verseEl = reader.querySelector(`#v-${verse}`);
        const action = btn.dataset.action;

        // "share" est dispo pour tout le monde (juste copier dans le presse-papier)
        if (action === 'share') {
          const ref = `${book.name} ${chapter}:${verse}`;
          const txt = verseEl?.querySelector('.bible-verse-text')?.textContent.trim() || '';
          const fullText = `« ${txt} »\n— ${ref}`;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(fullText).then(() => {
              flashFeedback(btn, '✓ Copié');
            }).catch(() => {});
          }
          return;
        }

        // Personnalisation (highlight verset, favori) : compte requis
        if (!isLoggedIn()) {
          showLoginRequiredToast(action === 'fav'
            ? 'Créez un compte gratuit pour ajouter des favoris.'
            : 'Créez un compte gratuit pour surligner vos versets préférés.');
          return;
        }

        if (action === 'hi') {
          const isOn = toggleHighlight(book.name, chapter, verse);
          btn.classList.toggle('active', isOn);
          verseEl?.classList.toggle('highlighted', isOn);
        } else if (action === 'fav') {
          const isOn = toggleFav(book.name, chapter, verse);
          btn.classList.toggle('active', isOn);
        }
        return;
      }
      // 2. Clic sur un mot → toggle surlignage du mot (compte requis)
      const word = e.target.closest('.bible-word');
      if (word) {
        if (!isLoggedIn()) {
          showLoginRequiredToast('Créez un compte gratuit pour surligner mot par mot.');
          return;
        }
        const verseEl = word.closest('.bible-verse');
        if (!verseEl) return;
        const verse  = parseInt(verseEl.dataset.verse, 10);
        const idx    = parseInt(word.dataset.w, 10);
        if (isNaN(verse) || isNaN(idx)) return;
        const isOn = toggleWordHighlight(book.name, chapter, verse, idx);
        word.classList.toggle('word-highlighted', isOn);
      }
    });

    // Scroll vers verset si demandé
    if (scrollToVerse) {
      setTimeout(() => {
        const target = reader.querySelector(`#v-${scrollToVerse}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('flash');
          setTimeout(() => target.classList.remove('flash'), 2000);
        }
      }, 100);
    }
  }

  function flashFeedback(el, msg) {
    const old = el.innerHTML;
    el.innerHTML = msg;
    el.classList.add('flashed');
    setTimeout(() => { el.innerHTML = old; el.classList.remove('flashed'); }, 1200);
  }

  // ── Recherche par référence ──────────────────────────────
  function parseReference(query) {
    // Ex: "Jean 3:16", "Genèse 1", "1 Corinthiens 13:4-7", "ps 23"
    const m = query.trim().match(/^((?:[123]\s+)?[A-Za-zÀ-ÖØ-öø-ÿ.]+)\s*(\d+)(?::(\d+))?/);
    if (!m) return null;
    const bookKey = norm(m[1]);
    const book = BOOK_INDEX[bookKey];
    if (!book) return null;
    const ch = parseInt(m[2], 10);
    if (isNaN(ch) || ch < 1 || ch > book.ch) return null;
    const verse = m[3] ? parseInt(m[3], 10) : null;
    return { book, ch, verse };
  }

  // ── Suggestions curées (passages célèbres & thèmes connus) ─
  // Chaque entrée a des "keywords" pour le matching.
  // Quand l'utilisateur tape un mot-clé même partiel, la
  // suggestion remonte instantanément, même si le terme n'est
  // pas littéralement dans le texte (ex: "béatitudes").
  const CURATED = [
    { ref:'Genèse 1',          title:'La Création du monde',                kw:['creation','commencement','genese','dieu cre','jours','eden','adam','eve'] },
    { ref:'Genèse 6',          title:"L'Arche de Noé",                      kw:['noe','arche','deluge','animaux'] },
    { ref:'Exode 3',           title:'Le Buisson ardent',                   kw:['moise','buisson','ardent','feu'] },
    { ref:'Exode 20',          title:'Les Dix Commandements',               kw:['dix','commandements','tables','loi','sinai'] },
    { ref:'Psaumes 23',        title:'Le Seigneur est mon berger',          kw:['berger','psaume','vingt-trois','ombre','vallee'] },
    { ref:'Psaumes 51',        title:'Miserere — Psaume du repentir',       kw:['miserere','repentir','peche','pardon'] },
    { ref:'Psaumes 91',        title:"Refuge sous les ailes de Dieu",       kw:['refuge','protection','ailes'] },
    { ref:'Psaumes 121',       title:"Cantique des montées",                kw:['montees','cantique','protection','aide'] },
    { ref:'Psaumes 139',       title:"Tu me sondes, Seigneur",              kw:['sondes','connais','intime'] },
    { ref:'Cantique 1',        title:'Cantique des cantiques',              kw:['cantique','cantiques','salomon','amour','epoux'] },
    { ref:'Ésaïe 53',          title:'Le Serviteur souffrant',              kw:['serviteur','souffrant','isaie 53'] },
    { ref:'Matthieu 5',        title:'Les Béatitudes',                      kw:['beatitudes','heureux','bonheur','sermon montagne','sermon sur la montagne'] },
    { ref:'Matthieu 6:9',      title:'Le Notre Père',                       kw:['notre pere','pater','priere','que ton nom'] },
    { ref:'Matthieu 4',        title:'Tentation au désert',                 kw:['tentation','desert','satan','diable','jeune'] },
    { ref:'Matthieu 17',       title:'La Transfiguration',                  kw:['transfiguration','tabor','gloire','elie','moise'] },
    { ref:'Matthieu 25',       title:'Le Jugement dernier',                 kw:['jugement','brebis','boucs','dernier','fin'] },
    { ref:'Matthieu 26:26',    title:"L'Institution de l'Eucharistie",      kw:['cene','eucharistie','dernier repas','pain vin'] },
    { ref:'Matthieu 27',       title:'La Crucifixion',                      kw:['crucifixion','golgotha','calvaire','passion','mort'] },
    { ref:'Matthieu 28',       title:'La Résurrection',                     kw:['resurrection','tombeau vide','paques','dimanche'] },
    { ref:'Marc 1',            title:"Début de l'Évangile selon Marc",      kw:['evangile selon marc','baptiste','desert'] },
    { ref:'Luc 1:26',          title:"L'Annonciation",                      kw:['annonciation','gabriel','vierge','marie'] },
    { ref:'Luc 1:46',          title:'Le Magnificat',                       kw:['magnificat','marie','mon ame'] },
    { ref:'Luc 2',             title:'La Nativité',                         kw:['nativite','naissance','jesus','noel','etable','mages','bergers'] },
    { ref:'Luc 10:25',         title:'La Parabole du bon Samaritain',       kw:['samaritain','samaritaine','bon samaritain','pretre','levite'] },
    { ref:'Luc 15:11',         title:'La Parabole du fils prodigue',        kw:['prodigue','fils perdu','retour','heritage','pere'] },
    { ref:'Luc 24',            title:"Les disciples d'Emmaüs",              kw:['emmaus','disciples','rompit','reconnaissent'] },
    { ref:'Jean 1',            title:'Prologue : le Verbe fait chair',      kw:['prologue','verbe','chair','logos','commencement'] },
    { ref:'Jean 3:16',         title:'Dieu a tant aimé le monde',           kw:['nicodeme','aime','vie eternelle','dieu a tant'] },
    { ref:'Jean 6:51',         title:'Pain de vie',                         kw:['pain de vie','pain vivant','manger ma chair'] },
    { ref:'Jean 13',           title:'Lavement des pieds',                  kw:['lavement','pieds','dernier repas'] },
    { ref:'Jean 14',           title:'Le chemin, la vérité, la vie',        kw:['chemin','verite','vie','adieu'] },
    { ref:'Jean 20',           title:'Apparitions du Ressuscité',           kw:['ressuscite','thomas','marie madeleine','tombeau'] },
    { ref:'Actes 1:9',         title:"L'Ascension",                         kw:['ascension','elevation','nuee'] },
    { ref:'Actes 2',           title:'La Pentecôte',                        kw:['pentecote','esprit saint','langues feu','apotres'] },
    { ref:'Actes 9',           title:'Conversion de saint Paul',            kw:['saul','paul','conversion','damas','chemin'] },
    { ref:'Romains 8',         title:"Rien ne nous séparera de l'amour",    kw:['rien ne separera','romains huit'] },
    { ref:'1 Corinthiens 13',  title:"Hymne à l'amour",                     kw:['amour','charite','hymne','si je'] },
    { ref:'Philippiens 2:6',   title:'Hymne au Christ — abaissement',       kw:['kenose','abaissement','condition de serviteur'] },
    { ref:'Hébreux 11',        title:'La foi des anciens',                  kw:['foi anciens','heros','abraham','moise','rahab'] },
    { ref:'Apocalypse 21',     title:'Cieux nouveaux et terre nouvelle',    kw:['apocalypse','jerusalem celeste','nouveaux','larmes'] },
    { ref:'Apocalypse 22',     title:"Marana tha — Viens Seigneur Jésus",   kw:['marana','viens','arbre vie','fin'] },
  ];

  // Trouve les suggestions curées qui matchent une requête (lowercase, sans accents)
  function matchCurated(query) {
    const q = norm(query);
    if (!q || q.length < 2) return [];
    return CURATED.filter(item => {
      // Match dans le titre OU dans les mots-clés
      if (norm(item.title).includes(q)) return true;
      return item.kw.some(k => norm(k).includes(q) || q.includes(norm(k)));
    }).slice(0, 5);
  }

  // ── Recherche plein texte via bolls.life ──────────────────
  let _searchAbortCtrl = null;
  async function searchFullText(query) {
    if (!query || query.length < 3) return [];
    if (_searchAbortCtrl) _searchAbortCtrl.abort();
    _searchAbortCtrl = new AbortController();
    try {
      const url = `https://bolls.life/find/${currentTranslation}/?search=${encodeURIComponent(query)}&limit=8`;
      const resp = await fetch(url, { signal: _searchAbortCtrl.signal });
      if (!resp.ok) return [];
      const data = await resp.json();
      if (!Array.isArray(data)) return [];
      // bolls renvoie : { book, chapter, verse, text } — book est numérique 1-66
      return data.map(r => {
        const allBooks = [...BOOKS.ot, ...BOOKS.nt];
        const book = allBooks.find(b => b.id === r.book);
        return book ? {
          book, ch: r.chapter, verse: r.verse,
          text: String(r.text || '').replace(/<\/?mark>/g, ''), // marqueur temporaire pour highlight
        } : null;
      }).filter(Boolean);
    } catch (err) {
      if (err.name === 'AbortError') return null;
      return [];
    }
  }

  // ── Dropdown de suggestions ──────────────────────────────
  let _dropdownEl = null;
  function ensureDropdown() {
    if (_dropdownEl) return _dropdownEl;
    _dropdownEl = document.createElement('div');
    _dropdownEl.className = 'bible-search-dropdown';
    _dropdownEl.hidden = true;
    const wrap = document.querySelector('.bible-search-wrap');
    wrap?.appendChild(_dropdownEl);
    return _dropdownEl;
  }

  function hideDropdown() {
    if (_dropdownEl) _dropdownEl.hidden = true;
  }

  function renderDropdown(query, refMatch, curated, fullText) {
    const dd = ensureDropdown();
    dd.innerHTML = '';

    let html = '';
    // 1. Match exact de référence en haut (toujours en premier)
    if (refMatch) {
      html += `<div class="bible-dd-section">
        <div class="bible-dd-section-title">📖 Référence directe</div>
        <button type="button" class="bible-dd-item bible-dd-ref" data-go="${refMatch.book.id}|${refMatch.ch}|${refMatch.verse || ''}">
          <div class="bible-dd-ref-name">${escapeHtml(refMatch.book.name)} ${refMatch.ch}${refMatch.verse ? ':' + refMatch.verse : ''}</div>
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>`;
    }

    // 2. Suggestions curées (passages célèbres)
    if (curated && curated.length) {
      html += `<div class="bible-dd-section">
        <div class="bible-dd-section-title">✨ Passages célèbres</div>`;
      curated.forEach(c => {
        const ref = parseReference(c.ref);
        if (!ref) return;
        html += `<button type="button" class="bible-dd-item" data-go="${ref.book.id}|${ref.ch}|${ref.verse || ''}">
          <div class="bible-dd-curated">
            <div class="bible-dd-curated-title">${escapeHtml(c.title)}</div>
            <div class="bible-dd-curated-ref">${escapeHtml(c.ref)}</div>
          </div>
        </button>`;
      });
      html += '</div>';
    }

    // 3. Résultats plein texte (versets contenant le mot)
    if (fullText && fullText.length) {
      html += `<div class="bible-dd-section">
        <div class="bible-dd-section-title">🔍 Versets contenant « ${escapeHtml(query)} »</div>`;
      fullText.forEach(r => {
        // Surligne les occurrences du mot cherche (insensible casse)
        const reHL = new RegExp('(' + query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + ')', 'gi');
        const cleanText = String(r.text).replace(/<\/?mark>/gi, '');
        const safeText = escapeHtml(cleanText).replace(reHL, '<mark>$1</mark>');
        html += `<button type="button" class="bible-dd-item bible-dd-fulltext" data-go="${r.book.id}|${r.ch}|${r.verse}">
          <div class="bible-dd-ft-ref">${escapeHtml(r.book.name)} ${r.ch}:${r.verse}</div>
          <div class="bible-dd-ft-text">${safeText}</div>
        </button>`;
      });
      html += '</div>';
    }

    if (!html) {
      html = `<div class="bible-dd-empty">Aucun résultat. Essayez « Jean 3:16 », « samaritain » ou « amour ».</div>`;
    }

    dd.innerHTML = html;
    dd.hidden = false;

    // Click handlers
    dd.querySelectorAll('[data-go]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [bookId, ch, verse] = btn.dataset.go.split('|');
        const allBooks = [...BOOKS.ot, ...BOOKS.nt];
        const book = allBooks.find(b => b.id === parseInt(bookId, 10));
        if (!book) return;
        loadChapter(book, parseInt(ch, 10), { scrollToVerse: verse ? parseInt(verse, 10) : null });
        hideDropdown();
        // Vide la barre pour le prochain usage
        const input = document.getElementById('bible-search');
        if (input) {
          input.value = '';
          document.getElementById('bible-search-clear').hidden = true;
          input.blur();
        }
      });
    });
  }

  // ── Panel favoris ────────────────────────────────────────
  function renderFavList() {
    const list = document.getElementById('bible-fav-list');
    if (!list) return;
    const favs = getFavs();
    if (!favs.length) {
      list.innerHTML = `<div class="bible-fav-empty">Aucun favori. Cliquez sur le ❤ d'un verset pour l'ajouter.</div>`;
      return;
    }
    list.innerHTML = favs.map(f => `
      <div class="bible-fav-item" data-book="${escapeAttr(f.book)}" data-ch="${f.ch}" data-verse="${f.verse}">
        <div class="bible-fav-ref"><i class="fa-solid fa-bookmark"></i> ${escapeHtml(f.label)}</div>
        <button class="bible-fav-remove" data-book="${escapeAttr(f.book)}" data-ch="${f.ch}" data-verse="${f.verse}" aria-label="Retirer">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `).join('');

    list.querySelectorAll('.bible-fav-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.bible-fav-remove')) return;
        const bookName = item.dataset.book;
        const ch = parseInt(item.dataset.ch, 10);
        const verse = parseInt(item.dataset.verse, 10);
        const book = [...BOOKS.ot, ...BOOKS.nt].find(b => b.name === bookName);
        if (!book) return;
        loadChapter(book, ch, { scrollToVerse: verse });
        closeFavPanel();
      });
    });
    list.querySelectorAll('.bible-fav-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const bookName = btn.dataset.book;
        const ch = parseInt(btn.dataset.ch, 10);
        const verse = parseInt(btn.dataset.verse, 10);
        toggleFav(bookName, ch, verse);
        // Rafraîchit les boutons fav dans le verset si visible
        const verseEl = document.querySelector(`#v-${verse}`);
        if (verseEl && currentBook?.name === bookName && currentChapter === ch) {
          const favBtn = verseEl.querySelector('.bible-fav-btn');
          favBtn?.classList.remove('active');
          const icon = favBtn?.querySelector('i');
          if (icon) icon.className = 'fa-regular fa-bookmark';
        }
      });
    });
  }

  function openFavPanel() {
    document.getElementById('bible-fav-panel')?.classList.remove('hidden');
    document.getElementById('bible-fav-overlay')?.classList.add('show');
    renderFavList();
  }
  function closeFavPanel() {
    document.getElementById('bible-fav-panel')?.classList.add('hidden');
    document.getElementById('bible-fav-overlay')?.classList.remove('show');
  }

  // ── Helpers ──────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ── Sélecteur de traduction ──────────────────────────────
  function setTranslation(code) {
    if (!TRANSLATIONS[code] || code === currentTranslation) return;
    currentTranslation = code;
    localStorage.setItem('pel_bible_translation', code);
    syncTranslationBtns();
    // Recharge le chapitre courant si un est ouvert (avec le cache de cette traduction)
    if (currentBook && currentChapter) {
      loadChapter(currentBook, currentChapter);
    } else {
      // Sinon, on rafraîchit la welcome screen pour mettre à jour la couverture active
      renderWelcome();
    }
  }
  function syncTranslationBtns() {
    document.querySelectorAll('.bible-trans-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.trans === currentTranslation);
    });
  }

  // ── Welcome screen avec 3 couvertures de Bible ───────────
  function renderWelcome() {
    const reader = document.getElementById('bible-reader');
    if (!reader) return;
    const t = TRANSLATIONS;
    const tr = t[currentTranslation];
    reader.innerHTML = `
      <div class="bible-welcome">
        <h3 class="bible-welcome-title">Choisissez une traduction</h3>
        <p class="bible-welcome-sub">Cliquez sur une Bible pour découvrir sa description, puis ouvrez-la.</p>

        <div class="bible-shelf">
          ${TRANSLATION_ORDER.map(code => {
            const trItem = t[code];
            const isActive = code === currentTranslation;
            return `<button class="bible-cover bible-cover-${trItem.cover}${isActive ? ' is-active' : ''}" data-trans="${code}" type="button" aria-label="Sélectionner ${escapeAttr(trItem.full)}">
              <div class="bible-cover-spine"></div>
              <div class="bible-cover-front">
                <div class="bible-cover-ornament-top"></div>
                <div class="bible-cover-cross">
                  <span></span><span></span>
                </div>
                <div class="bible-cover-title-block">
                  <div class="bible-cover-the">LA SAINTE</div>
                  <div class="bible-cover-bible">BIBLE</div>
                  <div class="bible-cover-divider"></div>
                  <div class="bible-cover-version">${escapeHtml(trItem.short === 'LSG' ? 'Segond' : trItem.short === 'BDS' ? 'Du Semeur' : 'Nouvelle Segond')}</div>
                  <div class="bible-cover-year">${escapeHtml(trItem.year)}</div>
                </div>
                <div class="bible-cover-ornament-bottom"></div>
              </div>
              <div class="bible-cover-pages"></div>
              ${isActive ? '<span class="bible-cover-active-badge">Sélectionnée</span>' : ''}
            </button>`;
          }).join('')}
        </div>

        <div class="bible-welcome-trans-info">
          <h4 class="bible-welcome-trans-name">${escapeHtml(tr.full)} <span class="bible-welcome-trans-year">— ${escapeHtml(tr.year)}</span></h4>
          <p class="bible-welcome-translation-desc">${escapeHtml(tr.desc)}</p>
          <button class="bible-open-btn" id="bible-open-selected" type="button">
            <i class="fa-solid fa-book-open"></i>
            Ouvrir la <strong>${escapeHtml(tr.short)}</strong>
            <i class="fa-solid fa-arrow-right bible-open-arrow"></i>
          </button>
        </div>

        <div class="bible-quick-refs">
          <span class="bible-quick-ref-label">Ou allez directement à :</span>
          <button class="bible-quick-ref" data-ref="Genèse 1">Genèse 1</button>
          <button class="bible-quick-ref" data-ref="Psaumes 23">Psaume 23</button>
          <button class="bible-quick-ref" data-ref="Matthieu 5">Béatitudes</button>
          <button class="bible-quick-ref" data-ref="Jean 3:16">Jean 3:16</button>
          <button class="bible-quick-ref" data-ref="1 Corinthiens 13">1 Co 13 — L'Amour</button>
        </div>
      </div>
    `;

    // 1er clic sur une couverture = SÉLECTION (description s'actualise, pas d'ouverture)
    // 2e clic sur la même couverture (déjà sélectionnée) = OUVERTURE
    reader.querySelectorAll('.bible-cover').forEach(el => {
      el.addEventListener('click', () => {
        const code = el.dataset.trans;
        if (code === currentTranslation) {
          // Déjà sélectionnée → on l'ouvre
          loadChapter(BOOKS.ot[0], 1);
        } else {
          // Sélection seulement
          setTranslation(code);
        }
      });
    });

    // Bouton "Ouvrir la BIBLE" sous la description
    reader.querySelector('#bible-open-selected')?.addEventListener('click', () => {
      loadChapter(BOOKS.ot[0], 1);
    });

    reader.querySelectorAll('.bible-quick-ref').forEach(btn => {
      btn.addEventListener('click', () => {
        const ref = parseReference(btn.dataset.ref);
        if (ref) loadChapter(ref.book, ref.ch, { scrollToVerse: ref.verse });
      });
    });
  }

  // ════════════════════════════════════════════════════════
  //  Synchronisation Supabase (compte connecté)
  //  - On garde toujours localStorage comme source de vérité locale
  //    pour fonctionnement immédiat & offline
  //  - Au login : pull serveur + merge UNION + push diff serveur
  //    (ainsi un user qui avait surligné en local conserve tout)
  //  - À chaque toggle local : push delta au serveur en arrière-plan
  // ════════════════════════════════════════════════════════
  let _syncing = false;

  // Helper : parse "Jean_3:16" → { book, ch, verse }
  function parseHiKey(key) {
    const m = key.match(/^(.+)_(\d+):(\d+)$/);
    if (!m) return null;
    return { book: m[1], ch: parseInt(m[2], 10), verse: parseInt(m[3], 10) };
  }
  // Helper : parse "Jean_3:16:5" → { book, ch, verse, wordIdx }
  function parseWordHiKey(key) {
    const m = key.match(/^(.+)_(\d+):(\d+):(\d+)$/);
    if (!m) return null;
    return { book: m[1], ch: parseInt(m[2], 10), verse: parseInt(m[3], 10), wordIdx: parseInt(m[4], 10) };
  }

  async function pullFromSupabase() {
    const sb = window._sbClient;
    const user = window._pelUser;
    if (!sb || !user) return;

    try {
      const [hiRes, whiRes, favRes] = await Promise.all([
        sb.from('bible_highlights').select('book,chapter,verse'),
        sb.from('bible_word_highlights').select('book,chapter,verse,word_idx'),
        sb.from('bible_favorites').select('book,chapter,verse,label,created_at'),
      ]);

      // Merge UNION avec localStorage : on ne perd jamais rien
      if (!hiRes.error && Array.isArray(hiRes.data)) {
        const local = getHighlights();
        hiRes.data.forEach(r => {
          const key = `${r.book}_${r.chapter}:${r.verse}`;
          if (!local[key]) local[key] = Date.now();
        });
        saveHighlights(local);
      }

      if (!whiRes.error && Array.isArray(whiRes.data)) {
        const local = getWordHighlights();
        whiRes.data.forEach(r => {
          const key = `${r.book}_${r.chapter}:${r.verse}:${r.word_idx}`;
          if (!local[key]) local[key] = Date.now();
        });
        saveWordHighlights(local);
      }

      if (!favRes.error && Array.isArray(favRes.data)) {
        const local = getFavs();
        const seen = new Set(local.map(f => `${f.book}_${f.ch}:${f.verse}`));
        favRes.data.forEach(r => {
          const key = `${r.book}_${r.chapter}:${r.verse}`;
          if (!seen.has(key)) {
            local.unshift({
              book: r.book, ch: r.chapter, verse: r.verse,
              label: r.label || `${r.book} ${r.chapter}:${r.verse}`,
              ts: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
            });
          }
        });
        saveFavs(local);
        renderFavList();
      }
    } catch (err) {
      console.warn('[bible/sync] pull error:', err.message);
    }
  }

  async function pushAllToSupabase() {
    // Pousse tout ce qui n'est pas encore sur le serveur
    // (à utiliser après un pull, pour synchroniser ce que l'user
    //  avait fait en local avant de se connecter)
    const sb = window._sbClient;
    const user = window._pelUser;
    if (!sb || !user) return;

    try {
      const hi = getHighlights();
      const hiRows = Object.keys(hi).map(parseHiKey).filter(Boolean)
        .map(o => ({ user_id: user.id, book: o.book, chapter: o.ch, verse: o.verse }));
      if (hiRows.length) {
        await sb.from('bible_highlights').upsert(hiRows, { onConflict: 'user_id,book,chapter,verse', ignoreDuplicates: true });
      }

      const whi = getWordHighlights();
      const whiRows = Object.keys(whi).map(parseWordHiKey).filter(Boolean)
        .map(o => ({ user_id: user.id, book: o.book, chapter: o.ch, verse: o.verse, word_idx: o.wordIdx }));
      if (whiRows.length) {
        await sb.from('bible_word_highlights').upsert(whiRows, { onConflict: 'user_id,book,chapter,verse,word_idx', ignoreDuplicates: true });
      }

      const favs = getFavs();
      const favRows = favs.map(f => ({
        user_id: user.id, book: f.book, chapter: f.ch, verse: f.verse, label: f.label || null,
      }));
      if (favRows.length) {
        await sb.from('bible_favorites').upsert(favRows, { onConflict: 'user_id,book,chapter,verse', ignoreDuplicates: true });
      }
    } catch (err) {
      console.warn('[bible/sync] push error:', err.message);
    }
  }

  // Synchronisation complète (pull puis push) — appelée au login
  async function syncOnLogin() {
    if (_syncing) return;
    _syncing = true;
    try {
      await pullFromSupabase();
      await pushAllToSupabase();
      // Si on est dans un chapitre, on rafraîchit l'affichage pour montrer
      // les surlignages tirés du serveur
      if (currentBook && currentChapter) {
        const data = cacheGet(currentBook, currentChapter);
        if (data) renderChapter(currentBook, currentChapter, data);
      }
    } finally {
      _syncing = false;
    }
  }

  // ── Sync delta : après chaque toggle local, on pousse au serveur ──
  async function syncToggleHighlight(bookName, ch, verse, isOn) {
    const sb = window._sbClient;
    const user = window._pelUser;
    if (!sb || !user) return;
    try {
      if (isOn) {
        await sb.from('bible_highlights').upsert(
          { user_id: user.id, book: bookName, chapter: ch, verse },
          { onConflict: 'user_id,book,chapter,verse', ignoreDuplicates: true }
        );
      } else {
        await sb.from('bible_highlights').delete()
          .eq('user_id', user.id).eq('book', bookName).eq('chapter', ch).eq('verse', verse);
      }
    } catch (_) {}
  }

  async function syncToggleWordHighlight(bookName, ch, verse, wordIdx, isOn) {
    const sb = window._sbClient;
    const user = window._pelUser;
    if (!sb || !user) return;
    try {
      if (isOn) {
        await sb.from('bible_word_highlights').upsert(
          { user_id: user.id, book: bookName, chapter: ch, verse, word_idx: wordIdx },
          { onConflict: 'user_id,book,chapter,verse,word_idx', ignoreDuplicates: true }
        );
      } else {
        await sb.from('bible_word_highlights').delete()
          .eq('user_id', user.id).eq('book', bookName).eq('chapter', ch).eq('verse', verse).eq('word_idx', wordIdx);
      }
    } catch (_) {}
  }

  async function syncToggleFav(bookName, ch, verse, isOn, label) {
    const sb = window._sbClient;
    const user = window._pelUser;
    if (!sb || !user) return;
    try {
      if (isOn) {
        await sb.from('bible_favorites').upsert(
          { user_id: user.id, book: bookName, chapter: ch, verse, label: label || null },
          { onConflict: 'user_id,book,chapter,verse', ignoreDuplicates: true }
        );
      } else {
        await sb.from('bible_favorites').delete()
          .eq('user_id', user.id).eq('book', bookName).eq('chapter', ch).eq('verse', verse);
      }
    } catch (_) {}
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    if (initialized) return;
    initialized = true;

    renderBookList();
    renderWelcome();

    // Recherche enrichie : référence + passages célèbres + plein texte
    const searchInput = document.getElementById('bible-search');
    const clearBtn    = document.getElementById('bible-search-clear');
    let searchTimer = null;

    async function runSearch() {
      const v = searchInput.value.trim();
      if (!v) { hideDropdown(); return; }

      // 1. Référence directe (synchrone, immédiat)
      const refMatch = parseReference(v);

      // 2. Suggestions curées (synchrone, sur mots-clés)
      const curated = matchCurated(v);

      // 3. Recherche plein texte (asynchrone, via API)
      // On affiche déjà le dropdown avec ce qu'on a, puis on update quand
      // les résultats plein texte arrivent
      renderDropdown(v, refMatch, curated, []);

      if (v.length >= 3 && !refMatch) {
        const ft = await searchFullText(v);
        if (ft === null) return;     // requête annulée par une plus récente
        // Si l'utilisateur a continué à taper, ne pas écraser
        if (searchInput.value.trim() !== v) return;
        renderDropdown(v, refMatch, curated, ft);
      }
    }

    searchInput?.addEventListener('input', () => {
      clearBtn.hidden = !searchInput.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 250);
    });
    searchInput?.addEventListener('focus', () => {
      if (searchInput.value.trim()) runSearch();
    });
    searchInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        clearTimeout(searchTimer);
        // Au Enter, si une référence directe matche, on y va
        const ref = parseReference(searchInput.value);
        if (ref) {
          loadChapter(ref.book, ref.ch, { scrollToVerse: ref.verse });
          hideDropdown();
          searchInput.value = '';
          clearBtn.hidden = true;
          searchInput.blur();
          return;
        }
        runSearch();
      } else if (e.key === 'Escape') {
        hideDropdown();
        searchInput.blur();
      }
    });
    clearBtn?.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.hidden = true;
      hideDropdown();
      searchInput.focus();
    });
    // Click hors du dropdown → ferme
    document.addEventListener('click', e => {
      if (!e.target.closest('.bible-search-wrap')) hideDropdown();
    });

    // Sélecteur de traduction (boutons en toolbar)
    document.querySelectorAll('.bible-trans-btn').forEach(btn => {
      btn.addEventListener('click', () => setTranslation(btn.dataset.trans));
    });
    syncTranslationBtns();

    // Sync Supabase à chaque connexion / déconnexion
    document.addEventListener('pel:authchange', e => {
      if (e.detail?.user) {
        // Login (ou check session) → on récupère les surlignages/favoris du serveur
        // et on pousse ce qui est en local mais pas encore sur le serveur
        syncOnLogin();
        // Rafraîchit la bannière "guest" si le chapitre est ouvert
        if (currentBook && currentChapter) {
          const data = cacheGet(currentBook, currentChapter);
          if (data) renderChapter(currentBook, currentChapter, data);
        }
      } else {
        // Logout → on rafraîchit pour réafficher la bannière "guest"
        if (currentBook && currentChapter) {
          const data = cacheGet(currentBook, currentChapter);
          if (data) renderChapter(currentBook, currentChapter, data);
        }
      }
    });

    // Si l'auth est déjà initialisée au moment où la Bible s'init, on sync directement
    if (window._pelUser) syncOnLogin();

    // Panel favoris (compte requis)
    document.getElementById('bible-fav-toggle')?.addEventListener('click', () => {
      if (!isLoggedIn()) {
        showLoginRequiredToast('Créez un compte gratuit pour retrouver vos favoris partout.');
        return;
      }
      openFavPanel();
    });
    document.getElementById('bible-fav-close')?.addEventListener('click', closeFavPanel);
    // Clic sur l'overlay derrière le panel → ferme
    document.getElementById('bible-fav-overlay')?.addEventListener('click', closeFavPanel);
    // ESC → ferme aussi
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const panel = document.getElementById('bible-fav-panel');
        if (panel && !panel.classList.contains('hidden')) closeFavPanel();
      }
    });
  }

  // Expose pour debug et init différée
  window._pelBible = { init, openBook, loadChapter };

  // Lance l'init quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
