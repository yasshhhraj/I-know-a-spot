import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createProfileProvider, createProfileUpdater, type ProfileProvider, type SupabaseTransport } from '../src/profile.js';

const userA = '00000000-0000-0000-0000-000000000001';
const userB = '00000000-0000-0000-0000-000000000002';
const config = readConfig({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' });
let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

function transport(options: {
  authStatus?: number;
  authBody?: object;
  row?: object | null;
  dbStatus?: number;
  failAt?: 'auth' | 'db';
  delay?: (token: string) => Promise<void>;
} = {}) {
  const calls: Array<{ path: string; token: string; key: string; query: URLSearchParams; timeout: boolean }> = [];
  const fetcher: SupabaseTransport = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const token = headers.get('authorization') ?? '';
    calls.push({ path: url.pathname, token, key: headers.get('apikey') ?? '', query: url.searchParams, timeout: !!init?.signal });
    await options.delay?.(token);
    if (url.pathname === '/auth/v1/user') {
      if (options.failAt === 'auth') throw new Error(`secret provider body ${token}`);
      return new Response(JSON.stringify(options.authBody ?? (options.authStatus ? { message: 'secret upstream token' } : {
        id: token === 'Bearer token-b' ? userB : userA, aud: 'authenticated',
      })), { status: options.authStatus ?? 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/rest/v1/pilot_members') {
      if (options.failAt === 'db') throw new Error(`secret provider body ${token}`);
      const id = token === 'Bearer token-b' ? userB : userA;
      return new Response(JSON.stringify(options.row === undefined ? {
        user_id: id, display_name: 'Caller', enrolled: true, public_radius_km: 5,
      } : options.row), {
        status: options.dbStatus ?? 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('unexpected endpoint');
  };
  return { fetcher, calls };
}

function route(provider: ProfileProvider) { app = createApp(config, provider); return app; }
const request = (url = '/me', authorization = 'Bearer token-a') => ({ method: 'GET' as const, url, headers: { authorization } });

describe('GET /me', () => {
  it.each([undefined, '', 'token-a', 'Basic token-a', 'Bearer', 'Bearer  token-a', 'Bearer\ttoken-a', 'Bearer token-a, Bearer token-b', 'Bearer token-a extra', 'Bearer token-a;other', 'Bearer token=a', 'Bearer token-a\nother'])
    ('rejects malformed or absent Authorization %j before invoking provider', async (header) => {
      const provider = vi.fn<ProfileProvider>();
      route(provider);
      const response = await app!.inject({ method: 'GET', url: '/me', ...(header === undefined ? {} : { headers: { authorization: header } }) });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } });
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(provider).not.toHaveBeenCalled();
    });

  it('uses verified provider identity, ignoring spoofed user query', async () => {
    const provider = vi.fn<ProfileProvider>().mockResolvedValue({ kind: 'ok', profile: { id: userA, displayName: 'Caller', publicRadiusKm: 5 } });
    route(provider);
    const response = await app!.inject(request(`/me?user_id=${userB}&ownerId=${userB}`));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ profile: { id: userA, displayName: 'Caller', publicRadiusKm: 5 } });
    expect(provider).toHaveBeenCalledWith('token-a');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it.each(['bearer token-a', 'bEaReR token-a'])('accepts case-insensitive Bearer scheme %j', async (authorization) => {
    const provider = vi.fn<ProfileProvider>().mockResolvedValue({ kind: 'ok', profile: { id: userA, displayName: 'Caller', publicRadiusKm: 5 } });
    route(provider);
    const response = await app!.inject(request('/me', authorization));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ profile: { id: userA, displayName: 'Caller', publicRadiusKm: 5 } });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(provider).toHaveBeenCalledExactlyOnceWith('token-a');
  });

  it.each([
    ['unauthorized', 401, 'UNAUTHORIZED'], ['not_enrolled', 403, 'NOT_ENROLLED'], ['unavailable', 503, 'SERVICE_UNAVAILABLE'],
  ] as const)('maps %s safely to %i', async (kind, status, code) => {
    route(async () => ({ kind }));
    const response = await app!.inject(request());
    expect(response.statusCode).toBe(status);
    expect(response.json().error.code).toBe(code);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).not.toContain('token-a');
  });

  it('does not leak a thrown provider error into body or logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      route(async () => { throw new Error('secret token-a upstream body'); });
      const response = await app!.inject(request());
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toMatch(/secret|token-a/);
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});

describe('Supabase user-scoped adapter', () => {
  const providerFor = (fetcher: SupabaseTransport) => createProfileProvider(config.supabaseUrl, config.supabasePublishableKey, fetcher);
  it('verifies with Auth and forwards only the caller token to an RLS-scoped profile SELECT', async () => {
    const mock = transport();
    const result = await providerFor(mock.fetcher)('token-a');
    expect(result).toEqual({ kind: 'ok', profile: { id: userA, displayName: 'Caller', publicRadiusKm: 5 } });
    expect(mock.calls.map((call) => call.path)).toEqual(['/auth/v1/user', '/rest/v1/pilot_members']);
    expect(mock.calls.every((call) => call.token === 'Bearer token-a' && call.key === 'sb_publishable_test' && call.timeout)).toBe(true);
    expect(mock.calls[1].query.get('user_id')).toBe(`eq.${userA}`);
    expect(mock.calls[1].query.get('select')).toBe('user_id,display_name,enrolled,public_radius_km');
  });

  it.each([401, 403])('rejects invalid/expired Auth tokens (%i) without a DB lookup', async (authStatus) => {
    const mock = transport({ authStatus });
    expect(await providerFor(mock.fetcher)('expired-token')).toEqual({ kind: 'unauthorized' });
    expect(mock.calls.map((call) => call.path)).toEqual(['/auth/v1/user']);
  });

  it.each([null, { user_id: userA, display_name: 'A', enrolled: false, public_radius_km: 5 }])
    ('denies missing/unenrolled row %j', async (row) => {
      expect(await providerFor(transport({ row }).fetcher)('token-a')).toEqual({ kind: 'not_enrolled' });
    });

  it('does not accept a different user row even if upstream returns one', async () => {
    expect(await providerFor(transport({ row: { user_id: userB, display_name: 'Other', enrolled: true, public_radius_km: 5 } }).fetcher)('token-a'))
      .toEqual({ kind: 'unavailable' });
  });

  it.each([{ authStatus: 503 }, { dbStatus: 404 }, { failAt: 'auth' as const }, { failAt: 'db' as const },
    { row: { user_id: userA, display_name: 'A', enrolled: true, public_radius_km: 30 } }])
    ('treats upstream/schema errors or invalid row as unavailable, not denied: %j', async (options) => {
      expect(await providerFor(transport(options).fetcher)('token-a')).toEqual({ kind: 'unavailable' });
    }, 15000);

  it('returns unavailable when configuration is missing or malformed without transport reads', async () => {
    const fetcher = vi.fn(transport().fetcher);
    expect(await createProfileProvider(undefined, undefined, fetcher)('token-a')).toEqual({ kind: 'unavailable' });
    expect(await createProfileProvider('not a URL', 'sb_publishable_test', fetcher)('token-a')).toEqual({ kind: 'unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
    app = createApp(readConfig({}));
    const response = await app.inject(request());
    expect(response.statusCode).toBe(503);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it.each([undefined, '', 'sb_secret_test', 'sb_publishable_', 'sb_publishable_test ',
    'sb_publishable_test;malformed', 'sb_publishable_😀', 'public-test-key',
    'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
  ])('rejects non-publishable/malformed key %j before client or network calls', async (key) => {
    const fetcher = vi.fn(transport().fetcher);
    const provider = createProfileProvider(config.supabaseUrl, key, fetcher);
    route(provider);
    const response = await app!.inject(request());
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.headers['cache-control']).toBe('private, no-store');
    if (key) expect(response.body).not.toContain(key);
    expect(response.body).not.toContain('token-a');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('isolates simultaneous requests with different user tokens (no shared client mutation)', async () => {
    const mock = transport({ delay: async (token) => { if (token === 'Bearer token-a') await new Promise((resolve) => setTimeout(resolve, 10)); } });
    route(providerFor(mock.fetcher));
    const [a, b] = await Promise.all([app!.inject(request('/me', 'Bearer token-a')), app!.inject(request('/me', 'Bearer token-b'))]);
    expect(a.json().profile.id).toBe(userA);
    expect(b.json().profile.id).toBe(userB);
    const dbCalls = mock.calls.filter((call) => call.path.includes('pilot_members'));
    expect(dbCalls.map((call) => [call.token, call.query.get('user_id')]).sort()).toEqual([
      ['Bearer token-a', `eq.${userA}`], ['Bearer token-b', `eq.${userB}`],
    ]);
  });
});

describe('PATCH /me saved radius', () => {
  const provider = async (token: string) => token === 'unenrolled' ? { kind: 'not_enrolled' as const }
    : token === 'expired' ? { kind: 'unauthorized' as const }
      : { kind: 'ok' as const, profile: { id: userA, displayName: 'Caller', publicRadiusKm: 5 } };
  const updater = vi.fn(async (_token: string, _id: string, radius: number) => ({ kind: 'ok' as const, profile: { id: userA, displayName: 'Caller', publicRadiusKm: radius } }));
  afterEach(() => updater.mockClear());
  const patch = (payload: unknown, authorization = 'Bearer token-a') => ({ method: 'PATCH' as const, url: '/me', headers: { authorization, 'content-type': 'application/json' }, payload });

  it.each([1, 25])('updates %i and responds with the existing private profile shape', async (radius) => {
    app = createApp(config, provider, undefined, updater);
    const response = await app.inject(patch({ publicRadiusKm: radius }));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ profile: { id: userA, displayName: 'Caller', publicRadiusKm: radius } });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(updater).toHaveBeenCalledExactlyOnceWith('token-a', userA, radius);
  });
  it('rejects extra/unknown/missing/noninteger/out-of-range body before writing', async () => {
    app = createApp(config, provider, undefined, updater);
    for (const payload of [{ publicRadiusKm: 5, userId: userB }, { radius: 5 }, {}, { publicRadiusKm: 0 },
      { publicRadiusKm: 26 }, { publicRadiusKm: 5.5 }, { publicRadiusKm: '5' }, { publicRadiusKm: null }, []]) {
      const response = await app.inject(patch(payload));
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('BAD_REQUEST');
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    const malformed = await app.inject({ ...patch('{}'), payload: '{bad' });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('BAD_REQUEST');
    const unsupported = await app.inject({ method: 'PATCH', url: '/me', headers: { authorization: 'Bearer token-a', 'content-type': 'application/octet-stream' }, payload: Buffer.from('not JSON') });
    expect(unsupported.statusCode).toBe(400);
    expect(unsupported.json().error.code).toBe('BAD_REQUEST');
    expect(updater).not.toHaveBeenCalled();
  });
  it('requires enrollment before updating and fails safely on provider/schema error', async () => {
    app = createApp(config, provider, undefined, updater);
    for (const [authorization, status] of [['Bearer unenrolled', 403], ['Bearer expired', 401], ['', 401]] as const) {
      const response = await app.inject(patch({ publicRadiusKm: 10 }, authorization));
      expect(response.statusCode).toBe(status);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(updater).not.toHaveBeenCalled();
    updater.mockRejectedValueOnce(new Error('private provider error'));
    const response = await app.inject(patch({ publicRadiusKm: 10 }));
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body).not.toContain('private provider');
  });

  it('uses fresh publishable caller-JWT clients, updates only own radius, and rejects zero/mismatched/error rows', async () => {
    const calls: Array<{ path: string; method: string; token: string; key: string; query: URLSearchParams; body: unknown }> = [];
    let row: object | null = { user_id: userA, display_name: 'Caller', enrolled: true, public_radius_km: 10 };
    let status = 200;
    const fetcher: SupabaseTransport = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const headers = new Headers(init?.headers);
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', token: headers.get('authorization') ?? '', key: headers.get('apikey') ?? '', query: url.searchParams, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(status === 200 ? row : { message: 'private error' }), { status, headers: { 'Content-Type': 'application/json' } });
    };
    const update = createProfileUpdater(config.supabaseUrl, config.supabasePublishableKey, fetcher);
    expect(await update('token-a', userA, 10)).toEqual({ kind: 'ok', profile: { id: userA, displayName: 'Caller', publicRadiusKm: 10 } });
    expect(calls[0]).toMatchObject({ path: '/rest/v1/pilot_members', method: 'PATCH', token: 'Bearer token-a', key: 'sb_publishable_test', body: { public_radius_km: 10 } });
    expect(calls[0].query.get('user_id')).toBe(`eq.${userA}`);
    expect(calls[0].query.get('enrolled')).toBe('eq.true');
    expect(calls[0].query.get('select')).toBe('user_id,display_name,enrolled,public_radius_km');
    row = null;
    expect(await update('token-a', userA, 10)).toEqual({ kind: 'unavailable' });
    row = { user_id: userB, display_name: 'Other', enrolled: true, public_radius_km: 10 };
    expect(await update('token-a', userA, 10)).toEqual({ kind: 'unavailable' });
    status = 503;
    expect(await update('token-a', userA, 10)).toEqual({ kind: 'unavailable' });
    expect(await createProfileUpdater(undefined, undefined, fetcher)('token-a', userA, 10)).toEqual({ kind: 'unavailable' });
    expect(calls).toHaveLength(4);
  });
});
