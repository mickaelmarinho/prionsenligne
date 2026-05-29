-- Migration : sélection d'offices spécifiques pour les notifs push.
--
-- Avant : l'utilisateur s'abonnait à des TYPES (messes/chapelets/...) et des
--         PAYS (fr/be/ch/ca) → trop grossier (10+ notifs/jour pour 'Messes').
-- Après : l'utilisateur s'abonne office par office via la cloche dans l'agenda.
--
-- Format d'un office_id : "{type}|{slug-du-label}|{HHMM}"
-- Ex : "messe|messe-notre-dame-de-paris|1800"
--      "chapelet|chapelet-de-lourdes|1530"
--
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS office_ids text[] NOT NULL DEFAULT '{}';

-- Les anciennes colonnes types[] / countries[] sont conservées pour
-- rétrocompat mais ne sont plus lues par le nouveau code.
