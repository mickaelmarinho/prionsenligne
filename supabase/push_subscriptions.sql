-- Migration : notifications push (Web Push API).
-- Permet aux utilisateurs de recevoir une notif 10 min avant un office choisi,
-- même si le site n'est pas ouvert.
--
-- Architecture : le CLIENT calcule à l'avance les pushes à envoyer pour les 7
-- prochains jours, selon les filtres de l'utilisateur (types d'office + pays).
-- Le serveur (cron Vercel toutes les minutes) lit `next_pushes`, sélectionne
-- les entrées dont l'heure est dans la fenêtre courante, et envoie le push.
--
-- À exécuter dans Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      text        NOT NULL UNIQUE,
  p256dh        text        NOT NULL,
  auth_secret   text        NOT NULL,
  user_agent    text,
  user_tz       text        NOT NULL DEFAULT 'Europe/Paris',
  lead_min      int         NOT NULL DEFAULT 10,
  types         text[]      NOT NULL DEFAULT '{}',   -- ex: {'messe','chapelet'}
  countries     text[]      NOT NULL DEFAULT '{}',   -- ex: {'fr','be','ch'}
  -- Liste pré-calculée (côté client) des prochains pushes à envoyer.
  -- Format : [{ "at": "2026-05-27T09:50:00.000Z", "label": "Messe – Radio Maria",
  --             "body": "Diffusion à 10h00", "url": "/agenda", "type": "messe" }, ...]
  next_pushes   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  last_sync     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON push_subscriptions(user_id);

-- RLS : un user ne voit/modifie que ses propres souscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_sub_select_own') THEN
    CREATE POLICY push_sub_select_own ON push_subscriptions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_sub_insert_own') THEN
    CREATE POLICY push_sub_insert_own ON push_subscriptions
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_sub_update_own') THEN
    CREATE POLICY push_sub_update_own ON push_subscriptions
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_sub_delete_own') THEN
    CREATE POLICY push_sub_delete_own ON push_subscriptions
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Auto-update du timestamp updated_at
CREATE OR REPLACE FUNCTION push_subscriptions_touch_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION push_subscriptions_touch_updated();
