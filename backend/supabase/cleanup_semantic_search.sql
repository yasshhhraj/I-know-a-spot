-- Operator-run SQL editor cleanup of ONLY the seed_semantic_search.sql metadata.
-- No member, connection, radius, unrelated row or Storage object changes.
-- Refuses changed fixture markers or uploaded media; investigate manually instead.
begin;
do $cleanup$
declare
  marker constant text := 'SYNTHETIC SEARCH FIXTURE v1 - Not a real destination. No photo uploaded.';
  fixture_ids uuid[];
begin
  select array_agg(('7a110000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid)
    into fixture_ids from generate_series(1, 14) n;
  if exists (select 1 from public.spots where id = any(fixture_ids) and access_note <> marker) then
    raise exception 'A reserved ID no longer has the fixture marker; refuse to delete changed/unrelated data';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'spot-photos'
      and split_part(name, '/', 2) = any(array(select f.id::text || '.webp' from unnest(fixture_ids) as f(id)))) then
    raise exception 'Fixture media exists; perform deliberate tombstone/Storage cleanup before deleting metadata';
  end if;
  delete from public.spots where id = any(fixture_ids) and access_note = marker;
end;
$cleanup$;
commit;
