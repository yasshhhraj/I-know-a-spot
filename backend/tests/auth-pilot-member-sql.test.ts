import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/202610080006_auth_pilot_member_trigger.sql', import.meta.url),
  'utf8',
);

describe('Auth pilot-member provisioning migration (structural only)', () => {
  it('provisions enrolled members without duplicating Auth email', () => {
    expect(migration).toContain('after insert on auth.users');
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('values (new.id, v_display_name, true)');
    expect(migration).toContain('on conflict (user_id) do nothing');
    expect(migration).not.toMatch(/pilot_members\s*\([^)]*email/i);
  });

  it('removes callable privileges and bounds provider/email fallback', () => {
    expect(migration).toContain('revoke all on function public.provision_pilot_member() from public, anon, authenticated');
    expect(migration).toContain("left(btrim(coalesce(");
    expect(migration).toContain("'full_name'");
    expect(migration).toContain("'given_name'");
    expect(migration).toContain("split_part(coalesce(new.email, ''), '@', 1)");
    expect(migration).toContain("'Member'");
    expect(migration).toContain('), 80);');
  });
});
