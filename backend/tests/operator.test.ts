import { describe, expect, it, vi } from 'vitest';
import { readConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createSearchService } from '../src/search.js';
import { createOperatorStore, parseOperatorArgs, runOperator, type OperatorStore, type PendingReport } from '../src/operator.js';
import type { SupabaseTransport } from '../src/profile.js';
import { createSpotStore, SpotFailure, type SpotRow } from '../src/spots.js';

const id = '00000000-0000-4000-8000-000000000010';
const reporter = '00000000-0000-4000-8000-000000000001';
const reportId = '00000000-0000-4000-8000-000000000020';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test' };
const report: PendingReport = { id: reportId, spot_id: id, reporter_id: reporter, reason: 'inaccurate', status: 'pending', created_at: '2026-10-08T00:00:00Z' };
const ok = (value: unknown) => Response.json(value, { headers: { 'content-type': 'application/json' } });

describe('LOCAL operator CLI', () => {
  it('can be imported without a process action; malformed/extra/missing confirmations fail before any config or I/O', async () => {
    const factory = vi.fn(); const output = vi.fn(); const error = vi.fn();
    expect(parseOperatorArgs(['remove', id, '--confirm-remove'])).toEqual({ kind: 'remove', id });
    for (const args of [[], ['list', 'extra'], ['review', reportId], ['remove', id], ['remove', id, '--confirm-review'],
      ['review', 'invalid', '--confirm-review'], ['remove', id, '--confirm-remove', reporter], ['help']]) {
      expect(await runOperator(args, { env: {}, operatorFactory: factory, output, error })).toBe(2);
    }
    expect(factory).not.toHaveBeenCalled(); expect(output).not.toHaveBeenCalled();
  });
  it('requires URL, publishable and backend-only admin credential before injected adapters or network', async () => {
    const factory = vi.fn(); const error = vi.fn();
    for (const invalid of [{ ...env, SUPABASE_URL: 'https://user:password@example.supabase.co' },
      { ...env, SUPABASE_URL: 'http://example.supabase.co' }, { ...env, SUPABASE_SECRET_KEY: '' },
      { ...env, SUPABASE_SECRET_KEY: 'sb_publishable_test' }, { ...env, SUPABASE_PUBLISHABLE_KEY: '' }]) {
      expect(await runOperator(['list'], { env: invalid, operatorFactory: factory, error })).toBe(1);
    }
    expect(factory).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join(' ')).not.toContain('password');
  });
  it('lists only bounded private records and reviews just one pending report; no unconfirmed removal', async () => {
    const output = vi.fn(); const error = vi.fn(); const store = {
      list: vi.fn(async () => [report]), review: vi.fn(async () => 'reviewed' as const), owner: vi.fn(async () => reporter),
    };
    const operatorFactory = () => store;
    expect(await runOperator(['list'], { env, operatorFactory, output, error })).toBe(0);
    expect(JSON.parse(output.mock.calls[0][0])).toEqual(report);
    expect(await runOperator(['review', reportId.toUpperCase(), '--confirm-review'], { env, operatorFactory, output, error })).toBe(0);
    expect(store.review).toHaveBeenCalledWith(reportId);
    expect(store.owner).not.toHaveBeenCalled();
    store.review.mockResolvedValueOnce('missing' as never);
    expect(await runOperator(['review', reportId, '--confirm-review'], { env, operatorFactory, output, error })).toBe(1);
    expect(error.mock.calls.at(-1)?.[0]).toContain('nothing reviewed');
    store.list.mockResolvedValueOnce(Array.from({ length: 51 }, () => report));
    expect(await runOperator(['list'], { env, operatorFactory, output, error })).toBe(1);
  });
  it('derives owner with privileged lookup, delegates existing tombstone cleanup; missing and pending are not successful', async () => {
    const output = vi.fn(), error = vi.fn();
    const store = { list: vi.fn(), review: vi.fn(), owner: vi.fn(async () => reporter) } as unknown as OperatorStore & { owner: ReturnType<typeof vi.fn> };
    const remove = vi.fn(async () => 'deleted' as const);
    const options = { env, operatorFactory: () => store, spotFactory: () => ({ configured: true, remove }), output, error };
    expect(await runOperator(['remove', id, '--confirm-remove'], options)).toBe(0);
    expect(remove).toHaveBeenCalledWith(reporter, id);
    store.owner.mockResolvedValueOnce(null);
    expect(await runOperator(['remove', id, '--confirm-remove'], options)).toBe(1);
    expect(remove).toHaveBeenCalledTimes(1);
    remove.mockResolvedValueOnce('not_found' as never);
    expect(await runOperator(['remove', id, '--confirm-remove'], options)).toBe(1);
    remove.mockRejectedValueOnce(new SpotFailure('MEDIA_CLEANUP_PENDING'));
    expect(await runOperator(['remove', id, '--confirm-remove'], options)).toBe(1);
    expect(error.mock.calls.at(-1)?.[0]).toContain('explicitly retry');
    remove.mockRejectedValueOnce(new Error('raw upstream key'));
    expect(await runOperator(['remove', id, '--confirm-remove'], options)).toBe(1);
    expect(error.mock.calls.flat().join(' ')).not.toContain('raw upstream key');
    expect(remove).toHaveBeenCalledTimes(4);
  });
  it('real adapter path hides before failed media cleanup and only explicit second invocation completes removal', async () => {
    let removedAt: string | null = null;
    let failMedia = true;
    const actions: string[] = [];
    const transport: SupabaseTransport = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method ?? 'GET';
      actions.push(`${method} ${url.pathname}`);
      if (url.pathname === '/rest/v1/spots') {
        if (method === 'GET') return ok(url.searchParams.get('select') === 'id,owner_id'
          ? { id, owner_id: reporter } : { id, owner_id: reporter, removed_at: removedAt });
        if (method === 'PATCH') { removedAt = '2026-10-08T00:00:00Z'; return ok({ id }); }
        if (method === 'DELETE') return new Response(null, { status: 204 });
      }
      if (url.pathname.startsWith('/storage/v1/object/spot-photos') && method === 'DELETE')
        return failMedia ? new Response(JSON.stringify({ message: 'private' }), { status: 500,
          headers: { 'content-type': 'application/json' } }) : ok([]);
      throw new Error('unexpected request');
    };
    const output = vi.fn(), error = vi.fn();
    const opts = { env, transport, output, error };
    expect(await runOperator(['remove', id, '--confirm-remove'], opts)).toBe(1);
    expect(removedAt).not.toBeNull();
    expect(actions.filter(action => action === 'PATCH /rest/v1/spots')).toHaveLength(1);
    expect(actions.some(action => action === 'DELETE /rest/v1/spots')).toBe(false);
    const count = actions.length;
    failMedia = false;
    expect(await runOperator(['remove', id, '--confirm-remove'], opts)).toBe(0);
    expect(actions.slice(count)).not.toContain('PATCH /rest/v1/spots');
    expect(actions.slice(count)).toContain('DELETE /rest/v1/spots');
    expect(output).toHaveBeenCalledWith('Spot removed and cleanup completed.');
  });
});

