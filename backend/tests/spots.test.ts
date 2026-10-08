import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { cleanPhoto, createSpotStore, photoPath, SpotFailure, validAdminKey, validateSpotInput, type SpotRow, type SpotStore } from '../src/spots.js';
import type { SupabaseTransport } from '../src/profile.js';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const c = '00000000-0000-4000-8000-000000000003';
const id = '00000000-0000-4000-8000-000000000010';
const cfg = readConfig({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test' });
const input = { title: 'A place', note: 'A carved wall', audience: 'connections', latitude: 0, longitude: 0, accessConfirmed: true, accessNote: '' } as const;
const row = (override: Partial<SpotRow> = {}): SpotRow => ({ id, owner_id: a, author_name: 'Verified name', title: input.title, note: input.note, audience: 'connections', latitude: 0, longitude: 0, access_confirmed: true, access_note: '', created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-07T00:00:00Z', removed_at: null, ...override });
let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });
const profile = async (token: string) => token === 'denied' ? { kind: 'not_enrolled' as const } : token === 'expired' ? { kind: 'unauthorized' as const } : { kind: 'ok' as const, profile: { id: token === 'b' ? b : token === 'c' ? c : a, displayName: 'Verified name', publicRadiusKm: 5 } };
const auth = (token = 'a') => ({ authorization: `Bearer ${token}` });
const fake = () => ({ configured: true, list: vi.fn(async () => [row()]), get: vi.fn(async () => row()), photo: vi.fn(async () => new Uint8Array([1, 2, 3])), create: vi.fn(async () => row()), update: vi.fn(async () => row()), remove: vi.fn(async () => 'deleted' as const) });
const boot = (store: SpotStore) => { app = createApp(cfg, profile, store); return app; };
function multipart(data: unknown = input, photo: Buffer = Buffer.from('photo'), mime = 'image/jpeg') {
  const boundary = 'test-spot-boundary';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="sample.jpg"\r\nContent-Type: ${mime}\r\n\r\n`), photo, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { ...auth(), 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('spot routes', () => {
  it('requires verified enrollment before all reads and writes', async () => {
    const store = fake(); boot(store);
    for (const [method, url] of [['GET', '/spots'], ['POST', '/spots'], ['GET', `/spots/${id}`],
      ['GET', `/spots/${id}/photo`], ['PATCH', `/spots/${id}`], ['DELETE', `/spots/${id}`]] as const)
      for (const token of [undefined, 'denied', 'expired']) {
      const response = await app!.inject({ method, url, ...(token ? { headers: auth(token) } : {}) });
      expect(response.statusCode).toBe(token === 'denied' ? 403 : 401);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    for (const operation of [store.list, store.get, store.photo, store.create, store.update, store.remove])
      expect(operation).not.toHaveBeenCalled();
  });
  it('logs safe response metadata without credentials or query strings', async () => {
    const store = fake(); boot(store);
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const response = await app!.inject({ method: 'GET', url: '/spots?token=should-not-log', headers: auth() });
      expect(response.statusCode).toBe(200);
      const entries = log.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
      const entry = entries.at(-1)!;
      expect(entry).toMatchObject({ event: 'api_response', method: 'GET', route: '/spots', status: 200 });
      expect(String(entry.route)).not.toContain('token');
      expect(JSON.stringify(entry)).not.toContain('Bearer');
      expect(JSON.stringify(entry)).not.toContain('should-not-log');
    } finally { log.mockRestore(); }
  });
  it('returns relative photo URLs and no storage keys; uses caller token for reads', async () => {
    const store = fake(); boot(store);
    const list = await app!.inject({ method: 'GET', url: '/spots', headers: auth('b') });
    expect(list.statusCode).toBe(200);
    expect(store.list).toHaveBeenCalledExactlyOnceWith('b', b);
    expect(list.json().spots[0]).toMatchObject({ photoUrl: `/spots/${id}/photo`, ownerId: a, authorName: 'Verified name' });
    expect(list.body).not.toContain('photo_path');
    const detail = await app!.inject({ method: 'GET', url: `/spots/${id}`, headers: auth('c') });
    expect(detail.statusCode).toBe(200); expect(store.get).toHaveBeenCalledWith('c', id);
  });
  it('returns neutral 404 for inaccessible or removed details and photos', async () => {
    const store = fake(); store.get.mockResolvedValueOnce(null as never).mockResolvedValueOnce(row({ removed_at: '2026-10-07T01:00:00Z' }) as never);
    boot(store);
    expect((await app!.inject({ method: 'GET', url: `/spots/${id}`, headers: auth('c') })).json().error.code).toBe('NOT_FOUND');
    expect((await app!.inject({ method: 'GET', url: `/spots/${id}/photo`, headers: auth('c') })).statusCode).toBe(404);
    expect(store.photo).not.toHaveBeenCalled();
  });
  it('fetches protected media only after rechecking visibility and sets private headers', async () => {
    const store = fake(); boot(store);
    const response = await app!.inject({ method: 'GET', url: `/spots/${id}/photo`, headers: auth('b') });
    expect(response.statusCode).toBe(200); expect(response.headers['content-type']).toBe('image/webp');
    expect(response.headers['x-content-type-options']).toBe('nosniff'); expect(response.headers['cache-control']).toBe('private, no-store');
    expect(store.get).toHaveBeenCalledWith('b', id); expect(store.photo).toHaveBeenCalledWith('b', a, id);
  });
  it('validates full metadata and rejects owner/path/id spoofing before mutation', async () => {
    const store = fake(); boot(store);
    for (const extra of [{ ownerId: b }, { id }, { photo_path: 'bucket/path' }, { accessConfirmed: false }, { latitude: 91 }, { note: '' }, { audience: 'other' }]) {
      const response = await app!.inject({ method: 'PATCH', url: `/spots/${id}`, headers: { ...auth(), 'content-type': 'application/json' }, payload: { ...input, ...extra } });
      expect(response.statusCode).toBe(400);
    }
    expect(store.update).not.toHaveBeenCalled();
    expect(validateSpotInput({ ...input, longitude: Infinity })).toBeUndefined();
    expect(validateSpotInput({ ...input, accessNote: 'x'.repeat(201) })).toBeUndefined();
    expect(validateSpotInput(input)).toEqual(input);
  });
  it('passes verified owner and snapshot name to creation, and rejects bad photos', async () => {
    const store = fake(); boot(store);
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ee9900' } }).jpeg().toBuffer();
    const valid = multipart(input, jpeg);
    const response = await app!.inject({ method: 'POST', url: '/spots', headers: valid.headers, payload: valid.payload });
    expect(response.statusCode).toBe(201);
    expect(store.create).toHaveBeenCalledWith(a, 'Verified name', input, expect.any(Buffer));
    expect((await sharp(store.create.mock.calls[0][3]).metadata()).format).toBe('webp');
    for (const [photo, mime, expected] of [[jpeg, 'image/png', 415], [Buffer.from('<svg/>'), 'image/svg+xml', 415], [Buffer.alloc(10 * 1024 * 1024 + 1), 'image/jpeg', 413]] as const) {
      const request = multipart(input, photo, mime);
      expect((await app!.inject({ method: 'POST', url: '/spots', headers: request.headers, payload: request.payload })).statusCode).toBe(expected);
    }
    expect(store.create).toHaveBeenCalledTimes(1);
  });
  it('accepts file-before-data and rejects duplicate/unknown multipart fields without a write', async () => {
    const store = fake(); boot(store);
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#eeeeee' } }).jpeg().toBuffer();
    const boundary = 'test-boundary';
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`), jpeg,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(input)}\r\n--${boundary}--\r\n`)]);
    const headers = { ...auth(), 'content-type': `multipart/form-data; boundary=${boundary}` };
    expect((await app!.inject({ method: 'POST', url: '/spots', headers, payload })).statusCode).toBe(201);
    const extra = Buffer.concat([payload.subarray(0, payload.length - `--${boundary}--\r\n`.length),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="ownerId"\r\n\r\n${b}\r\n--${boundary}--\r\n`)]);
    expect((await app!.inject({ method: 'POST', url: '/spots', headers, payload: extra })).statusCode).toBe(400);
    expect(store.create).toHaveBeenCalledTimes(1);
  });
  it('keeps /me and reads available when admin is missing while mutations return 503', async () => {
    const store = fake(); store.configured = false; boot(store);
    const request = multipart();
    const response = await app!.inject({ method: 'POST', url: '/spots', headers: request.headers, payload: request.payload });
    expect(response.statusCode).toBe(503);
    expect(store.create).not.toHaveBeenCalled();
    expect((await app!.inject({ method: 'GET', url: '/spots', headers: auth() })).statusCode).toBe(200);
    expect((await app!.inject({ method: 'GET', url: '/me', headers: auth() })).statusCode).toBe(200);
  });
  it('returns safe ownership and cleanup errors, never provider internals', async () => {
    const store = fake(); store.update.mockResolvedValue(null as never); store.remove.mockRejectedValue(new Error('private upstream secret'));
    boot(store);
    expect((await app!.inject({ method: 'PATCH', url: `/spots/${id}`, headers: { ...auth('b'), 'content-type': 'application/json' }, payload: input })).statusCode).toBe(404);
    const response = await app!.inject({ method: 'DELETE', url: `/spots/${id}`, headers: auth('b') });
    expect(response.statusCode).toBe(503); expect(response.body).not.toMatch(/private|secret|upstream/);
    expect(store.remove).toHaveBeenCalledWith(b, id);
    store.remove.mockRejectedValue(new SpotFailure('MEDIA_CLEANUP_PENDING'));
    const pending = await app!.inject({ method: 'DELETE', url: `/spots/${id}`, headers: auth() });
    expect(pending.statusCode).toBe(503); expect(pending.json().error.code).toBe('MEDIA_CLEANUP_PENDING');
  });
});

