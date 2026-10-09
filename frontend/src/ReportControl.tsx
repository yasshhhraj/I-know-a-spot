import { useEffect, useRef, useState, type FormEvent } from 'react'
import { apiBaseUrl } from './config'
import { ReportController, type ReportState } from './reportController'
import { reportLabels, reportReasons, submitReport } from './reportApi'
import { getSupabaseClient } from './supabase'

const button = 'ui-button min-h-12 rounded-xl border border-[var(--control-outline)] px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-50'

export function ReportControl({ memberId, spotId, recheck, onMissing }: { memberId: string; spotId: string; recheck: () => void; onMissing: () => void }) {
  const [state, setState] = useState<ReportState>({ phase: 'idle', reason: null, message: '' })
  const controller = useRef(new ReportController())
  const actions = useRef<ReturnType<ReportController['begin']> | null>(null)
  const callbacks = useRef({ recheck, onMissing })
  callbacks.current = { recheck, onMissing }
  useEffect(() => {
    const current = controller.current.begin(memberId, spotId,
      async () => (await getSupabaseClient().auth.getSession()).data.session,
      (token, id, reason, signal) => submitReport(apiBaseUrl, token, id, reason, signal),
      setState, () => callbacks.current.recheck(), () => callbacks.current.onMissing())
    actions.current = current
    return () => { current.dispose(); if (actions.current === current) actions.current = null }
  }, [memberId, spotId])
  function send(event: FormEvent) { event.preventDefault(); actions.current?.submit() }
  return <section aria-label="Report spot" className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
    <h5 className="font-semibold text-[var(--forest-950)]">Report a concern</h5>
    <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">Reports are private for operator review, not public votes or automatic takedowns. Reporting does not remove this spot.</p>
    <form onSubmit={send} className="mt-3 space-y-3">
      <fieldset disabled={state.phase === 'pending'}>
        <legend className="font-medium">Choose one reason</legend>
        <div className="mt-2 space-y-2">{reportReasons.map(reason => <label key={reason} className="flex min-h-12 items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
          <input type="radio" name="report-reason" value={reason} checked={state.reason === reason} onChange={() => actions.current?.choose(reason)} className="size-5 accent-emerald-800" />{reportLabels[reason]}
        </label>)}</div>
      </fieldset>
      {state.message && <p role={state.phase === 'error' || state.phase === 'uncertain' ? 'alert' : 'status'} aria-live="polite" className={state.phase === 'error' || state.phase === 'uncertain' ? 'text-red-800' : ''}>{state.message}</p>}
       <button type="submit" className={`${button} ui-button-primary`} disabled={!state.reason || state.phase === 'pending' || state.phase === 'success'}>{state.phase === 'pending' ? 'Sending report…' : state.phase === 'uncertain' ? 'Retry same reason explicitly' : 'Submit report'}</button>
    </form>
  </section>
}
