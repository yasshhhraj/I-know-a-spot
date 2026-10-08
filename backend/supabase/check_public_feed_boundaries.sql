-- Operator-run only, AFTER 202610070001, 202610070002, and 202610080003:
-- psql -X -v ON_ERROR_STOP=1 -v member_a=REPLACE_WITH_DISPOSABLE_AUTH_UUID \
--   -v member_b=REPLACE_WITH_DISPOSABLE_AUTH_UUID -v outsider=REPLACE_WITH_DISPOSABLE_AUTH_UUID \
--   -f supabase/check_public_feed_boundaries.sql
-- Three distinct EXISTING disposable Auth users, with NO pilot_members rows.
-- Execute through a privately configured operator connection, never a user token.
-- Synthetic coordinates (0,0); spots have canonical photo paths but NO Storage
-- objects. This verifies SQL grants/RPC/RLS behavior, NOT Storage/media or the
-- real-token HTTP path. A successful run ROLLBACKs every fixture/mutation.
-- With ON_ERROR_STOP=1, a failed psql session closes and PostgreSQL rolls back.
begin;

create temporary table public_feed_fixture (a uuid, b uuid, outsider uuid) on commit drop;
insert into public_feed_fixture values (:'member_a'::uuid, :'member_b'::uuid, :'outsider'::uuid);
create temporary table public_feed_spot_fixture (kind text primary key, id uuid not null default gen_random_uuid()) on commit drop;
grant select on public_feed_fixture, public_feed_spot_fixture to authenticated;

do $$
declare f record; p record;
begin
  select * into f from public_feed_fixture;
  if f.a = f.b or f.a = f.outsider or f.b = f.outsider then
    raise exception 'Fixture accounts must be distinct';
  end if;
  if (select count(*) from auth.users where id in (f.a, f.b, f.outsider)) <> 3 then
    raise exception 'Fixture accounts must exist in auth.users';
  end if;
  if exists (select 1 from public.pilot_members where user_id in (f.a, f.b, f.outsider)) then
    raise exception 'Fixture accounts must not already be pilot members';
  end if;
  -- Exact counts below assume no unrelated Public spots in the synthetic area.
  -- Refuse contamination; never hide/delete existing operator data to run a test.
  if exists (
    select 1 from public.spots s
    join public.pilot_members m on m.user_id = s.owner_id and m.enrolled = true
    where s.audience = 'public' and s.removed_at is null and
      2.0 * 6371.0 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians(s.latitude / 2.0)), 2) +
        cos(radians(s.latitude)) * power(sin(radians(s.longitude / 2.0)), 2)
      )))) <= 25
  ) then
    raise exception 'Synthetic test area contains existing Public spots; use an isolated test project';
  end if;
  select * into p from pg_proc
    where oid = 'public.list_public_spots(double precision,double precision)'::regprocedure;
  if not found then
    raise exception 'Public RPC is missing; apply 202610080003 first';
  end if;
  if not p.prosecdef or p.provolatile <> 's' or
      not (coalesce('search_path=' = any(p.proconfig), false) or
           coalesce('search_path=""' = any(p.proconfig), false)) or
     p.pronargs <> 2 or
     (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
       and proname = 'list_public_spots') <> 1 or
     has_function_privilege('anon', p.oid, 'EXECUTE') or
     not has_function_privilege('authenticated', p.oid, 'EXECUTE') or
     exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where a.grantee = 0 and a.privilege_type = 'EXECUTE') or
     pg_get_function_result(p.oid) ~ '(photo_path|public_radius_km|enrolled|removed_at)' then
    raise exception 'Public RPC grants, fixed search_path, definer or return shape incorrect';
  end if;
end $$;

insert into public.pilot_members (user_id, display_name, enrolled)
select a, 'Synthetic A', true from public_feed_fixture
union all select b, 'Synthetic B', true from public_feed_fixture
union all select outsider, 'Synthetic outsider', false from public_feed_fixture;
-- No connection pair: B must still see A's nearby Public spots.

insert into public_feed_spot_fixture (kind) values
  ('near_old'), ('near_new'), ('near_tie'), ('inside'), ('on'), ('outside'),
  ('private'), ('removed'), ('own');
insert into public.spots (id, owner_id, author_name, title, note, audience,
  latitude, longitude, access_confirmed, access_note, photo_path, created_at, updated_at, removed_at)
