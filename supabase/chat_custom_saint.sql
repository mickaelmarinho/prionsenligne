-- Migration : dénormalise le nom + la date de fête du saint patron dans le tchat.
-- Permet d'afficher correctement les saints personnalisés (issus de la recherche Nominis).
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE prayer_intentions
  ADD COLUMN IF NOT EXISTS patron_saint_name  text,
  ADD COLUMN IF NOT EXISTS patron_saint_feast text;
