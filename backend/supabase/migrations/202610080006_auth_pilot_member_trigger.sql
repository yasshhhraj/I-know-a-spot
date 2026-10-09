-- Operator-run after 202610070001_pilot_members_connections.sql.
-- Every newly created Auth user (including Google users) gets the application
-- row required by the authenticated pilot. This does not copy email: Auth is
-- the sole email source. Existing rows are left unchanged.
begin;

create or replace function public.provision_pilot_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  -- Prefer provider-supplied names, then the email local-part, and finally a
  -- generic bounded name. The checks on pilot_members remain the final guard.
  v_display_name := left(btrim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'given_name',
    nullif(pg_catalog.split_part(coalesce(new.email, ''), '@', 1), ''),
    'Member'
  )), 80);

  if v_display_name is null or pg_catalog.length(v_display_name) = 0 then
    v_display_name := 'Member';
  end if;

  insert into public.pilot_members (user_id, display_name, enrolled)
  values (new.id, v_display_name, true)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.provision_pilot_member() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_provision_pilot_member on auth.users;
create trigger on_auth_user_created_provision_pilot_member
  after insert on auth.users
  for each row execute function public.provision_pilot_member();

commit;
