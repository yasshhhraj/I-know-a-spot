-- Operator-run once after 202610070002_spots_storage.sql. No service-role
-- reads from the API: this narrowly granted function checks the JWT caller.
begin;

create function public.list_public_spots(p_center_lat double precision, p_center_lon double precision)
returns table (
  id uuid, owner_id uuid, author_name text, title text, note text,
  audience text, latitude double precision, longitude double precision,
  access_confirmed boolean, access_note text, created_at timestamptz,
  updated_at timestamptz, distance_km double precision
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_radius integer;
begin
  -- BETWEEN also rejects PostgreSQL floating NaN and infinities (and NULL
  -- is explicitly rejected). No center is stored as member activity.
  if p_center_lat is null or p_center_lon is null or
     not (p_center_lat between -90 and 90) or
     not (p_center_lon between -180 and 180) then
    raise exception 'invalid discovery center' using errcode = '22023';
  end if;

  select m.public_radius_km into v_radius
  from public.pilot_members m
  where m.user_id = auth.uid() and m.enrolled = true;
  if not found or v_radius not between 1 and 25 then
    raise exception 'pilot enrollment required' using errcode = '42501';
  end if;

  return query
  select nearby.id, nearby.owner_id, nearby.author_name, nearby.title,
    nearby.note, nearby.audience, nearby.latitude, nearby.longitude,
    nearby.access_confirmed, nearby.access_note, nearby.created_at,
    nearby.updated_at, nearby.distance_km
  from (
    select s.id, s.owner_id, s.author_name, s.title, s.note, s.audience,
      s.latitude, s.longitude, s.access_confirmed, s.access_note,
      s.created_at, s.updated_at,
      -- Haversine great-circle distance in km; clamp roundoff before sqrt.
      2.0 * 6371.0 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians((s.latitude - p_center_lat) / 2.0)), 2) +
        cos(radians(p_center_lat)) * cos(radians(s.latitude)) *
        power(sin(radians((s.longitude - p_center_lon) / 2.0)), 2)
      )))) as distance_km
    from public.spots s
    join public.pilot_members author on author.user_id = s.owner_id
      and author.enrolled = true
    where s.removed_at is null and s.audience = 'public'
  ) nearby
  where nearby.distance_km <= v_radius
  order by nearby.distance_km asc, nearby.created_at desc, nearby.id desc
  limit 50;
end;
$$;

revoke all on function public.list_public_spots(double precision, double precision) from public, anon;
grant execute on function public.list_public_spots(double precision, double precision) to authenticated;

commit;
