import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import type { ServerConfig } from '../config.js';
import {
  SPOT_COLUMNS,
  photoPath,
  SpotFailure,
  type SpotInput,
  type SpotRow,
  type SpotStore,
} from '../models/spot.model.js';
import type { SupabaseTransport } from '../models/profile.model.js';
import { validAdminKey } from '../validators/common.validator.js';

const publishableKey = /^sb_publishable_[A-Za-z0-9_-]+$/;
// Only these PostgreSQL data/integrity errors prove that this INSERT was rejected.
// A transport error, timeout, PostgREST error, or missing response is not a rollback.
const rejectedInsertCodes = new Set(['22001', '22P02', '23502', '23503', '23505', '23514']);

export function createSpotStore(
  config: ServerConfig,
  transport: SupabaseTransport = fetch
): SpotStore {
  const url = config.supabaseUrl;
  const publicKey = config.supabasePublishableKey;
  const adminKey = validAdminKey(config);
  let validUrl = false;
  try {
    const parsed = new URL(url ?? '');
    validUrl =
      (parsed.protocol === 'https:' ||
        (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) &&
      !parsed.username &&
      !parsed.password;
  } catch {
    /* unavailable */
  }
  const readReady = !!(validUrl && publishableKey.test(publicKey ?? ''));
  const writeReady = !!(readReady && adminKey);
  const boundedFetch: SupabaseTransport = (input, init) =>
    transport(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000),
    });
  const makeClient = (key: string, token?: string) =>
    createClient(url!, key, {
      global: {
        fetch: boundedFetch,
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  const reader = (token: string) => {
    if (!readReady) throw new SpotFailure('SERVICE_UNAVAILABLE');
    return makeClient(publicKey!, token);
  };
  const writer = () => {
    if (!writeReady) throw new SpotFailure('SERVICE_UNAVAILABLE');
    return makeClient(adminKey!);
  };
  const fetchOwner = async (client: SupabaseClient, id: string) => {
    const { data, error } = await client
      .from('spots')
      .select(SPOT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new SpotFailure('SERVICE_UNAVAILABLE');
    return data as SpotRow | null;
  };
  return {
    configured: writeReady,
    async list(token, caller, options) {
      const client = reader(token);
      if (options.feed === 'public') {
        const { data, error } = await client.rpc('list_public_spots', {
          p_center_lat: options.centerLat,
          p_center_lon: options.centerLon,
        });
        if (
          error ||
          !Array.isArray(data) ||
          data.length > 50 ||
          data.some(
            (item: SpotRow) =>
              !item ||
              item.audience !== 'public' ||
              item.removed_at ||
              typeof item.distance_km !== 'number' ||
              !Number.isFinite(item.distance_km) ||
              item.distance_km < 0
          )
        ) {
          throw new SpotFailure('SERVICE_UNAVAILABLE');
        }
        return data as SpotRow[];
      }
      const { data: edges, error: edgeError } = await client
        .from('connections')
        .select('member_a,member_b')
        .or(`member_a.eq.${caller},member_b.eq.${caller}`);
      if (edgeError) throw new SpotFailure('SERVICE_UNAVAILABLE');
      const ids = [
        caller,
        ...(edges ?? []).map((edge) => (edge.member_a === caller ? edge.member_b : edge.member_a)),
      ];
      const { data, error } = await client
        .from('spots')
        .select(SPOT_COLUMNS)
        .in('owner_id', ids)
        .is('removed_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(50);
      if (error) throw new SpotFailure('SERVICE_UNAVAILABLE');
      return data as SpotRow[];
    },
    async get(token, id) {
      const row = await fetchOwner(reader(token), id);
      return row?.removed_at ? null : row;
    },
    async photo(token, owner, id) {
      const { data, error } = await reader(token)
        .storage.from('spot-photos')
        .download(photoPath(owner, id));
      if (error || !data) throw new SpotFailure('SERVICE_UNAVAILABLE');
      return new Uint8Array(await data.arrayBuffer());
    },
    async create(caller, authorName, input, bytes) {
      const client = writer();
      const id = randomUUID();
      const path = photoPath(caller, id);
      const { error: uploadError } = await client.storage
        .from('spot-photos')
        .upload(path, bytes, { contentType: 'image/webp', upsert: false });
      if (uploadError) throw new SpotFailure('SERVICE_UNAVAILABLE');
      let result;
      try {
        result = await client
          .from('spots')
          .insert({
            id,
            owner_id: caller,
            author_name: authorName,
            photo_path: path,
            title: input.title,
            note: input.note,
            audience: input.audience,
            latitude: input.latitude,
            longitude: input.longitude,
            access_confirmed: true,
            access_note: input.accessNote,
          })
          .select(SPOT_COLUMNS)
          .single();
      } catch {
        throw new SpotFailure('SERVICE_UNAVAILABLE');
      }
      if (result.error && rejectedInsertCodes.has(result.error.code)) {
        // A completed SQL constraint/data rejection is definitive. Still protect
        // any row observed at this ID before attempting orphan cleanup.
        try {
          if (!(await fetchOwner(client, id)))
            await client.storage.from('spot-photos').remove([path]);
        } catch {
          /* uncertain result / operator cleanup */
        }
      }
      if (result.error || !result.data) throw new SpotFailure('SERVICE_UNAVAILABLE');
      return result.data as SpotRow;
    },
    async update(caller, id, input) {
      const client = writer();
      const row = await fetchOwner(client, id);
      if (!row || row.owner_id !== caller || row.removed_at) return null;
      const { data, error } = await client
        .from('spots')
        .update({
          title: input.title,
          note: input.note,
          audience: input.audience,
          latitude: input.latitude,
          longitude: input.longitude,
          access_confirmed: true,
          access_note: input.accessNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('owner_id', caller)
        .is('removed_at', null)
        .select(SPOT_COLUMNS)
        .maybeSingle();
      if (error) throw new SpotFailure('SERVICE_UNAVAILABLE');
      return data as SpotRow | null;
    },
    async remove(caller, id) {
      const client = writer();
      const row = await fetchOwner(client, id);
      if (!row || row.owner_id !== caller) return 'not_found';
      if (!row.removed_at) {
        const { data, error } = await client
          .from('spots')
          .update({
            removed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('owner_id', caller)
          .is('removed_at', null)
          .select('id')
          .maybeSingle();
        if (error || !data) {
          // Do not retry an uncertain tombstone write automatically.
          const observed = await fetchOwner(client, id);
          throw new SpotFailure(
            observed?.removed_at ? 'MEDIA_CLEANUP_PENDING' : 'SERVICE_UNAVAILABLE'
          );
        }
      }
      // Do not restore visibility or retry automatically on uncertain storage failure.
      try {
        const { error } = await client.storage
          .from('spot-photos')
          .remove([photoPath(caller, id)]);
        if (error) throw error;
      } catch {
        throw new SpotFailure('MEDIA_CLEANUP_PENDING');
      }
      const { error } = await client
        .from('spots')
        .delete()
        .eq('id', id)
        .eq('owner_id', caller)
        .not('removed_at', 'is', null);
      if (error) throw new SpotFailure('MEDIA_CLEANUP_PENDING');
      return 'deleted';
    },
  };
}

export async function cleanPhoto(input: Buffer, mime: string): Promise<Buffer> {
  const types: Record<string, string> = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  if (!types[mime] || !input.length || input.length > 10 * 1024 * 1024)
    throw new Error('unsupported');
  // Sharp detects actual raster encoding; formats/MIME must agree, even if extension lies.
  const image = sharp(input, { limitInputPixels: 20_000_000, animated: true, failOn: 'error' });
  const metadata = await image.metadata();
  if (
    metadata.format !== types[mime] ||
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > 20_000_000 ||
    (metadata.pages ?? 1) !== 1 ||
    (metadata.pageHeight && metadata.pageHeight !== metadata.height)
  )
    throw new Error('unsupported');
  return sharp(input, { limitInputPixels: 20_000_000, failOn: 'error' })
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}
