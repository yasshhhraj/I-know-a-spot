-- Operator-run once, after 202610070001. Do not silently repurpose an existing bucket.
begin;

create table public.spots (
  id uuid primary key,
  owner_id uuid not null references public.pilot_members(user_id),
  author_name text not null check (length(btrim(author_name)) between 1 and 80),
  title text not null check (length(btrim(title)) between 1 and 80),
  note text not null check (length(btrim(note)) between 1 and 500),
  audience text not null check (audience in ('connections', 'public')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  access_confirmed boolean not null check (access_confirmed = true),
  access_note text not null default '' check (length(access_note) <= 200),
  photo_path text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint canonical_photo_path check (photo_path = owner_id::text || '/' || id::text || '.webp')
);
create index spots_owner_created on public.spots (owner_id, created_at desc);
alter table public.spots enable row level security;
revoke all on public.spots from public, anon, authenticated;
grant select (id, owner_id, author_name, title, note, audience, latitude, longitude,
  access_confirmed, access_note, created_at, updated_at, removed_at) on public.spots to authenticated;

-- Definer can inspect both enrollment rows and consented pair without widening
-- pilot_members/connection client SELECT. Caller identity always comes from auth.uid().
create function public.spot_visible(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.spots s
    join public.pilot_members author on author.user_id = s.owner_id and author.enrolled = true
    join public.pilot_members viewer on viewer.user_id = auth.uid() and viewer.enrolled = true
    where s.id = p_id and s.removed_at is null
      and (s.audience = 'public' or s.owner_id = auth.uid() or exists (
        select 1 from public.connections c
        where (c.member_a = s.owner_id and c.member_b = auth.uid())
           or (c.member_b = s.owner_id and c.member_a = auth.uid())
      ))
  );
$$;
revoke all on function public.spot_visible(uuid) from public, anon;
grant execute on function public.spot_visible(uuid) to authenticated;
create policy spots_visible_select on public.spots for select to authenticated
  using (public.spot_visible(id));

do $$ begin
  if exists (select 1 from storage.buckets where id = 'spot-photos') then
    raise exception 'spot-photos bucket exists; inspect it manually rather than repurposing it';
  end if;
end $$;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spot-photos', 'spot-photos', false, 10485760, array['image/webp']);

-- Storage can have unrelated broad policies. Restrictive guards take AND with
-- every permissive policy, preventing those policies from leaking this bucket.
create function public.spot_photo_visible(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.spots s
    where s.photo_path = p_name and public.spot_visible(s.id)
  );
$$;
revoke all on function public.spot_photo_visible(text) from public, anon;
grant execute on function public.spot_photo_visible(text) to authenticated;

create policy spot_photo_read on storage.objects for select to authenticated
  using (bucket_id = 'spot-photos' and public.spot_photo_visible(name));
create policy spot_photo_select_guard on storage.objects as restrictive for select to public
  using (bucket_id <> 'spot-photos' or (auth.role() = 'authenticated' and public.spot_photo_visible(name)));
create policy spot_photo_insert_guard on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'spot-photos');
create policy spot_photo_update_guard on storage.objects as restrictive for update to public
  using (bucket_id <> 'spot-photos') with check (bucket_id <> 'spot-photos');
create policy spot_photo_delete_guard on storage.objects as restrictive for delete to public
  using (bucket_id <> 'spot-photos');

commit;
