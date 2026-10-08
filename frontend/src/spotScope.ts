import { SpotApiError, safeFailure } from './spotApi.ts'

// A workspace lives only while its /me-verified profile is gated. Epochs also
// reject late responses from fetch implementations that ignore AbortSignal.
export class SpotScope {
  private epoch = 0
  private alive = true
  private pending = new Set<AbortController>()
  private urls = new Set<string>()

  invalidate() {
    this.epoch++
    for (const request of this.pending) request.abort()
    this.pending.clear()
    for (const url of this.urls) URL.revokeObjectURL(url)
    this.urls.clear()
  }
  dispose() { this.alive = false; this.invalidate() }
  current(epoch: number) { return this.alive && this.epoch === epoch }
  track(blob: Blob) {
    const url = URL.createObjectURL(blob)
    this.urls.add(url)
    return url
  }
  revoke(url: string | null) { if (url && this.urls.delete(url)) URL.revokeObjectURL(url) }

  async run<T>(identity: string, getSession: () => Promise<{ access_token: string; user: { id: string } } | null>, task: (token: string, signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    const epoch = this.epoch
    const request = new AbortController()
    this.pending.add(request)
    try {
      const session = await getSession() // Outside Supabase's auth-state callback.
      if (!this.current(epoch) || request.signal.aborted) return undefined
      if (!session || session.user.id !== identity || !session.access_token) throw new SpotApiError(safeFailure(401, { error: { code: 'UNAUTHORIZED' } }, false))
      const result = await task(session.access_token, request.signal)
      return this.current(epoch) && !request.signal.aborted ? result : undefined
    } catch (error) {
      if (!this.current(epoch) || request.signal.aborted) return undefined
      throw error
    } finally { this.pending.delete(request) }
  }
}
