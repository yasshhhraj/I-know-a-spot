import { spotIdPattern } from './spotApi.ts'

export const REPORT_TIMEOUT_MS = 35_000
export const reportReasons = ['private_property', 'sensitive_location', 'inappropriate_content', 'inaccurate'] as const
export type ReportReason = typeof reportReasons[number]
export const reportLabels: Record<ReportReason, string> = {
  private_property: 'Private property',
  sensitive_location: 'Sensitive location',
  inappropriate_content: 'Inappropriate photo or content',
  inaccurate: 'Inaccurate',
}
export const isReportReason = (value: unknown): value is ReportReason => reportReasons.some(reason => reason === value)
export type ReportFailure = { kind: 'invalid' | 'auth' | 'missing' | 'uncertain'; message: string }
export class ReportApiError extends Error {
  readonly failure: ReportFailure
  constructor(failure: ReportFailure) { super(failure.message); this.failure = failure }
}
const invalid = () => new ReportApiError({ kind: 'invalid', message: 'Choose a valid reason for this report.' })
const uncertain = () => new ReportApiError({ kind: 'uncertain', message: 'The report may have been received, but we could not confirm it. You may explicitly retry the same reason; identical reports are deduplicated. A different reason is a separate report.' })
const errorFor = (status: number) => {
  if (status === 400) return invalid()
  if (status === 401 || status === 403) return new ReportApiError({ kind: 'auth', message: 'Pilot access needs verification.' })
  if (status === 404) return new ReportApiError({ kind: 'missing', message: 'Spot unavailable.' })
  return uncertain()
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseReport(payload: unknown, requestedId: string, reason: ReportReason): void {
  if (!record(payload) || Object.keys(payload).length !== 1 || !record(payload.report) ||
      Object.keys(payload.report).length !== 3 || payload.report.spotId !== requestedId ||
      payload.report.reason !== reason || payload.report.accepted !== true ||
      !['spotId', 'reason', 'accepted'].every(key => Object.hasOwn(payload.report as object, key))) throw uncertain()
}

export async function submitReport(base: string, token: string, spotId: string, reason: ReportReason, signal: AbortSignal, timeoutMs = REPORT_TIMEOUT_MS): Promise<void> {
  if (!spotIdPattern.test(spotId) || !isReportReason(reason)) throw invalid()
  const request = new AbortController()
  const abort = () => request.abort()
  if (signal.aborted) request.abort()
  else signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  let rejectAbort!: (error: ReportApiError) => void
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const onAbort = () => rejectAbort(uncertain())
  request.signal.addEventListener('abort', onAbort, { once: true })
  try {
    if (request.signal.aborted) throw uncertain()
    const response = await Promise.race([fetch(`${base}/spots/${spotId}/reports`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }), cache: 'no-store', signal: request.signal,
    }), aborted])
    if (request.signal.aborted) throw uncertain()
    if (response.status !== 200) throw errorFor(response.status)
    let payload: unknown
    try { payload = await Promise.race([response.json(), aborted]) } catch { throw uncertain() }
    if (request.signal.aborted) throw uncertain()
    parseReport(payload, spotId, reason)
  } catch (error) {
    if (error instanceof ReportApiError) throw error
    throw uncertain() // Never surface raw network/upstream details or assume a write failed.
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); request.signal.removeEventListener('abort', onAbort) }
}
