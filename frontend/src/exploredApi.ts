import { spotIdPattern } from './spotApi.ts'

export const EXPLORED_READ_TIMEOUT_MS = 30_000
export const EXPLORED_WRITE_TIMEOUT_MS = 35_000
export type ExploredFailure = { kind: 'invalid' | 'auth' | 'missing' | 'unavailable' | 'uncertain'; message: string }
export class ExploredApiError extends Error {
  readonly failure: ExploredFailure
  constructor(failure: ExploredFailure) { super(failure.message); this.failure = failure }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const unavailable = () => new ExploredApiError({ kind: 'unavailable', message: 'Explored state unavailable. Reload state to try again.' })
const uncertain = () => new ExploredApiError({ kind: 'uncertain', message: 'The change may have saved, but its outcome is uncertain. Reload state before changing it again.' })

export function parseExploration(payload: unknown, requestedId: string, desired?: boolean): boolean {
  if (!record(payload) || Object.keys(payload).length !== 1 || !record(payload.exploration) ||
      Object.keys(payload.exploration).length !== 2 ||
      !Object.hasOwn(payload.exploration, 'spotId') || !Object.hasOwn(payload.exploration, 'explored') ||
      payload.exploration.spotId !== requestedId || typeof payload.exploration.explored !== 'boolean' ||
      (desired !== undefined && payload.exploration.explored !== desired)) throw desired === undefined ? unavailable() : uncertain()
  return payload.exploration.explored
}

function failure(status: number, write: boolean): ExploredApiError {
  if (status === 400) return new ExploredApiError({ kind: 'invalid', message: 'Explored request was invalid.' })
  if (status === 401 || status === 403) return new ExploredApiError({ kind: 'auth', message: 'Pilot access needs verification.' })
  if (status === 404) return new ExploredApiError({ kind: 'missing', message: 'Spot unavailable.' })
  // A write may have committed before a 5xx, timeout, network loss, or unreadable response.
  return write && (status >= 500 || status === 0) ? uncertain() : unavailable()
}

export async function exploredRequest(base: string, token: string, spotId: string, signal: AbortSignal, desired?: boolean, timeoutMs = desired === undefined ? EXPLORED_READ_TIMEOUT_MS : EXPLORED_WRITE_TIMEOUT_MS): Promise<boolean> {
  if (!spotIdPattern.test(spotId) || (desired !== undefined && typeof desired !== 'boolean')) throw failure(400, desired !== undefined)
  const write = desired !== undefined
  const request = new AbortController()
  const abort = () => request.abort()
  if (signal.aborted) request.abort()
  else signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    if (request.signal.aborted) throw failure(0, write)
    const response = await fetch(`${base}/spots/${spotId}/explored`, {
      method: write ? 'PUT' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(write ? { 'Content-Type': 'application/json' } : {}) },
      ...(write ? { body: JSON.stringify({ explored: desired }) } : {}), cache: 'no-store', signal: request.signal,
    })
    if (request.signal.aborted) throw failure(0, write)
    let payload: unknown
    try { payload = await response.json() } catch { throw failure(response.ok ? 0 : response.status, write) }
    if (request.signal.aborted) throw failure(0, write)
    if (!response.ok || response.status !== 200) throw failure(response.ok ? 0 : response.status, write)
    return parseExploration(payload, spotId, desired)
  } catch (error) {
    if (error instanceof ExploredApiError) throw error
    throw failure(0, write)
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}
