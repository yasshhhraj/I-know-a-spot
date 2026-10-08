import { normalizeCenter, type Center } from './discovery.ts'
import { parseSpot, type Audience, type Spot } from './spotApi.ts'

export const SEARCH_TIMEOUT_MS = 45_000
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export type SearchResult = { mode: 'semantic' | 'browse'; spots: Spot[]; candidateLimit: 50; emptyReason?: 'no_candidates' | 'no_matches' }
export type SearchFailure = { kind: 'invalid' | 'auth' | 'busy' | 'unavailable'; message: string }
export class SearchApiError extends Error {
  readonly failure: SearchFailure
  constructor(failure: SearchFailure) { super(failure.message); this.failure = failure }
}
const unavailable = (): SearchApiError => new SearchApiError({ kind: 'unavailable', message: 'Search unavailable. Retry or browse spots instead.' })

export function searchQuery(value: string): string {
  const trimmed = value.trim()
  if ([...trimmed].length > 200) throw new SearchApiError({ kind: 'invalid', message: 'Search must be at most 200 characters.' })
  return trimmed
}

export function searchBody(query: string, feed: Audience, center: Center | null): { query: string; feed: Audience; centerLat?: number; centerLon?: number } {
  const trimmed = searchQuery(query)
  if (feed === 'connections') return { query: trimmed, feed }
  const confirmed = center && normalizeCenter(center.latitude, center.longitude)
  if (feed !== 'public' || !confirmed) throw new SearchApiError({ kind: 'invalid', message: 'Confirm a valid discovery center before searching Public spots.' })
  return { query: trimmed, feed, centerLat: confirmed.latitude, centerLon: confirmed.longitude }
}

export function parseSearchResult(payload: unknown, base: string, feed: Audience, query: string): SearchResult {
  if (!isRecord(payload) || Object.keys(payload).some(key => !['mode', 'spots', 'candidateLimit', 'emptyReason'].includes(key)) ||
      payload.candidateLimit !== 50 || payload.mode !== (searchQuery(query) ? 'semantic' : 'browse') ||
      !Array.isArray(payload.spots) || payload.spots.length > (payload.mode === 'semantic' ? 3 : 50)) throw unavailable()
  const spots = payload.spots.map(row => parseSpot(row, base))
  if (spots.some(spot => !spot || (feed === 'public' && (spot.audience !== 'public' || spot.distanceKm === undefined)) ||
      (feed === 'connections' && spot.distanceKm !== undefined))) throw unavailable()
  const validSpots = spots as Spot[]
  if (new Set(validSpots.map(spot => spot.id)).size !== validSpots.length) throw unavailable()
  if (validSpots.length ? payload.emptyReason !== undefined :
      (payload.emptyReason !== 'no_candidates' && (payload.mode !== 'semantic' || payload.emptyReason !== 'no_matches'))) throw unavailable()
  return { mode: payload.mode, spots: validSpots, candidateLimit: 50,
    ...(validSpots.length ? {} : { emptyReason: payload.emptyReason }) } as SearchResult
}

function searchFailure(status: number, body: unknown): SearchApiError {
  const code = isRecord(body) && isRecord(body.error) ? body.error.code : null
  if (status === 401 || status === 403) return new SearchApiError({ kind: 'auth', message: 'Pilot access needs verification.' })
  if (status === 400 && code === 'BAD_REQUEST') return new SearchApiError({ kind: 'invalid', message: 'Search request was invalid. Check your query and discovery center.' })
  if (status === 429 && code === 'SEARCH_BUSY') return new SearchApiError({ kind: 'busy', message: 'Search is busy. Retry in a moment or browse spots.' })
  return unavailable() // Never display upstream message, status text or body.
}

// POST here is read-only. Do not pass through spotRequest's uncertain-mutation handling.
export async function searchSpots(base: string, token: string, query: string, feed: Audience, center: Center | null, callerSignal: AbortSignal, timeoutMs = SEARCH_TIMEOUT_MS): Promise<SearchResult> {
  const body = searchBody(query, feed, center)
  const request = new AbortController()
  const abort = () => request.abort()
  if (callerSignal.aborted) request.abort()
  else callerSignal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    if (request.signal.aborted) throw unavailable()
    const response = await fetch(`${base}/spots/search`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store', signal: request.signal,
    })
    if (request.signal.aborted) throw unavailable()
    let payload: unknown
    try { payload = await response.json() } catch { throw unavailable() }
    if (request.signal.aborted) throw unavailable()
    if (!response.ok) throw searchFailure(response.status, payload)
    return parseSearchResult(payload, base, feed, body.query)
  } catch (error) {
    if (error instanceof SearchApiError) throw error
    throw unavailable()
  } finally { clearTimeout(timer); callerSignal.removeEventListener('abort', abort) }
}
