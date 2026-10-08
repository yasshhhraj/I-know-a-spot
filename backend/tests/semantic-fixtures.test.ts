import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Fixture = { key: string; id: string; title: string; note: string; owner: string; audience: string; distanceKm: number; removed?: boolean };
const root = new URL('../supabase/', import.meta.url);
const data = JSON.parse(readFileSync(new URL('semantic_search_fixture.json', root), 'utf8')) as {
  marker: string; center: { latitude: number; longitude: number }; spots: Fixture[];
  queries: { query: string; feed: string; expected: string[] }[];
};
const seed = readFileSync(new URL('seed_semantic_search.sql', root), 'utf8');
const cleanup = readFileSync(new URL('cleanup_semantic_search.sql', root), 'utf8');
const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;

describe('synthetic search fixture/operator script structure (not live SQL)', () => {
  it('keeps committed SQL fixture text and distances identical to the actual model evaluation corpus', () => {
    expect(data.center).toEqual({ latitude: 0, longitude: 0 });
    expect(data.spots).toHaveLength(14);
    expect(new Set(data.spots.map(row => row.id)).size).toBe(14);
    for (const [index, row] of data.spots.entries()) {
      expect(row.id).toBe(`7a110000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
      const tuple = `(${index + 1}, ${quote(row.owner)}, ${quote(row.title)}, ${quote(row.note)}, ${quote(row.audience)}, ${row.distanceKm}, ${!!row.removed})`;
      expect(seed).toContain(tuple);
      expect([...row.title].length).toBeLessThanOrEqual(80);
      expect([...row.note].length).toBeLessThanOrEqual(500);
    }
    expect(data.queries).toHaveLength(12);
    const keys = new Set(data.spots.map(row => row.key));
    for (const query of data.queries) {
      expect([...query.query].length).toBeLessThanOrEqual(200);
      expect(query.expected.every(key => keys.has(key))).toBe(true);
    }
  });

  it('seeds without upsert/member/settings changes and refuses collisions, unrelated public data and media', () => {
    expect(seed).toContain('begin;'); expect(seed).toContain('commit;');
    expect(seed).toContain('Use three distinct existing enrolled accounts');
    expect(seed).toContain('All fixture accounts must already be enrolled');
    expect(seed).toContain('consented mutual connection');
    expect(seed).toContain('Fixture ID collision');
    expect(seed).toContain('Fixture photo paths already have Storage objects');
    expect(seed).toContain('use an isolated test project');
    expect(seed).toContain(quote(data.marker));
    expect(seed).not.toMatch(/^\s*(?:update|delete|truncate|drop|alter|create policy|insert into storage\.|insert into public\.(?:pilot_members|connections))/im);
    expect(seed).not.toMatch(/on conflict/i);
    expect(seed).toContain('degrees(f.km::double precision / 6371.0)');
    expect(data.spots.some(row => row.owner === 'unconnected' && row.audience === 'connections')).toBe(true);
    expect(data.spots.some(row => row.removed)).toBe(true);
    expect(data.spots.some(row => row.distanceKm > 25)).toBe(true);
  });

  it('cleanup targets only 14 reserved IDs with exact markers and refuses media deletion', () => {
    expect(cleanup).toContain('generate_series(1, 14)');
    expect(cleanup).toContain(quote(data.marker));
    expect(cleanup).toContain('access_note <> marker');
    expect(cleanup).toContain('Fixture media exists');
    expect(cleanup).toContain('delete from public.spots where id = any(fixture_ids) and access_note = marker');
    expect(cleanup).not.toMatch(/^\s*(?:update|truncate|drop|alter|delete from storage\.|delete from public\.(?:pilot_members|connections))/im);
    expect(cleanup).toContain('begin;'); expect(cleanup).toContain('commit;');
  });
});
