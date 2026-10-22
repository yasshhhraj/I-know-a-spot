import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Profile, ProfileProvider } from '../models/profile.model.js';
import { SearchFailure, type SearchDeadline } from '../models/search.model.js';
import { sendError, unavailable } from '../utils/response.js';
import { exploredPath } from '../validators/explored.validator.js';
import { reportPath } from '../validators/reports.validator.js';

export const BEARER_TOKEN_REGEX = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i;

export type AuthenticatedCaller = {
  token: string;
  profile: Profile;
};

export async function verifyCaller(
  request: FastifyRequest,
  reply: FastifyReply,
  profileProvider: ProfileProvider,
  deadline?: SearchDeadline
): Promise<AuthenticatedCaller | null> {
  const authHeader = request.headers.authorization;
  const match = typeof authHeader === 'string' && BEARER_TOKEN_REGEX.exec(authHeader);
  if (!match) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Sign in to continue.');
    return null;
  }
  const token = match[1];
  let result;
  try {
    result = deadline
      ? await deadline.run(profileProvider(token))
      : await profileProvider(token);
  } catch (error) {
    if (error instanceof SearchFailure) {
      sendError(
        reply,
        503,
        'SEARCH_UNAVAILABLE',
        'Search is temporarily unavailable. Please retry.'
      );
      return null;
    }
    result = { kind: 'unavailable' } as const;
  }
  if (result.kind === 'ok') {
    return { token, profile: result.profile };
  }
  if (result.kind === 'unauthorized') {
    sendError(reply, 401, 'UNAUTHORIZED', 'Sign in to continue.');
  } else if (result.kind === 'not_enrolled') {
    sendError(reply, 403, 'NOT_ENROLLED', 'This account is not enrolled in the pilot.');
  } else {
    unavailable(reply);
  }
  return null;
}

export function earlyAuthGuard(request: FastifyRequest, reply: FastifyReply): boolean {
  const path = request.url.split('?')[0];
  const requiresEarlyAuth =
    (request.method === 'POST' && path === '/spots/search') ||
    (request.method === 'PUT' && exploredPath(path)) ||
    (request.method === 'POST' && reportPath(path));

  if (
    requiresEarlyAuth &&
    (typeof request.headers.authorization !== 'string' ||
      !BEARER_TOKEN_REGEX.test(request.headers.authorization))
  ) {
    reply.header('Cache-Control', 'private, no-store');
    sendError(reply, 401, 'UNAUTHORIZED', 'Sign in to continue.');
    return true;
  }
  return false;
}
