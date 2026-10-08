import { createClient } from '@supabase/supabase-js';
import type { ServerConfig } from './config.js';
import type { SupabaseTransport } from './profile.js';

/** Null means the narrow RPC returned no currently visible spot. */
export interface ReportStore {
  readonly configured: boolean;
  submit(token: string, spotId: string, reason: ReportReason): Promise<boolean | null>;
}

export const REPORT_REASONS = ['private_property', 'sensitive_location', 'inappropriate_content', 'inaccurate'] as const;
export type ReportReason = typeof REPORT_REASONS[number];
export function reportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && REPORT_REASONS.some(reason => reason === value);
}

export function validSupabaseUrl(raw: string | undefined): boolean {
  try {
    const url = new URL(raw ?? '');
    return (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) &&
      !!url.hostname && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
  } catch { return false; }
}

export function boundedTransport(transport: SupabaseTransport): SupabaseTransport {
  return (input, init) => transport(input, { ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
  });
}

export function createReportStore(config: ServerConfig, transport: SupabaseTransport = fetch): ReportStore {
  const configured = validSupabaseUrl(config.supabaseUrl) && /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey ?? '');
  return {
    configured,
    async submit(token, spotId, reason) {
      if (!configured) throw new Error('report unavailable');
      // A fresh caller-JWT client; report table is never read and no admin fallback exists.
      const client = createClient(config.supabaseUrl!, config.supabasePublishableKey!, {
        global: { fetch: boundedTransport(transport), headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const canonicalId = spotId.toLowerCase();
      const { data, error } = await client.rpc('submit_spot_report', { p_spot_id: canonicalId, p_reason: reason });
      if (error || !Array.isArray(data) || data.length > 1) throw new Error('report unavailable');
      if (data.length === 0) return null;
      const row: unknown = data[0];
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== 2 ||
        (row as Record<string, unknown>).spot_id !== canonicalId || (row as Record<string, unknown>).reason !== reason) {
        throw new Error('report unavailable');
      }
      return true;
    },
  };
}
