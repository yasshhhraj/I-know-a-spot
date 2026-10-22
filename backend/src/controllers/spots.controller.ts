import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProfileProvider } from '../models/profile.model.js';
import {
  toSpot,
  type SpotStore,
} from '../models/spot.model.js';
import type { SearchService } from '../models/search.model.js';
import { verifyCaller } from '../middleware/auth.middleware.js';
import { isValidUUID } from '../validators/common.validator.js';
import { listOptions, validateSpotInput } from '../validators/spots.validator.js';
import { cleanPhoto } from '../services/spot.service.js';
import { fail, missing, sendError, unavailable } from '../utils/response.js';

export class SpotsController {
  constructor(
    private readonly spotStore: SpotStore,
    private readonly profileProvider: ProfileProvider,
    private readonly searchService: SearchService
  ) {}

  private validateId(id: string, reply: FastifyReply): boolean {
    if (!isValidUUID(id)) {
      sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot ID.');
      return false;
    }
    return true;
  }

  async listSpots(request: FastifyRequest, reply: FastifyReply) {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verifyCaller(request, reply, this.profileProvider);
    if (!caller) return;
    const options = listOptions(request.raw.url ?? '/spots');
    if (!options)
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot feed or center.');
    try {
      const rows = await this.spotStore.list(caller.token, caller.profile.id, options);
      return { spots: rows.filter((row) => !row.removed_at).map(toSpot) };
    } catch (error) {
      return fail(reply, error);
    }
  }

  async getSpot(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verifyCaller(request, reply, this.profileProvider);
    if (!caller) return;
    if (!this.validateId(request.params.id, reply)) return;
    try {
      const row = await this.spotStore.get(caller.token, request.params.id);
      return row && !row.removed_at ? { spot: toSpot(row) } : missing(reply);
    } catch (error) {
      return fail(reply, error);
    }
  }

  async getPhoto(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff');
    const caller = await verifyCaller(request, reply, this.profileProvider);
    if (!caller) return;
    if (!this.validateId(request.params.id, reply)) return;
    try {
      const row = await this.spotStore.get(caller.token, request.params.id);
      if (!row || row.removed_at) return missing(reply);
      const bytes = await this.spotStore.photo(caller.token, row.owner_id, row.id);
      return reply.type('image/webp').send(Buffer.from(bytes));
    } catch (error) {
      return fail(reply, error);
    }
  }

  async createSpot(request: FastifyRequest, reply: FastifyReply) {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verifyCaller(request, reply, this.profileProvider);
    if (!caller) return;
    if (!this.spotStore.configured) return unavailable(reply);
    if (!request.isMultipart())
      return sendError(reply, 400, 'BAD_REQUEST', 'Expected one data field and one photo.');
    let data: unknown;
    let photo: Buffer | undefined;
    let mime = '';
    try {
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          if (
            part.fieldname !== 'data' ||
            data !== undefined ||
            typeof part.value !== 'string'
          )
            return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot data.');
          try {
            data = JSON.parse(part.value);
          } catch {
            return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot data.');
          }
        } else {
          if (part.fieldname !== 'photo' || photo)
            return sendError(reply, 400, 'BAD_REQUEST', 'Expected one photo.');
          mime = part.mimetype;
          photo = await part.toBuffer();
          if (part.file.truncated)
            return sendError(
              reply,
              413,
              'PHOTO_TOO_LARGE',
              'Photo must be 10 MiB or smaller.'
            );
        }
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        [
          'FST_REQ_FILE_TOO_LARGE',
          'FST_PARTS_LIMIT',
          'FST_FILES_LIMIT',
          'FST_FIELDS_LIMIT',
          'FST_FIELD_VALUE_TOO_LARGE',
        ].includes(String(error.code))
      ) {
        return sendError(
          reply,
          error.code === 'FST_REQ_FILE_TOO_LARGE' ? 413 : 400,
          error.code === 'FST_REQ_FILE_TOO_LARGE' ? 'PHOTO_TOO_LARGE' : 'BAD_REQUEST',
          'Invalid multipart upload.'
        );
      }
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid multipart upload.');
    }
    const input = validateSpotInput(data);
    if (!input || !photo)
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot data or missing photo.');
    if (photo.length > 10 * 1024 * 1024)
      return sendError(reply, 413, 'PHOTO_TOO_LARGE', 'Photo must be 10 MiB or smaller.');
    let clean: Buffer;
    try {
      clean = await cleanPhoto(photo, mime);
    } catch {
      return sendError(
        reply,
        415,
        'UNSUPPORTED_PHOTO',
        'Use a single JPEG, PNG, or WebP image.'
      );
    }
    try {
      const created = await this.spotStore.create(
        caller.profile.id,
        caller.profile.displayName,
        input,
        clean
      );
      return reply.code(201).send({ spot: toSpot(created) });
    } catch (error) {
      return fail(reply, error);
    }
  }

  async updateSpot(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verifyCaller(request, reply, this.profileProvider);
    if (!caller) return;
    if (!this.validateId(request.params.id, reply)) return;
    const input = validateSpotInput(request.body);
    if (!input) return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot data.');
    try {
      const row = await this.spotStore.update(
        caller.profile.id,
        request.params.id,
        input
      );
      if (row) this.searchService.invalidate(row.id);
      return row ? { spot: toSpot(row) } : missing(reply);
    } catch (error) {
      // An ambiguous write might have committed. Evict derived text anyway.
      this.searchService.invalidate(request.params.id);
      return fail(reply, error);
    }
  }

  async deleteSpot(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verifyCaller(request, reply, this.profileProvider);
    if (!caller) return;
    if (!this.validateId(request.params.id, reply)) return;
    try {
      const result = await this.spotStore.remove(
        caller.profile.id,
        request.params.id
      );
      return result === 'deleted' ? reply.code(204).send() : missing(reply);
    } catch (error) {
      return fail(reply, error);
    } finally {
      this.searchService.invalidate(request.params.id);
    }
  }
}
