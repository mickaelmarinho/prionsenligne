-- Migration : journal de modération des messages du tchat.
-- Chaque appel à /api/moderate-chat crée une ligne ici (autorisé OU refusé).
-- Lecture restreinte aux admins (champ app_metadata.is_admin = true).
-- À exécuter dans Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS moderation_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid REFERENCES auth.users,
  user_name   text,
  office_id   text,
  message     text NOT NULL,
  allowed     boolean NOT NULL,
  category    text,            -- 'ok' | 'spam' | 'haine' | 'blaspheme' | 'sexuel' | 'violence' | 'hors-sujet' | 'autre'
  reason      text,
  source      text DEFAULT 'claude'  -- 'claude' | 'local-flood' | 'local-url' | 'fallback'
);

CREATE INDEX IF NOT EXISTS moderation_log_created_idx  ON moderation_log (created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_log_allowed_idx  ON moderation_log (allowed, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_log_user_idx     ON moderation_log (user_id, created_at DESC);

ALTER TABLE moderation_log ENABLE ROW LEVEL SECURITY;

-- Lecture : admins seulement (flag app_metadata.is_admin = true dans le JWT)
DROP POLICY IF EXISTS "Admins lisent les logs" ON moderation_log;
CREATE POLICY "Admins lisent les logs" ON moderation_log FOR SELECT
USING (
  COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false) = true
);

-- Aucune policy INSERT : seul le service_role (utilisé côté serveur Vercel) peut insérer.
-- Le client anon ne peut donc pas pourrir le journal.
