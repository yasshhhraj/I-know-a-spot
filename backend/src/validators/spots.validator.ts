import type { SpotInput, SpotListOptions } from '../models/spot.model.js';

export function validateSpotInput(raw: unknown): SpotInput | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const fields = raw as Record<string, unknown>;
  if (
    Object.keys(fields).some(
      (key) =>
        ![
          'title',
          'note',
          'audience',
          'latitude',
          'longitude',
          'accessConfirmed',
          'accessNote',
        ].includes(key)
    )
  )
    return;
  const { title, note, audience, latitude, longitude, accessConfirmed, accessNote } =
    fields;
  if (
    typeof title !== 'string' ||
    title.trim().length < 1 ||
    [...title].length > 80 ||
    typeof note !== 'string' ||
    note.trim().length < 1 ||
    [...note].length > 500 ||
    typeof accessNote !== 'string' ||
    [...accessNote].length > 200 ||
    (audience !== 'connections' && audience !== 'public') ||
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    accessConfirmed !== true
  )
    return;
  return {
    title,
    note,
    audience,
    latitude,
    longitude,
    accessConfirmed: true,
    accessNote,
  };
}

export function listOptions(rawUrl: string): SpotListOptions | null {
  const query = new URL(rawUrl, 'http://localhost').searchParams;
  if (
    [...query.keys()].some((key) => !['feed', 'centerLat', 'centerLon'].includes(key)) ||
    query.getAll('feed').length > 1 ||
    query.getAll('centerLat').length > 1 ||
    query.getAll('centerLon').length > 1
  )
    return null;
  const feed = query.get('feed') ?? 'connections';
  if (feed === 'connections')
    return query.has('centerLat') || query.has('centerLon') ? null : { feed };
  if (feed !== 'public' || !query.has('centerLat') || !query.has('centerLon'))
    return null;
  const lat = query.get('centerLat')!;
  const lon = query.get('centerLon')!;
  const coordinate = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!coordinate.test(lat) || !coordinate.test(lon)) return null;
  const centerLat = Number(lat);
  const centerLon = Number(lon);
  return Number.isFinite(centerLat) &&
    centerLat >= -90 &&
    centerLat <= 90 &&
    Number.isFinite(centerLon) &&
    centerLon >= -180 &&
    centerLon <= 180
    ? { feed, centerLat, centerLon }
    : null;
}
