export type SpotInput = {
  title: string;
  note: string;
  audience: 'connections' | 'public';
  latitude: number;
  longitude: number;
  accessConfirmed: true;
  accessNote: string;
};

export type SpotRow = {
  id: string;
  owner_id: string;
  author_name: string;
  title: string;
  note: string;
  audience: 'connections' | 'public';
  latitude: number;
  longitude: number;
  access_confirmed: boolean;
  access_note: string;
  created_at: string;
  updated_at: string;
  removed_at?: string | null;
  distance_km?: number;
};

export type Spot = {
  id: string;
  ownerId: string;
  authorName: string;
  title: string;
  note: string;
  audience: 'connections' | 'public';
  latitude: number;
  longitude: number;
  accessConfirmed: boolean;
  accessNote: string;
  createdAt: string;
  updatedAt: string;
  photoUrl: string;
  distanceKm?: number;
};

export type SpotListOptions =
  | { feed: 'connections' }
  | { feed: 'public'; centerLat: number; centerLon: number };

export const SPOT_COLUMNS =
  'id,owner_id,author_name,title,note,audience,latitude,longitude,access_confirmed,access_note,created_at,updated_at,removed_at';

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function toSpot(row: SpotRow): Spot {
  return {
    id: row.id,
    ownerId: row.owner_id,
    authorName: row.author_name,
    title: row.title,
    note: row.note,
    audience: row.audience,
    latitude: row.latitude,
    longitude: row.longitude,
    accessConfirmed: row.access_confirmed,
    accessNote: row.access_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoUrl: `/spots/${row.id}/photo`,
    ...(row.distance_km === undefined ? {} : { distanceKm: row.distance_km }),
  };
}

export const photoPath = (owner: string, id: string): string => `${owner}/${id}.webp`;

export class SpotFailure extends Error {
  constructor(public readonly code: 'SERVICE_UNAVAILABLE' | 'MEDIA_CLEANUP_PENDING') {
    super(code);
  }
}

export interface SpotStore {
  list(token: string, caller: string, options: SpotListOptions): Promise<SpotRow[]>;
  get(token: string, id: string): Promise<SpotRow | null>;
  photo(token: string, owner: string, id: string): Promise<Uint8Array>;
  create(caller: string, authorName: string, input: SpotInput, bytes: Buffer): Promise<SpotRow>;
  update(caller: string, id: string, input: SpotInput): Promise<SpotRow | null>;
  remove(caller: string, id: string): Promise<'deleted' | 'not_found'>;
  configured: boolean;
}
