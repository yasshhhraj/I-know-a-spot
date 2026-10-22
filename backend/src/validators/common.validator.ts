import type { ServerConfig } from '../config.js';
import { UUID } from '../models/spot.model.js';

const secretKey = /^sb_secret_[A-Za-z0-9_-]+$/;
export const publishableKeyRegex = /^sb_publishable_[A-Za-z0-9_-]+$/;

export function isValidUUID(id: string): boolean {
  return UUID.test(id);
}

export function validAdminKey(config: ServerConfig): string | undefined {
  if (
    secretKey.test(config.supabaseSecretKey ?? '') &&
    config.supabaseSecretKey !== config.supabasePublishableKey
  ) {
    return config.supabaseSecretKey;
  }
  const legacy = config.supabaseServiceRoleKey;
  if (
    !legacy ||
    legacy === config.supabasePublishableKey ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(legacy)
  ) {
    return undefined;
  }
  try {
    const [encodedHeader, encodedPayload] = legacy.split('.');
    const header = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8')
    ) as { alg?: unknown };
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as { role?: unknown; iss?: unknown; exp?: unknown };
    // Shape checking only: Supabase verifies signature; never use this as caller authentication.
    return header.alg === 'HS256' &&
      payload.iss === 'supabase' &&
      payload.role === 'service_role' &&
      typeof payload.exp === 'number' &&
      payload.exp > Date.now() / 1000
      ? legacy
      : undefined;
  } catch {
    return undefined;
  }
}

export function validSupabaseUrl(raw: string | undefined): boolean {
  try {
    const url = new URL(raw ?? '');
    return (
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/'
    );
  } catch {
    return false;
  }
}
