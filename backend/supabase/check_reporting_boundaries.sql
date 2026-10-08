-- Operator psql after0005; simulated roles/claims, NOT real-JWT/Storage proof.
-- Four DISTINCT existing disposable Auth users with NO pilot member rows.
-- psql -X -v ON_ERROR_STOP=1 -v member_a=REPLACE_WITH_AUTH_UUID_A \
--   -v member_b=REPLACE_WITH_AUTH_UUID_B -v unconnected=REPLACE_WITH_AUTH_UUID_C \
--   -v unenrolled=REPLACE_WITH_AUTH_UUID_D -f supabase/check_reporting_boundaries.sql
-- Supply database credentials privately; no photographs; ALL changes rollback.
begin;
create temporary table report_fixture(a uuid,b uuid,c uuid,d uuid,
  public_id uuid default '7c330000-0000-4000-8000-000000000001',
  private_id uuid default '7c330000-0000-4000-8000-000000000002') on commit drop;
insert into report_fixture(a,b,c,d) values
  (:'member_a'::uuid,:'member_b'::uuid,:'unconnected'::uuid,:'unenrolled'::uuid);
grant select on report_fixture to authenticated;

do $$ declare f record; p record; role_name text; column_name text;
begin
  select * into f from report_fixture;
  if (select count(distinct id) from unnest(array[f.a,f.b,f.c,f.d]) id)<>4 or
     (select count(*) from auth.users where id in(f.a,f.b,f.c,f.d))<>4 or
     exists(select 1 from public.pilot_members where user_id in(f.a,f.b,f.c,f.d)) then
    raise exception 'Use four distinct existing disposable Auth users without member rows';
  end if;
  if exists(select 1 from public.spots where id in(f.public_id,f.private_id)) or
     exists(select 1 from public.spot_reports where spot_id in(f.public_id,f.private_id)) or
     exists(select 1 from storage.objects where bucket_id='spot-photos' and
       split_part(name,'/',2) in(f.public_id::text||'.webp',f.private_id::text||'.webp')) then
    raise exception 'Reserved fixture ID/report/media collision; never overwrite';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.spot_reports'::regclass) or
     exists(select 1 from pg_policies where schemaname='public' and tablename='spot_reports') then
    raise exception 'Reports require sealed RLS with no ordinary policies';
  end if;
  foreach role_name in array array['anon','authenticated'] loop
    if has_table_privilege(role_name,'public.spot_reports','INSERT') or
       has_table_privilege(role_name,'public.spot_reports','UPDATE') or
       has_table_privilege(role_name,'public.spot_reports','DELETE') then
      raise exception 'Ordinary report mutation privileges found';
    end if;
    foreach column_name in array array['id','spot_id','reporter_id','reason','status','created_at'] loop
      if has_column_privilege(role_name,'public.spot_reports',column_name,'SELECT') or
         has_column_privilege(role_name,'public.spot_reports',column_name,'INSERT') or
         has_column_privilege(role_name,'public.spot_reports',column_name,'UPDATE') then
        raise exception 'Ordinary report column privilege found';
      end if;
    end loop;
  end loop;
  select * into p from pg_proc where oid='public.submit_spot_report(uuid,text)'::regprocedure;
  if not p.prosecdef or p.provolatile<>'v' or not p.proretset or p.pronargs<>2 or
     not (coalesce('search_path='=any(p.proconfig),false) or coalesce('search_path=""'=any(p.proconfig),false)) or
     has_function_privilege('anon',p.oid,'EXECUTE') or
     not has_function_privilege('authenticated',p.oid,'EXECUTE') or
     exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
       where acl.grantee=0 and acl.privilege_type='EXECUTE') or
     pg_get_function_result(p.oid)<>'TABLE(spot_id uuid, reason text)' then
    raise exception 'Report RPC must be narrow, definer, fixed-path and authenticated-only';
  end if;
end $$;

insert into public.pilot_members(user_id,display_name,enrolled)
select a,'Synthetic report A',true from report_fixture union all
select b,'Synthetic report B',true from report_fixture union all
select c,'Synthetic report C',true from report_fixture union all
select d,'Synthetic report D',false from report_fixture;
insert into public.connections(member_a,member_b)
select least(a,b),greatest(a,b) from report_fixture;
insert into public.spots(id,owner_id,author_name,title,note,audience,
  latitude,longitude,access_confirmed,access_note,photo_path)
select public_id,a,'Synthetic report A','Synthetic distant Public spot','Not a real destination.',
  'public',0,1,true,'Rollback-only fixture; no photo.',a::text||'/'||public_id::text||'.webp'
from report_fixture union all
select private_id,a,'Synthetic report A','Synthetic private spot','Not a real destination.',
  'connections',0,0,true,'Rollback-only fixture; no photo.',a::text||'/'||private_id::text||'.webp'
from report_fixture;

