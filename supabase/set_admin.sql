-- À exécuter UNE seule fois pour te marquer comme admin.
-- Remplace l'email par le tien.
--
-- Le flag est posé dans `raw_app_meta_data` (et NON `raw_user_meta_data`)
-- car app_meta_data est protégé : l'utilisateur ne peut pas le modifier
-- via _sb.auth.updateUser(). Seul le service_role peut écrire dedans,
-- ce qui rend le flag inviolable côté client.

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
WHERE email = 'mickael_la_carafa@hotmail.fr';

-- Vérification :
-- SELECT email, raw_app_meta_data FROM auth.users WHERE email = 'mickael_la_carafa@hotmail.fr';
--
-- IMPORTANT : tu dois te déconnecter / reconnecter sur le site après cette
-- mise à jour pour que le nouveau JWT inclue is_admin = true.
