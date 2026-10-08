-- Apply as the Supabase project operator, not via a browser/client connection.
-- No auth triggers: creating an Auth user never grants pilot enrollment.
create table public.pilot_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  enrolled boolean not null default false,
  public_radius_km integer not null default 5 check (public_radius_km between 1 and 25)
);

create table public.connections (
  member_a uuid not null references public.pilot_members(user_id) on delete cascade,
  member_b uuid not null references public.pilot_members(user_id) on delete cascade,
  primary key (member_a, member_b),
  constraint connections_canonical_order check (member_a < member_b)
);

alter table public.pilot_members enable row level security;
alter table public.connections enable row level security;

-- Explicitly eliminate accidental default/public/anon grants before adding
-- the narrow authenticated privileges. The table owner/operator can seed data.
revoke all on public.pilot_members, public.connections from public, anon, authenticated;
grant select (user_id, display_name, enrolled, public_radius_km)
  on public.pilot_members to authenticated;
grant update (public_radius_km) on public.pilot_members to authenticated;
grant select (member_a, member_b) on public.connections to authenticated;

create policy pilot_members_self_select on public.pilot_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy pilot_members_self_radius_update on public.pilot_members
  for update to authenticated
  using (user_id = (select auth.uid()) and enrolled = true)
  with check (user_id = (select auth.uid()) and enrolled = true);

create policy connections_participant_select on public.connections
  for select to authenticated using (
    ((select auth.uid()) = member_a or (select auth.uid()) = member_b)
    and exists (
      select 1 from public.pilot_members me
      where me.user_id = (select auth.uid()) and me.enrolled = true
    )
  );
