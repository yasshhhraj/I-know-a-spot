import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const migration = readFileSync(new URL('../supabase/migrations/202610080005_spot_reports.sql', import.meta.url), 'utf8');
const check = readFileSync(new URL('../supabase/check_reporting_boundaries.sql', import.meta.url), 'utf8');

describe('prepared reporting SQL (structural only, not PostgreSQL/RLS execution)', () => {
  it('seals report table and keeps review evidence with atomic deduplication', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on public.spot_reports from public, anon, authenticated');
    expect(migration).not.toMatch(/create policy/i);
    expect(migration).toMatch(/spot_id uuid not null,/);
    expect(migration).toContain('references public.pilot_members(user_id) on delete cascade');
    expect(migration).toContain('unique (reporter_id,spot_id,reason)');
    expect(migration).toContain("default 'pending' check (status in ('pending','reviewed'))");
  });
  it('uses a caller-derived narrow definer with fixed path and no existence/count oracle', () => {
    expect(migration).toContain('returns table(spot_id uuid,reason text)');
    expect(migration).toContain("volatile security definer set search_path = ''");
    expect(migration).toContain('caller uuid := auth.uid()');
    expect(migration).toContain('not public.spot_visible(p_spot_id)');
    expect(migration).toContain('on conflict on constraint spot_reports_dedup do nothing');
    expect(migration).toContain('return query select p_spot_id,p_reason');
    expect(migration).toContain('revoke all on function public.submit_spot_report(uuid,text) from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.submit_spot_report(uuid,text) to authenticated');
    expect(migration).not.toMatch(/exception when|execute\s+.*p_/i);
    for (const reason of ['private_property','sensitive_location','inappropriate_content','inaccurate']) expect(migration).toContain(`'${reason}'`);
  });
  it('prepares guarded rollback-only direct-role, revocation, identity, retention and privilege checks', () => {
    expect(check.trim()).toMatch(/rollback;$/);
    expect(check).not.toMatch(/\bcommit\s*;/i);
    for (const marker of ['Reserved fixture ID/report/media collision', 'has_column_privilege', 'aclexplode',
      'Duplicate reports or spoofed reporter identity', 'Reporter can read queue', 'Spot owner can read reporter queue',
      'Anonymous RPC succeeded', 'Unenrolled caller accepted', 'Duplicate retry reopened reviewed report',
      'Revoked historical report accepted', 'Tombstoned spot remains accessible',
      'Removal erased private report evidence', 'Member deletion did not cascade own reports']) expect(check).toContain(marker);
    expect(check).toContain('set local role authenticated');
    expect(check).toContain('set local role anon');
    expect(check).not.toMatch(/insert into storage\.objects/i);
  });
});
