import type { FastifyInstance } from 'fastify';
import type { MeController } from '../controllers/me.controller.js';

export function registerMeRoutes(
  app: FastifyInstance,
  controller: MeController
): void {
  app.get('/me', async (request, reply) => controller.getProfile(request, reply));
  app.patch('/me', async (request, reply) => controller.updateRadius(request, reply));
}
