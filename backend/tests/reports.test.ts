import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import type { ProfileProvider, SupabaseTransport } from '../src/profile.js';
import { createReportStore, type ReportStore } from '../src/reports.js';
import type { SearchService } from '../src/search.js';
import type { SpotRow, SpotStore } from '../src/spots.js';

const id = 'ABCDEF12-0000-4000-8000-000000000010';
const config = readConfig({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test' });
const row = { id: id.toLowerCase(), owner_id: '00000000-0000-4000-8000-000000000001', audience: 'public', removed_at: null } as SpotRow;
const profile: ProfileProvider = async token => token === 'expired' ? { kind: 'unauthorized' } : token === 'unenrolled' ? { kind: 'not_enrolled' } :
  { kind: 'ok', profile: { id: row.owner_id, displayName: 'Pilot', publicRadiusKm: 1 } };
const search = { dispose: vi.fn(async () => {}), invalidate: vi.fn() } as unknown as SearchService;
let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });
function boot() {
  const spots = { get: vi.fn(async () => row) } as unknown as SpotStore & { get: ReturnType<typeof vi.fn> };
  const reports = { configured: true, submit: vi.fn(async () => true) } as ReportStore & { submit: ReturnType<typeof vi.fn> };
  app = createApp(config, profile, spots, async () => ({ kind: 'unavailable' }), search,
    { configured: false, get: vi.fn(), set: vi.fn() }, reports);
  return { spots, reports };
}
const request = (reason: unknown = 'private_property', token = 'first') => ({ method: 'POST' as const, url: `/spots/${id}/reports`,
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, payload: { reason } });

