import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { readConfig, type ServerConfig } from './config.js';
import { boundedTransport, reportReason, validSupabaseUrl, type ReportReason } from './reports.js';
import type { SupabaseTransport } from './profile.js';
import { createSpotStore, SpotFailure, UUID, validAdminKey, type SpotStore } from './spots.js';

export type PendingReport = { id: string; spot_id: string; reporter_id: string; reason: ReportReason; status: 'pending'; created_at: string };
export interface OperatorStore {
  list(): Promise<PendingReport[]>;
  review(id: string): Promise<'reviewed' | 'missing'>;
  owner(id: string): Promise<string | null>;
}

const columns = 'id,spot_id,reporter_id,reason,status,created_at';
function validReport(value: unknown): value is PendingReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).length === 6 && UUID.test(String(row.id)) && UUID.test(String(row.spot_id)) &&
    UUID.test(String(row.reporter_id)) && reportReason(row.reason) && row.status === 'pending' &&
    typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at));
}

/** The privileged adapter exists only in the local CLI, never in an HTTP route. */
export function createOperatorStore(config: ServerConfig, transport: SupabaseTransport = fetch): OperatorStore {
  const key = validAdminKey(config);
  if (!validSupabaseUrl(config.supabaseUrl) || !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey ?? ''))
    throw new Error('Operator configuration unavailable.');
  const client = () => createClient(config.supabaseUrl!, key, {
    global: { fetch: boundedTransport(transport) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async list() {
      const { data, error } = await client().from('spot_reports').select(columns).eq('status', 'pending')
        .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(50);
      if (error || !Array.isArray(data) || data.length > 50 || !data.every(validReport)) throw new Error('Operator request unavailable.');
      return data;
    },
    async review(id) {
      const { data, error } = await client().from('spot_reports').update({ status: 'reviewed' }).eq('id', id)
        .eq('status', 'pending').select('id,status').maybeSingle();
      if (error) throw new Error('Operator request unavailable.');
      if (data === null) return 'missing';
      if (!data || Object.keys(data).length !== 2 || data.id !== id || data.status !== 'reviewed') throw new Error('Operator request unavailable.');
      return 'reviewed';
    },
    async owner(id) {
      // Privileged lookup derives the actual owner. No owner ID is accepted in args.
      const { data, error } = await client().from('spots').select('id,owner_id').eq('id', id).maybeSingle();
      if (error) throw new Error('Operator request unavailable.');
      if (data === null) return null;
      if (!data || Object.keys(data).length !== 2 || data.id !== id || typeof data.owner_id !== 'string' || !UUID.test(data.owner_id))
        throw new Error('Operator request unavailable.');
      return data.owner_id;
    },
  };
}

type Command = { kind: 'list' } | { kind: 'review' | 'remove'; id: string };
export function parseOperatorArgs(args: string[]): Command | null {
  if (args.length === 1 && args[0] === 'list') return { kind: 'list' };
  if (args.length === 3 && (args[0] === 'review' || args[0] === 'remove') && UUID.test(args[1]) &&
    args[2] === (args[0] === 'review' ? '--confirm-review' : '--confirm-remove'))
    return { kind: args[0], id: args[1].toLowerCase() };
  return null;
}

export async function runOperator(args: string[], options: {
  env?: NodeJS.ProcessEnv;
  transport?: SupabaseTransport;
  operatorFactory?: (config: ServerConfig, transport?: SupabaseTransport) => OperatorStore;
  spotFactory?: (config: ServerConfig, transport?: SupabaseTransport) => Pick<SpotStore, 'remove' | 'configured'>;
  output?: (line: string) => void;
  error?: (line: string) => void;
} = {}): Promise<number> {
  const command = parseOperatorArgs(args);
  const output = options.output ?? console.log;
  const error = options.error ?? console.error;
  if (!command) { error('Invalid operator command. Use list, review <report-uuid> --confirm-review, or remove <spot-uuid> --confirm-remove.'); return 2; }
  try {
    const config = readConfig(options.env ?? process.env);
    // Validate before constructing or invoking ANY adapter, including injected ones.
    if (!validSupabaseUrl(config.supabaseUrl) || !validAdminKey(config) ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey ?? '')) throw new Error('configuration');
    const operator = (options.operatorFactory ?? createOperatorStore)(config, options.transport);
    if (command.kind === 'list') {
      const rows = await operator.list();
      if (!Array.isArray(rows) || rows.length > 50 || !rows.every(validReport)) throw new Error('invalid rows');
      for (const row of rows) output(JSON.stringify(row));
      return 0;
    }
    if (command.kind === 'review') {
      const result = await operator.review(command.id);
      if (result === 'missing') { error('Pending report not found; nothing reviewed.'); return 1; }
      if (result !== 'reviewed') throw new Error('invalid result');
      output('Report reviewed.'); return 0;
    }
    const spotStore = (options.spotFactory ?? createSpotStore)(config, options.transport);
    if (!spotStore.configured) throw new Error('configuration');
    const owner = await operator.owner(command.id);
    if (!owner) { error('Spot not found; nothing removed.'); return 1; }
    if (!UUID.test(owner)) throw new Error('invalid owner');
    const result = await spotStore.remove(owner, command.id);
    if (result === 'not_found') { error('Spot not found; nothing removed.'); return 1; }
    if (result !== 'deleted') throw new Error('invalid result');
    output('Spot removed and cleanup completed.'); return 0;
  } catch (cause) {
    // Never expose upstream messages or credentials. A tombstone can be hidden
    // while media cleanup is pending; explicit retry is safe, automatic retry is not.
    error(cause instanceof SpotFailure && cause.code === 'MEDIA_CLEANUP_PENDING'
      ? 'Spot hidden; media cleanup pending. Inspect privately and explicitly retry removal.'
      : 'Operator action unavailable or outcome uncertain. Inspect privately before retrying.');
    return 1;
  }
}

// Importing this module never reads env or invokes a privileged operation.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runOperator(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
