import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProfileProvider } from '../models/profile.model.js';
import type { SpotStore } from '../models/spot.model.js';
import {
  SearchDeadline,
  SearchFailure,
  type SearchService,
} from '../models/search.model.js';
import { searchDeadlines } from '../middleware/logger.middleware.js';
import { verifyCaller } from '../middleware/auth.middleware.js';
import { searchBody } from '../validators/search.validator.js';
import { sendError } from '../utils/response.js';

export class SearchController {
  constructor(
    private readonly spotStore: SpotStore,
    private readonly searchService: SearchService,
    private readonly profileProvider: ProfileProvider
  ) {}

  async searchSpots(request: FastifyRequest, reply: FastifyReply) {
    reply.header('Cache-Control', 'private, no-store');
    const deadline = searchDeadlines.get(request) ?? new SearchDeadline();
    const caller = await verifyCaller(request, reply, this.profileProvider, deadline);
    if (!caller) return;
    if (
      (request.raw.url ?? '').includes('?') ||
      !/^application\/json(?:\s*;|\s*$)/i.test(request.headers['content-type'] ?? '')
    )
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid search request.');
    const parsed = searchBody(request.body);
    if (!parsed) return sendError(reply, 400, 'BAD_REQUEST', 'Invalid search request.');
    try {
      return await this.searchService.search(
        this.spotStore,
        caller.token,
        caller.profile.id,
        parsed.options,
        parsed.query,
        deadline,
        caller.profile.publicRadiusKm
      );
    } catch (error) {
      if (error instanceof SearchFailure) {
        const busy = error.code === 'SEARCH_BUSY';
        return sendError(
          reply,
          busy ? 429 : 503,
          error.code,
          busy
            ? 'Search is busy. Please retry.'
            : error.code === 'SERVICE_UNAVAILABLE'
            ? 'Spot service is temporarily unavailable. Please retry.'
            : 'Search is temporarily unavailable. Please retry.'
        );
      }
      return sendError(
        reply,
        503,
        'SEARCH_UNAVAILABLE',
        'Search is temporarily unavailable. Please retry.'
      );
    }
  }
}
