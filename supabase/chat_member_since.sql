-- Migration : date d'inscription du membre, dénormalisée dans chaque message.
-- Permet d'afficher le grade (Pèlerin/Disciple/Frère/Fidèle/Ancien) dans le tchat
-- et la date d'inscription dans le popover du profil.
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE prayer_intentions
  ADD COLUMN IF NOT EXISTS member_since timestamptz;
