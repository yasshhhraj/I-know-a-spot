import { createClient } from '@supabase/supabase-js';
import type {
  ProfileProvider,
  ProfileResult,
  ProfileUpdater,
  SupabaseTransport,
} from '../models/profile.model.js';
import { configuredClient } from '../validators/profile.validator.js';
import { boundedTransport } from '../utils/transport.js';

export function profileFromRow(
  row: Record<string, unknown> | null,
  callerId: string
): ProfileResult {
  if (!row || row.enrolled === false) return { kind: 'not_enrolled' };
  if (
    row.enrolled !== true ||
    row.user_id !== callerId ||
    typeof row.display_name !== 'string' ||
    !row.display_name.trim() ||
    !Number.isInteger(row.public_radius_km) ||
    (row.public_radius_km as number) < 1 ||
    (row.public_radius_km as number) > 25
  ) {
    return { kind: 'unavailable' };
  }
  return {
    kind: 'ok',
    profile: {
      id: callerId,
      displayName: row.display_name,
      publicRadiusKm: row.public_radius_km as number,
    },
  };
}

export function createProfileProvider(
  url: string | undefined,
  publishableKey: string | undefined,
  transport: SupabaseTransport = fetch
): ProfileProvider {
  const configured = configuredClient(url, publishableKey);

  return async (token) => {
    if (!configured || !url || !publishableKey) return { kind: 'unavailable' };

    // Fresh client per call: no shared session or mutable Authorization header.
    try {
      const client = createClient(url, publishableKey, {
        global: {
          fetch: boundedTransport(transport),
          headers: { Authorization: `Bearer ${token}` },
        },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      // This calls Supabase Auth; decoding a JWT locally is never identity verification.
      const { data: identity, error: authError } = await client.auth.getUser(token);
      if (authError) {
        return {
          kind:
            authError.status !== undefined && [400, 401, 403].includes(authError.status)
              ? 'unauthorized'
              : 'unavailable',
        };
      }
      if (!identity.user?.id) return { kind: 'unauthorized' };

      // User access token is forwarded to PostgREST; RLS also limits SELECT to self.
      const { data: row, error } = await client
        .from('pilot_members')
        .select('user_id,display_name,enrolled,public_radius_km')
        .eq('user_id', identity.user.id)
        .maybeSingle();
      if (error) return { kind: 'unavailable' };
      return profileFromRow(row, identity.user.id);
    } catch {
      // Network, timeout, schema, and provider errors do not imply invalid credentials.
      return { kind: 'unavailable' };
    }
  };
}

export function createProfileUpdater(
  url: string | undefined,
  publishableKey: string | undefined,
  transport: SupabaseTransport = fetch
): ProfileUpdater {
  const configured = configuredClient(url, publishableKey);
  return async (token, callerId, radiusKm) => {
    if (!configured || !url || !publishableKey) return { kind: 'unavailable' };
    try {
      // The route verifies identity/enrollment first. This client never uses an
      // admin key: column grants and the enrolled-self RLS policy govern UPDATE.
      const client = createClient(url, publishableKey, {
        global: {
          fetch: boundedTransport(transport),
          headers: { Authorization: `Bearer ${token}` },
        },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await client
        .from('pilot_members')
        .update({ public_radius_km: radiusKm })
        .eq('user_id', callerId)
        .eq('enrolled', true)
        .select('user_id,display_name,enrolled,public_radius_km')
        .maybeSingle();
      if (error) return { kind: 'unavailable' };
      const result = profileFromRow(data, callerId);
      // A concurrent enrollment change or zero-row RLS update is not a save.
      if (result.kind !== 'ok' || result.profile.publicRadiusKm !== radiusKm)
        return { kind: 'unavailable' };
      return result;
    } catch {
      return { kind: 'unavailable' };
    }
  };
}
