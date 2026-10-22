import type { FastifyInstance } from 'fastify';
import { HealthController } from '../controllers/health.controller.js';
import { MeController } from '../controllers/me.controller.js';
import { SpotsController } from '../controllers/spots.controller.js';
import { SearchController } from '../controllers/search.controller.js';
import { ExploredController } from '../controllers/explored.controller.js';
import { ReportsController } from '../controllers/reports.controller.js';
import { registerHealthRoutes } from './health.routes.js';
import { registerMeRoutes } from './me.routes.js';
import { registerSpotsRoutes } from './spots.routes.js';
import type { ProfileProvider, ProfileUpdater } from '../models/profile.model.js';
import type { SpotStore } from '../models/spot.model.js';
import type { SearchService } from '../models/search.model.js';
import type { ExploredStore } from '../models/explored.model.js';
import type { ReportStore } from '../models/report.model.js';

export interface AppDependencies {
  profileProvider: ProfileProvider;
  spotStore: SpotStore;
  profileUpdater: ProfileUpdater;
  searchService: SearchService;
  exploredStore: ExploredStore;
  reportStore: ReportStore;
}

export function registerAllRoutes(
  app: FastifyInstance,
  dependencies: AppDependencies
): void {
  const {
    profileProvider,
    spotStore,
    profileUpdater,
    searchService,
    exploredStore,
    reportStore,
  } = dependencies;

  // Controllers
  const healthController = new HealthController();
  const meController = new MeController(profileProvider, profileUpdater);
  const spotsController = new SpotsController(spotStore, profileProvider, searchService);
  const searchController = new SearchController(spotStore, searchService, profileProvider);
  const exploredController = new ExploredController(spotStore, exploredStore, profileProvider);
  const reportsController = new ReportsController(spotStore, reportStore, profileProvider);

  // Register route groups
  const registerRoutes = (instance: FastifyInstance) => {
    registerHealthRoutes(instance, healthController);
    registerMeRoutes(instance, meController);
    registerSpotsRoutes(instance, {
      spotsController,
      searchController,
      exploredController,
      reportsController,
    });
  };

  registerRoutes(app);
  app.register(async (api) => {
    registerRoutes(api);
  }, { prefix: '/api' });
}
