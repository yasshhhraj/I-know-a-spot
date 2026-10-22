import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { sendError, unavailable } from '../utils/response.js';
import { exploredPath } from '../validators/explored.validator.js';
import { reportPath } from '../validators/reports.validator.js';

export function centralizedErrorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): FastifyReply {
  const path = request.url.split('?')[0];

  if (reportPath(path)) {
    reply.header('Cache-Control', 'private, no-store');
    const status =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    return status === 400 || status === 413 || status === 415
      ? sendError(reply, 400, 'BAD_REQUEST', 'Invalid report request.')
      : unavailable(reply);
  }

  if (exploredPath(path)) {
    reply.header('Cache-Control', 'private, no-store');
    const status =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    return status === 400 || status === 413 || status === 415
      ? sendError(reply, 400, 'BAD_REQUEST', 'Invalid explored request.')
      : unavailable(reply);
  }

  if (path === '/spots/search') {
    reply.header('Cache-Control', 'private, no-store');
    const status =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    return status === 400 || status === 413 || status === 415
      ? sendError(reply, 400, 'BAD_REQUEST', 'Invalid search request.')
      : unavailable(reply);
  }

  if (path === '/me') {
    reply.header('Cache-Control', 'private, no-store');
    const status =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    return status === 400 || status === 415
      ? sendError(reply, 400, 'BAD_REQUEST', 'Invalid profile request.')
      : sendError(
          reply,
          503,
          'SERVICE_UNAVAILABLE',
          'Profile service is temporarily unavailable. Please retry.'
        );
  }

  if (path === '/spots' || path.startsWith('/spots/')) {
    reply.header('Cache-Control', 'private, no-store');
    const status =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    if (status === 413)
      return sendError(reply, 413, 'PHOTO_TOO_LARGE', 'Photo must be 10 MiB or smaller.');
    if (status === 400 || status === 415)
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot request.');
    return unavailable(reply);
  }

  return reply
    .code(503)
    .send({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable.' } });
}
