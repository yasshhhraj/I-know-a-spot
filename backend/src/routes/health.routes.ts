import type { FastifyInstance } from 'fastify';
import { HealthController } from '../controllers/health.controller.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  controller = new HealthController()
): void {
  app.get('/health', async (request, reply) => controller.getHealth(request, reply));
}
