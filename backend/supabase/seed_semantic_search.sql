-- Operator-run in the Supabase SQL editor AFTER migrations 0001, 0002 and 0003.
-- This deliberately COMMITS synthetic rows for HTTP/browser search checks.
-- Replace only the three UUID placeholders PRIVATELY; never commit filled-in SQL.
-- A = enrolled author connected to viewer B. C is connected to neither A nor B.
-- Existing members/connections/settings are validated but NEVER created or changed.
-- Synthetic discovery center is exactly (0,0), not a real outing destination.
-- No Storage objects are created: photo errors are EXPECTED for these test rows.
-- Ordinary existing spots need no search migration/backfill; vectors are computed locally.
begin;

do $seed$
declare
  author_a uuid := 'REPLACE_WITH_ENROLLED_CONNECTED_AUTHOR_UUID';
  viewer_b uuid := 'REPLACE_WITH_ENROLLED_VIEWER_UUID';
  author_c uuid := 'REPLACE_WITH_ENROLLED_UNCONNECTED_AUTHOR_UUID';
  marker constant text := 'SYNTHETIC SEARCH FIXTURE v1 - Not a real destination. No photo uploaded.';
  fixture_ids uuid[];
begin
  if author_a = viewer_b or author_a = author_c or viewer_b = author_c then
    raise exception 'Use three distinct existing enrolled accounts';
  end if;
  if to_regclass('public.spots') is null or to_regclass('public.pilot_members') is null or
     to_regclass('public.connections') is null or
     to_regprocedure('public.list_public_spots(double precision,double precision)') is null then
    raise exception 'Apply the existing auth, spots/Storage and Public-radius migrations first';
  end if;
  if (select count(*) from public.pilot_members where enrolled = true and user_id in (author_a, viewer_b, author_c)) <> 3 then
    raise exception 'All fixture accounts must already be enrolled';
  end if;
  if not exists (select 1 from public.connections where member_a = least(author_a, viewer_b) and member_b = greatest(author_a, viewer_b)) then
    raise exception 'Author A and viewer B must already have a consented mutual connection';
  end if;
  if exists (select 1 from public.connections where member_a = least(author_c, viewer_b) and member_b = greatest(author_c, viewer_b)) then
    raise exception 'Author C must not be connected to viewer B';
  end if;
  if exists (select 1 from public.connections where member_a = least(author_c, author_a) and member_b = greatest(author_c, author_a)) then
    raise exception 'Author C must not be connected to author A (unconnected-viewer checks)';
  end if;
  select array_agg(('7a110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid)
    into fixture_ids from generate_series(1, 14) n;
  if exists (select 1 from public.spots where id = any(fixture_ids)) then
    raise exception 'Fixture ID collision: inspect/clean previous fixtures; this script never overwrites rows';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'spot-photos'
      and split_part(name, '/', 2) = any(array(select f.id::text || '.webp' from unnest(fixture_ids) as f(id)))) then
    raise exception 'Fixture photo paths already have Storage objects; inspect them manually';
  end if;
  if exists (select 1 from public.spots s join public.pilot_members p on p.user_id = s.owner_id and p.enrolled
      where s.audience = 'public' and s.removed_at is null and
        2 * 6371.0 * asin(sqrt(least(1.0, greatest(0.0,
          power(sin(radians(s.latitude / 2)), 2) + cos(radians(s.latitude)) * power(sin(radians(s.longitude / 2)), 2)
        )))) <= 25) then
    raise exception 'Synthetic (0,0) test area has existing Public spots; use an isolated test project';
  end if;

  insert into public.spots (id, owner_id, author_name, title, note, audience,
    latitude, longitude, access_confirmed, access_note, photo_path, created_at, updated_at, removed_at)
  select ('7a110000-0000-4000-8000-' || lpad(f.n::text, 12, '0'))::uuid,
    p.user_id, p.display_name, f.title, f.note, f.audience,
    0::double precision, degrees(f.km::double precision / 6371.0), true, marker,
    p.user_id::text || '/7a110000-0000-4000-8000-' || lpad(f.n::text, 12, '0') || '.webp',
    now() - f.n * interval '1 second', now(), case when f.removed then now() else null end
  from (values
    (1, 'connected', 'Synthetic shaded garden', 'A leafy canopy keeps a bench cool. A calm corner for reading and resting beneath trees.', 'public', 0.1, false),
    (2, 'connected', 'Synthetic carved doorway', 'An old entrance decorated with carved stone, ornate reliefs and interesting textures, visible from the pavement.', 'public', 0.2, false),
    (3, 'connected', 'Synthetic colorful staircase', 'A staircase painted in vivid rainbow colors. Its geometric patterns make a striking photograph.', 'public', 0.3, false),
    (4, 'connected', 'Synthetic riverside seat', 'A bench beside flowing water, where ripples and the river current are easy to notice.', 'public', 2.4, false),
    (5, 'connected', 'Synthetic wildflower patch', 'A small patch of blossoms with bees and butterflies among the petals. Observe without picking anything.', 'public', 0.5, false),
    (6, 'connected', 'Synthetic basketball court', 'An open basketball court with painted lines, two baskets and space for a friendly game.', 'public', 0.6, false),
    (7, 'connected', 'Synthetic sunset terrace', 'An open terrace faces west. A small spot to see evening colors spread across the sky.', 'public', 0.7, false),
    (8, 'connected', 'Synthetic grassy meadow', 'A broad grassy clearing with room to spread a blanket, share snacks and relax outdoors.', 'public', 0.8, false),
    (9, 'connected', 'Synthetic duck pond', 'Still water reflects the trees. Ducks paddle between reeds along the edge of this small pond.', 'public', 4.5, false),
    (10, 'connected', 'Synthetic connections-only brick arch', 'A weathered brick archway with patterned masonry. This post is shared only with connections.', 'connections', 0.25, false),
    (11, 'unconnected', 'Synthetic neighborhood mural', 'A painted wall full of bold shapes and street art. The artwork is visible from the sidewalk.', 'public', 0.35, false),
    (12, 'unconnected', 'Synthetic inaccessible reading garden', 'A quiet shaded garden with a bench for reading under trees.', 'connections', 0.15, false),
    (13, 'connected', 'Synthetic removed reading garden', 'A quiet shaded garden with a bench for reading under trees.', 'public', 0.15, true),
    (14, 'unconnected', 'Synthetic distant reading garden', 'A quiet shaded garden with a bench for reading under trees.', 'public', 26, false)
  ) f(n, owner_kind, title, note, audience, km, removed)
  join public.pilot_members p on p.user_id = case when f.owner_kind = 'connected' then author_a else author_c end;
  if (select count(*) from public.spots where id = any(fixture_ids) and access_note = marker) <> 14 then
    raise exception 'Fixture row count incorrect; transaction must not commit';
  end if;
end;
$seed$;

commit;

-- Inspect only synthetic fields; avoid copying real member identifiers into reports.
select id, title, audience, removed_at is not null as tombstoned
from public.spots
where id in (select ('7a110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 14) n)
order by id;
