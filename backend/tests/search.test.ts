import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createLocalEncoder, MODEL_IDENTITY, validVector, type TextEncoder } from '../src/encoder.js';
import { createSearchService, RELEVANCE_THRESHOLD, SearchDeadline } from '../src/search.js';
import type { SpotRow, SpotStore } from '../src/spots.js';

const a = '00000000-0000-4000-8000-000000000001';
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const config = readConfig({});
const auth = (token = 'ok') => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
const row = (i: number, changes: Partial<SpotRow> = {}): SpotRow => ({ id: id(i), owner_id: a, author_name: 'Contributor', title: `Door ${i}`, note: 'Carved stone',
  audience: 'connections', latitude: 0, longitude: 0, access_confirmed: true, access_note: '',
  created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-07T00:00:00Z', removed_at: null, ...changes });
const unit = (index = 0) => { const v = new Float64Array(384); v[index] = 1; return v; };
const encoder = (impl: (text: string) => Promise<Float64Array> = async () => unit()) => ({ encode: vi.fn(impl), dispose: vi.fn(async () => {}) });
const store = (list: (token: string, caller: string, options: unknown) => Promise<SpotRow[]> = async () => [row(1)]) => ({
  configured: true, list: vi.fn(list), get: vi.fn(async () => row(1)), photo: vi.fn(async () => new Uint8Array()),
  create: vi.fn(async () => row(1)), update: vi.fn(async () => row(1)), remove: vi.fn(async () => 'deleted' as const),
});
const profile = async (token: string) => token === 'denied' ? { kind: 'not_enrolled' as const } :
  token === 'expired' ? { kind: 'unauthorized' as const } : token === 'outage' ? { kind: 'unavailable' as const } :
  { kind: 'ok' as const, profile: { id: a, displayName: 'Member', publicRadiusKm: 5 } };
let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });
function boot(rows = store(), model = encoder()) {
  const service = createSearchService(model);
  app = createApp(config, profile, rows as SpotStore, undefined, service);
  return { rows, model, service };
}
function search(body: unknown = { query: 'stonework', feed: 'connections' }, token = 'ok', url = '/spots/search') {
  return app!.inject({ method: 'POST', url, headers: auth(token), payload: body });
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

describe('authenticated semantic search', () => {
  it('denies signed-out, unenrolled, expired and provider-outage callers before any listing or inference', async () => {
    const { rows, model } = boot();
    for (const [token, status, code] of [['denied', 403, 'NOT_ENROLLED'], ['expired', 401, 'UNAUTHORIZED'], ['outage', 503, 'SERVICE_UNAVAILABLE']] as const) {
      const res = await search(undefined, token);
      expect(res.statusCode).toBe(status); expect(res.json().error.code).toBe(code);
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
    expect((await app!.inject({ method: 'POST', url: '/spots/search', payload: '{}' })).statusCode).toBe(401);
    expect(rows.list).not.toHaveBeenCalled(); expect(model.encode).not.toHaveBeenCalled();
  });

  it('validates strict JSON, 2 KiB size, content-type, URL, Unicode length, feed and coordinates', async () => {
    const { rows, model } = boot();
    for (const payload of [null, [], {}, { query: 1, feed: 'connections' }, { query: 'x', feed: 'other' },
      { query: 'x', feed: 'connections', centerLat: 0 }, { query: 'x', feed: 'public', centerLat: '0', centerLon: 0 },
      { query: 'x', feed: 'public', centerLat: 0, centerLon: 181 }, { query: 'x', feed: 'public', centerLat: 0, centerLon: 0, radiusKm: 25 },
      { query: '😀'.repeat(201), feed: 'connections' }]) {
      const res = await search(payload); expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error.code).toBe('BAD_REQUEST'); expect(res.headers['cache-control']).toBe('private, no-store');
    }
    for (const bad of [
      { headers: auth(), payload: '{oops' },
      { headers: auth(), payload: `{"query":"${'x'.repeat(2100)}","feed":"connections"}` },
      { headers: { ...auth(), 'content-type': 'text/plain' }, payload: 'stone' },
      { headers: { ...auth(), 'content-type': 'application/x-www-form-urlencoded' }, payload: 'query=stone' },
    ]) {
      const res = await app!.inject({ method: 'POST', url: '/spots/search', ...bad });
      expect(res.statusCode).toBe(400); expect(res.json().error.code).toBe('BAD_REQUEST');
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
    expect((await search({ query: 'x', feed: 'connections' }, 'ok', '/spots/search?query=secret')).statusCode).toBe(400);
    expect(rows.list).not.toHaveBeenCalled(); expect(model.encode).not.toHaveBeenCalled();
  });

  it('browses without model, and distinguishes no candidates from no matches', async () => {
    const rows = store(async () => [row(1)]); const model = encoder(); boot(rows, model);
    const browse = await search({ query: ' \n ', feed: 'connections' });
    expect(browse.json()).toMatchObject({ mode: 'browse', candidateLimit: 50, spots: [{ id: id(1) }] });
    expect(browse.json()).not.toHaveProperty('emptyReason'); expect(model.encode).not.toHaveBeenCalled();
    rows.list.mockResolvedValue([]);
    expect((await search()).json()).toEqual({ mode: 'semantic', spots: [], candidateLimit: 50, emptyReason: 'no_candidates' });
    expect((await search({ query: '', feed: 'connections' })).json()).toEqual({ mode: 'browse', spots: [], candidateLimit: 50, emptyReason: 'no_candidates' });
    expect(model.encode).not.toHaveBeenCalled();
    rows.list.mockResolvedValue([row(1)]); model.encode.mockImplementation(async text => text === 'stonework' ? unit(1) : unit(0));
    expect((await search()).json()).toEqual({ mode: 'semantic', spots: [], candidateLimit: 50, emptyReason: 'no_matches' });
  });

  it('filters Public audience/removal/radius before model, preserves distance and deterministic top three, with no scores', async () => {
    const cases = [row(1, { audience: 'public', distance_km: 5 }), row(2, { audience: 'public', distance_km: 5.01 }),
      row(3, { audience: 'connections', distance_km: 1 }), row(4, { audience: 'public', distance_km: 0, removed_at: 'now' }),
      row(5, { audience: 'public', distance_km: 0 })];
    const rows = store(async () => cases); const model = encoder(); boot(rows, model);
    const response = await search({ query: '  textured   ', feed: 'public', centerLat: 0, centerLon: 0 });
    expect(response.statusCode).toBe(200);
    expect(response.json().spots.map((s: { id: string }) => s.id)).toEqual([id(1), id(5)]);
    expect(response.json().spots[0].distanceKm).toBe(5);
    expect(response.body).not.toMatch(/score|confidence|photo_path/);
    expect(model.encode.mock.calls.map(([text]) => text)).toEqual(['textured', 'Door 1\nCarved stone', 'Door 5\nCarved stone']);
    expect(rows.list).toHaveBeenNthCalledWith(1, 'ok', a, { feed: 'public', centerLat: 0, centerLon: 0 });
    expect(rows.list).toHaveBeenCalledTimes(2);
  });

  it('uses exact current text and fresh eligible listing for edit, removal, audience flip and radius changes', async () => {
    let current = [row(1, { audience: 'public', distance_km: 2 }), row(2, { audience: 'public', distance_km: 2 }), row(3, { audience: 'public', distance_km: 2 }), row(4, { audience: 'public', distance_km: 2 })];
    const rows = store(async () => current);
    const model = encoder(async text => {
      if (text === 'Door 4\nCarved stone') current = [row(1, { audience: 'public', distance_km: 2, note: 'Edited' }),
        row(2, { audience: 'connections', distance_km: 2 }), row(3, { audience: 'public', distance_km: 2, removed_at: 'now' }),
        row(4, { audience: 'public', distance_km: 6 })];
      return unit();
    }); boot(rows, model);
    const response = await search({ query: 'texture', feed: 'public', centerLat: 0, centerLon: 0 });
    expect(response.json()).toEqual({ mode: 'semantic', spots: [], candidateLimit: 50, emptyReason: 'no_matches' });
    expect(rows.list).toHaveBeenCalledTimes(2);
  });

  it('fails closed on final revalidation outage rather than returning ranked stale spots', async () => {
    let call = 0; const rows = store(async () => { if (++call === 2) throw new Error('private upstream payload'); return [row(1)]; });
    const { model } = boot(rows);
    const response = await search();
    expect(response.statusCode).toBe(503); expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body).not.toContain('private'); expect(model.encode).toHaveBeenCalledTimes(2);
  });

  it('returns busy with no queued inference and holds the permit after inference timeout until native work settles', async () => {
    const waiting = deferred<Float64Array>();
    const rows = store(); const model = encoder(async () => waiting.promise);
    const service = createSearchService(model, { inferenceMs: 12 });
    app = createApp(config, profile, rows as SpotStore, undefined, service);
    const first = search();
    await vi.waitFor(() => expect(model.encode).toHaveBeenCalledTimes(1));
    expect((await search()).json().error.code).toBe('SEARCH_BUSY');
    const timeout = await first;
    expect(timeout.statusCode).toBe(503); expect(timeout.json().error.code).toBe('SEARCH_UNAVAILABLE');
    expect((await search()).json().error.code).toBe('SEARCH_BUSY');
    waiting.resolve(unit());
    await Promise.resolve();
    // No second batch or late cache entry from a timed-out native query.
    expect(model.encode).toHaveBeenCalledTimes(1);
    expect((await search()).statusCode).toBe(200);
  });

  it('invalidates successful/uncertain owner edits and pending removal, including in-flight vectors', async () => {
    let current = row(1); const waiting = deferred<Float64Array>(); let started = false;
    const rows = store(async () => [current]);
    rows.update.mockImplementation(async () => { current = row(1, { note: 'New note' }); return current; });
    rows.remove.mockImplementation(async () => { current = row(1, { removed_at: 'now' }); throw new Error('cleanup pending'); });
    const model = encoder(async text => {
      if (text === 'Door 1\nCarved stone' && !started) { started = true; return waiting.promise; }
      return unit();
    }); boot(rows, model);
    const first = search(); await vi.waitFor(() => expect(started).toBe(true));
    const edit = await app!.inject({ method: 'PATCH', url: `/spots/${id(1)}`, headers: auth(), payload: {
      title: 'Door 1', note: 'New note', audience: 'connections', latitude: 0, longitude: 0, accessConfirmed: true, accessNote: '',
    } });
    expect(edit.statusCode).toBe(200);
    waiting.resolve(unit());
    expect((await first).json()).toMatchObject({ spots: [], emptyReason: 'no_matches' });
    const next = await search(); expect(next.json().spots[0].note).toBe('New note');
    expect(model.encode.mock.calls.map(([text]) => text)).toContain('Door 1\nNew note');
    const remove = await app!.inject({ method: 'DELETE', url: `/spots/${id(1)}`, headers: { authorization: 'Bearer ok' } });
    expect(remove.statusCode).toBe(503);
    expect((await search()).json().emptyReason).toBe('no_candidates');
  });

  it('keeps a bounded idle-TTL vector cache keyed by exact normalized text and model/preprocessing identity', async () => {
    expect(MODEL_IDENTITY).toMatch(/q8:cpu:mean-normalized:256:trim-v1/);
    expect(RELEVANCE_THRESHOLD).toBe(0.35);
    let time = 0; let current = [row(1)]; const rows = store(async () => current);
    const model = encoder(); const service = createSearchService(model, { now: () => time });
    const run = () => service.search(rows as SpotStore, 'ok', a, { feed: 'connections' }, 'query', new SearchDeadline(), 5);
    await run(); await run(); expect(model.encode).toHaveBeenCalledTimes(3); // query each time, description once
    current = [row(1, { title: ' Door 1 ' })]; await run(); expect(model.encode).toHaveBeenCalledTimes(4); // normalized cache hit
    current = [row(1, { note: 'Different' })]; await run(); expect(model.encode).toHaveBeenCalledTimes(6);
    time = 300_000; await run(); expect(model.encode).toHaveBeenCalledTimes(8);
    service.invalidate(id(1)); await run(); expect(model.encode).toHaveBeenCalledTimes(10);
    current = Array.from({ length: 50 }, (_, i) => row(i + 1)); await run();
    current = Array.from({ length: 50 }, (_, i) => row(i + 51)); await run();
    current = [row(101)]; await run();
    const previousCount = model.encode.mock.calls.filter(([text]) => text === 'Door 1\nCarved stone').length;
    current = [row(1)]; await run();
    expect(model.encode.mock.calls.filter(([text]) => text === 'Door 1\nCarved stone')).toHaveLength(previousCount + 1);
    await service.dispose();
  });

  it('holds the single semantic permit while the first provider list is outstanding; overall deadline skips late inference', async () => {
    const pending = deferred<SpotRow[]>();
    const rows = store(async () => pending.promise); const model = encoder();
    const service = createSearchService(model);
    const first = service.search(rows as SpotStore, 'ok', a, { feed: 'connections' }, 'stone', new SearchDeadline(15), 5);
    await vi.waitFor(() => expect(rows.list).toHaveBeenCalledTimes(1));
    await expect(service.search(rows as SpotStore, 'ok', a, { feed: 'connections' }, 'stone', new SearchDeadline(), 5))
      .rejects.toMatchObject({ code: 'SEARCH_BUSY' });
    await expect(first).rejects.toMatchObject({ code: 'SEARCH_UNAVAILABLE' });
    pending.resolve([row(1)]);
    await Promise.resolve();
    expect(model.encode).not.toHaveBeenCalled();
    await service.dispose();
  });

  it('retains capacity across an overall timeout while native inference is still unresolved', async () => {
    const pending = deferred<Float64Array>();
    const rows = store(); const model = encoder(async () => pending.promise);
    const service = createSearchService(model, { inferenceMs: 1000 });
    const first = service.search(rows as SpotStore, 'ok', a, { feed: 'connections' }, 'query', new SearchDeadline(15), 5)
      .then(() => null, error => error as Error);
    await vi.waitFor(() => expect(model.encode).toHaveBeenCalledTimes(1));
    expect(await first).toMatchObject({ code: 'SEARCH_UNAVAILABLE' });
    await expect(service.search(rows as SpotStore, 'ok', a, { feed: 'connections' }, 'next', new SearchDeadline(), 5))
      .rejects.toMatchObject({ code: 'SEARCH_BUSY' });
    pending.resolve(unit());
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(model.encode).toHaveBeenCalledTimes(1);
    const next = await service.search(rows as SpotStore, 'ok', a, { feed: 'connections' }, 'next', new SearchDeadline(), 5);
    expect(next.spots).toHaveLength(1);
    await service.dispose();
  });

  it('caps successful semantic results at three and excludes geodesically outside Public rows even if RPC distance lies', async () => {
    const rows = store(async () => [row(1, { audience: 'public', latitude: 5 / 6371 * 180 / Math.PI, distance_km: 5 }),
      row(2, { audience: 'public', latitude: 10, distance_km: 0 }),
      row(3, { audience: 'public', distance_km: 1 }), row(4, { audience: 'public', distance_km: 1 }),
      row(5, { audience: 'public', distance_km: 1 })]);
    const model = encoder(); boot(rows, model);
    const response = await search({ query: '😀'.repeat(200), feed: 'public', centerLat: 0, centerLon: 0 });
    expect(response.statusCode).toBe(200);
    const returned = response.json().spots.map((spot: { id: string }) => spot.id);
    expect(returned).toHaveLength(3);
    expect(returned).not.toContain(id(2));
    expect(model.encode.mock.calls.map(([text]) => text)).not.toContain('Door 2\nCarved stone');
  });

  it('rejects invalid embeddings and missing/wrong-model artifacts while browse and health stay usable', async () => {
    expect(validVector(new Float64Array(384))).toBe(false);
    expect(validVector(unit())).toBe(true);
    const bad = encoder(async () => new Float64Array(384)); boot(store(), bad);
    expect((await search()).json().error.code).toBe('SEARCH_UNAVAILABLE');
    expect((await search({ query: '', feed: 'connections' })).statusCode).toBe(200);
    expect((await app!.inject({ method: 'GET', url: '/health' })).json()).toEqual({ status: 'scaffold' });
    const missing = createLocalEncoder({ modelId: 'wrong', modelCacheDir: '/missing-model-cache' });
    await expect(missing.encode('synthetic')).rejects.toThrow();
    await missing.dispose();
    await app!.close();
    app = createApp(config, profile, store() as SpotStore, undefined,
      createSearchService(createLocalEncoder({ modelCacheDir: '/missing-model-cache' })));
    const unavailable = await search();
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error.code).toBe('SEARCH_UNAVAILABLE');
    expect((await search({ query: '', feed: 'connections' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ status: 'scaffold' });
  });

  it('does not cache a failed candidate embedding and retries it on the next search', async () => {
    let failed = false;
    const model = encoder(async text => {
      if (text === 'Door 1\nCarved stone' && !failed) { failed = true; throw new Error('raw private failure'); }
      return unit();
    });
    boot(store(), model);
    expect((await search()).json().error.code).toBe('SEARCH_UNAVAILABLE');
    const retry = await search();
    expect(retry.statusCode).toBe(200);
    expect(retry.json().spots[0].id).toBe(id(1));
    expect(model.encode.mock.calls.filter(([text]) => text === 'Door 1\nCarved stone')).toHaveLength(2);
  });

  it('never logs query, title, note, coordinates or raw encoder error', async () => {
    const secret = 'private member description'; const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      boot(store(async () => [row(1, { title: secret, note: secret, audience: 'public', latitude: 12.345, longitude: 43.21, distance_km: 0 })]), encoder(async () => { throw new Error(secret); }));
      const response = await search({ query: secret, feed: 'public', centerLat: 12.345, centerLon: 43.21 });
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain(secret);
      const records = JSON.stringify(log.mock.calls);
      for (const value of [secret, '12.345', '43.21', 'Bearer']) expect(records).not.toContain(value);
    } finally { log.mockRestore(); }
  });
});
