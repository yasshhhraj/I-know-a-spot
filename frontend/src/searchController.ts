import { FeedScopeLifecycle } from './spotScope.ts'

// Own a fresh effect scope per request, including StrictMode setup/cleanup replay.
// An abort is advisory: the generation guard also drops fetches that ignore it.
export class ScopedResultsController {
  private lifecycle = new FeedScopeLifecycle()
  private generation = 0

  invalidate() { this.generation++; this.lifecycle.invalidate() }

  begin<T>(key: string, identity: string, session: () => Promise<{ access_token: string; user: { id: string } } | null>,
    task: (token: string, signal: AbortSignal) => Promise<T>,
    publish: (event: { key: string; status: 'success'; value: T } | { key: string; status: 'error'; error: unknown }) => void): () => void {
    const generation = ++this.generation
    const scope = this.lifecycle.begin()
    let active = true
    void scope.run(identity, session, task).then(value => {
      if (active && generation === this.generation && value !== undefined) publish({ key, status: 'success', value })
    }).catch(error => {
      if (active && generation === this.generation) publish({ key, status: 'error', error })
    })
    return () => { active = false; if (generation === this.generation) this.generation++; this.lifecycle.end(scope) }
  }
}
