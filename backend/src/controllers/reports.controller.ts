import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProfileProvider } from '../models/profile.model.js';
import type { SpotStore } from '../models/spot.model.js';
import type { ReportStore } from '../models/report.model.js';
import { verifyCaller } from '../middleware/auth.middleware.js';
import { isValidUUID } from '../validators/common.validator.js';
import { reportBody } from '../validators/reports.validator.js';
import { missing, sendError, unavailable } from '../utils/response.js';

export class ReportsController {
  constructor(
    private readonly spotStore: SpotStore,
    private readonly reportStore: ReportStore,
    private readonly profileProvider: ProfileProvider
  ) {}

  private validateId(id: string, reply: FastifyReply): boolean {
    if (!isValidUUID(id)) {
      sendError(reply, 400, 'BAD_REQUEST', 'Invalid spot ID.');
      return false;
    }
    return true;
  }

  async submitReport(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    reply.header('Cache-Control', 'private, no-store');
    const caller = await verifyCaller(request, reply, this.profileProvider);
    if (!caller) return;
    const id = request.params.id;
    if (!this.validateId(id, reply)) return;

    if (
      (request.raw.url ?? '').includes('?') ||
      !/^application\/json(?:\s*;|\s*$)/i.test(request.headers['content-type'] ?? '')
    ) {
      return sendError(reply, 400, 'BAD_REQUEST', 'Invalid report request.');
    }

    const reason = reportBody(request.body);
    if (!reason) return sendError(reply, 400, 'BAD_REQUEST', 'Invalid report request.');

    try {
      const before = await this.spotStore.get(caller.token, id);
      if (!before || before.removed_at) return missing(reply);

      // Re-read with the same caller JWT even on RPC failure or zero rows. A
      // concurrent revocation wins over an ambiguous provider result.
      let accepted: boolean | null | undefined;
      let failed = false;
      try {
        accepted = await this.reportStore.submit(caller.token, id, reason);
      } catch {
        failed = true;
      }
      const after = await this.spotStore.get(caller.token, id);
      if (!after || after.removed_at) return missing(reply);
      if (accepted === null) return missing(reply);
      if (failed || accepted !== true) return unavailable(reply);
      return { report: { spotId: id, reason, accepted: true } };
    } catch {
      return unavailable(reply);
    }
  }
}
