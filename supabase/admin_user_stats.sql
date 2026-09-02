-- ═══════════════════════════════════════════════════════════════════
-- PRIONSENLIGNE — Statistiques des inscrits (panneau admin)
--
-- À COLLER EN ENTIER dans Supabase → SQL Editor → Run.
-- Résultat attendu : « Success. No rows returned ». C'est normal :
-- on crée une fonction, on n'interroge rien.
--
-- ⚠️ N'exécutez PAS « select admin_user_stats(); » depuis cet éditeur :
-- il tournerait sans session utilisateur, donc sans jeton, donc sans
-- is_admin — et la fonction refuserait. Ce refus est son travail, pas
-- une panne. Elle ne répond que depuis le site, une fois connecté.
--
-- Pourquoi une fonction : auth.users n'est pas exposée au navigateur,
-- et c'est heureux. Celle-ci vérifie elle-même le drapeau is_admin porté
-- par le jeton, puis ne renvoie que des AGRÉGATS — aucun email, aucun
-- identifiant, rien de nominatif.
--
-- Rejouer ce fichier est sans danger (create or replace).
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.admin_user_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  res jsonb;
begin
  -- app_metadata voyage dans le jeton et l'utilisateur ne peut pas le
  -- modifier lui-même (contrairement à user_metadata) : c'est bien un
  -- contrôle d'accès, pas une simple préférence d'affichage.
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false) is not true then
    raise exception 'admin_user_stats: acces reserve aux administrateurs'
      using errcode = '42501';
  end if;

  -- Le test sur deleted_at passe par to_jsonb : la colonne n'existe pas
  -- dans les projets Supabase les plus anciens, et une référence directe
  -- y ferait échouer la fonction à l'exécution.
  select jsonb_build_object(
    'total',      count(*),
    'confirmes',  count(*) filter (where u.email_confirmed_at is not null),
    'j7',         count(*) filter (where u.created_at      >= now() - interval '7 days'),
    'j30',        count(*) filter (where u.created_at      >= now() - interval '30 days'),
    'actifs_j7',  count(*) filter (where u.last_sign_in_at >= now() - interval '7 days'),
    'actifs_j30', count(*) filter (where u.last_sign_in_at >= now() - interval '30 days'),
    'premier',    min(u.created_at),
    'dernier',    max(u.created_at)
  )
  into res
  from auth.users u
  where (to_jsonb(u) ->> 'deleted_at') is null;

  -- Courbe des inscriptions : un point par jour sur 30 jours. Les jours
  -- sans inscription sont absents ; le site complète par des zéros.
  res := res || jsonb_build_object('par_jour', coalesce((
    select jsonb_agg(jsonb_build_object('d', t.d, 'n', t.n) order by t.d)
    from (
      select date_trunc('day', u.created_at)::date as d, count(*) as n
      from auth.users u
      where (to_jsonb(u) ->> 'deleted_at') is null
        and u.created_at >= now() - interval '30 days'
      group by 1
    ) t
  ), '[]'::jsonb));

  return res;
end;
$fn$;

-- Personne par défaut. Seuls les comptes connectés peuvent appeler la
-- fonction — et elle refuse d'elle-même ceux qui ne sont pas admins.
revoke all on function public.admin_user_stats() from public;
revoke all on function public.admin_user_stats() from anon;
grant execute on function public.admin_user_stats() to authenticated;
