import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/202610080004_spot_explorations.sql', import.meta.url), 'utf8');
const checks = readFileSync(new URL('../supabase/check_explored_boundaries.sql', import.meta.url), 'utf8');

describe('explored SQL structure only (not applied PostgreSQL/RLS evidence)', () => {
  it('defines minimal private state, cascading composite keys and narrow grants', () => {
    expect(migration).toContain('primary key (user_id, spot_id)');
    expect(migration).toContain('references public.pilot_members(user_id) on delete cascade');
    expect(migration).toContain('references public.spots(id) on delete cascade');
    expect(migration).toContain('explored boolean not null');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on public.spot_explorations from public, anon, authenticated');
    expect(migration).toContain('grant update (explored)');
    expect(migration).not.toMatch(/grant\s+(all|delete|update\s*\(\s*(user_id|spot_id))/i);
    const table = migration.match(/create table[\s\S]*?\n\);/)?.[0];
    expect(table).toBeDefined();
    expect(table).not.toMatch(/\b(timestamp|latitude|longitude|visit_count)\b/i);
  });
  it('guards both policy sides and invoker RPC; derives identity rather than trusting parameters', () => {
    expect(migration.match(/user_id = \(select auth.uid\(\)\) and public.spot_visible\(spot_id\)/g)).toHaveLength(4);
    expect(migration).toContain('language sql volatile security invoker set search_path =');
    expect(migration).toContain('select auth.uid(), p_spot_id, p_explored');
    expect(migration).toContain('where p_explored is not null and public.spot_visible(p_spot_id)');
    expect(migration).toContain('on conflict (user_id, spot_id) do update set explored = excluded.explored');
    expect(migration).toContain('returning e.spot_id, e.explored');
    expect(migration).toContain('revoke all on function public.set_spot_explored(uuid, boolean) from public, anon');
    expect(migration).not.toMatch(/security definer|p_user_id|create or replace|if not exists/i);
  });
  it('prepares rollback-only disposable-account access/grant/cascade checks, not data population', () => {
    expect(checks).toContain('begin;'); expect(checks.trimEnd()).toMatch(/rollback;$/);
    expect(checks).not.toMatch(/^\s*commit;/m);
    for (const phrase of ['no pilot member rows', 'Reserved fixture ID/photo collision',
      'Repeated true', 'Other-member SELECT leaked', 'Spoofed user INSERT succeeded',
      'Identifier column UPDATE succeeded', 'Ordinary DELETE succeeded',
      'Inaccessible spot INSERT succeeded', 'Revocation must hide', 'Unenrolled direct INSERT',
      'Anonymous RPC', 'De-enrollment', 'Tombstoned spot', 'Member deletion', 'Spot deletion']) {
      expect(checks).toContain(phrase);
    }
    expect(checks).toContain('set local role authenticated');
    expect(checks).toContain('set local role anon');
    expect(checks).not.toMatch(/insert into storage\./i);
  });
});
