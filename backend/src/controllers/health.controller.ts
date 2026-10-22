import type { FastifyReply, FastifyRequest } from 'fastify';

export class HealthController {
  async getHealth(_request: FastifyRequest, _reply: FastifyReply) {
    return { status: 'scaffold' as const };
  }
}
