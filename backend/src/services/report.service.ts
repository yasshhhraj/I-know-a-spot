import { createClient } from '@supabase/supabase-js';
import type { ServerConfig } from '../config.js';
import type { SupabaseTransport } from '../models/profile.model.js';
import type { ReportStore } from '../models/report.model.js';
import { validSupabaseUrl } from '../validators/common.validator.js';
import { boundedTransport } from '../utils/transport.js';

export function createReportStore(
  config: ServerConfig,
  transport: SupabaseTransport = fetch
): ReportStore {
  const configured =
    validSupabaseUrl(config.supabaseUrl) &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey ?? '');
  return {
    configured,
    async submit(token, spotId, reason) {
      if (!configured) throw new Error('report unavailable');
      // A fresh caller-JWT client; report table is never read and no admin fallback exists.
      const client = createClient(config.supabaseUrl!, config.supabasePublishableKey!, {
        global: {
          fetch: boundedTransport(transport),
          headers: { Authorization: `Bearer ${token}` },
        },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const canonicalId = spotId.toLowerCase();
      const { data, error } = await client.rpc('submit_spot_report', {
        p_spot_id: canonicalId,
        p_reason: reason,
      });
      if (error || !Array.isArray(data) || data.length > 1)
        throw new Error('report unavailable');
      if (data.length === 0) return null;
      const row: unknown = data[0];
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        Object.keys(row).length !== 2 ||
        (row as Record<string, unknown>).spot_id !== canonicalId ||
        (row as Record<string, unknown>).reason !== reason
      ) {
        throw new Error('report unavailable');
      }
      return true;
    },
  };
}
