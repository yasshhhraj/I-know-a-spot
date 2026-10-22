import type { FastifyReply, FastifyRequest } from 'fastify';
import { SearchDeadline } from '../models/search.model.js';

export const requestStarted = new WeakMap<object, number>();
export const searchDeadlines = new WeakMap<object, SearchDeadline>();

export function setupRequestTracking(request: FastifyRequest): void {
  requestStarted.set(request, Date.now());
  if (request.method === 'POST' && request.url.split('?')[0] === '/spots/search') {
    searchDeadlines.set(request, new SearchDeadline());
  }
}

export function logApiResponse(request: FastifyRequest, reply: FastifyReply): void {
  const route = request.routeOptions?.url ?? request.url.split('?')[0];
  console.info(
    JSON.stringify({
      event: 'api_response',
      requestId: request.id,
      method: request.method,
      route,
      status: reply.statusCode,
      durationMs: Date.now() - (requestStarted.get(request) ?? Date.now()),
    })
  );
}