do $$ declare f record; begin
  select * into f from report_fixture;
  perform set_config('request.jwt.claim.sub',f.b::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',f.b,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare f record; n integer;
begin
  select * into f from report_fixture;
  -- Connections permission; Public location >25km, reporting still allowed by ID.
  if (select count(*) from public.submit_spot_report(f.private_id,'private_property'))<>1 or
     (select count(*) from public.submit_spot_report(f.public_id,'inaccurate'))<>1 or
     (select count(*) from public.submit_spot_report(f.public_id,'inaccurate'))<>1 or
     (select count(*) from public.submit_spot_report(f.public_id,'sensitive_location'))<>1 then
    raise exception 'Accessible submissions/identical retry failed';
  end if;
  if exists(select 1 from public.submit_spot_report(f.public_id,'free text')) or
     exists(select 1 from public.submit_spot_report(f.public_id,null)) or
     exists(select 1 from public.submit_spot_report(null,'inaccurate')) then
    raise exception 'Invalid RPC input accepted';
  end if;
  begin
    perform * from public.spot_reports;
    raise exception 'Reporter can read queue';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.spot_reports(reporter_id,spot_id,reason) values(f.a,f.public_id,'inaccurate');
    raise exception 'Direct/spoofed report INSERT succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.spot_reports set status='reviewed';
    raise exception 'Ordinary operator review succeeded';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.spot_reports;
    raise exception 'Ordinary report DELETE succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.spots set removed_at=now() where id=f.public_id;
    raise exception 'Reporter can tombstone another spot';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ declare f record; begin
  select * into f from report_fixture;
  if (select count(*) from public.spot_reports where reporter_id=f.b)<>3 or
     exists(select 1 from public.spot_reports where spot_id in(f.public_id,f.private_id) and reporter_id<>f.b) then
    raise exception 'Duplicate reports or spoofed reporter identity';
  end if;
  perform set_config('request.jwt.claim.sub',f.c::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',f.c,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare f record; begin
  select * into f from report_fixture;
  if exists(select 1 from public.submit_spot_report(f.private_id,'inaccurate')) or
     exists(select 1 from public.submit_spot_report('7c330000-0000-4000-8000-000000000099','inaccurate')) then
    raise exception 'Private/missing spot accepted';
  end if;
  perform public.submit_spot_report(f.public_id,'inaccurate');
end $$;
reset role;

-- Explicit operator review is distinct from removal; duplicates cannot reopen it.
update public.spot_reports set status='reviewed'
where reporter_id=(select c from report_fixture) and spot_id=(select public_id from report_fixture);
set local role authenticated;
do $$ declare f record; begin
  select * into f from report_fixture;
  perform public.submit_spot_report(f.public_id,'inaccurate');
end $$;
reset role;
do $$ declare f record; begin
  select * into f from report_fixture;
  if (select count(*) from public.spot_reports where reporter_id=f.c)<>1 or
     (select status from public.spot_reports where reporter_id=f.c) is distinct from 'reviewed' then
    raise exception 'Duplicate retry reopened reviewed report';
  end if;
end $$;

-- Public -> Connections revokes even an identical historical submission.
update public.spots set audience='connections' where id=(select public_id from report_fixture);
set local role authenticated;
do $$ declare f record; begin
  select * into f from report_fixture;
  if exists(select 1 from public.submit_spot_report(f.public_id,'inaccurate')) then
    raise exception 'Revoked historical report accepted';
  end if;
end $$;
reset role;
update public.spots set audience='public' where id=(select public_id from report_fixture);

do $$ declare f record; begin
  select * into f from report_fixture;
  perform set_config('request.jwt.claim.sub',f.d::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',f.d,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare f record; begin
  select * into f from report_fixture;
  if exists(select 1 from public.submit_spot_report(f.public_id,'inaccurate')) then
    raise exception 'Unenrolled caller accepted';
  end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.spot_reports;
    raise exception 'Anonymous SELECT succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_spot_report('7c330000-0000-4000-8000-000000000001','inaccurate');
    raise exception 'Anonymous RPC succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Even an enrolled OWNER has no queue SELECT or moderation grants.
do $$ declare f record; begin
  select * into f from report_fixture;
  perform set_config('request.jwt.claim.sub',f.a::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',f.a,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
  begin
    perform * from public.spot_reports;
    raise exception 'Spot owner can read reporter queue';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- De-enrolled author then hidden target must fail RPC, including own old reports.
update public.pilot_members set enrolled=false where user_id=(select a from report_fixture);
do $$ declare f record; begin
  select * into f from report_fixture;
  perform set_config('request.jwt.claim.sub',f.b::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',f.b,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare f record; begin
  select * into f from report_fixture;
  if exists(select 1 from public.submit_spot_report(f.public_id,'inaccurate')) then
    raise exception 'De-enrolled author accepted';
  end if;
end $$;
reset role;
update public.pilot_members set enrolled=true where user_id=(select a from report_fixture);
update public.spots set removed_at=now() where id in(select public_id from report_fixture union all select private_id from report_fixture);
set local role authenticated;
do $$ declare f record; begin
  select * into f from report_fixture;
  if public.spot_visible(f.public_id) or public.spot_visible(f.private_id) or
     exists(select 1 from public.submit_spot_report(f.public_id,'inaccurate')) or
     exists(select 1 from public.spots where id in(f.public_id,f.private_id)) then
    raise exception 'Tombstoned spot remains accessible';
  end if;
end $$;
reset role;
delete from public.spots where id in(select public_id from report_fixture union all select private_id from report_fixture);
do $$ declare f record; begin
  select * into f from report_fixture;
  if (select count(*) from public.spot_reports where spot_id in(f.public_id,f.private_id))<>4 then
    raise exception 'Removal erased private report evidence';
  end if;
end $$;
delete from public.pilot_members where user_id=(select c from report_fixture);
do $$ declare f record; begin
  select * into f from report_fixture;
  if exists(select 1 from public.spot_reports where reporter_id=f.c) then
    raise exception 'Member deletion did not cascade own reports';
  end if;
end $$;

rollback;
