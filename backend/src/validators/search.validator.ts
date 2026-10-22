import type { SpotListOptions } from '../models/spot.model.js';

export function searchBody(
  raw: unknown
): { query: string; options: SpotListOptions } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.query !== 'string' || typeof body.feed !== 'string') return null;
  const query = body.query.trim();
  if ([...query].length > 200) return null;
  if (
    body.feed === 'connections' &&
    Object.keys(body).length === 2 &&
    Object.keys(body).every((key) => key === 'query' || key === 'feed')
  )
    return { query, options: { feed: 'connections' } };
  if (
    body.feed !== 'public' ||
    Object.keys(body).length !== 4 ||
    Object.keys(body).some(
      (key) => !['query', 'feed', 'centerLat', 'centerLon'].includes(key)
    )
  )
    return null;
  const lat = body.centerLat;
  const lon = body.centerLon;
  if (
    typeof lat !== 'number' ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lon !== 'number' ||
    !Number.isFinite(lon) ||
    lon < -180 ||
    lon > 180
  )
    return null;
  return { query, options: { feed: 'public', centerLat: lat, centerLon: lon } };
}
