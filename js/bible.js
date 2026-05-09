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

  // ── Cache localStorage ────────────────────────────────────
  const CACHE_PREFIX = 'pel_bible_ch_';
  function cacheGet(book, ch) {
    try { return JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${book.id}_${ch}`) || 'null'); }
    catch (_) { return null; }
  }
  function cacheSet(book, ch, data) {
    try { localStorage.setItem(`${CACHE_PREFIX}${book.id}_${ch}`, JSON.stringify(data)); }
    catch (_) { /* quota plein, ignore */ }
  }

  // ── Sources API (essai en cascade) ────────────────────────
  // bolls.life propose la Bible Segond 1910 (FRLSG) gratuitement,
  // avec CORS ouvert. On garde une BDS (Bible du Semeur) en fallback.
  function bollsSource(translation) {
    return {
      name: 'bolls/' + translation,
      url: (book, ch) => `https://bolls.life/get-text/${translation}/${book.id}/${ch}/`,
      parse: (data) => {
        if (!Array.isArray(data)) return null;
        return {
          verses: data.map(v => ({
            verse: parseInt(v.verse, 10),
            text:  String(v.text || '').replace(/<[^>]+>/g, '').trim(),
          })).filter(v => !isNaN(v.verse) && v.text),
        };
      },
    };
  }
  const API_SOURCES = [
    bollsSource('FRLSG'),   // Louis Segond 1910 (référence catholique francophone)
    bollsSource('BDS'),     // Bible du Semeur 2015 (fallback si LSG indisponible)
    bollsSource('NBS'),     // Nouvelle Bible Segond 2002 (2e fallback)
  ];

  // ── Surlignages ──────────────────────────────────────────
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
    return !!h[key];
  }
  function isHighlighted(bookName, ch, verse) {
    return !!getHighlights()[`${bookName}_${ch}:${verse}`];
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
    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.unshift({ book: bookName, ch, verse, label: `${bookName} ${ch}:${verse}`, ts: Date.now() });
    }
    saveFavs(favs);
    renderFavList();
    return idx < 0;
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

    // Si déjà en cache, on affiche immédiatement
    let data = cacheGet(book, chapter);
    if (!data) {
      reader.innerHTML = `<div class="bible-loading">
        <div class="bible-spinner"></div>
        <p>Chargement de ${escapeHtml(book.name)} ${chapter}…</p>
      </div>`;

      // Essai en cascade des différentes sources API
      let lastError = null;
      for (const source of API_SOURCES) {
        try {
          const url = source.url(book, chapter);
          const resp = await fetch(url);
          if (!resp.ok) { lastError = `${source.name}: HTTP ${resp.status}`; continue; }
          const raw = await resp.json();
          const parsed = source.parse(raw);
          if (parsed && parsed.verses && parsed.verses.length) {
            data = parsed;
            cacheSet(book, chapter, data);
            break;
          }
          lastError = `${source.name}: réponse vide`;
        } catch (err) {
          lastError = `${source.name}: ${err.message}`;
        }
      }

      if (!data) {
        console.warn('[bible] Toutes les sources ont échoué :', lastError);
        reader.innerHTML = `<div class="bible-error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <p>Impossible de charger ce chapitre. Vérifiez votre connexion internet.</p>
          <p class="bible-error-detail">${escapeHtml(lastError || '')}</p>
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

    let html = `<div class="bible-chapter">
      <div class="bible-chapter-header">
        <button class="bible-back-btn" id="bible-back" aria-label="Retour à la liste des chapitres">
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
      html += `<div class="bible-verse${hi ? ' highlighted' : ''}" id="v-${num}" data-verse="${num}">
        <span class="bible-verse-num">${num}</span>
        <span class="bible-verse-text">${escapeHtml(txt)}</span>
        <div class="bible-verse-actions">
          <button class="bible-verse-action bible-hi-btn${hi ? ' active' : ''}" data-action="hi" data-verse="${num}" aria-label="Surligner">
            <i class="fa-solid fa-highlighter"></i>
          </button>
          <button class="bible-verse-action bible-fav-btn${fav ? ' active' : ''}" data-action="fav" data-verse="${num}" aria-label="Ajouter aux favoris">
            <i class="fa-${fav ? 'solid' : 'regular'} fa-bookmark"></i>
          </button>
          <button class="bible-verse-action bible-share-btn" data-action="share" data-verse="${num}" aria-label="Copier la référence">
            <i class="fa-solid fa-link"></i>
          </button>
        </div>
      </div>`;
    });

    html += '</div></div>';
    reader.innerHTML = html;

    // Event handlers
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

    // Délégation pour les actions verset (highlight/fav/share)
    reader.querySelector('.bible-verses')?.addEventListener('click', e => {
      const btn = e.target.closest('.bible-verse-action');
      if (!btn) return;
      e.stopPropagation();
      const verse = parseInt(btn.dataset.verse, 10);
      const verseEl = reader.querySelector(`#v-${verse}`);
      const action = btn.dataset.action;

      if (action === 'hi') {
        const isOn = toggleHighlight(book.name, chapter, verse);
        btn.classList.toggle('active', isOn);
        verseEl?.classList.toggle('highlighted', isOn);
      } else if (action === 'fav') {
        const isOn = toggleFav(book.name, chapter, verse);
        btn.classList.toggle('active', isOn);
        const icon = btn.querySelector('i');
        if (icon) icon.className = isOn ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
      } else if (action === 'share') {
        const ref = `${book.name} ${chapter}:${verse}`;
        const txt = verseEl?.querySelector('.bible-verse-text')?.textContent.trim() || '';
        const fullText = `« ${txt} »\n— ${ref}`;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(fullText).then(() => {
            flashFeedback(btn, '✓ Copié');
          }).catch(() => {});
        }
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
    renderFavList();
  }
  function closeFavPanel() {
    document.getElementById('bible-fav-panel')?.classList.add('hidden');
  }

  // ── Helpers ──────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    if (initialized) return;
    initialized = true;

    renderBookList();

    // Recherche
    const searchInput = document.getElementById('bible-search');
    const clearBtn    = document.getElementById('bible-search-clear');
    let searchTimer = null;
    searchInput?.addEventListener('input', () => {
      const v = searchInput.value;
      clearBtn.hidden = !v;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        if (!v.trim()) return;
        const ref = parseReference(v);
        if (ref) {
          loadChapter(ref.book, ref.ch, { scrollToVerse: ref.verse });
        }
      }, 400);
    });
    searchInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        clearTimeout(searchTimer);
        const ref = parseReference(searchInput.value);
        if (ref) loadChapter(ref.book, ref.ch, { scrollToVerse: ref.verse });
      }
    });
    clearBtn?.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.hidden = true;
      searchInput.focus();
    });

    // Boutons "quick refs" sur la page d'accueil
    document.querySelectorAll('.bible-quick-ref').forEach(btn => {
      btn.addEventListener('click', () => {
        const ref = parseReference(btn.dataset.ref);
        if (ref) loadChapter(ref.book, ref.ch, { scrollToVerse: ref.verse });
      });
    });

    // Panel favoris
    document.getElementById('bible-fav-toggle')?.addEventListener('click', openFavPanel);
    document.getElementById('bible-fav-close')?.addEventListener('click', closeFavPanel);
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
