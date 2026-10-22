import { createClient } from '@supabase/supabase-js';
import type { ServerConfig } from '../config.js';
import type { SupabaseTransport } from '../models/profile.model.js';
import type { ExploredStore } from '../models/explored.model.js';
import { boundedTransport } from '../utils/transport.js';

export function createExploredStore(
  config: ServerConfig,
  transport: SupabaseTransport = fetch
): ExploredStore {
  let validUrl = false;
  try {
    const url = new URL(config.supabaseUrl ?? '');
    validUrl =
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) &&
      !url.username &&
      !url.password;
  } catch {
    /* unconfigured */
  }
  const configured =
    validUrl && /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey ?? '');

  function client(token: string) {
    if (!configured) throw new Error('explored unavailable');
    return createClient(config.supabaseUrl!, config.supabasePublishableKey!, {
      global: {
        fetch: boundedTransport(transport),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return {
    configured,
    async get(token, callerId, spotId) {
      // PostgreSQL serializes UUIDs lowercase; accepted URL UUIDs may use uppercase.
      const canonicalId = spotId.toLowerCase();
      const { data, error } = await client(token)
        .from('spot_explorations')
        .select('user_id,spot_id,explored')
        .eq('user_id', callerId)
        .eq('spot_id', canonicalId)
        .maybeSingle();
      if (error) throw new Error('explored unavailable');
      if (data === null) return false;
      if (
        !data ||
        data.user_id !== callerId ||
        data.spot_id !== canonicalId ||
        typeof data.explored !== 'boolean'
      )
        throw new Error('explored unavailable');
      return data.explored;
    },
    async set(token, _callerId, spotId, explored) {
      // The invoker RPC derives auth.uid() itself and updates only explored. Do not
      // use PostgREST upsert, which can update identifier columns on conflict.
      const canonicalId = spotId.toLowerCase();
      const { data, error } = await client(token).rpc('set_spot_explored', {
        p_spot_id: canonicalId,
        p_explored: explored,
      });
      if (error || !Array.isArray(data) || data.length > 1)
        throw new Error('explored unavailable');
      if (!data.length) return null;
      if (
        !data[0] ||
        data[0].spot_id !== canonicalId ||
        data[0].explored !== explored ||
        typeof data[0].explored !== 'boolean'
      )
        throw new Error('explored unavailable');
      return data[0].explored;
    },
  };
}
