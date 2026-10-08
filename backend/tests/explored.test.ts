import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createExploredStore, type ExploredStore } from '../src/explored.js';
import type { ProfileProvider, SupabaseTransport } from '../src/profile.js';
import type { SearchService } from '../src/search.js';
import type { SpotRow, SpotStore } from '../src/spots.js';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const c = '00000000-0000-4000-8000-000000000003';
const id = '00000000-0000-4000-8000-000000000010';
const config = readConfig({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test' });
const profile: ProfileProvider = async token => token === 'expired' ? { kind: 'unauthorized' } : token === 'unenrolled' ? { kind: 'not_enrolled' } :
  { kind: 'ok', profile: { id: token === 'b' ? b : token === 'c' ? c : a, displayName: 'Pilot', publicRadiusKm: 1 } };
const spot = (override: Partial<SpotRow> = {}): SpotRow => ({ id, owner_id: a, author_name: 'Pilot', title: 'Wall', note: 'Pattern', audience: 'connections',
  latitude: 0, longitude: 0, access_confirmed: true, access_note: '', created_at: '2026-10-08T00:00:00Z', updated_at: '2026-10-08T00:00:00Z', removed_at: null, ...override });
function stores() {
  const current = new Map<string, boolean>();
  const spots = { configured: true, get: vi.fn(async (_token: string, _spotId: string): Promise<SpotRow | null> => spot()),
    list: vi.fn(), photo: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } as unknown as SpotStore & { get: ReturnType<typeof vi.fn> };
  const explored = { configured: true,
    get: vi.fn(async (_token: string, caller: string) => current.get(caller) ?? false),
    set: vi.fn(async (_token: string, caller: string, _spotId: string, value: boolean) => { current.set(caller, value); return value; }),
  };
  return { spots, explored, current };
}
const search = { dispose: vi.fn(async () => {}), invalidate: vi.fn(), search: vi.fn() } as unknown as SearchService;
let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });
function boot(spots: SpotStore, explored: ExploredStore) { app = createApp(config, profile, spots, async () => ({ kind: 'unavailable' }), search, explored); return app; }
const auth = (token = 'a') => ({ authorization: `Bearer ${token}` });
const put = (payload: unknown, token = 'a') => ({ method: 'PUT' as const, url: `/spots/${id}/explored`, headers: { ...auth(token), 'content-type': 'application/json' }, payload });

