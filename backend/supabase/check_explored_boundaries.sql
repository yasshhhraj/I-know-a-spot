-- Operator-run psql AFTER migration0004; ALWAYS ROLLBACK, no Storage objects.
-- Four DISTINCT existing disposable Auth users with NO pilot_members rows:
-- psql -X -v ON_ERROR_STOP=1 -v member_a=REPLACE_WITH_AUTH_UUID_A \
--   -v member_b=REPLACE_WITH_AUTH_UUID_B -v unconnected=REPLACE_WITH_AUTH_UUID_C \
--   -v unenrolled=REPLACE_WITH_AUTH_UUID_D -f supabase/check_explored_boundaries.sql
-- Configure operator connection privately; never put credentials in this file.
begin;
create temporary table explored_fixture(a uuid, b uuid, c uuid, d uuid,
  public_id uuid default '7b220000-0000-4000-8000-000000000001',
  private_id uuid default '7b220000-0000-4000-8000-000000000002') on commit drop;
insert into explored_fixture(a,b,c,d) values
  (:'member_a'::uuid, :'member_b'::uuid, :'unconnected'::uuid, :'unenrolled'::uuid);
grant select on explored_fixture to authenticated;

do $$
declare f record; p record;
begin
  select * into f from explored_fixture;
  if (select count(distinct id) from unnest(array[f.a,f.b,f.c,f.d]) id) <> 4 then
    raise exception 'Use four distinct disposable accounts';
  end if;
  if (select count(*) from auth.users where id in(f.a,f.b,f.c,f.d)) <> 4 or
     exists(select 1 from public.pilot_members where user_id in(f.a,f.b,f.c,f.d)) then
    raise exception 'All accounts must exist in Auth and have no pilot member rows';
  end if;
  if exists(select 1 from public.spots where id in(f.public_id,f.private_id)) or
     exists(select 1 from storage.objects where bucket_id='spot-photos' and
       split_part(name,'/',2) in(f.public_id::text||'.webp',f.private_id::text||'.webp')) then
    raise exception 'Reserved fixture ID/photo collision; do not overwrite existing data';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.spot_explorations'::regclass) then
    raise exception 'Explored RLS must be enabled';
  end if;
  if has_column_privilege('anon','public.spot_explorations','explored','SELECT') or
     has_table_privilege('authenticated','public.spot_explorations','DELETE') or
     has_column_privilege('authenticated','public.spot_explorations','user_id','UPDATE') or
     has_column_privilege('authenticated','public.spot_explorations','spot_id','UPDATE') or
     not has_column_privilege('authenticated','public.spot_explorations','explored','UPDATE') or
     not has_column_privilege('authenticated','public.spot_explorations','user_id','INSERT') or
     not has_column_privilege('authenticated','public.spot_explorations','spot_id','SELECT') then
    raise exception 'Explored column privileges are incorrect';
  end if;
  select * into p from pg_proc where oid='public.set_spot_explored(uuid,boolean)'::regprocedure;
  if p.prosecdef or p.provolatile <> 'v' or not p.proretset or p.pronargs <> 2 or
     not (coalesce('search_path='=any(p.proconfig),false) or coalesce('search_path=""'=any(p.proconfig),false)) or
     has_function_privilege('anon',p.oid,'EXECUTE') or
     not has_function_privilege('authenticated',p.oid,'EXECUTE') or
     exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
       where acl.grantee=0 and acl.privilege_type='EXECUTE') or
     pg_get_function_result(p.oid) ~ '(user_id|timestamp)' then
    raise exception 'Explored RPC must be narrow, invoker, fixed-path and authenticated-only';
  end if;
end $$;

insert into public.pilot_members(user_id,display_name,enrolled)
select a,'Synthetic explored A',true from explored_fixture union all
select b,'Synthetic explored B',true from explored_fixture union all
select c,'Synthetic explored C',true from explored_fixture union all
select d,'Synthetic explored D',false from explored_fixture;
insert into public.connections(member_a,member_b)
select least(a,b),greatest(a,b) from explored_fixture;
insert into public.spots(id,owner_id,author_name,title,note,audience,
  latitude,longitude,access_confirmed,access_note,photo_path)
select public_id,a,'Synthetic explored A','Synthetic distant public spot','Not a real destination.',
  'public',0,1,true,'Rollback-only fixture; no photo.',a::text||'/'||public_id::text||'.webp'
from explored_fixture union all
select private_id,a,'Synthetic explored A','Synthetic private spot','Not a real destination.',
  'connections',0,0,true,'Rollback-only fixture; no photo.',a::text||'/'||private_id::text||'.webp'
from explored_fixture;
-- Another member's existing mark must not become B's displayed state.
insert into public.spot_explorations(user_id,spot_id,explored)
select a,public_id,true from explored_fixture;

