-- ═══════════════════════════════════════════════════════════════════
-- PRIONSENLIGNE — Statistiques des inscrits (panneau admin)
--
-- Le navigateur ne peut pas lire auth.users : cette table n'est pas
-- exposée par PostgREST, et c'est une bonne chose. On passe donc par une
-- fonction SECURITY DEFINER qui vérifie elle-même le drapeau is_admin
-- porté par le jeton, puis ne renvoie que des AGRÉGATS — aucun email,
-- aucun identifiant, rien de nominatif.
--
-- À exécuter une seule fois dans l'éditeur SQL de Supabase.
-- Rejouer ce fichier est sans danger (create or replace).
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.admin_user_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_admin boolean;
  res        jsonb;
begin
  -- app_metadata voyage dans le JWT : l'utilisateur ne peut pas le modifier
  -- lui-même (contrairement à user_metadata). C'est bien un contrôle d'accès.
  v_is_admin := coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
  if not v_is_admin then
    raise exception 'admin_user_stats : accès réservé aux administrateurs'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total',      count(*),
    'confirmes',  count(*) filter (where email_confirmed_at is not null),
    'j7',         count(*) filter (where created_at      >= now() - interval '7 days'),
    'j30',        count(*) filter (where created_at      >= now() - interval '30 days'),
    'actifs_j7',  count(*) filter (where last_sign_in_at >= now() - interval '7 days'),
    'actifs_j30', count(*) filter (where last_sign_in_at >= now() - interval '30 days'),
    'premier',    min(created_at),
    'dernier',    max(created_at)
  )
  into res
  from auth.users
  where deleted_at is null;

  -- Courbe des inscriptions : un point par jour sur 30 jours.
  -- Les jours sans inscription sont absents ; le client complète par des zéros.
  res := res || jsonb_build_object('par_jour', coalesce((
    select jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d)
    from (
      select date_trunc('day', created_at)::date as d, count(*) as n
      from auth.users
      where deleted_at is null
        and created_at >= now() - interval '30 days'
      group by 1
    ) t
  ), '[]'::jsonb));

  return res;
end;
$$;

-- Personne par défaut ; seuls les comptes connectés peuvent l'appeler —
-- et la fonction refuse elle-même ceux qui ne sont pas administrateurs.
revoke all on function public.admin_user_stats() from public;
revoke all on function public.admin_user_stats() from anon;
grant execute on function public.admin_user_stats() to authenticated;