describe('image normalization', () => {
  it.each([
    ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'],
  ] as const)('decodes %s, applies EXIF orientation and emits bounded metadata-free WebP', async (format, mime) => {
    const source = await sharp({ create: { width: 1800, height: 900, channels: 3, background: '#aabbcc' } })
      .withExif({ IFD0: { ImageDescription: 'synthetic-private-location-marker' } }).withMetadata({ orientation: 6 })
      .toFormat(format).toBuffer();
    const before = await sharp(source).metadata();
    expect(before.format).toBe(format);
    expect(before.exif).toBeDefined();
    expect(before.orientation).toBe(6);
    const output = await cleanPhoto(source, mime);
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 800, height: 1600 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(output.includes(Buffer.from('synthetic-private-location-marker'))).toBe(false);
    const decoded = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    expect(decoded.info).toMatchObject({ width: 800, height: 1600 });
    expect(decoded.data.length).toBe(decoded.info.width * decoded.info.height * decoded.info.channels);
  });
  it('strips synthetic JPEG EXIF GPS marker and rotates orientation without enlarging', async () => {
    const jpg = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#aabbcc' } }).jpeg().toBuffer();
    // APP1 Exif, TIFF little-endian with orientation=6 and a GPS IFD pointer.
    const tiff = Buffer.alloc(100);
    tiff.write('II', 0); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(2, 8); tiff.writeUInt16LE(0x112, 10); tiff.writeUInt16LE(3, 12);
    tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(6, 18);
    tiff.writeUInt16LE(0x8825, 22); tiff.writeUInt16LE(4, 24);
    tiff.writeUInt32LE(1, 26); tiff.writeUInt32LE(38, 30);
    tiff.writeUInt16LE(2, 38);
    tiff.writeUInt16LE(1, 40); tiff.writeUInt16LE(2, 42); tiff.writeUInt32LE(2, 44); tiff.write('N', 48);
    tiff.writeUInt16LE(2, 52); tiff.writeUInt16LE(5, 54); tiff.writeUInt32LE(3, 56); tiff.writeUInt32LE(70, 60);
    for (const [index, value] of [12, 34, 56].entries()) { tiff.writeUInt32LE(value, 70 + index * 8); tiff.writeUInt32LE(1, 74 + index * 8); }
    const exif = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
    const header = Buffer.alloc(4); header.writeUInt16BE(0xffe1, 0); header.writeUInt16BE(exif.length + 2, 2);
    const source = Buffer.concat([jpg.subarray(0, 2), header, exif, jpg.subarray(2)]);
    expect((await sharp(source).metadata()).orientation).toBe(6);
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const clean = await cleanPhoto(source, 'image/jpeg');
    const meta = await sharp(clean).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 20, height: 40 });
    expect(meta.exif).toBeUndefined(); expect(meta.orientation).toBeUndefined();
    expect(clean.includes(Buffer.from('Exif'))).toBe(false);
    expect(clean.includes(Buffer.from('GPS'))).toBe(false);
  });
  it('bounds pixel count, dimensions and multipage/animated sources', async () => {
    const large = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#abcdef' } }).png().toBuffer();
    const meta = await sharp(await cleanPhoto(large, 'image/png')).metadata();
    expect(meta.width).toBe(1600); expect(meta.height).toBe(800);
    const oversize = await sharp({ create: { width: 5000, height: 4100, channels: 3, background: '#abcdef' } }).png().toBuffer();
    await expect(cleanPhoto(oversize, 'image/png')).rejects.toThrow();
    const frames = Buffer.from([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0]);
    const animated = await sharp(frames, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    await expect(cleanPhoto(animated, 'image/webp')).rejects.toThrow();
    await expect(cleanPhoto(Buffer.from('<svg/>'), 'image/svg+xml')).rejects.toThrow();
  });
});

