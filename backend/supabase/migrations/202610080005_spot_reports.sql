-- Operator-run once after0001–0004. Private queue; no ordinary table access.
begin;

create table public.spot_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  -- Retain private review evidence after physical spot removal. Only the narrow
  -- submission helper can accept a spot_id, after current spot_visible checks.
  spot_id uuid not null,
  reporter_id uuid not null references public.pilot_members(user_id) on delete cascade,
  reason text not null check (reason in
    ('private_property','sensitive_location','inappropriate_content','inaccurate')),
  status text not null default 'pending' check (status in ('pending','reviewed')),
  created_at timestamptz not null default now(),
  constraint spot_reports_dedup unique (reporter_id,spot_id,reason)
);
create index spot_reports_pending on public.spot_reports (created_at,id) where status='pending';
alter table public.spot_reports enable row level security;
-- No SELECT, even own reports; no ordinary INSERT/UPDATE/DELETE or policies.
revoke all on public.spot_reports from public, anon, authenticated;
grant select, insert, update, delete on public.spot_reports to service_role;

-- A narrow definer avoids granting queue access for INSERT ... ON CONFLICT.
-- auth.uid() remains caller-derived; spot_visible checks enrolled viewer/author,
-- audience and tombstone. No client reporter ID and no duplicate-existence flag.
create function public.submit_spot_report(p_spot_id uuid,p_reason text)
returns table(spot_id uuid,reason text)
language plpgsql volatile security definer set search_path = ''
as $$
declare caller uuid := auth.uid();
begin
  if caller is null or p_spot_id is null or p_reason is null or
     p_reason not in ('private_property','sensitive_location','inappropriate_content','inaccurate') or
     not public.spot_visible(p_spot_id) then
    return;
  end if;
  insert into public.spot_reports(reporter_id,spot_id,reason)
    values(caller,p_spot_id,p_reason)
    on conflict on constraint spot_reports_dedup do nothing;
  -- No catch-all: database failure must propagate, never become acknowledgement.
  return query select p_spot_id,p_reason;
end;
$$;
revoke all on function public.submit_spot_report(uuid,text) from public, anon, authenticated;
grant execute on function public.submit_spot_report(uuid,text) to authenticated;

commit;