describe('explored routes', () => {
  it('blocks missing, expired and unenrolled accounts before either store is touched, including malformed write JSON', async () => {
    const { spots, explored } = stores(); boot(spots, explored);
    for (const method of ['GET', 'PUT'] as const) for (const token of [undefined, 'expired', 'unenrolled']) {
      const response = await app!.inject({ method, url: `/spots/${id}/explored`, ...(token ? { headers: auth(token) } : {}),
        ...(method === 'PUT' ? { payload: token ? { explored: true } : '{invalid', headers: { ...(token ? auth(token) : {}), 'content-type': 'application/json' } } : {}) });
      expect(response.statusCode).toBe(token === 'unenrolled' ? 403 : 401);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(spots.get).not.toHaveBeenCalled(); expect(explored.get).not.toHaveBeenCalled(); expect(explored.set).not.toHaveBeenCalled();
  });
  it('keeps own/connected and out-of-radius Public detail access independent of feed radius; isolates repeated desired sets', async () => {
    const { spots, explored } = stores();
    spots.get.mockImplementation(async (token: string) => token === 'a' || token === 'b' || token === 'c' ? spot({ audience: token === 'c' ? 'public' : 'connections', longitude: 90 }) : null);
    boot(spots, explored);
    for (const token of ['a', 'b', 'c']) {
      expect((await app!.inject({ method: 'GET', url: `/spots/${id}/explored`, headers: auth(token) })).json()).toEqual({ exploration: { spotId: id, explored: false } });
      for (const desired of [true, true, false, false]) {
        const response = await app!.inject(put({ explored: desired }, token));
        expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ exploration: { spotId: id, explored: desired } });
        expect(response.headers['cache-control']).toBe('private, no-store');
      }
    }
    expect(explored.set).toHaveBeenCalledWith('b', b, id, true);
    expect(explored.set).toHaveBeenCalledWith('c', c, id, false);
    await app!.inject(put({ explored: true }, 'b'));
    expect((await app!.inject({ method: 'GET', url: `/spots/${id}/explored`, headers: auth('a') })).json().exploration.explored).toBe(false);
    expect((await app!.inject({ method: 'GET', url: `/spots/${id}/explored`, headers: auth('b') })).json().exploration.explored).toBe(true);
    expect((await app!.inject({ method: 'GET', url: `/spots/${id}/explored`, headers: auth('c') })).json().exploration.explored).toBe(false);
  });
  it('returns neutral 404 for missing, hidden private, tombstone and before/after revocation, without exposing own state', async () => {
    const { spots, explored } = stores(); boot(spots, explored);
    for (const inaccessible of [null, spot({ removed_at: '2026-10-08T01:00:00Z' })]) {
      spots.get.mockResolvedValueOnce(inaccessible);
      expect((await app!.inject(put({ explored: true }, 'c'))).statusCode).toBe(404);
    }
    expect(explored.set).not.toHaveBeenCalled();
    spots.get.mockResolvedValueOnce(spot()).mockResolvedValueOnce(null);
    expect((await app!.inject(put({ explored: true }, 'b'))).json().error.code).toBe('NOT_FOUND');
    spots.get.mockResolvedValueOnce(spot()).mockResolvedValueOnce(spot({ removed_at: '2026-10-08T01:00:00Z' }));
    expect((await app!.inject({ method: 'GET', url: `/spots/${id}/explored`, headers: auth('a') })).statusCode).toBe(404);
  });
  it('treats successful absent read as false, failures as 503, zero RPC rows as neutral 404 and wrong values as 503', async () => {
    const { spots, explored } = stores(); boot(spots, explored);
    expect((await app!.inject({ method: 'GET', url: `/spots/${id}/explored`, headers: auth() })).json().exploration.explored).toBe(false);
    explored.get.mockRejectedValueOnce(new Error('private provider payload'));
    const failure = await app!.inject({ method: 'GET', url: `/spots/${id}/explored`, headers: auth() });
    expect(failure.statusCode).toBe(503); expect(failure.body).not.toContain('private provider payload');
    explored.set.mockResolvedValueOnce(null);
    expect((await app!.inject(put({ explored: true }))).statusCode).toBe(404);
    explored.set.mockResolvedValueOnce(false);
    expect((await app!.inject(put({ explored: true }))).statusCode).toBe(503);
    explored.configured = false;
    expect((await app!.inject({ method: 'GET', url: `/spots/${id}/explored`, headers: auth() })).statusCode).toBe(503);
  });
  it('rejects malformed ID, query, GET body, wrong content type, extra fields, nonboolean and oversized malformed JSON before state calls', async () => {
    const { spots, explored } = stores(); boot(spots, explored);
    const cases = [
      { method: 'GET' as const, url: '/spots/not-a-uuid/explored', headers: auth() },
      { method: 'GET' as const, url: `/spots/${id}/explored?user_id=${b}`, headers: auth() },
      { method: 'GET' as const, url: `/spots/${id}/explored`, headers: { ...auth(), 'content-type': 'application/json' }, payload: '{}' },
      { ...put({ explored: true }), url: `/spots/${id}/explored?x=1` },
      { ...put({ explored: true }), headers: { ...auth(), 'content-type': 'text/plain' } },
      ...[{ explored: 1 }, { explored: true, userId: b }, {}, { explored: null }, ['true']].map(payload => put(payload)),
      { ...put({ explored: true }), payload: '{' },
      { ...put({ explored: true }), payload: JSON.stringify({ explored: true, padding: 'x'.repeat(2100) }) },
    ];
    for (const entry of cases) {
      const response = await app!.inject(entry);
      expect(response.statusCode, JSON.stringify(entry).slice(0, 200)).toBe(400);
      expect(response.json().error.code).toBe('BAD_REQUEST');
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(explored.get).not.toHaveBeenCalled(); expect(explored.set).not.toHaveBeenCalled();
  });
  it('allows authenticated PUT preflight headers and logs only redacted route metadata', async () => {
    const { spots, explored } = stores(); boot(spots, explored);
    const preflight = await app!.inject({ method: 'OPTIONS', url: `/spots/${id}/explored`, headers: {
      origin: config.frontendOrigin, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'Authorization,Content-Type',
    } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-methods']).toContain('PUT');
    expect(preflight.headers['access-control-allow-origin']).toBe(config.frontendOrigin);
    expect(String(preflight.headers['access-control-allow-headers']).toLowerCase()).toContain('authorization');
    expect(String(preflight.headers['access-control-allow-headers']).toLowerCase()).toContain('content-type');
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const response = await app!.inject({ ...put({ explored: true, privateMarker: 'secret-body' }, 'a'), url: `/spots/${id}/explored?privateQuery=secret-query` });
      expect(response.statusCode).toBe(400);
      const entries = log.mock.calls.map(([line]) => JSON.parse(String(line)));
      expect(entries.at(-1)).toMatchObject({ method: 'PUT', route: '/spots/:id/explored', status: 400 });
      expect(JSON.stringify(entries)).not.toMatch(/secret-body|secret-query|Bearer|sb_secret/);
    } finally { log.mockRestore(); }
  });
});

describe('Supabase explored transport', () => {
  it('normalizes accepted uppercase UUIDs before comparison with PostgreSQL canonical results', async () => {
    const requested = 'ABCDEF12-0000-4000-8000-000000000010';
    const canonical = requested.toLowerCase();
    const fetcher: SupabaseTransport = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname.includes('/rpc/')) {
        expect(JSON.parse(String(init?.body))).toEqual({ p_spot_id: canonical, p_explored: false });
        return Response.json([{ spot_id: canonical, explored: false }]);
      }
      expect(url.searchParams.get('spot_id')).toBe(`eq.${canonical}`);
      return Response.json({ user_id: a, spot_id: canonical, explored: true });
    };
    const store = createExploredStore(config, fetcher);
    expect(await store.get('first', a, requested)).toBe(true);
    expect(await store.set('first', a, requested, false)).toBe(false);
  });
  it('requires publishable configuration regardless of admin credential', async () => {
    for (const key of [undefined, 'sb_secret_test', 'not-a-publishable-key']) {
      const store = createExploredStore({ ...config, supabasePublishableKey: key });
      expect(store.configured).toBe(false);
      await expect(store.get('caller', a, id)).rejects.toThrow();
    }
  });
  it('filters exact caller and spot, sends JWT with publishable key only, uses invoker RPC without identifier update', async () => {
    const calls: Array<{ url: URL; method: string; headers: Headers; body?: unknown; signal?: AbortSignal }> = [];
    const data = new Map<string, boolean>();
    const fetcher: SupabaseTransport = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: init?.method ?? 'GET', headers, body, signal: init?.signal ?? undefined });
      const caller = headers.get('authorization') === 'Bearer first' ? a : b;
      if (url.pathname.endsWith('/spot_explorations')) return new Response(JSON.stringify(data.has(caller) ? { user_id: caller, spot_id: id, explored: data.get(caller) } : null), { headers: { 'Content-Type': 'application/json' } });
      if (url.pathname.endsWith('/rpc/set_spot_explored')) {
        data.set(caller, (body as { p_explored: boolean }).p_explored);
        return new Response(JSON.stringify([{ spot_id: id, explored: data.get(caller) }]), { headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error('unexpected transport');
    };
    const store = createExploredStore(config, fetcher);
    expect(await store.get('first', a, id)).toBe(false);
    expect(await store.set('first', a, id, true)).toBe(true);
    expect(await store.set('first', a, id, true)).toBe(true);
    expect(await store.get('second', b, id)).toBe(false);
    expect(await store.set('second', b, id, false)).toBe(false);
    expect(await store.get('first', a, id)).toBe(true);
    expect(calls.every(call => call.headers.get('apikey') === 'sb_publishable_test' && call.signal instanceof AbortSignal)).toBe(true);
    expect(calls.map(call => call.headers.get('authorization'))).toEqual(['Bearer first', 'Bearer first', 'Bearer first', 'Bearer second', 'Bearer second', 'Bearer first']);
    for (const call of calls.filter(call => call.method === 'GET')) {
      expect(call.url.searchParams.get('user_id')).toBe(`eq.${call.headers.get('authorization') === 'Bearer first' ? a : b}`);
      expect(call.url.searchParams.get('spot_id')).toBe(`eq.${id}`);
      expect(call.url.searchParams.get('select')).toBe('user_id,spot_id,explored');
    }
    for (const call of calls.filter(call => call.method === 'POST')) {
      expect(call.url.pathname).toBe('/rest/v1/rpc/set_spot_explored');
      expect(call.body).toEqual({ p_spot_id: id, p_explored: expect.any(Boolean) });
    }
    expect(calls.some(call => call.method === 'PATCH')).toBe(false);
  });
  it('does not confuse missing table/grant/provider errors or malformed own/RPC rows with successful absence', async () => {
    let mode: 'error' | 'grant' | 'wrongRead' | 'wrongRpc' | 'wrongBoolean' | 'zeroRpc' = 'error';
    const fetcher: SupabaseTransport = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (mode === 'error' || mode === 'grant') return new Response(JSON.stringify({ code: mode === 'error' ? '42P01' : '42501', message: 'private schema error' }),
        { status: mode === 'error' ? 404 : 403, headers: { 'Content-Type': 'application/json' } });
      const isRpc = url.pathname.includes('/rpc/');
      const response = isRpc ? mode === 'zeroRpc' ? [] : [{ spot_id: mode === 'wrongBoolean' ? id : b, explored: mode !== 'wrongBoolean' }]
        : { user_id: b, spot_id: id, explored: false };
      return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
    };
    const store = createExploredStore(config, fetcher);
    await expect(store.get('first', a, id)).rejects.toThrow();
    await expect(store.set('first', a, id, true)).rejects.toThrow();
    mode = 'grant'; await expect(store.get('first', a, id)).rejects.toThrow(); await expect(store.set('first', a, id, true)).rejects.toThrow();
    mode = 'wrongRead'; await expect(store.get('first', a, id)).rejects.toThrow();
    mode = 'wrongRpc'; await expect(store.set('first', a, id, true)).rejects.toThrow();
    mode = 'wrongBoolean'; await expect(store.set('first', a, id, true)).rejects.toThrow();
    mode = 'zeroRpc'; expect(await store.set('first', a, id, true)).toBeNull();
  });
});
