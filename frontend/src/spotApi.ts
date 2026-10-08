export type Audience = 'connections' | 'public'
export type SpotData = { title: string; note: string; audience: Audience; latitude: number; longitude: number; accessConfirmed: true; accessNote: string }
export type Spot = SpotData & { id: string; ownerId: string; authorName: string; createdAt: string; updatedAt: string; photoUrl: string }
export const spotIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
export const SPOT_READ_TIMEOUT_MS = 15_000
// Writes include auth/profile checks and, for creation, image processing plus
// storage and database work. Keep this bounded, but allow the longest ordered
// path (including delete cleanup) to finish before reporting an unknown outcome.
export const SPOT_MUTATION_TIMEOUT_MS = 35_000
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const validCoordinate = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max
const characterCount = (text: string) => [...text].length // Match backend Unicode code-point limits, not UTF-16 units.

export function validateData(value: Omit<SpotData, 'accessConfirmed'> & { accessConfirmed: boolean }): string | null {
  if (!value.title.trim() || characterCount(value.title) > 80) return 'Title must be 1–80 characters.'
  if (!value.note.trim() || characterCount(value.note) > 500) return 'Note must be 1–500 characters.'
  if (characterCount(value.accessNote) > 200) return 'Access note must be at most 200 characters.'
  if (value.audience !== 'connections' && value.audience !== 'public') return 'Choose an audience.'
  if (!validCoordinate(value.latitude, -90, 90) || !validCoordinate(value.longitude, -180, 180)) return 'Choose a valid destination pin.'
  if (value.accessConfirmed !== true) return 'Confirm appropriate public access before sharing.'
  return null
}

export function validatePhoto(file: File | null): string | null {
  if (!file) return 'Choose one photo.'
  if (file.size > 10 * 1024 * 1024) return 'Photo must be at most 10 MiB.'
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG or WebP photo. HEIC is not supported.'
  return null // Server validates actual bytes, dimensions, animation and strips metadata.
}

export function parseSpot(value: unknown, baseUrl: string): Spot | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !spotIdPattern.test(value.id) ||
      typeof value.ownerId !== 'string' || !spotIdPattern.test(value.ownerId) ||
      typeof value.authorName !== 'string' || !value.authorName.trim() ||
      typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' ||
      typeof value.photoUrl !== 'string' || !photoEndpoint(baseUrl, value.photoUrl, value.id)) return null
  const data = { title: value.title, note: value.note, audience: value.audience, latitude: value.latitude, longitude: value.longitude, accessConfirmed: value.accessConfirmed, accessNote: value.accessNote }
  if (typeof data.title !== 'string' || typeof data.note !== 'string' || typeof data.accessNote !== 'string' ||
      typeof data.latitude !== 'number' || typeof data.longitude !== 'number' ||
      (data.audience !== 'connections' && data.audience !== 'public') || data.accessConfirmed !== true ||
      validateData(data as SpotData)) return null
  return { ...data as SpotData, id: value.id, ownerId: value.ownerId, authorName: value.authorName, createdAt: value.createdAt, updatedAt: value.updatedAt, photoUrl: value.photoUrl }
}

export function photoEndpoint(baseUrl: string, path: string, id: string): string | null {
  // Reject protocol-relative, traversal, query, fragments and any mismatched ID.
  if (!spotIdPattern.test(id) || path !== `/spots/${id}/photo`) return null
  return `${baseUrl}${path}`
}

export function multipart(data: SpotData, photo: File): FormData {
  const body = new FormData()
  body.append('data', JSON.stringify(data))
  body.append('photo', photo)
  return body
}

export type SpotFailure = { kind: 'auth' | 'invalid' | 'unavailable' | 'uncertain' | 'cleanup'; message: string }
export class SpotApiError extends Error {
  readonly failure: SpotFailure
  constructor(failure: SpotFailure) { super(failure.message); this.failure = failure }
}

export function safeFailure(status: number, body: unknown, mutation: boolean): SpotFailure {
  const code = isRecord(body) && isRecord(body.error) ? body.error.code : null
  if (status === 401 || status === 403) return { kind: 'auth', message: 'Pilot access needs verification.' }
  if (status === 503 && code === 'MEDIA_CLEANUP_PENDING') return { kind: 'cleanup', message: 'Spot is hidden, but photo cleanup is pending. Retry deletion explicitly.' }
  if (status === 413 && code === 'PHOTO_TOO_LARGE') return { kind: 'invalid', message: 'Photo is too large (10 MiB maximum).' }
  if (status === 415 && code === 'UNSUPPORTED_PHOTO') return { kind: 'invalid', message: 'Unsupported photo. Use a non-animated JPEG, PNG or WebP.' }
  if (status === 400 && code === 'BAD_REQUEST') return { kind: 'invalid', message: 'Invalid spot details. Review the fields and selected photo.' }
  if (status === 404 && code === 'NOT_FOUND') return { kind: 'unavailable', message: 'Spot unavailable.' }
  if (mutation && (status >= 500 || status === 0)) return { kind: 'uncertain', message: 'The save timed out or its network/server response was uncertain. It may have completed; check the list/detail before submitting again.' }
  return { kind: 'unavailable', message: 'Spot service unavailable. Try again later.' }
}

export async function spotRequest(base: string, token: string, path: string, signal: AbortSignal, method = 'GET', body?: BodyInit, contentType?: string, timeoutMs?: number): Promise<unknown> {
  const request = new AbortController()
  const mutation = method !== 'GET'
  const requestTimeout = timeoutMs ?? (mutation ? SPOT_MUTATION_TIMEOUT_MS : SPOT_READ_TIMEOUT_MS)
  const abort = () => request.abort()
  if (signal.aborted) request.abort()
  else signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, requestTimeout)
  try {
    const response = await fetch(`${base}${path}`, { method, body, headers: { Authorization: `Bearer ${token}`, ...(contentType ? { 'Content-Type': contentType } : {}) }, cache: 'no-store', signal: request.signal })
    if (request.signal.aborted) throw new SpotApiError(safeFailure(0, null, mutation))
    if (response.status === 204 && method === 'DELETE') return null
    if (path.endsWith('/photo') && response.ok) {
      if (response.headers.get('Content-Type')?.split(';')[0].trim() !== 'image/webp') throw new SpotApiError(safeFailure(0, null, false))
      const blob = await response.blob()
      if (request.signal.aborted) throw new SpotApiError(safeFailure(0, null, false))
      return blob
    }
    let payload: unknown
    try { payload = await response.json() } catch { throw new SpotApiError(safeFailure(response.ok ? 0 : response.status, null, mutation)) }
    if (!response.ok) throw new SpotApiError(safeFailure(response.status, payload, mutation))
    if (request.signal.aborted) throw new SpotApiError(safeFailure(0, null, mutation))
    return payload
  } catch (error) {
    if (error instanceof SpotApiError) throw error
    throw new SpotApiError(safeFailure(0, null, mutation))
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}

export function asSpot(payload: unknown, baseUrl: string, mutation = false): Spot {
  const spot = isRecord(payload) && parseSpot(payload.spot, baseUrl)
  if (!spot) throw new SpotApiError(safeFailure(0, null, mutation))
  return spot
}
export function asSpots(payload: unknown, baseUrl: string): Spot[] {
  if (!isRecord(payload) || !Array.isArray(payload.spots) || payload.spots.length > 50) throw new SpotApiError(safeFailure(0, null, false))
  const spots = payload.spots.map(item => parseSpot(item, baseUrl))
  if (spots.some(item => !item)) throw new SpotApiError(safeFailure(0, null, false))
  return spots as Spot[]
}
