-- psql -X -v ON_ERROR_STOP=1 -v member_a=REPLACE_WITH_TEST_AUTH_UUID \
--   -v member_b=REPLACE_WITH_TEST_AUTH_UUID -v outsider=REPLACE_WITH_TEST_AUTH_UUID \
--   -f supabase/check_pilot_boundaries.sql
-- Requires three distinct EXISTING disposable Auth users with no pilot_members rows.
-- Run as a DB operator with role/set_config permissions, never with a user token.
-- The entire fixture and every test mutation roll back on success.
begin;
create temporary table pilot_fixture (a uuid, b uuid, outsider uuid) on commit drop;
insert into pilot_fixture values (:'member_a'::uuid, :'member_b'::uuid, :'outsider'::uuid);
grant select on pilot_fixture to authenticated;
do $$
declare f record;
begin
  select * into f from pilot_fixture;
  if f.a = f.b or f.a = f.outsider or f.b = f.outsider then
    raise exception 'Fixture accounts must be distinct';
  end if;
  if (select count(*) from auth.users where id in (f.a, f.b, f.outsider)) <> 3 then
    raise exception 'Fixture accounts must exist in auth.users';
  end if;
  if exists (select 1 from public.pilot_members where user_id in (f.a, f.b, f.outsider)) then
    raise exception 'Fixture accounts must not already be pilot members';
  end if;
end $$;

insert into public.pilot_members (user_id, display_name, enrolled)
select a, 'Boundary A', true from pilot_fixture
union all select b, 'Boundary B', true from pilot_fixture
union all select outsider, 'Boundary outsider', false from pilot_fixture;
insert into public.connections (member_a, member_b)
select least(a,b), greatest(a,b) from pilot_fixture;

do $$
declare f record;
begin
  select * into f from pilot_fixture;
  if not exists (select 1 from public.pilot_members where user_id = f.a and public_radius_km = 5) then
    raise exception 'Default radius failed';
  end if;
  if not (select convalidated from pg_constraint where conrelid = 'public.pilot_members'::regclass and conname = 'pilot_members_public_radius_km_check') then
    raise exception 'Radius constraint missing';
  end if;
  if not (select convalidated from pg_constraint where conrelid = 'public.connections'::regclass and conname = 'connections_canonical_order') then
    raise exception 'Canonical pair constraint missing';
  end if;
  begin
    update public.pilot_members set public_radius_km = 0 where user_id = f.a;
    raise exception 'Radius lower bound was not enforced';
  exception when check_violation then null;
  end;
  begin
    update public.pilot_members set public_radius_km = 26 where user_id = f.a;
    raise exception 'Radius upper bound was not enforced';
  exception when check_violation then null;
  end;
  begin
    insert into public.connections (member_a, member_b) values (f.a, f.a);
    raise exception 'Self-pair was not rejected';
  exception when check_violation then null;
  end;
  begin
    insert into public.connections (member_a, member_b) values (greatest(f.a, f.b), least(f.a, f.b));
    raise exception 'Reversed pair was not rejected';
  exception when check_violation then null;
  end;
  begin
    insert into public.connections (member_a, member_b) values (least(f.a, f.b), greatest(f.a, f.b));
    raise exception 'Duplicate pair was not rejected';
  exception when unique_violation then null;
  end;
  if has_table_privilege('anon', 'public.pilot_members', 'SELECT') or
     has_table_privilege('anon', 'public.connections', 'SELECT') or
     has_table_privilege('anon', 'public.pilot_members', 'UPDATE') or
     has_table_privilege('anon', 'public.connections', 'UPDATE') or
     has_table_privilege('authenticated', 'public.pilot_members', 'INSERT') or
     has_table_privilege('authenticated', 'public.pilot_members', 'DELETE') or
     has_column_privilege('authenticated', 'public.pilot_members', 'display_name', 'UPDATE') or
     has_column_privilege('authenticated', 'public.pilot_members', 'enrolled', 'UPDATE') or
     has_table_privilege('authenticated', 'public.connections', 'INSERT') or
     has_table_privilege('authenticated', 'public.connections', 'UPDATE') or
     has_table_privilege('authenticated', 'public.connections', 'DELETE') then
    raise exception 'Unexpected client privileges';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', a::text, true) from pilot_fixture;
do $$
declare f record;
begin
  select * into f from pilot_fixture;
  if (select count(*) from public.pilot_members) <> 1 or
     not exists (select 1 from public.pilot_members where user_id = f.a) or
     (select count(*) from public.connections) <> 1 then
    raise exception 'Member A self/connection SELECT boundary failed';
  end if;
end $$;
update public.pilot_members set public_radius_km = 25 where user_id = (select a from pilot_fixture);
do $$ begin
  if (select public_radius_km from public.pilot_members) <> 25 then
    raise exception 'Self radius UPDATE failed';
  end if;
end $$;

select set_config('request.jwt.claim.sub', b::text, true) from pilot_fixture;
do $$
begin
  if (select count(*) from public.pilot_members) <> 1 or
     (select count(*) from public.connections) <> 1 or
     (select public_radius_km from public.pilot_members) <> 5 then
    raise exception 'Member B must only see own profile and shared connection';
  end if;
end $$;

select set_config('request.jwt.claim.sub', outsider::text, true) from pilot_fixture;
do $$
begin
  if (select count(*) from public.pilot_members) <> 1 or
     (select count(*) from public.connections) <> 0 then
    raise exception 'Unenrolled outsider SELECT boundary failed';
  end if;
end $$;
update public.pilot_members set public_radius_km = 10;
do $$ begin
  if (select public_radius_km from public.pilot_members) <> 5 then
    raise exception 'Unenrolled radius UPDATE should affect zero rows';
  end if;
end $$;
reset role;
rollback;
