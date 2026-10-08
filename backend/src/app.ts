import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import type { ServerConfig } from './config.js';
import { createProfileProvider, createProfileUpdater, type ProfileProvider, type ProfileUpdater } from './profile.js';
import { cleanPhoto, createSpotStore, SpotFailure, toSpot, UUID, validateSpotInput, type SpotListOptions, type SpotStore } from './spots.js';

function listOptions(rawUrl: string): SpotListOptions | null {
  const query = new URL(rawUrl, 'http://localhost').searchParams;
  if ([...query.keys()].some(key => !['feed', 'centerLat', 'centerLon'].includes(key)) ||
      query.getAll('feed').length > 1 || query.getAll('centerLat').length > 1 || query.getAll('centerLon').length > 1) return null;
  const feed = query.get('feed') ?? 'connections';
  if (feed === 'connections') return query.has('centerLat') || query.has('centerLon') ? null : { feed };
  if (feed !== 'public' || !query.has('centerLat') || !query.has('centerLon')) return null;
  const lat = query.get('centerLat')!;
  const lon = query.get('centerLon')!;
  const coordinate = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!coordinate.test(lat) || !coordinate.test(lon)) return null;
  const centerLat = Number(lat);
  const centerLon = Number(lon);
  return Number.isFinite(centerLat) && centerLat >= -90 && centerLat <= 90 &&
    Number.isFinite(centerLon) && centerLon >= -180 && centerLon <= 180 ? { feed, centerLat, centerLon } : null;
}

function radiusBody(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'publicRadiusKm') ||
      !Number.isInteger(body.publicRadiusKm) || (body.publicRadiusKm as number) < 1 || (body.publicRadiusKm as number) > 25) return null;
  return body.publicRadiusKm as number;
}

