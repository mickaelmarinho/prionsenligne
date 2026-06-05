-- ════════════════════════════════════════════════════════════
--  PrionsEnLigne — Préférences d'offices (favoris synchronisés)
-- ────────────────────────────────────────────────────────────
--  À exécuter UNE FOIS dans le SQL Editor de Supabase
--  (Dashboard → SQL Editor → New query → coller → Run)
--
--  Stocke, pour chaque utilisateur connecté, la liste des types
--  d'offices favoris (Laudes, Messe, Chapelet, Vêpres…) afin que
--  la page « Aujourd'hui » n'affiche que ceux-ci, et que ce choix
--  le suive sur tous ses appareils.
--
--  Row Level Security : chaque utilisateur ne voit/modifie que sa
--  propre ligne.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  office_filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Lecture : chacun lit sa propre ligne
DROP POLICY IF EXISTS "Users select own prefs" ON public.user_preferences;
CREATE POLICY "Users select own prefs"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

-- Insertion : chacun crée sa propre ligne
DROP POLICY IF EXISTS "Users insert own prefs" ON public.user_preferences;
CREATE POLICY "Users insert own prefs"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Mise à jour : chacun met à jour sa propre ligne (nécessaire pour l'upsert)
DROP POLICY IF EXISTS "Users update own prefs" ON public.user_preferences;
CREATE POLICY "Users update own prefs"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════
--  Vérification : la table doit maintenant exister
-- ════════════════════════════════════════════════════════════
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'user_preferences';
