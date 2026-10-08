import { createClient } from '@supabase/supabase-js';

export type ProfileResult =
  | { kind: 'ok'; profile: { id: string; displayName: string; publicRadiusKm: number } }
  | { kind: 'unauthorized' | 'not_enrolled' | 'unavailable' };

export type ProfileProvider = (token: string) => Promise<ProfileResult>;
export type SupabaseTransport = typeof fetch;

const REQUEST_TIMEOUT_MS = 5000;
// Only the new, non-privileged Supabase publishable key format is supported.
// Never allow a secret key or legacy JWT to initialize this user-scoped client.
const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]+$/;

export function createProfileProvider(
  url: string | undefined,
  publishableKey: string | undefined,
  transport: SupabaseTransport = fetch,
): ProfileProvider {
  let configured = false;
  try {
    const parsed = new URL(url ?? '');
    configured = (parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) &&
      !parsed.username && !parsed.password && PUBLISHABLE_KEY.test(publishableKey ?? '');
  } catch { /* Missing/invalid integration config is a per-request 503, not startup failure. */ }

  return async (token) => {
    if (!configured || !url || !publishableKey) return { kind: 'unavailable' };

    // Fresh client per call: no shared session or mutable Authorization header.
    const boundedFetch: SupabaseTransport = (input, init) => transport(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    try {
      const client = createClient(url, publishableKey, {
        global: { fetch: boundedFetch, headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      // This calls Supabase Auth; decoding a JWT locally is never identity verification.
      const { data: identity, error: authError } = await client.auth.getUser(token);
      if (authError) {
        return { kind: authError.status !== undefined && [400, 401, 403].includes(authError.status)
          ? 'unauthorized' : 'unavailable' };
      }
      if (!identity.user?.id) return { kind: 'unauthorized' };

      // User access token is forwarded to PostgREST; RLS also limits SELECT to self.
      const { data: row, error } = await client.from('pilot_members')
        .select('user_id,display_name,enrolled,public_radius_km')
        .eq('user_id', identity.user.id).maybeSingle();
      if (error) return { kind: 'unavailable' };
      if (!row || row.enrolled === false) return { kind: 'not_enrolled' };
      if (row.enrolled !== true || row.user_id !== identity.user.id ||
          typeof row.display_name !== 'string' || !row.display_name.trim() ||
          !Number.isInteger(row.public_radius_km) || row.public_radius_km < 1 || row.public_radius_km > 25) {
        return { kind: 'unavailable' };
      }
      return { kind: 'ok', profile: {
        id: row.user_id, displayName: row.display_name, publicRadiusKm: row.public_radius_km,
      } };
    } catch {
      // Network, timeout, schema, and provider errors do not imply invalid credentials.
      return { kind: 'unavailable' };
    }
  };
}
