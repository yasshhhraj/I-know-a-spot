import { Component, lazy, Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { apiBaseUrl, hasApiConfig } from './config'
import { getSupabaseClient } from './supabase'
import { fetchMe } from './api'
import { AuthController, type AuthView } from './authController'
import { BrandMark } from './BrandMark'

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
      signInWithGoogle: async () => {
        // Return to the origin the user is currently using (localhost, a tunnel,
        // or the deployed site). Each origin still must be allowlisted in Supabase.
        const redirectTo = `${window.location.origin}${window.location.pathname}`
        const { error } = await auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        })
        return { error }
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
  const enrolledProfile = view.kind === 'enrolled' ? view.profile : null
  const enrolled = enrolledProfile !== null
  return (
    <main className="app-canvas min-h-screen">
      <div className={enrolled ? 'mx-auto w-full max-w-6xl px-4 pb-8 pt-4 sm:px-6 lg:px-8' : 'mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:px-8'}>
        <header className={enrolled ? 'flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4' : 'max-w-xl'}>
          <BrandMark />
          {enrolled && <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[var(--ink-muted)] sm:inline">{enrolledProfile.displayName}</span>
            <button type="button" onClick={() => void controller?.signOut()} className="button-secondary">Sign out</button>
          </div>}
        </header>
        {!enrolled && <section className="max-w-xl">
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--forest-700)]">A map of small discoveries</p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] text-[var(--forest-950)] sm:text-5xl">Small discoveries. A reason to go outside.</h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-[var(--ink-muted)]">Share overlooked places with your connections. Find Public spots around an area you choose, and search by what you feel like seeing.</p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm text-[var(--ink-muted)]"><span className="rounded-full bg-[var(--opal-100)] px-3 py-2">Notice &amp; share</span><span className="rounded-full bg-[var(--opal-100)] px-3 py-2">Find by meaning</span><span className="rounded-full bg-[var(--opal-100)] px-3 py-2">Go &amp; explore</span></div>
        </section>}
        {enrolledProfile ? <WorkspaceBoundary>
          <Suspense fallback={<p role="status" className="mt-8">Loading your spots…</p>}>
            <SpotWorkspace profile={enrolledProfile} recheck={recheck} />
          </Suspense>
        </WorkspaceBoundary> : <section className="surface card w-full max-w-xl p-5 sm:p-7" aria-live="polite">
          {configurationError && <><h2 className="text-2xl font-semibold text-[var(--forest-950)]">Configuration needed</h2><p className="mt-2 text-[var(--ink-muted)]">The public Supabase or API settings are missing. Ask the pilot operator to configure this app.</p></>}
          {!configurationError && (view.kind === 'restoring' || view.kind === 'verifying') && <><h2 className="text-2xl font-semibold text-[var(--forest-950)]">{view.kind === 'restoring' ? 'Restoring session…' : 'Verifying pilot access…'}</h2><p className="mt-2 text-[var(--ink-muted)]">Please wait.</p></>}
          {!configurationError && signingForm && <>
            <h2 className="text-2xl font-semibold text-[var(--forest-950)]">{view.kind === 'expired' ? 'Session expired' : 'Sign in to explore'}</h2>
            {view.kind === 'expired' && <p className="mt-2 text-[var(--ink-muted)]">Your session could not be verified. Sign in again to continue.</p>}
            {view.kind === 'signedOut' && view.credentialError && <p role="alert" className="mt-3 rounded-xl bg-[var(--error-surface)] p-3 text-[var(--error-text)]">Those credentials were not accepted. Check your email and password and try again.</p>}
            {view.kind === 'signedOut' && view.oauthError && <p role="alert" className="mt-3 rounded-xl bg-[var(--error-surface)] p-3 text-[var(--error-text)]">Google sign-in could not be started. Check your connection and try again.</p>}
            <form className="mt-5 space-y-4" onSubmit={submit}>
              <div><label className="field-label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} className="field-input" /></div>
              <div><label className="field-label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="field-input" /></div>
              <button disabled={view.kind === 'signingIn' || !controller} className="button-primary w-full">{view.kind === 'signingIn' ? 'Signing in…' : 'Sign in'}</button>
            </form>
            <div className="my-5 flex items-center gap-3 text-sm text-[var(--ink-muted)]"><span className="h-px flex-1 bg-[var(--line)]" />or<span className="h-px flex-1 bg-[var(--line)]" /></div>
            <button type="button" disabled={view.kind === 'signingIn' || !controller} onClick={() => void controller?.signInWithGoogle()} className="button-secondary w-full">{view.kind === 'signingIn' ? 'Starting Google sign-in…' : 'Continue with Google'}</button>
            <p className="mt-5 text-sm leading-6 text-[var(--ink-muted)]">For pre-enrolled pilot members. Public posts are visible to other enrolled members.</p>
          </>}
          {!configurationError && view.kind === 'denied' && <><h2 className="text-2xl font-semibold text-[var(--forest-950)]">Not enrolled</h2><p className="mt-2 text-[var(--ink-muted)]">This account is not enrolled in the pilot. Ask the operator for access; signing in alone does not grant it.</p><button onClick={() => void controller?.signOut()} className="button-secondary mt-5">Sign out</button></>}
          {!configurationError && view.kind === 'outage' && <><h2 className="text-2xl font-semibold text-[var(--forest-950)]">Access temporarily unavailable</h2><p className="mt-2 text-[var(--ink-muted)]">We could not verify pilot access. Your local session has not been signed out. Please retry.</p><div className="mt-5 flex flex-wrap gap-3"><button onClick={() => controller?.retry()} className="button-primary">Retry verification</button><button onClick={() => void controller?.signOut()} className="button-secondary">Sign out</button></div></>}
          {!configurationError && (view.kind === 'signingOut' || view.kind === 'logoutFailed') && <><h2 className="text-2xl font-semibold text-[var(--forest-950)]">{view.kind === 'signingOut' ? 'Signing out…' : 'Could not clear local session'}</h2>{view.kind === 'logoutFailed' && <><p className="mt-2 text-[var(--ink-muted)]">Access remains hidden. Retry signing out before using this app.</p><button onClick={() => void controller?.signOut()} className="button-secondary mt-5">Retry sign out</button></>}</>}
        </section>}
      </div>
    </main>
  )
}