export function createApp(config: ServerConfig, profileProvider: ProfileProvider =
  createProfileProvider(config.supabaseUrl, config.supabasePublishableKey), spotStore: SpotStore = createSpotStore(config),
  profileUpdater: ProfileUpdater = createProfileUpdater(config.supabaseUrl, config.supabasePublishableKey)) {
  // Fastify's built-in logger stays off; the response hook below emits only
  // explicitly redacted request metadata.
  const app = Fastify({ logger: false });
  const requestStarted = new WeakMap<object, number>();
  // Deliberately log only safe response metadata. Never log headers, tokens,
  // request bodies, multipart fields, photo bytes, coordinates or query strings.
  app.addHook('onRequest', async request => {
    requestStarted.set(request, Date.now());
  });
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? request.url.split('?')[0];
    console.info(JSON.stringify({
      event: 'api_response',
      requestId: request.id,
      method: request.method,
      route,
      status: reply.statusCode,
      durationMs: Date.now() - (requestStarted.get(request) ?? Date.now()),
    }));
  });
  app.register(cors, {
    origin: config.frontendOrigin,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.register(multipart, { limits: { files: 1, fields: 1, parts: 2, fieldSize: 4096, fileSize: 10 * 1024 * 1024 } });

  const sendError = (reply: { code: (status: number) => { send: (body: object) => unknown } }, status: number, code: string, message: string) =>
    reply.code(status).send({ error: { code, message } });
  const unavailable = (reply: Parameters<typeof sendError>[0]) => sendError(reply, 503, 'SERVICE_UNAVAILABLE', 'Spot service is temporarily unavailable. Please retry.');
  const missing = (reply: Parameters<typeof sendError>[0]) => sendError(reply, 404, 'NOT_FOUND', 'Spot unavailable.');
  async function verified(request: { headers: { authorization?: string } }, reply: Parameters<typeof sendError>[0]) {
    const match = typeof request.headers.authorization === 'string' && /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(request.headers.authorization);
    if (!match) { sendError(reply, 401, 'UNAUTHORIZED', 'Sign in to continue.'); return null; }
    let result;
    try { result = await profileProvider(match[1]); } catch { result = { kind: 'unavailable' } as const; }
    if (result.kind === 'ok') return { token: match[1], profile: result.profile };
    if (result.kind === 'unauthorized') sendError(reply, 401, 'UNAUTHORIZED', 'Sign in to continue.');
    else if (result.kind === 'not_enrolled') sendError(reply, 403, 'NOT_ENROLLED', 'This account is not enrolled in the pilot.');
    else unavailable(reply);
    return null;
  }
  const fail = (reply: Parameters<typeof sendError>[0], error: unknown) => error instanceof SpotFailure && error.code === 'MEDIA_CLEANUP_PENDING'
    ? sendError(reply, 503, 'MEDIA_CLEANUP_PENDING', 'Spot is hidden; photo cleanup is pending. Retry deletion later.') : unavailable(reply);
  const idOf = (id: string, reply: Parameters<typeof sendError>[0]) => {
    if (!UUID.test(id)) { sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot ID.'); return false; }
    return true;
  };
  app.setErrorHandler((error, request, reply) => {
    if (request.url.split('?')[0] === '/me') {
      reply.header('Cache-Control', 'private, no-store');
      const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
      return (status === 400 || status === 415) ? sendError(reply, 400, 'BAD_REQUEST', 'Invalid profile request.')
        : sendError(reply, 503, 'SERVICE_UNAVAILABLE', 'Profile service is temporarily unavailable. Please retry.');
    }
    if (request.url.split('?')[0] === '/spots' || request.url.startsWith('/spots/')) {
      reply.header('Cache-Control', 'private, no-store');
      const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
      if (status === 413) return sendError(reply, 413, 'PHOTO_TOO_LARGE', 'Photo must be 10 MiB or smaller.');
      if (status === 400 || status === 415) return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot request.');
      return unavailable(reply);
    }
    return reply.code(503).send({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable.' } });
  });

  app.get('/health', async () => ({ status: 'scaffold' as const }));

  app.get('/me', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const header = request.headers.authorization;
    // HTTP auth-scheme is case-insensitive; token68 forbids whitespace/delimiters.
    const match = typeof header === 'string' && /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(header);
    if (!match) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } });

    // Provider is injectable for route tests; both adapters return only safe states.
    let result;
    try { result = await profileProvider(match[1]); }
    catch { result = { kind: 'unavailable' } as const; }
    if (result.kind === 'ok') return { profile: result.profile };
    if (result.kind === 'not_enrolled') {
      return reply.code(403).send({ error: { code: 'NOT_ENROLLED', message: 'This account is not enrolled in the pilot.' } });
    }
    if (result.kind === 'unauthorized') {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } });
    }
    return reply.code(503).send({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Profile verification is temporarily unavailable. Please retry.' } });
  });

  app.patch('/me', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verified(request, reply);
    if (!caller) return;
    const radius = radiusBody(request.body);
    if (radius === null) return sendError(reply, 400, 'BAD_REQUEST', 'Invalid public discovery radius.');
    let result;
    try { result = await profileUpdater(caller.token, caller.profile.id, radius); }
    catch { result = { kind: 'unavailable' } as const; }
    if (result.kind === 'ok') return { profile: result.profile };
    if (result.kind === 'not_enrolled') return sendError(reply, 403, 'NOT_ENROLLED', 'This account is not enrolled in the pilot.');
    return sendError(reply, 503, 'SERVICE_UNAVAILABLE', 'Profile service is temporarily unavailable. Please retry.');
  });

  app.get('/spots', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verified(request, reply);
    if (!caller) return;
    const options = listOptions(request.raw.url ?? '/spots');
    if (!options) return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot feed or center.');
    try { return { spots: (await spotStore.list(caller.token, caller.profile.id, options)).filter((row) => !row.removed_at).map(toSpot) }; }
    catch (error) { return fail(reply, error); }
  });
  app.get<{ Params: { id: string } }>('/spots/:id', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verified(request, reply);
    if (!caller) return;
    if (!idOf(request.params.id, reply)) return;
    try { const row = await spotStore.get(caller.token, request.params.id); return row && !row.removed_at ? { spot: toSpot(row) } : missing(reply); }
    catch (error) { return fail(reply, error); }
  });
  app.get<{ Params: { id: string } }>('/spots/:id/photo', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff');
    const caller = await verified(request, reply);
    if (!caller) return;
    if (!idOf(request.params.id, reply)) return;
    try {
      const row = await spotStore.get(caller.token, request.params.id);
      if (!row || row.removed_at) return missing(reply);
      const bytes = await spotStore.photo(caller.token, row.owner_id, row.id);
      return reply.type('image/webp').send(Buffer.from(bytes));
    } catch (error) { return fail(reply, error); }
  });
  app.post('/spots', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verified(request, reply);
    if (!caller) return;
    if (!spotStore.configured) return unavailable(reply);
    if (!request.isMultipart()) return sendError(reply, 400, 'BAD_REQUEST', 'Expected one data field and one photo.');
    let data: unknown;
    let photo: Buffer | undefined;
    let mime = '';
    try {
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          if (part.fieldname !== 'data' || data !== undefined || typeof part.value !== 'string') return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot data.');
          try { data = JSON.parse(part.value); } catch { return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot data.'); }
        } else {
          if (part.fieldname !== 'photo' || photo) return sendError(reply, 400, 'BAD_REQUEST', 'Expected one photo.');
          mime = part.mimetype;
          photo = await part.toBuffer();
          if (part.file.truncated) return sendError(reply, 413, 'PHOTO_TOO_LARGE', 'Photo must be 10 MiB or smaller.');
        }
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error &&
        ['FST_REQ_FILE_TOO_LARGE', 'FST_PARTS_LIMIT', 'FST_FILES_LIMIT', 'FST_FIELDS_LIMIT', 'FST_FIELD_VALUE_TOO_LARGE'].includes(String(error.code))) {
        return sendError(reply, error.code === 'FST_REQ_FILE_TOO_LARGE' ? 413 : 400,
          error.code === 'FST_REQ_FILE_TOO_LARGE' ? 'PHOTO_TOO_LARGE' : 'BAD_REQUEST', 'Invalid multipart upload.');
      }
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid multipart upload.');
    }
    const input = validateSpotInput(data);
    if (!input || !photo) return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot data or missing photo.');
    if (photo.length > 10 * 1024 * 1024) return sendError(reply, 413, 'PHOTO_TOO_LARGE', 'Photo must be 10 MiB or smaller.');
    let clean: Buffer;
    try { clean = await cleanPhoto(photo, mime); }
    catch { return sendError(reply, 415, 'UNSUPPORTED_PHOTO', 'Use a single JPEG, PNG, or WebP image.'); }
    try { return reply.code(201).send({ spot: toSpot(await spotStore.create(caller.profile.id, caller.profile.displayName, input, clean)) }); }
    catch (error) { return fail(reply, error); }
  });
  app.patch<{ Params: { id: string } }>('/spots/:id', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verified(request, reply);
    if (!caller) return;
    if (!idOf(request.params.id, reply)) return;
    const input = validateSpotInput(request.body);
    if (!input) return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot data.');
    try { const row = await spotStore.update(caller.profile.id, request.params.id, input); return row ? { spot: toSpot(row) } : missing(reply); }
    catch (error) { return fail(reply, error); }
  });
  app.delete<{ Params: { id: string } }>('/spots/:id', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verified(request, reply);
    if (!caller) return;
    if (!idOf(request.params.id, reply)) return;
    try { return await spotStore.remove(caller.profile.id, request.params.id) === 'deleted' ? reply.code(204).send() : missing(reply); }
    catch (error) { return fail(reply, error); }
  });

  return app;
}
