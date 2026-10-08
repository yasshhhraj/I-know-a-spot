export type Profile = { id: string; displayName: string; publicRadiusKm: number }
export type MeResult =
  | { kind: 'enrolled'; profile: Profile }
  | { kind: 'expired' | 'denied' | 'outage' }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseProfile(value: unknown, userId?: string): Profile | null {
  if (!record(value)) return null
  const { id, displayName, publicRadiusKm } = value
  if (typeof id !== 'string' || (userId && id !== userId) || typeof displayName !== 'string' || !displayName.trim() ||
      typeof publicRadiusKm !== 'number' || !Number.isInteger(publicRadiusKm) || publicRadiusKm < 1 || publicRadiusKm > 25) return null
  return { id, displayName, publicRadiusKm }
}

export function radiusValue(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const number = Number(value.trim())
  return Number.isInteger(number) && number >= 1 && number <= 25 ? number : null
}

export class RadiusError extends Error {
  readonly kind: 'auth' | 'invalid' | 'unavailable' | 'uncertain'
  constructor(kind: 'auth' | 'invalid' | 'unavailable' | 'uncertain', message: string) { super(message); this.kind = kind }
}

export async function saveRadius(baseUrl: string, token: string, userId: string, radius: number, signal: AbortSignal): Promise<Profile> {
  if (!Number.isInteger(radius) || radius < 1 || radius > 25) throw new RadiusError('invalid', 'Enter a whole-number radius from 1 to 25 km.')
  const request = new AbortController()
  const abort = () => request.abort()
  if (signal.aborted) request.abort()
  else signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 35_000)
  try {
    const response = await fetch(`${baseUrl}/me`, { method: 'PATCH', body: JSON.stringify({ publicRadiusKm: radius }), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store', signal: request.signal })
    if (request.signal.aborted) throw new RadiusError('uncertain', 'Radius save may have completed. Reload and verify your profile before saving again.')
    let body: unknown
    try { body = await response.json() } catch { throw new RadiusError('uncertain', 'Radius save response could not be verified. Reload and verify your profile before saving again.') }
    if (response.status === 401 || response.status === 403) throw new RadiusError('auth', 'Pilot access needs verification.')
    if (response.status === 400) throw new RadiusError('invalid', 'Enter a whole-number radius from 1 to 25 km.')
    if (!response.ok) throw new RadiusError('uncertain', 'Radius save may have completed. Reload and verify your profile before saving again.')
    const profile = record(body) && parseProfile(body.profile, userId)
    if (!profile || request.signal.aborted || profile.publicRadiusKm !== radius) throw new RadiusError('uncertain', 'Radius save response could not be verified. Reload and verify your profile before saving again.')
    return profile
  } catch (error) {
    if (error instanceof RadiusError) throw error
    throw new RadiusError('uncertain', 'Radius save may have completed. Reload and verify your profile before saving again.')
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}

export function parseMe(status: number, body: unknown, userId: string): MeResult {
  if (status === 200 && record(body) && record(body.profile)) {
    const profile = parseProfile(body.profile, userId)
    if (profile) return { kind: 'enrolled', profile }
  }
  if (record(body) && record(body.error) && typeof body.error.message === 'string') {
    if (status === 401 && body.error.code === 'UNAUTHORIZED') return { kind: 'expired' }
    if (status === 403 && body.error.code === 'NOT_ENROLLED') return { kind: 'denied' }
  }
  return { kind: 'outage' }
}

export async function fetchMe(baseUrl: string, token: string, userId: string, signal: AbortSignal, timeoutMs = 15_000): Promise<MeResult> {
  // Abort both on caller invalidation (sign-out/account switch) and a stalled request.
  // A local controller avoids relying on AbortSignal.any/timeout on older mobile browsers.
  const request = new AbortController()
  const onCallerAbort = () => request.abort()
  if (signal.aborted) request.abort()
  else signal.addEventListener('abort', onCallerAbort, { once: true })
  const timer = setTimeout(() => request.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: request.signal,
    })
    const body: unknown = await response.json()
    return request.signal.aborted ? { kind: 'outage' } : parseMe(response.status, body, userId)
  } catch {
    return { kind: 'outage' }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onCallerAbort)
  }
}
