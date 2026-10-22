import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProfileProvider, ProfileUpdater } from '../models/profile.model.js';
import { verifyCaller } from '../middleware/auth.middleware.js';
import { radiusBody } from '../validators/profile.validator.js';
import { sendError } from '../utils/response.js';

export class MeController {
  constructor(
    private readonly profileProvider: ProfileProvider,
    private readonly profileUpdater: ProfileUpdater
  ) {}

  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    reply.header('Cache-Control', 'private, no-store');
    const header = request.headers.authorization;
    // HTTP auth-scheme is case-insensitive; token68 forbids whitespace/delimiters.
    const match =
      typeof header === 'string' &&
      /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(header);
    if (!match)
      return reply
        .code(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } });

    let result;
    try {
      result = await this.profileProvider(match[1]);
    } catch {
      result = { kind: 'unavailable' } as const;
    }
    if (result.kind === 'ok') return { profile: result.profile };
    if (result.kind === 'not_enrolled') {
      return reply
        .code(403)
        .send({ error: { code: 'NOT_ENROLLED', message: 'This account is not enrolled in the pilot.' } });
    }
    if (result.kind === 'unauthorized') {
      return reply
        .code(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } });
    }
    return reply.code(503).send({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Profile verification is temporarily unavailable. Please retry.',
      },
    });
  }

  async updateRadius(request: FastifyRequest, reply: FastifyReply) {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verifyCaller(request, reply, this.profileProvider);
    if (!caller) return;
    const radius = radiusBody(request.body);
    if (radius === null)
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid public discovery radius.');
    let result;
    try {
      result = await this.profileUpdater(caller.token, caller.profile.id, radius);
    } catch {
      result = { kind: 'unavailable' } as const;
    }
    if (result.kind === 'ok') return { profile: result.profile };
    if (result.kind === 'not_enrolled')
      return sendError(
        reply,
        403,
        'NOT_ENROLLED',
        'This account is not enrolled in the pilot.'
      );
    return sendError(
      reply,
      503,
      'SERVICE_UNAVAILABLE',
      'Profile service is temporarily unavailable. Please retry.'
    );
  }
}