do $$ declare f record; begin
  select * into f from explored_fixture;
  perform set_config('request.jwt.claim.sub',f.b::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',f.b,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare f record; n integer;
begin
  select * into f from explored_fixture;
  if exists(select 1 from public.spot_explorations) then
    raise exception 'B must not see A marks or a fabricated default row';
  end if;
  -- Public location is >25km away, yet detail-based marking remains allowed.
  perform public.set_spot_explored(f.public_id,true);
  perform public.set_spot_explored(f.public_id,true);
  if (select count(*) from public.spot_explorations where spot_id=f.public_id) <> 1 or
     not (select explored from public.spot_explorations where spot_id=f.public_id) then
    raise exception 'Repeated true must produce one own true state';
  end if;
  perform public.set_spot_explored(f.public_id,false);
  perform public.set_spot_explored(f.private_id,true);
  if (select explored from public.spot_explorations where spot_id=f.public_id) is distinct from false or
     (select count(*) from public.spot_explorations) <> 2 then
    raise exception 'Explicit false/connected private marking failed';
  end if;
  if exists(select 1 from public.spot_explorations where user_id=f.a) then
    raise exception 'Other-member SELECT leaked';
  end if;
  update public.spot_explorations set explored=false where user_id=f.a;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Other-member UPDATE succeeded'; end if;
  begin
    insert into public.spot_explorations(user_id,spot_id,explored) values(f.a,f.private_id,true);
    raise exception 'Spoofed user INSERT succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.spot_explorations set user_id=f.a where spot_id=f.public_id;
    raise exception 'Identifier column UPDATE succeeded';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.spot_explorations where spot_id=f.public_id;
    raise exception 'Ordinary DELETE succeeded';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.set_spot_explored(f.public_id,null)) then
    raise exception 'Null state must not write';
  end if;
end $$;
reset role;

do $$ declare f record; begin
  select * into f from explored_fixture;
  if (select explored from public.spot_explorations where user_id=f.a and spot_id=f.public_id) is distinct from true then
    raise exception 'B modified A state';
  end if;
  perform set_config('request.jwt.claim.sub',f.c::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',f.c,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare f record;
begin
  select * into f from explored_fixture;
  if exists(select 1 from public.set_spot_explored(f.private_id,true)) or
     exists(select 1 from public.set_spot_explored('7b220000-0000-4000-8000-000000000099',true)) then
    raise exception 'Unconnected private/missing RPC target must produce no row';
  end if;
  begin
    insert into public.spot_explorations(user_id,spot_id,explored) values(f.c,f.private_id,true);
    raise exception 'Inaccessible spot INSERT succeeded';
  exception when insufficient_privilege then null; end;
  perform public.set_spot_explored(f.public_id,true);
  if (select count(*) from public.spot_explorations)<>1 then
    raise exception 'C must see only its own eligible Public state';
  end if;
end $$;
reset role;

-- Public -> Connections revokes C's mark access, but not B's consented access.
update public.spots set audience='connections'
where id=(select public_id from explored_fixture);
set local role authenticated;
do $$
declare f record; n integer;
begin
  select * into f from explored_fixture;
  if exists(select 1 from public.spot_explorations) or
     exists(select 1 from public.set_spot_explored(f.public_id,false)) then
    raise exception 'Revocation must hide own historical mark and deny new sets';
  end if;
  update public.spot_explorations set explored=false where spot_id=f.public_id;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Revoked row UPDATE succeeded'; end if;
end $$;
reset role;

-- Give D an otherwise eligible Public target to isolate the enrollment denial.
update public.spots set audience='public' where id=(select public_id from explored_fixture);
do $$ declare f record; begin
  select * into f from explored_fixture;
  perform set_config('request.jwt.claim.sub',f.d::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',f.d,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare f record;
begin
  select * into f from explored_fixture;
  if exists(select 1 from public.spot_explorations) or
     exists(select 1 from public.set_spot_explored(f.public_id,true)) then
    raise exception 'Unenrolled viewer must have no state access';
  end if;
  begin
    insert into public.spot_explorations(user_id,spot_id,explored) values(f.d,f.public_id,true);
    raise exception 'Unenrolled direct INSERT succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Anonymous has neither table nor function privilege (no token simulation needed).
set local role anon;
do $$ begin
  begin
    perform explored from public.spot_explorations;
    raise exception 'Anonymous SELECT succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_spot_explored('7b220000-0000-4000-8000-000000000001',true);
    raise exception 'Anonymous RPC succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Restore Public so C has an accessible mark, then test de-enrollment as its caller.
update public.spots set audience='public' where id=(select public_id from explored_fixture);
update public.pilot_members set enrolled=false where user_id=(select c from explored_fixture);
do $$ declare f record; begin
  select * into f from explored_fixture;
  perform set_config('request.jwt.claim.sub',f.c::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',f.c,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare f record; begin
  select * into f from explored_fixture;
  if exists(select 1 from public.spot_explorations) or
     exists(select 1 from public.set_spot_explored(f.public_id,false)) then
    raise exception 'De-enrollment must hide existing own marks';
  end if;
end $$;
reset role;

-- Tombstone prevents B from reading/writing its private mark immediately.
update public.spots set removed_at=now() where id=(select private_id from explored_fixture);
do $$ declare f record; begin
  select * into f from explored_fixture;
  perform set_config('request.jwt.claim.sub',f.b::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',f.b,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare f record; begin
  select * into f from explored_fixture;
  if exists(select 1 from public.spot_explorations where spot_id=f.private_id) or
     exists(select 1 from public.set_spot_explored(f.private_id,false)) then
    raise exception 'Tombstoned spot must hide its marks';
  end if;
end $$;
reset role;

delete from public.pilot_members where user_id=(select c from explored_fixture);
do $$ declare f record; begin
  select * into f from explored_fixture;
  if exists(select 1 from public.spot_explorations where user_id=f.c) then
    raise exception 'Member deletion did not cascade own marks';
  end if;
end $$;
delete from public.spots where id in(select public_id from explored_fixture union all select private_id from explored_fixture);
do $$ declare f record; begin
  select * into f from explored_fixture;
  if exists(select 1 from public.spot_explorations where spot_id in(f.public_id,f.private_id)) then
    raise exception 'Spot deletion did not cascade marks';
  end if;
end $$;

rollback;
