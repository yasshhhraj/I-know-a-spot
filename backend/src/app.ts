import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { ServerConfig } from './config.js';

export function createApp(config: ServerConfig) {
  // Request logs stay off until authenticated routes and safe redaction exist.
  const app = Fastify({ logger: false });
  app.register(cors, { origin: config.frontendOrigin });

  app.get('/health', async () => ({ status: 'scaffold' as const }));

  return app;
}
