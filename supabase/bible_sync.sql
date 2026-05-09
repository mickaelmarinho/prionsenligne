-- ════════════════════════════════════════════════════════════
--  PrionsEnLigne — Tables de synchronisation Bible
-- ────────────────────────────────────────────────────────────
--  À exécuter UNE FOIS dans le SQL Editor de Supabase
--  (Dashboard → SQL Editor → New query → coller → Run)
--
--  Crée 3 tables avec Row Level Security pour que chaque
--  utilisateur ne voie/modifie que ses propres données.
-- ════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Surlignages de versets entiers
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bible_highlights (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book        TEXT NOT NULL,
  chapter     INTEGER NOT NULL CHECK (chapter > 0),
  verse       INTEGER NOT NULL CHECK (verse > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, book, chapter, verse)
);

CREATE INDEX IF NOT EXISTS bible_highlights_user_idx
  ON public.bible_highlights (user_id, book, chapter);

ALTER TABLE public.bible_highlights ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur ne voit que ses propres surlignages
DROP POLICY IF EXISTS "Users select own highlights" ON public.bible_highlights;
CREATE POLICY "Users select own highlights"
  ON public.bible_highlights FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own highlights" ON public.bible_highlights;
CREATE POLICY "Users insert own highlights"
  ON public.bible_highlights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own highlights" ON public.bible_highlights;
CREATE POLICY "Users delete own highlights"
  ON public.bible_highlights FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 2. Surlignages mot par mot
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bible_word_highlights (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book        TEXT NOT NULL,
  chapter     INTEGER NOT NULL CHECK (chapter > 0),
  verse       INTEGER NOT NULL CHECK (verse > 0),
  word_idx    INTEGER NOT NULL CHECK (word_idx >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, book, chapter, verse, word_idx)
);

CREATE INDEX IF NOT EXISTS bible_word_hi_user_idx
  ON public.bible_word_highlights (user_id, book, chapter);

ALTER TABLE public.bible_word_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own word highlights" ON public.bible_word_highlights;
CREATE POLICY "Users select own word highlights"
  ON public.bible_word_highlights FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own word highlights" ON public.bible_word_highlights;
CREATE POLICY "Users insert own word highlights"
  ON public.bible_word_highlights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own word highlights" ON public.bible_word_highlights;
CREATE POLICY "Users delete own word highlights"
  ON public.bible_word_highlights FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 3. Favoris (versets bookmarkés)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bible_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book        TEXT NOT NULL,
  chapter     INTEGER NOT NULL CHECK (chapter > 0),
  verse       INTEGER NOT NULL CHECK (verse > 0),
  label       TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, book, chapter, verse)
);

CREATE INDEX IF NOT EXISTS bible_favorites_user_idx
  ON public.bible_favorites (user_id, created_at DESC);

ALTER TABLE public.bible_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own favorites" ON public.bible_favorites;
CREATE POLICY "Users select own favorites"
  ON public.bible_favorites FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own favorites" ON public.bible_favorites;
CREATE POLICY "Users insert own favorites"
  ON public.bible_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own favorites" ON public.bible_favorites;
CREATE POLICY "Users delete own favorites"
  ON public.bible_favorites FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own favorites" ON public.bible_favorites;
CREATE POLICY "Users update own favorites"
  ON public.bible_favorites FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
--  Vérification : ces 3 tables doivent maintenant exister
--  (à requêter pour confirmer)
-- ════════════════════════════════════════════════════════════
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename LIKE 'bible_%';