describe('privileged adapter', () => {
  it('selects max50 pending oldest+ID first without content, reviews just matching pending row and looks up real owner', async () => {
    const calls: Array<{ url: URL; method: string; headers: Headers; body: unknown; signal: unknown }> = [];
    const transport: SupabaseTransport = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      calls.push({ url, method: init?.method ?? 'GET', headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : undefined, signal: init?.signal });
      return ok(url.pathname.endsWith('/spots') ? { id, owner_id: reporter } : init?.method === 'PATCH' ? { id: reportId, status: 'reviewed' } : [report]);
    };
    const store = createOperatorStore(readConfig(env), transport);
    expect(await store.list()).toEqual([report]);
    expect(await store.review(reportId)).toBe('reviewed');
    expect(await store.owner(id)).toBe(reporter);
    expect(calls.map(({ url }) => url.pathname)).toEqual(['/rest/v1/spot_reports', '/rest/v1/spot_reports', '/rest/v1/spots']);
    expect(calls[0].url.searchParams.get('status')).toBe('eq.pending');
    expect(calls[0].url.searchParams.get('limit')).toBe('50');
    expect(calls[0].url.searchParams.get('order')).toBe('created_at.asc,id.asc');
    expect(calls[0].url.searchParams.get('select')).toBe('id,spot_id,reporter_id,reason,status,created_at');
    expect(calls[1].url.searchParams.get('id')).toBe(`eq.${reportId}`);
    expect(calls[1].url.searchParams.get('status')).toBe('eq.pending');
    expect(calls[1].body).toEqual({ status: 'reviewed' });
    expect(calls[2].url.searchParams.get('select')).toBe('id,owner_id');
    expect(calls[2].url.searchParams.get('id')).toBe(`eq.${id}`);
    expect(calls.every(call => call.headers.get('apikey') === 'sb_secret_test' && call.signal instanceof AbortSignal)).toBe(true);
    expect(JSON.stringify(calls)).not.toContain('latitude');
  });
  it('refuses provider errors, malformed rows and missing updates without inventing success', async () => {
    const config = readConfig(env);
    await expect(createOperatorStore(config, async () => ok([{ ...report, note: 'private' }])).list()).rejects.toThrow();
    expect(await createOperatorStore(config, async () => ok(null)).review(reportId)).toBe('missing');
    expect(await createOperatorStore(config, async () => ok(null)).owner(id)).toBeNull();
    await expect(createOperatorStore(config, async () => ok({ id, owner_id: 'wrong' })).owner(id)).rejects.toThrow();
    const denied: SupabaseTransport = async () => new Response(JSON.stringify({ message: 'private provider detail' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
    await expect(createOperatorStore(config, denied).list()).rejects.toThrow();
  });
});

describe('operator/API integration with simulated caller RLS, not a live audit', () => {
  it('pending cleanup hides all subsequent ordinary paths, including an already warmed search cache', async () => {
    let removedAt: string | null = null;
    const viewer = '00000000-0000-4000-8000-000000000002';
    const row = (): SpotRow => ({ id, owner_id: reporter, author_name: 'Synthetic owner',
      title: 'Synthetic garden', note: 'Synthetic garden for reading, not a real destination.',
      audience: 'public', latitude: 0, longitude: 0, access_confirmed: true, access_note: '',
      created_at: '2026-10-08T00:00:00Z', updated_at: '2026-10-08T00:00:00Z', removed_at: removedAt });
    let storageCalls = 0;
    const transport: SupabaseTransport = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method ?? 'GET';
      const admin = new Headers(init?.headers).get('apikey') === 'sb_secret_test';
      if (url.pathname === '/rest/v1/connections') return ok([{ member_a: reporter, member_b: viewer }]);
      if (url.pathname === '/rest/v1/rpc/list_public_spots') return ok(removedAt ? [] : [{ ...row(), distance_km: 0 }]);
      if (url.pathname === '/rest/v1/spots') {
        if (admin && method === 'PATCH') { removedAt = '2026-10-08T01:00:00Z'; return ok({ id }); }
        if (method === 'GET') {
          if (admin) return ok(url.searchParams.get('select') === 'id,owner_id' ? { id, owner_id: reporter } : row());
          // This transport simulates the applied visibility policies; real SQL is separate.
          if (url.searchParams.has('id')) return ok(removedAt ? null : row());
          return ok(removedAt ? [] : [row()]);
        }
      }
      if (url.pathname.startsWith('/storage/v1/object/spot-photos')) {
        storageCalls++;
        return Response.json({ message: 'simulated cleanup failure' }, { status: 500 });
      }
      throw new Error('Unexpected synthetic transport call');
    };
    const config = readConfig(env);
    const encode = vi.fn(async () => { const vector = new Float64Array(384); vector[0] = 1; return vector; });
    const search = createSearchService({ encode });
    const explored = { configured: true, get: vi.fn(), set: vi.fn() };
    const reports = { configured: true, submit: vi.fn() };
    const app = createApp(config, async () => ({ kind: 'ok', profile: { id: viewer, displayName: 'Synthetic viewer', publicRadiusKm: 5 } }),
      createSpotStore(config, transport), async () => ({ kind: 'unavailable' }), search, explored, reports);
    const headers = { authorization: 'Bearer synthetic-viewer' };
    try {
      const warmed = await app.inject({ method: 'POST', url: '/spots/search', headers, payload: { query: 'garden', feed: 'connections' } });
      expect(warmed.statusCode).toBe(200); expect(warmed.json().spots).toHaveLength(1);
      const callsBeforeRemoval = encode.mock.calls.length;
      expect(await runOperator(['remove', id, '--confirm-remove'], { env, transport, output: vi.fn(), error: vi.fn() })).toBe(1);
      expect(removedAt).not.toBeNull(); expect(storageCalls).toBe(1);
      for (const url of ['/spots?feed=connections', '/spots?feed=public&centerLat=0&centerLon=0']) {
        const response = await app.inject({ method: 'GET', url, headers });
        expect(response.statusCode).toBe(200); expect(response.json().spots).toEqual([]);
      }
      for (const body of [{ query: 'garden', feed: 'connections' }, { query: 'garden', feed: 'public', centerLat: 0, centerLon: 0 }]) {
        const response = await app.inject({ method: 'POST', url: '/spots/search', headers, payload: body });
        expect(response.statusCode).toBe(200); expect(response.json().spots).toEqual([]);
      }
      for (const entry of [{ method: 'GET' as const, url: `/spots/${id}` },
        { method: 'GET' as const, url: `/spots/${id}/photo` }, { method: 'GET' as const, url: `/spots/${id}/explored` },
        { method: 'PUT' as const, url: `/spots/${id}/explored`, payload: { explored: true } },
        { method: 'POST' as const, url: `/spots/${id}/reports`, payload: { reason: 'inaccurate' } }]) {
        const response = await app.inject({ ...entry, headers });
        expect(response.statusCode).toBe(404); expect(response.json().error.code).toBe('NOT_FOUND');
      }
      expect(encode).toHaveBeenCalledTimes(callsBeforeRemoval);
      expect(storageCalls).toBe(1); expect(explored.get).not.toHaveBeenCalled(); expect(explored.set).not.toHaveBeenCalled();
      expect(reports.submit).not.toHaveBeenCalled();
      for (const url of ['/operator/reports', '/spots/reports', `/spots/${id}/reports`])
        expect((await app.inject({ method: 'GET', url, headers })).statusCode).not.toBe(200);
    } finally { await app.close(); }
  });
});
