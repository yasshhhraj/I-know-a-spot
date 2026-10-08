-- Operator-run ONCE after 0001, 0002 and 0003. No existing tables/policies widened.
-- Private voluntary state, not a verified visit or a public activity counter.
begin;

create table public.spot_explorations (
  user_id uuid not null references public.pilot_members(user_id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  explored boolean not null default false,
  primary key (user_id, spot_id)
);
create index spot_explorations_spot on public.spot_explorations(spot_id);
alter table public.spot_explorations enable row level security;

revoke all on public.spot_explorations from public, anon, authenticated;
grant select (user_id, spot_id, explored), insert (user_id, spot_id, explored)
  on public.spot_explorations to authenticated;
grant update (explored) on public.spot_explorations to authenticated;

create policy exploration_own_visible_select on public.spot_explorations
  for select to authenticated
  using (user_id = (select auth.uid()) and public.spot_visible(spot_id));
create policy exploration_own_visible_insert on public.spot_explorations
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.spot_visible(spot_id));
create policy exploration_own_visible_update on public.spot_explorations
  for update to authenticated
  using (user_id = (select auth.uid()) and public.spot_visible(spot_id))
  with check (user_id = (select auth.uid()) and public.spot_visible(spot_id));

-- This runs with caller privileges and RLS. Unlike a PostgREST upsert payload, the
-- ON CONFLICT update touches only explored; identifiers cannot be moved by clients.
-- No privileged/service-role path, visit timestamp, GPS, photo or aggregate query.
create function public.set_spot_explored(p_spot_id uuid, p_explored boolean)
returns table (spot_id uuid, explored boolean)
language sql volatile security invoker set search_path = ''
as $$
  insert into public.spot_explorations as e (user_id, spot_id, explored)
  select auth.uid(), p_spot_id, p_explored
  where p_explored is not null and public.spot_visible(p_spot_id)
  on conflict (user_id, spot_id) do update set explored = excluded.explored
  returning e.spot_id, e.explored;
$$;
revoke all on function public.set_spot_explored(uuid, boolean) from public, anon;
grant execute on function public.set_spot_explored(uuid, boolean) to authenticated;

commit;
