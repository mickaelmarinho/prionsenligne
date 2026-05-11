-- Migration : ajoute les avatars dans le tchat des intentions de prière.
-- À exécuter dans Supabase → SQL Editor.
--
-- Les deux colonnes sont nullables et ont des valeurs par défaut sûres,
-- donc les messages anciens continuent de s'afficher (avec initiale auto).

ALTER TABLE prayer_intentions
  ADD COLUMN IF NOT EXISTS avatar_icon    text DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS avatar_palette text DEFAULT 'auto';
