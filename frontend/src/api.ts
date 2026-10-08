export type Profile = { id: string; displayName: string; publicRadiusKm: number }
export type MeResult =
  | { kind: 'enrolled'; profile: Profile }
  | { kind: 'expired' | 'denied' | 'outage' }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseMe(status: number, body: unknown, userId: string): MeResult {
  if (status === 200 && record(body) && record(body.profile)) {
    const { id, displayName, publicRadiusKm } = body.profile
    if (id === userId && typeof displayName === 'string' && displayName.trim().length > 0 &&
        Number.isInteger(publicRadiusKm) && (publicRadiusKm as number) >= 1 && (publicRadiusKm as number) <= 25) {
      return { kind: 'enrolled', profile: { id, displayName, publicRadiusKm: publicRadiusKm as number } }
    }
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
