import { Component, lazy, Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { apiBaseUrl, hasApiConfig } from './config'
import { getSupabaseClient } from './supabase'
import { fetchMe } from './api'
import { AuthController, type AuthView } from './authController'

const SpotWorkspace = lazy(() => import('./SpotWorkspace').then(module => ({ default: module.SpotWorkspace })))

class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (this.state.failed) return <div role="alert" className="mt-8 rounded-lg border border-amber-700 p-4">
      <h3 className="font-semibold">Spot workspace unavailable</h3>
      <p className="mt-2">The workspace could not load. You can sign out above, or reload this page to try again.</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-12 rounded-lg border border-stone-600 px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Reload page</button>
    </div>
    return this.props.children
  }
}

export default function App() {
  const [view, setView] = useState<AuthView>({ kind: 'restoring' })
  const [controller, setController] = useState<AuthController | null>(null)
  const [configurationError, setConfigurationError] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const recheck = useCallback(() => controller?.recheckAccess(), [controller])

  useEffect(() => {
    if (!hasApiConfig()) {
      setConfigurationError(true)
      return
    }
    let client: ReturnType<typeof getSupabaseClient>
    try { client = getSupabaseClient() } catch {
      setConfigurationError(true)
      return
    }
    const auth = client.auth
    const gate = new AuthController({
      getSession: async () => {
        const { data, error } = await auth.getSession()
        return { session: data.session, error }
      },
      onChange: callback => {
        const { data } = auth.onAuthStateChange((event, session) => { callback(event, session) })
        return () => data.subscription.unsubscribe()
      },
      signIn: async (address, secret) => {
        const { data, error } = await auth.signInWithPassword({ email: address, password: secret })
        return { session: data.session, error }
      },
      signOutLocal: async () => {
        const { error } = await auth.signOut({ scope: 'local' })
        return { error }
      },
    }, (token, userId, signal) => fetchMe(apiBaseUrl, token, userId, signal), setView)
    gate.start()
    setController(gate)
    return () => gate.dispose()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const secret = password
    setPassword('')
    // Clear the DOM value before awaiting to avoid retaining a password in the input.
    const input = event.currentTarget.elements.namedItem('password')
    if (input instanceof HTMLInputElement) input.value = ''
    if (controller && email.trim() && secret) await controller.signIn(email.trim(), secret)
  }

  const signingForm = view.kind === 'signedOut' || view.kind === 'expired' || view.kind === 'signingIn'
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-10 text-stone-900">
      <p className="text-sm font-bold uppercase tracking-widest text-emerald-800">I Know a Spot</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Pilot access</h1>
      <p className="mt-3 leading-relaxed text-stone-700">Sign in with a pre-created pilot account. Public spots will be visible to other enrolled members, not anonymous visitors.</p>
      <section className="mt-7 rounded-2xl border border-stone-300 bg-white p-5 shadow-sm" aria-live="polite">
        {configurationError && <><h2 className="text-xl font-semibold">Configuration needed</h2><p className="mt-2">The public Supabase or API settings are missing. Ask the pilot operator to configure this app.</p></>}
        {!configurationError && (view.kind === 'restoring' || view.kind === 'verifying') && <><h2 className="text-xl font-semibold">{view.kind === 'restoring' ? 'Restoring session…' : 'Verifying pilot access…'}</h2><p className="mt-2 text-stone-700">Please wait.</p></>}
        {!configurationError && signingForm && <>
          <h2 className="text-xl font-semibold">{view.kind === 'expired' ? 'Session expired' : 'Sign in'}</h2>
          {view.kind === 'expired' && <p className="mt-2">Your session could not be verified. Sign in again to continue.</p>}
          {view.kind === 'signedOut' && view.credentialError && <p role="alert" className="mt-2 text-red-800">Those credentials were not accepted. Check your email and password and try again.</p>}
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <div><label className="block font-medium" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-500 px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" /></div>
            <div><label className="block font-medium" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-500 px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" /></div>
            <button disabled={view.kind === 'signingIn' || !controller} className="min-h-12 w-full rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60">{view.kind === 'signingIn' ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </>}
        {!configurationError && view.kind === 'enrolled' && <>
          <h2 className="text-xl font-semibold">Welcome, {view.profile.displayName}</h2>
           <p className="mt-3">Pilot membership verified.</p>
            <p className="mt-3 text-stone-700">The workspace includes Connections and Public discovery, saved radius, semantic search, self-reported explored state and private spot reporting. Availability depends on the configured backend and pilot access; this is not a release-readiness check.</p>
           <button onClick={() => void controller?.signOut()} className="mt-5 min-h-12 rounded-lg border border-stone-600 px-5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Sign out</button>
           <WorkspaceBoundary>
             <Suspense fallback={<p role="status" className="mt-8">Loading spot workspace…</p>}>
               <SpotWorkspace profile={view.profile} recheck={recheck} />
             </Suspense>
           </WorkspaceBoundary>
        </>}
        {!configurationError && view.kind === 'denied' && <><h2 className="text-xl font-semibold">Not enrolled</h2><p className="mt-2">This account is not enrolled in the pilot. Ask the operator for access; signing in alone does not grant it.</p><button onClick={() => void controller?.signOut()} className="mt-5 min-h-12 rounded-lg border border-stone-600 px-5 font-semibold">Sign out</button></>}
        {!configurationError && view.kind === 'outage' && <><h2 className="text-xl font-semibold">Access temporarily unavailable</h2><p className="mt-2">We could not verify pilot access. Your local session has not been signed out. Please retry.</p><div className="mt-5 flex flex-wrap gap-3"><button onClick={() => controller?.retry()} className="min-h-12 rounded-lg bg-emerald-800 px-5 font-semibold text-white">Retry verification</button><button onClick={() => void controller?.signOut()} className="min-h-12 rounded-lg border border-stone-600 px-5 font-semibold">Sign out</button></div></>}
        {!configurationError && (view.kind === 'signingOut' || view.kind === 'logoutFailed') && <><h2 className="text-xl font-semibold">{view.kind === 'signingOut' ? 'Signing out…' : 'Could not clear local session'}</h2>{view.kind === 'logoutFailed' && <><p className="mt-2">Access remains hidden. Retry signing out before using this app.</p><button onClick={() => void controller?.signOut()} className="mt-5 min-h-12 rounded-lg border border-stone-600 px-5 font-semibold">Retry sign out</button></>}</>}
      </section>
    </main>
  )
}
