import { useEffect, useRef, useState } from 'react'
import { apiBaseUrl } from './config'
import { exploredRequest } from './exploredApi'
import { ExploredController, type ExploredState } from './exploredController'
import { getSupabaseClient } from './supabase'

const button = 'min-h-12 rounded-lg border border-stone-600 px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50'

export function ExploredControl({ memberId, spotId, recheck, onMissing }: { memberId: string; spotId: string; recheck: () => void; onMissing: () => void }) {
  const [state, setState] = useState<ExploredState>({ phase: 'loading', confirmed: null, message: 'Loading your explored state…' })
  const controller = useRef(new ExploredController())
  const actions = useRef<ReturnType<ExploredController['begin']> | null>(null)
  const callbacks = useRef({ recheck, onMissing })
  callbacks.current = { recheck, onMissing }
  useEffect(() => {
    const current = controller.current.begin(memberId, spotId,
      async () => (await getSupabaseClient().auth.getSession()).data.session,
      (token, id, signal, desired) => exploredRequest(apiBaseUrl, token, id, signal, desired),
      setState, () => callbacks.current.recheck(), () => callbacks.current.onMissing())
    actions.current = current
    return () => { current.dispose(); if (actions.current === current) actions.current = null }
  }, [memberId, spotId])
  const active = state.phase === 'ready' && state.confirmed !== null
  return <section aria-label="Your explored state" className="rounded-lg border border-stone-300 p-3">
    <h5 className="font-semibold">Explored (self-reported)</h5>
    <p className="text-sm">Only your own mark is shown. This is voluntary, not a verified visit: no GPS proof, public counts or rankings.</p>
    <p role={state.phase === 'error' || state.phase === 'uncertain' || (state.phase === 'ready' && state.message.includes('invalid')) ? 'alert' : 'status'} aria-live="polite" className="mt-2">{state.message}</p>
    {state.phase === 'uncertain' && <p className="text-sm">The last confirmed value may be outdated. A reload shows a current snapshot, not proof that an in-flight write cannot complete later.</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={button} aria-pressed={state.confirmed === null ? undefined : state.confirmed} disabled={!active} onClick={() => { if (state.confirmed !== null) actions.current?.set(!state.confirmed) }}>
        {state.confirmed === null ? 'Explored state unknown' : state.confirmed ? 'Mark unexplored' : 'Mark explored'}
      </button>
      {(state.phase === 'error' || state.phase === 'uncertain') && <button type="button" className={button} onClick={() => actions.current?.reload()}>Reload state</button>}
    </div>
  </section>
}
