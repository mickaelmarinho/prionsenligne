-- Migration : dénormalise saint patron + citation favorite dans les messages du tchat.
-- Permet d'afficher un mini-profil au clic sur un avatar dans le tchat.
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE prayer_intentions
  ADD COLUMN IF NOT EXISTS patron_saint   text,
  ADD COLUMN IF NOT EXISTS favorite_verse text;
