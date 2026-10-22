import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerConfig } from './config.js';
import { createLocalEncoder } from './encoder.js';
import { createExploredStore, type ExploredStore } from './explored.js';
import {
  createProfileProvider,
  createProfileUpdater,
  type ProfileProvider,
  type ProfileUpdater,
} from './profile.js';
import { createReportStore, type ReportStore } from './reports.js';
import { createSearchService, type SearchService } from './search.js';
import { createSpotStore, type SpotStore } from './spots.js';
import { earlyAuthGuard } from './middleware/auth.middleware.js';
import { centralizedErrorHandler } from './middleware/error.middleware.js';
import {
  logApiResponse,
  setupRequestTracking,
} from './middleware/logger.middleware.js';
import { registerAllRoutes } from './routes/index.js';

export function createApp(
  config: ServerConfig,
  profileProvider: ProfileProvider = createProfileProvider(
    config.supabaseUrl,
    config.supabasePublishableKey
  ),
  spotStore: SpotStore = createSpotStore(config),
  profileUpdater: ProfileUpdater = createProfileUpdater(
    config.supabaseUrl,
    config.supabasePublishableKey
  ),
  searchService: SearchService = createSearchService(createLocalEncoder(config)),
  exploredStore: ExploredStore = createExploredStore(config),
  reportStore: ReportStore = createReportStore(config)
): FastifyInstance {
  // Fastify's built-in logger stays off; the response hook below emits only
  // explicitly redacted request metadata.
  const app = Fastify({ logger: false });

  // Middleware & Hooks
  // Deliberately log only safe response metadata. Never log headers, tokens,
  // request bodies, multipart fields, photo bytes, coordinates or query strings.
  app.addHook('onRequest', async (request, reply) => {
    setupRequestTracking(request);
    // Fastify parses JSON before route handlers. Reject missing/malformed Bearer
    // credentials first even when the request body itself cannot be parsed.
    if (earlyAuthGuard(request, reply)) return;
  });

  app.addHook('onResponse', async (request, reply) => {
    logApiResponse(request, reply);
  });

  // Plugins
  const allowedOrigins = new Set([config.frontendOrigin]);

  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      if (origin === 'capacitor://localhost') return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  app.register(multipart, {
    limits: {
      files: 1,
      fields: 1,
      parts: 2,
      fieldSize: 4096,
      fileSize: 10 * 1024 * 1024,
    },
  });

  // Centralized Error Handling
  app.setErrorHandler(centralizedErrorHandler);

  // Routes
  registerAllRoutes(app, {
    profileProvider,
    spotStore,
    profileUpdater,
    searchService,
    exploredStore,
    reportStore,
  });

  // Lifecycle
  app.addHook('onClose', async () => {
    await searchService.dispose();
  });

  return app;
}
