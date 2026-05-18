-- Migration : surcharges de planning (admin peut éditer les offices sans modifier le code).
-- Chaque ligne est UN override qui s'applique soit à une date précise, soit à une période.
-- Les overrides sont appliqués PAR-DESSUS WEEK_SCHEDULE côté client.
-- À exécuter dans Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS schedule_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users,

  -- Scope temporel
  date_start  date NOT NULL,            -- jour de début (inclus)
  date_end    date NOT NULL,            -- jour de fin (inclus). Si = date_start → 1 seul jour.

  -- Action
  action      text NOT NULL CHECK (action IN ('disable', 'add', 'modify')),

  -- Pour disable/modify : référence à l'office d'origine.
  -- Format : "<type>_<HHMM>" (ex: "messe_1000")
  target_office_id text,

  -- Pour add/modify : nouvelles valeurs (NULL = pas de changement sur ce champ)
  type         text,   -- 'laudes' | 'matin' | 'messe' | 'chapelet' | 'vepres' | 'soiree' | 'complies'
  label        text,
  description  text,
  time         text,   -- 'HH:MM'
  duration     int,    -- minutes
  sources      text[], -- ex: ['rm', 'nd']

  -- Méta
  notes        text,   -- mémo pour l'admin
  enabled      boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS schedule_overrides_dates_idx
  ON schedule_overrides (date_start, date_end)
  WHERE enabled = true;

ALTER TABLE schedule_overrides ENABLE ROW LEVEL SECURITY;

-- Lecture : TOUT le monde (anon inclus) peut lire les overrides actifs
-- (nécessaire pour que la grille soit à jour pour tous les visiteurs).
DROP POLICY IF EXISTS "Lecture publique des overrides" ON schedule_overrides;
CREATE POLICY "Lecture publique des overrides" ON schedule_overrides FOR SELECT
USING (enabled = true);

-- Écriture : admins seulement (app_metadata.is_admin = true)
DROP POLICY IF EXISTS "Admins écrivent les overrides" ON schedule_overrides;
CREATE POLICY "Admins écrivent les overrides" ON schedule_overrides FOR INSERT
WITH CHECK (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false) = true
);
DROP POLICY IF EXISTS "Admins modifient les overrides" ON schedule_overrides;
CREATE POLICY "Admins modifient les overrides" ON schedule_overrides FOR UPDATE
USING (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false) = true
);
DROP POLICY IF EXISTS "Admins suppriment les overrides" ON schedule_overrides;
CREATE POLICY "Admins suppriment les overrides" ON schedule_overrides FOR DELETE
USING (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false) = true
);

-- Trigger : met à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS schedule_overrides_set_updated_at ON schedule_overrides;
CREATE TRIGGER schedule_overrides_set_updated_at
  BEFORE UPDATE ON schedule_overrides
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
