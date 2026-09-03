-- ═══════════════════════════════════════════════════════════════════
-- PRIONSENLIGNE — Mesure d'usage, sans nommer personne
--
-- À COLLER EN ENTIER dans Supabase → SQL Editor → Run.
-- Résultat attendu : « Success. No rows returned ».
--
-- Principe : on ne stocke aucune ligne par visiteur. On incrémente des
-- COMPTEURS. Il n'y a donc ni identifiant, ni adresse IP, ni session en
-- base — l'anonymat n'est pas une promesse, c'est la forme même des
-- données. Rien à ajouter à la politique de confidentialité.
--
-- Une ligne = (jour, type, clé) avec deux nombres :
--   n     → combien de fois
--   total → une somme, utilisée seulement pour cumuler des secondes
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.usage_stats (
  jour  date   not null default current_date,
  type  text   not null,
  cle   text   not null,
  n     bigint not null default 0,
  total bigint not null default 0,
  primary key (jour, type, cle)
);

alter table public.usage_stats enable row level security;
-- Aucune politique : personne ne lit ni n'écrit la table directement.
-- Tout passe par les deux fonctions ci-dessous.

-- ── Écriture : appelée par le site, y compris par un visiteur non connecté
create or replace function public.stat_bump(p_type text, p_cle text, p_valeur bigint default 0)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Liste blanche : une clé inattendue est ignorée en silence plutôt que
  -- de laisser n'importe qui créer des lignes arbitraires.
  if p_type not in ('page', 'onglet', 'action', 'heure', 'visite') then
    return;
  end if;
  if p_cle is null or length(p_cle) = 0 or length(p_cle) > 60 then
    return;
  end if;

  insert into public.usage_stats (jour, type, cle, n, total)
  values (
    current_date,
    p_type,
    left(p_cle, 60),
    1,
    -- Deux heures de plafond : au-delà, c'est un onglet oublié ouvert,
    -- pas une visite. Sans borne, une seule valeur aberrante fausserait
    -- la moyenne pour toute la journée.
    least(greatest(coalesce(p_valeur, 0), 0), 7200)
  )
  on conflict (jour, type, cle) do update
    set n     = usage_stats.n + 1,
        total = usage_stats.total + least(greatest(coalesce(p_valeur, 0), 0), 7200);
end;
$fn$;

grant execute on function public.stat_bump(text, text, bigint) to anon, authenticated;

-- ── Lecture : réservée aux administrateurs
create or replace function public.admin_usage_stats(p_jours int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  d0  date := current_date - greatest(least(coalesce(p_jours, 30), 365), 1);
  res jsonb;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false) is not true then
    raise exception 'admin_usage_stats: acces reserve aux administrateurs'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'depuis', d0,
    'pages',   coalesce((select jsonb_agg(x order by x->>'cle')
                 from (select jsonb_build_object('cle', cle, 'n', sum(n)) as x
                       from usage_stats where type = 'page'   and jour >= d0
                       group by cle order by sum(n) desc limit 25) p), '[]'::jsonb),
    'onglets', coalesce((select jsonb_agg(x)
                 from (select jsonb_build_object('cle', cle, 'n', sum(n)) as x
                       from usage_stats where type = 'onglet' and jour >= d0
                       group by cle order by sum(n) desc) o), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(x)
                 from (select jsonb_build_object('cle', cle, 'n', sum(n)) as x
                       from usage_stats where type = 'action' and jour >= d0
                       group by cle order by sum(n) desc limit 25) a), '[]'::jsonb),
    'heures',  coalesce((select jsonb_agg(x)
                 from (select jsonb_build_object('cle', cle, 'n', sum(n)) as x
                       from usage_stats where type = 'heure'  and jour >= d0
                       group by cle order by cle::int) h), '[]'::jsonb),
    'visites',      coalesce((select sum(n)     from usage_stats where type = 'visite' and jour >= d0), 0),
    'secondes',     coalesce((select sum(total) from usage_stats where type = 'visite' and jour >= d0), 0),
    'par_jour', coalesce((select jsonb_agg(x)
                 from (select jsonb_build_object('d', jour, 'n', sum(n)) as x
                       from usage_stats where type = 'visite' and jour >= d0
                       group by jour order by jour) j), '[]'::jsonb)
  ) into res;

  return res;
end;
$fn$;

revoke all on function public.admin_usage_stats(int) from public;
revoke all on function public.admin_usage_stats(int) from anon;
grant execute on function public.admin_usage_stats(int) to authenticated;
