-- Migration : pays de prière de l'utilisateur, dénormalisé dans chaque message.
-- Permet d'afficher un petit drapeau à côté du pseudo dans le chat des intentions,
-- pour favoriser la communion francophone (France, Belgique, Suisse, Québec,
-- Cameroun, Côte d'Ivoire, Haïti, Sénégal, RDC, etc.).
--
-- Valeurs : code ISO-2 minuscule (fr, be, ch, ca, ci, cm, ht, sn, cd, …)
--           ou NULL si l'utilisateur n'a pas précisé ou préfère ne pas dire.
--
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE prayer_intentions
  ADD COLUMN IF NOT EXISTS country text;

-- Contrainte légère : 2 caractères ASCII minuscules max (code ISO-2)
ALTER TABLE prayer_intentions
  ADD CONSTRAINT IF NOT EXISTS prayer_intentions_country_format_chk
    CHECK (country IS NULL OR country ~ '^[a-z]{2}$');
