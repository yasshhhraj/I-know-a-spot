import type { FastifyInstance } from 'fastify';
import type { SpotsController } from '../controllers/spots.controller.js';
import type { SearchController } from '../controllers/search.controller.js';
import type { ExploredController } from '../controllers/explored.controller.js';
import type { ReportsController } from '../controllers/reports.controller.js';

export interface SpotRouteControllers {
  spotsController: SpotsController;
  searchController: SearchController;
  exploredController: ExploredController;
  reportsController: ReportsController;
}

export function registerSpotsRoutes(
  app: FastifyInstance,
  controllers: SpotRouteControllers
): void {
  const { spotsController, searchController, exploredController, reportsController } =
    controllers;

  // Spots collection
  app.get('/spots', async (request, reply) => spotsController.listSpots(request, reply));
  app.post('/spots', async (request, reply) => spotsController.createSpot(request, reply));

  // Search
  app.post('/spots/search', { bodyLimit: 2048 }, async (request, reply) =>
    searchController.searchSpots(request, reply)
  );

  // Spot resource by ID
  app.get<{ Params: { id: string } }>('/spots/:id', async (request, reply) =>
    spotsController.getSpot(request, reply)
  );
  app.patch<{ Params: { id: string } }>('/spots/:id', async (request, reply) =>
    spotsController.updateSpot(request, reply)
  );
  app.delete<{ Params: { id: string } }>('/spots/:id', async (request, reply) =>
    spotsController.deleteSpot(request, reply)
  );

  // Photo
  app.get<{ Params: { id: string } }>('/spots/:id/photo', async (request, reply) =>
    spotsController.getPhoto(request, reply)
  );

  // Explored status
  app.get<{ Params: { id: string } }>('/spots/:id/explored', async (request, reply) =>
    exploredController.getExplored(request, reply)
  );
  app.put<{ Params: { id: string } }>(
    '/spots/:id/explored',
    { bodyLimit: 2048 },
    async (request, reply) => exploredController.setExplored(request, reply)
  );

  // Reports
  app.post<{ Params: { id: string } }>(
    '/spots/:id/reports',
    { bodyLimit: 2048 },
    async (request, reply) => reportsController.submitReport(request, reply)
  );
}