select s.id, case when s.kind = 'own' then f.b else f.a end,
  'Synthetic author', s.kind, 'Synthetic public-area test only',
  case when s.kind = 'private' then 'connections' else 'public' end,
  0::double precision,
  case s.kind
    when 'inside' then degrees(4.999::double precision / 6371.0)
    when 'on' then degrees(5.0::double precision / 6371.0)
    when 'outside' then degrees(5.001::double precision / 6371.0)
    else 0::double precision end,
  true, '',
  (case when s.kind = 'own' then f.b else f.a end)::text || '/' || s.id::text || '.webp',
  case when s.kind in ('near_new', 'near_tie') then '2026-10-08 02:00:00+00'::timestamptz
       when s.kind = 'near_old' then '2026-10-08 01:00:00+00'::timestamptz
       else '2026-10-08 00:00:00+00'::timestamptz end,
  '2026-10-08 03:00:00+00'::timestamptz,
  case when s.kind = 'removed' then '2026-10-08 04:00:00+00'::timestamptz else null end
from public_feed_spot_fixture s cross join public_feed_fixture f;

-- The independently computed formula verifies the mathematically specified
-- 5 km boundary to a floating-point tolerance, not an extra policy epsilon.
-- The RPC itself must still use its strict <= saved radius predicate.
do $$
declare inside_km double precision; on_km double precision; outside_km double precision;
begin
  select 2.0 * 6371.0 * asin(sqrt(power(sin(radians(longitude / 2.0)), 2)))
    into inside_km from public.spots where id = (select id from public_feed_spot_fixture where kind = 'inside');
  select 2.0 * 6371.0 * asin(sqrt(power(sin(radians(longitude / 2.0)), 2)))
    into on_km from public.spots where id = (select id from public_feed_spot_fixture where kind = 'on');
  select 2.0 * 6371.0 * asin(sqrt(power(sin(radians(longitude / 2.0)), 2)))
    into outside_km from public.spots where id = (select id from public_feed_spot_fixture where kind = 'outside');
  if not (inside_km < 5 and abs(on_km - 5) < 1e-9 and outside_km > 5) then
    raise exception 'Synthetic Haversine boundary coordinates are invalid';
  end if;
end $$;

select set_config('request.jwt.claim.sub', b::text, true) from public_feed_fixture;
set local role authenticated;
do $$
declare n integer; f record;
begin
  select * into f from public_feed_fixture;
  if (select count(*) from public.connections) <> 0 then
    raise exception 'Synthetic viewer unexpectedly has a connection';
  end if;
  select count(*) into n from public.list_public_spots(0, 0);
  if n <> 6 or
     exists (select 1 from public.list_public_spots(0, 0) r
       where r.audience <> 'public' or r.distance_km < 0 or r.distance_km > 5) or
     not exists (select 1 from public.list_public_spots(0, 0) r
       where r.owner_id = f.a) or
     exists (select 1 from public.list_public_spots(0, 0) r
       join public_feed_spot_fixture s on s.id = r.id
       where s.kind in ('outside', 'private', 'removed')) then
    raise exception 'Unconnected viewer Public/removed/private/radius boundary failed';
  end if;
  if not exists (select 1 from public.list_public_spots(0, 0) r
       join public_feed_spot_fixture s on s.id = r.id where s.kind = 'on'
         and abs(r.distance_km - 5) < 1e-9) or
     not exists (select 1 from public.list_public_spots(0, 0) r
       join public_feed_spot_fixture s on s.id = r.id where s.kind = 'inside') then
    raise exception 'Inclusive on/inside 5 km boundary failed';
  end if;
  -- Exact ordering: distance, then recency, then UUID descending, including
  -- two same-time/same-position A spots to exercise the final ID tie break.
  if exists (select 1 from (
    select r.*, lag(r.distance_km) over w as prev_km,
      lag(r.created_at) over w as prev_created, lag(r.id) over w as prev_id
    from public.list_public_spots(0, 0) with ordinality r
    window w as (order by r.ordinality)
  ) ordered where prev_km > distance_km or
    (prev_km = distance_km and prev_created < created_at) or
    (prev_km = distance_km and prev_created = created_at and prev_id < id)) then
    raise exception 'Public result order failed';
  end if;
end $$;

