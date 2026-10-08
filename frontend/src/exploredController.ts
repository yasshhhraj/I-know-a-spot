import { ExploredApiError } from './exploredApi.ts'
import { SpotApiError } from './spotApi.ts'
import { FeedScopeLifecycle } from './spotScope.ts'

export type ExploredState = { phase: 'loading' | 'ready' | 'saving' | 'error' | 'uncertain'; confirmed: boolean | null; message: string }
type Session = () => Promise<{ access_token: string; user: { id: string } } | null>
type Task = (token: string, spotId: string, signal: AbortSignal, desired?: boolean) => Promise<boolean>
type Failure = 'auth' | 'missing' | 'invalid' | 'other' | 'uncertain'

export class ExploredController {
  private lifecycle = new FeedScopeLifecycle()
  private generation = 0

  begin(memberId: string, spotId: string, session: Session, task: Task, publish: (state: ExploredState) => void, onAuth: () => void, onMissing: () => void) {
    const generation = ++this.generation
    const scope = this.lifecycle.begin()
    let active = true
    let state: ExploredState = { phase: 'error', confirmed: null, message: '' }
    const current = () => active && generation === this.generation
    const update = (next: ExploredState) => { if (current()) { state = next; publish(next) } }
    const classify = (error: unknown): { kind: Failure; message: string } => {
      if (error instanceof ExploredApiError) return { kind: error.failure.kind === 'unavailable' ? 'other' : error.failure.kind, message: error.failure.message }
      if (error instanceof SpotApiError && error.failure.kind === 'auth') return { kind: 'auth', message: 'Pilot access needs verification.' }
      return { kind: 'other', message: 'Explored state unavailable. Reload state to try again.' }
    }
    const handle = (error: unknown, wasWrite: boolean) => {
      if (!current()) return
      const failure = classify(error)
      // A failed reconciliation cannot resolve an uncertain write.
      const uncertain = failure.kind === 'uncertain' || (wasWrite && failure.kind === 'other') || state.phase === 'uncertain'
      update({ phase: uncertain ? 'uncertain' : wasWrite ? 'ready' : 'error', confirmed: state.confirmed, message: failure.message })
      if (failure.kind === 'auth') onAuth()
      if (failure.kind === 'missing') onMissing()
    }
    const load = () => {
      if (!current() || state.phase === 'loading' || state.phase === 'saving') return false
      const unresolved = state.phase === 'uncertain'
      update({ ...state, phase: 'loading', message: unresolved ? 'Reloading state after uncertain change…' : 'Loading your explored state…' })
      void scope.run(memberId, session, (token, signal) => task(token, spotId, signal)).then(value => {
        if (current() && value !== undefined) update({ phase: 'ready', confirmed: value, message: value ? 'You marked this spot explored.' : 'You have not marked this spot explored.' })
      }).catch(error => {
        if (unresolved && current()) state = { ...state, phase: 'uncertain' }
        handle(error, false)
      })
      return true
    }
    const set = (desired: boolean) => {
      if (!current() || state.phase !== 'ready' || state.confirmed === null || typeof desired !== 'boolean' || desired === state.confirmed) return false
      update({ ...state, phase: 'saving', message: 'Saving explored state…' })
      void scope.run(memberId, session, (token, signal) => task(token, spotId, signal, desired)).then(value => {
        if (current() && value !== undefined) update({ phase: 'ready', confirmed: value, message: value ? 'Explored state saved: explored.' : 'Explored state saved: unexplored.' })
      }).catch(error => handle(error, true))
      return true
    }
    // Fresh scope per effect setup, including React StrictMode's cleanup/setup replay.
    // The loading state is published synchronously before starting the independent read.
    load()
    return { reload: load, set, dispose: () => { active = false; if (generation === this.generation) this.generation++; this.lifecycle.end(scope) } }
  }
}
