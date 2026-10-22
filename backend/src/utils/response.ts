import type { FastifyReply } from 'fastify';
import { SpotFailure } from '../models/spot.model.js';

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string
): FastifyReply {
  return reply.code(status).send({ error: { code, message } });
}

export function unavailable(reply: FastifyReply): FastifyReply {
  return sendError(
    reply,
    503,
    'SERVICE_UNAVAILABLE',
    'Spot service is temporarily unavailable. Please retry.'
  );
}

export function missing(reply: FastifyReply): FastifyReply {
  return sendError(reply, 404, 'NOT_FOUND', 'Spot unavailable.');
}

export function fail(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof SpotFailure && error.code === 'MEDIA_CLEANUP_PENDING') {
    return sendError(
      reply,
      503,
      'MEDIA_CLEANUP_PENDING',
      'Spot is hidden; photo cleanup is pending. Retry deletion later.'
    );
  }
  return unavailable(reply);
}
