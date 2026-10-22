import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProfileProvider } from '../models/profile.model.js';
import type { SpotStore } from '../models/spot.model.js';
import type { ExploredStore } from '../models/explored.model.js';
import { verifyCaller } from '../middleware/auth.middleware.js';
import { isValidUUID } from '../validators/common.validator.js';
import { exploredBody } from '../validators/explored.validator.js';
import { missing, sendError, unavailable } from '../utils/response.js';

export class ExploredController {
  constructor(
    private readonly spotStore: SpotStore,
    private readonly exploredStore: ExploredStore,
    private readonly profileProvider: ProfileProvider
  ) {}

  private validateId(id: string, reply: FastifyReply): boolean {
    if (!isValidUUID(id)) {
      sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot ID.');
      return false;
    }
    return true;
  }

  async getExplored(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    return this.handleExplored(request, reply, false);
  }

  async setExplored(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    return this.handleExplored(request, reply, true);
  }

  private async handleExplored(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
    write: boolean
  ) {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verifyCaller(request, reply, this.profileProvider);
    if (!caller) return;
    const id = request.params.id;
    if (!this.validateId(id, reply)) return;

    if (
      (request.raw.url ?? '').includes('?') ||
      (!write &&
        (request.body !== undefined ||
          Number(request.headers['content-length'] ?? 0) > 0 ||
          request.headers['transfer-encoding']))
    ) {
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid explored request.');
    }

    if (
      write &&
      !/^application\/json(?:\s*;|\s*$)/i.test(request.headers['content-type'] ?? '')
    ) {
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid explored request.');
    }

    const desired = write ? exploredBody(request.body) : null;
    if (write && desired === null) {
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid explored request.');
    }

    try {
      const before = await this.spotStore.get(caller.token, id);
      if (!before || before.removed_at) return missing(reply);
      if (!this.exploredStore.configured) return unavailable(reply);

      // Always recheck after the own-row read/write, including RPC zero-row and
      // provider failure, so a concurrent visibility revocation returns neutral 404.
      let value: boolean | null | undefined;
      let failure = false;
      try {
        value = write
          ? await this.exploredStore.set(caller.token, caller.profile.id, id, desired!)
          : await this.exploredStore.get(caller.token, caller.profile.id, id);
      } catch {
        failure = true;
      }
      const after = await this.spotStore.get(caller.token, id);
      if (!after || after.removed_at) return missing(reply);
      if (value === null) return missing(reply);
      if (failure || typeof value !== 'boolean' || (write && value !== desired))
        return unavailable(reply);
      return { exploration: { spotId: id, explored: value } };
    } catch {
      return unavailable(reply);
    }
  }
}