-- A's radius is not the viewer's radius. Only B's authenticated, enrolled,
-- self-scoped column update changes B's results; no RPC radius argument exists.
update public.pilot_members set public_radius_km = 1 where user_id = (select b from public_feed_fixture);
do $$
begin
  if (select public_radius_km from public.pilot_members) <> 1 or
     (select count(*) from public.list_public_spots(0, 0)) <> 4 or
     exists (select 1 from public.list_public_spots(0, 0) where distance_km > 1) then
    raise exception 'Saved own radius update or narrower Public results failed';
  end if;
  if (select count(*) from public.list_public_spots(0, 0.1)) <> 0 then
    raise exception 'Center change must not silently widen discovery';
  end if;
end $$;
update public.pilot_members set public_radius_km = 25 where user_id = (select a from public_feed_fixture);
do $$ begin
  if (select public_radius_km from public.pilot_members) <> 1 then
    raise exception 'Cannot change another member radius';
  end if;
end $$;
do $$
declare denied boolean := false;
begin
  begin
    update public.pilot_members set display_name = 'Unauthorized' where user_id = (select b from public_feed_fixture);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Display name UPDATE unexpectedly allowed'; end if;
  denied := false;
  begin
    update public.pilot_members set enrolled = false where user_id = (select b from public_feed_fixture);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Enrollment UPDATE unexpectedly allowed'; end if;
  denied := false;
  begin
    update public.pilot_members set public_radius_km = 26 where user_id = (select b from public_feed_fixture);
  exception when check_violation then denied := true;
  end;
  if not denied then raise exception 'Radius bound UPDATE unexpectedly allowed'; end if;
  denied := false;
  begin
    perform public.list_public_spots(91, 0);
  exception when invalid_parameter_value then denied := true;
  end;
  if not denied then raise exception 'Invalid center unexpectedly allowed'; end if;
end $$;
update public.pilot_members set public_radius_km = 5 where user_id = (select b from public_feed_fixture);
do $$ begin
  if (select public_radius_km from public.pilot_members) <> 5 or
     (select count(*) from public.list_public_spots(0, 0)) <> 6 then
    raise exception 'Saved radius restoration did not persist in transaction';
  end if;
end $$;
reset role;

-- De-enrolled authors are excluded even though their old public rows remain.
update public.pilot_members set enrolled = false where user_id = (select a from public_feed_fixture);
select set_config('request.jwt.claim.sub', b::text, true) from public_feed_fixture;
set local role authenticated;
do $$ begin
  if (select count(*) from public.list_public_spots(0, 0)) <> 1 or
     exists (select 1 from public.list_public_spots(0, 0) r
       where r.owner_id <> (select b from public_feed_fixture)) then
    raise exception 'De-enrolled author leaked to Public';
  end if;
end $$;
reset role;
update public.pilot_members set enrolled = true where user_id = (select a from public_feed_fixture);

-- Add 52 synthetic active spots (no media) to test the hard 50 result cap.
insert into public.spots (id, owner_id, author_name, title, note, audience,
  latitude, longitude, access_confirmed, access_note, photo_path, created_at, updated_at)
select x.id, f.a, 'Synthetic author', 'bulk-' || x.n, 'Synthetic test only',
  'public', 0, 0, true, '', f.a::text || '/' || x.id::text || '.webp',
  '2026-10-08 05:00:00+00'::timestamptz + x.n * interval '1 second',
  '2026-10-08 05:00:00+00'::timestamptz
from public_feed_fixture f cross join lateral (
  select n, gen_random_uuid() as id from generate_series(1, 52) n
) x;
select set_config('request.jwt.claim.sub', b::text, true) from public_feed_fixture;
set local role authenticated;
do $$
declare first_title text; last_title text;
begin
  if (select count(*) from public.list_public_spots(0, 0)) <> 50 then
    raise exception 'Public result must cap at 50';
  end if;
  select title into first_title from public.list_public_spots(0, 0) limit 1;
  select title into last_title from public.list_public_spots(0, 0) offset 49 limit 1;
  if first_title <> 'bulk-52' or last_title <> 'bulk-3' then
    raise exception 'Public cap must apply after distance/newest ordering';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', outsider::text, true) from public_feed_fixture;
set local role authenticated;
do $$
declare denied boolean := false;
begin
  update public.pilot_members set public_radius_km = 25 where user_id = (select outsider from public_feed_fixture);
  if (select public_radius_km from public.pilot_members) <> 5 then
    raise exception 'Unenrolled caller changed own radius';
  end if;
  begin
    perform public.list_public_spots(0, 0);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Unenrolled caller accessed Public RPC'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$
declare denied boolean := false;
begin
  begin
    perform public.list_public_spots(0, 0);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous caller accessed Public RPC'; end if;
end $$;
reset role;

rollback;