describe('private reporting route', () => {
  it('acknowledges identical submissions without exposing report data; forwards caller token and rechecks access', async () => {
    const { spots, reports } = boot();
    for (const token of ['first', 'second', 'first']) {
      const response = await app!.inject(request('private_property', token));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ report: { spotId: id, reason: 'private_property', accepted: true } });
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(reports.submit).toHaveBeenCalledWith('second', id, 'private_property');
    expect(spots.get).toHaveBeenCalledTimes(6);
    expect(spots.get.mock.calls.every(([token, spotId]) => ['first', 'second'].includes(token) && spotId === id)).toBe(true);
  });
  it('fails auth before malformed JSON and never touches a store for signed-out, expired or unenrolled identities', async () => {
    const { spots, reports } = boot();
    for (const token of [undefined, 'expired', 'unenrolled']) {
      const response = await app!.inject({ method: 'POST', url: `/spots/${id}/reports`,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, payload: token ? { reason: 'inaccurate' } : '{' });
      expect(response.statusCode).toBe(token === 'unenrolled' ? 403 : 401);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(spots.get).not.toHaveBeenCalled(); expect(reports.submit).not.toHaveBeenCalled();
  });
  it('rejects IDs, query, unknown reason/fields, wrong type, malformed and oversized JSON', async () => {
    const { spots, reports } = boot();
    const cases = [
      { ...request(), url: '/spots/bad/reports' }, { ...request(), url: `/spots/${id}/reports?x=1` },
      { ...request(), headers: { authorization: 'Bearer first', 'content-type': 'text/plain' } },
      ...['wrong', '', null, 1].map(reason => request(reason)),
      { ...request(), payload: { reason: 'private_property', ownerId: row.owner_id } },
      { ...request(), payload: '{' },
      { ...request(), payload: JSON.stringify({ reason: 'inaccurate', padding: 'a'.repeat(2100) }) },
    ];
    for (const entry of cases) {
      const response = await app!.inject(entry);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('BAD_REQUEST');
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(spots.get).not.toHaveBeenCalled(); expect(reports.submit).not.toHaveBeenCalled();
  });
  it('neutralizes inaccessible, removed, revoked, zero rows even on RPC failure; otherwise provider errors are safe 503', async () => {
    const { spots, reports } = boot();
    for (const unavailable of [null, { ...row, removed_at: '2026-10-08T01:00:00Z' }]) {
      spots.get.mockResolvedValueOnce(unavailable);
      expect((await app!.inject(request())).statusCode).toBe(404);
    }
    expect(reports.submit).not.toHaveBeenCalled();
    spots.get.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    expect((await app!.inject(request())).statusCode).toBe(404);
    reports.submit.mockResolvedValueOnce(null);
    expect((await app!.inject(request())).statusCode).toBe(404);
    reports.submit.mockRejectedValueOnce(new Error('private upstream credential'));
    spots.get.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    expect((await app!.inject(request())).statusCode).toBe(404);
    reports.submit.mockRejectedValueOnce(new Error('private upstream credential'));
    const failure = await app!.inject(request());
    expect(failure.statusCode).toBe(503); expect(failure.body).not.toContain('private upstream');
    expect(spots.get).toHaveBeenCalledTimes(10);
  });
  it('does not treat malformed success or initial/final provider failures as accepted', async () => {
    const { spots, reports } = boot();
    reports.submit.mockResolvedValueOnce(undefined);
    expect((await app!.inject(request())).statusCode).toBe(503);
    spots.get.mockRejectedValueOnce(new Error('secret'));
    expect((await app!.inject(request())).statusCode).toBe(503);
    spots.get.mockResolvedValueOnce(row).mockRejectedValueOnce(new Error('secret'));
    expect((await app!.inject(request())).statusCode).toBe(503);
  });
  it('allows JSON authorization preflight while response logging never includes report reason, query or credentials', async () => {
    boot();
    const preflight = await app!.inject({ method: 'OPTIONS', url: `/spots/${id}/reports`, headers: {
      origin: config.frontendOrigin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'Authorization,Content-Type',
    } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(config.frontendOrigin);
    expect(String(preflight.headers['access-control-allow-headers']).toLowerCase()).toContain('authorization');
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const response = await app!.inject({ ...request('sensitive_location', 'private-token'), url: `/spots/${id}/reports?privateQuery=secret` });
      expect(response.statusCode).toBe(400);
      expect(log.mock.calls.map(([line]) => JSON.parse(String(line))).at(-1)).toMatchObject({
        route: '/spots/:id/reports', method: 'POST', status: 400,
      });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/sensitive_location|privateQuery|private-token|sb_secret/);
    } finally { log.mockRestore(); }
  });
});

describe('report RPC adapter', () => {
  it('uses only fresh publishable/JWT RPC, lowercase UUID and bounded transport, never report tables/admin', async () => {
    const calls: Array<{ url: URL; headers: Headers; body: unknown; signal: unknown }> = [];
    const transport: SupabaseTransport = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      calls.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)), signal: init?.signal });
      return Response.json([{ spot_id: id.toLowerCase(), reason: 'inaccurate' }]);
    };
    const store = createReportStore(config, transport);
    expect(await store.submit('first', id, 'inaccurate')).toBe(true);
    expect(await store.submit('second', id, 'inaccurate')).toBe(true);
    expect(calls.map(call => call.headers.get('authorization'))).toEqual(['Bearer first', 'Bearer second']);
    for (const call of calls) {
      expect(call.url.pathname).toBe('/rest/v1/rpc/submit_spot_report');
      expect(call.headers.get('apikey')).toBe('sb_publishable_test');
      expect(call.body).toEqual({ p_spot_id: id.toLowerCase(), p_reason: 'inaccurate' });
      expect(call.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it('rejects missing configuration, provider errors and any malformed/extra/multiple RPC data; [] means inaccessible', async () => {
    const unavailable = createReportStore({ ...config, supabasePublishableKey: 'sb_secret_test' });
    expect(unavailable.configured).toBe(false);
    await expect(unavailable.submit('first', id, 'inaccurate')).rejects.toThrow();
    for (const payload of [[{ spot_id: id.toLowerCase(), reason: 'inaccurate', reporter_id: 'leak' }],
      [{ spot_id: id, reason: 'inaccurate' }], [{ spot_id: id.toLowerCase(), reason: 'wrong' }],
      [{ spot_id: id.toLowerCase(), reason: 'inaccurate' }, { spot_id: id.toLowerCase(), reason: 'inaccurate' }], null]) {
      const store = createReportStore(config, async () => Response.json(payload));
      await expect(store.submit('first', id, 'inaccurate')).rejects.toThrow();
    }
    expect(await createReportStore(config, async () => Response.json([])).submit('first', id, 'inaccurate')).toBeNull();
    await expect(createReportStore(config, async () => new Response(JSON.stringify({ message: 'schema private' }), { status: 404,
      headers: { 'content-type': 'application/json' } })).submit('first', id, 'inaccurate')).rejects.toThrow();
  });
});
