import { ReportApiError, isReportReason, type ReportReason } from './reportApi.ts'
import { SpotApiError } from './spotApi.ts'
import { FeedScopeLifecycle } from './spotScope.ts'

export type ReportState = { phase: 'idle' | 'pending' | 'success' | 'error' | 'uncertain'; reason: ReportReason | null; message: string }
type Session = () => Promise<{ access_token: string; user: { id: string } } | null>
type Task = (token: string, spotId: string, reason: ReportReason, signal: AbortSignal) => Promise<void>

export class ReportController {
  private lifecycle = new FeedScopeLifecycle()
  private generation = 0

  begin(memberId: string, spotId: string, session: Session, task: Task, publish: (state: ReportState) => void, onAuth: () => void, onMissing: () => void) {
    const generation = ++this.generation
    const scope = this.lifecycle.begin()
    let active = true
    let state: ReportState = { phase: 'idle', reason: null, message: '' }
    const current = () => active && generation === this.generation
    const update = (next: ReportState) => { if (current()) { state = next; publish(next) } }
    update(state) // A new effect setup must reset stale state, including StrictMode replay.
    const choose = (reason: ReportReason | null) => {
      if (!current() || state.phase === 'pending' || (reason !== null && !isReportReason(reason))) return false
      if (reason === state.reason) return false
      update({ phase: 'idle', reason, message: state.phase === 'uncertain' ? 'The previous reason may have been received. A different reason is a separate report.' : '' })
      return true
    }
    const submit = () => {
      if (!current() || !state.reason || state.phase === 'pending' || state.phase === 'success') return false
      const reason = state.reason
      update({ phase: 'pending', reason, message: 'Sending report…' })
      void scope.run(memberId, session, async (token, signal) => { await task(token, spotId, reason, signal); return true }).then(value => {
        if (current() && value === true) update({ phase: 'success', reason, message: 'Report received for private operator review.' })
      }).catch(error => {
        if (!current()) return
        const failure = error instanceof ReportApiError ? error.failure :
          error instanceof SpotApiError && error.failure.kind === 'auth' ? { kind: 'auth', message: 'Pilot access needs verification.' } as const :
          { kind: 'uncertain', message: 'The report outcome is uncertain. Explicitly retry the same reason if needed.' } as const
        update({ phase: failure.kind === 'uncertain' ? 'uncertain' : 'error', reason, message: failure.message })
        if (failure.kind === 'auth') onAuth()
        if (failure.kind === 'missing') onMissing()
      })
      return true
    }
    return { choose, submit, dispose: () => { active = false; if (generation === this.generation) this.generation++; this.lifecycle.end(scope) } }
  }
}