describe('Supabase transport boundaries', () => {
  it('rejects user-role JWT shapes; accepts server secret or legacy service_role shape pending provider verification', () => {
    expect(validAdminKey(cfg)).toBe('sb_secret_test');
    const token = (role: string) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ iss: 'supabase', role, exp: 4102444800 })).toString('base64url'), 'signature'].join('.');
    expect(validAdminKey(readConfig({ SUPABASE_SERVICE_ROLE_KEY: token('authenticated') }))).toBeUndefined();
    expect(validAdminKey(readConfig({ SUPABASE_SERVICE_ROLE_KEY: token('service_role') }))).toBe(token('service_role'));
    expect(validAdminKey(readConfig({ SUPABASE_SECRET_KEY: 'sb_secret_' }))).toBeUndefined();
    expect(photoPath(a, id)).toBe(`${a}/${id}.webp`);
  });
  it('uses publishable caller-JWT transport for reads, and does not require admin on reads', async () => {
    const calls: Array<{ path: string; key: string; auth: string; query: URLSearchParams }> = [];
    const fetcher: SupabaseTransport = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const headers = new Headers(init?.headers); calls.push({ path: url.pathname, key: headers.get('apikey') ?? '', auth: headers.get('authorization') ?? '', query: url.searchParams });
      return new Response(JSON.stringify(url.pathname.endsWith('/connections') ? [{ member_a: a, member_b: b }] : [row()]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const store = createSpotStore(readConfig({ SUPABASE_URL: cfg.supabaseUrl, SUPABASE_PUBLISHABLE_KEY: cfg.supabasePublishableKey }), fetcher);
    expect(store.configured).toBe(false);
    expect(await store.list('caller-token', a)).toHaveLength(1);
    expect(calls.map((call) => call.path)).toEqual(['/rest/v1/connections', '/rest/v1/spots']);
    expect(calls.every((call) => call.key === 'sb_publishable_test' && call.auth === 'Bearer caller-token')).toBe(true);
    expect(calls[1].auth).not.toContain('sb_secret');
    expect(calls[1].query.get('owner_id')).toContain(a);
    expect(calls[1].query.get('owner_id')).toContain(b);
    expect(calls[1].query.get('owner_id')).not.toContain(c);
    expect(calls[1].query.get('limit')).toBe('50');
  });
  it('checks ownership before admin edits; revocation and removed rows deny caller reads; failed cleanup remains hidden', async () => {
    let current = row({ audience: 'public' });
    let storageFails = true;
    const calls: Array<{ path: string; method: string; key: string; auth: string }> = [];
    const fetcher: SupabaseTransport = async (resource, init) => {
      const url = new URL(typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const key = headers.get('apikey') ?? '';
      const authHeader = headers.get('authorization') ?? '';
      calls.push({ path: url.pathname, method, key, auth: authHeader });
      const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
      if (url.pathname === '/rest/v1/spots') {
        if (method === 'PATCH') {
          const update = JSON.parse(String(init?.body)) as Partial<SpotRow>;
          current = { ...current, ...update };
          return json(current);
        }
        if (method === 'DELETE') return new Response(null, { status: 204 });
        const visible = key === 'sb_secret_test' || (current.removed_at === null && (authHeader === 'Bearer a' || (authHeader === 'Bearer b' && (current.audience === 'public' || current.owner_id === a)) || (authHeader === 'Bearer c' && current.audience === 'public')));
        return json(visible ? current : null);
      }
      if (url.pathname.startsWith('/storage/v1/object/spot-photos')) {
        if (method === 'DELETE') return storageFails ? json({ message: 'private storage error' }, 500) : json([]);
        if (method === 'GET') return current.removed_at === null && current.audience === 'public' ? new Response(Buffer.from('webp')) : json({ message: 'not found' }, 404);
      }
      throw new Error('unexpected operation');
    };
    const store = createSpotStore(cfg, fetcher);
    expect((await store.get('c', id))?.audience).toBe('public');
    expect(await store.update(b, id, input)).toBeNull();
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
    expect(await store.update(a, id, input)).toMatchObject({ audience: 'connections' });
    expect(await store.get('c', id)).toBeNull();
    await expect(store.remove(b, id)).resolves.toBe('not_found');
    await expect(store.remove(a, id)).rejects.toMatchObject({ code: 'MEDIA_CLEANUP_PENDING' });
    expect(current.removed_at).not.toBeNull();
    expect(await store.get('a', id)).toBeNull();
    storageFails = false;
    expect(await store.remove(a, id)).toBe('deleted');
    expect(calls.filter((call) => ['PATCH', 'DELETE'].includes(call.method)).every((call) => call.key === 'sb_secret_test' && call.auth === 'Bearer sb_secret_test')).toBe(true);
    expect(calls.filter((call) => call.method === 'GET' && call.key === 'sb_publishable_test').every((call) => ['Bearer a', 'Bearer c'].includes(call.auth))).toBe(true);
  });
  it.each(['timeout', 'transport', 'unknown response'] as const)('retains private photo after ambiguous %s insert even when an immediate lookup is absent', async (failure) => {
    const calls: string[] = [];
    const fetcher: SupabaseTransport = async (resource, init) => {
      const url = new URL(typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url.pathname}`);
      if (url.pathname === '/rest/v1/spots') {
        if (method === 'GET') return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (failure === 'timeout') throw new DOMException('timed out', 'TimeoutError');
        if (failure === 'transport') throw new TypeError('network failed');
        return new Response(JSON.stringify({ code: 'PGRST000', message: 'upstream failure' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'DELETE') throw new Error('unsafe storage DELETE');
      return new Response(JSON.stringify({ Key: 'safe' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const store = createSpotStore(cfg, fetcher);
    await expect(store.create(a, 'Name', input, Buffer.from('webp'))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(calls.map((call) => call.split(' ')[0])).toEqual(['POST', 'POST']);
    expect(calls[0]).toMatch(/^POST \/storage\/v1\/object\/spot-photos\//);
    const generatedId = calls[0].split('/').at(-1)!.replace(/\.webp$/, '');
    expect(await store.get('a', generatedId)).toBeNull();
    expect(calls.map((call) => call.split(' ')[0])).toEqual(['POST', 'POST', 'GET']);
  });
  it('cleans an orphan only on a definitive PostgreSQL insert rejection and absent row; never uses caller token for storage uploads', async () => {
    const calls: Array<{ path: string; method: string; key: string; auth: string }> = [];
    const fetcher: SupabaseTransport = async (resource, init) => {
      const url = new URL(typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url);
      const headers = new Headers(init?.headers);
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', key: headers.get('apikey') ?? '', auth: headers.get('authorization') ?? '' });
      return url.pathname === '/rest/v1/spots'
        ? new Response(JSON.stringify((init?.method ?? 'GET') === 'GET' ? null : { code: '23514', message: 'check constraint rejected insert' }), { status: (init?.method ?? 'GET') === 'GET' ? 200 : 400, headers: { 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify({ Key: 'safe' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    await expect(createSpotStore(cfg, fetcher).create(a, 'Name', input, Buffer.from('webp'))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(calls.map((call) => call.method)).toEqual(['POST', 'POST', 'GET', 'DELETE']);
    expect(calls[0].path).toMatch(/^\/storage\/v1\/object\/spot-photos\//);
    expect(calls[3].path).toContain('/storage/v1/object/spot-photos');
    expect(calls.every((call) => call.key === 'sb_secret_test' && call.auth === 'Bearer sb_secret_test')).toBe(true);
  });
  it('does not delete photo on definitive rejection when an observed row exists', async () => {
    const calls: string[] = [];
    const fetcher: SupabaseTransport = async (resource, init) => {
      const url = new URL(typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url.pathname}`);
      if (url.pathname === '/rest/v1/spots') return new Response(JSON.stringify(method === 'GET' ? row() : { code: '23505', message: 'duplicate key' }),
        { status: method === 'GET' ? 200 : 409, headers: { 'Content-Type': 'application/json' } });
      if (method === 'DELETE') throw new Error('must not delete observed photo');
      return new Response(JSON.stringify({ Key: 'safe' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    await expect(createSpotStore(cfg, fetcher).create(a, 'Name', input, Buffer.from('webp'))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(calls.map((call) => call.split(' ')[0])).toEqual(['POST', 'POST', 'GET']);
  });
});
