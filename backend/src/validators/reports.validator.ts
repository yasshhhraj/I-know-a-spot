import { REPORT_REASONS, type ReportReason } from '../models/report.model.js';

export function reportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && REPORT_REASONS.some((reason) => reason === value);
}

export function reportBody(raw: unknown): ReportReason | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  return Object.keys(body).length === 1 &&
    Object.hasOwn(body, 'reason') &&
    reportReason(body.reason)
    ? body.reason
    : null;
}

export function reportPath(path: string): boolean {
  return /^\/spots\/[^/]+\/reports$/.test(path);
}
