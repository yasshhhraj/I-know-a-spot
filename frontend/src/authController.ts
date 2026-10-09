import type { MeResult, Profile } from './api.ts'

export type AuthSession = { access_token: string; user: { id: string } }
export type AuthView =
  | { kind: 'restoring' | 'verifying' | 'signingIn' | 'signingOut' | 'signedOut' | 'expired' | 'denied' | 'outage' | 'logoutFailed'; credentialError?: boolean; oauthError?: boolean }
  | { kind: 'enrolled'; profile: Profile }

export type AuthPort = {
  getSession(): Promise<{ session: AuthSession | null; error: unknown }>
  onChange(callback: (event: string, session: AuthSession | null) => void): () => void
  signIn(email: string, password: string): Promise<{ session: AuthSession | null; error: unknown }>
  signInWithGoogle(): Promise<{ error: unknown }>
  signOutLocal(): Promise<{ error: unknown }>
}

export class AuthController {
  private revision = 0
  private active = true
  private session: AuthSession | null = null
  private abort?: AbortController
  private unsubscribe?: () => void
  private view: AuthView = { kind: 'restoring' }
  private readonly auth: AuthPort
  private readonly me: (token: string, userId: string, signal: AbortSignal) => Promise<MeResult>
  private readonly emit: (view: AuthView) => void

  constructor(
    auth: AuthPort,
    me: (token: string, userId: string, signal: AbortSignal) => Promise<MeResult>,
    emit: (view: AuthView) => void,
  ) {
    this.auth = auth
    this.me = me
    this.emit = emit
  }

  private update(view: AuthView) {
    if (this.active) {
      this.view = view
      this.emit(view)
    }
  }

  private invalidate() {
    this.revision++
    this.abort?.abort()
    this.abort = undefined
    return this.revision
  }

  start() {
    // Supabase invokes callbacks under its auth lock: never call/await Supabase here.
    this.unsubscribe?.()
    this.unsubscribe = this.auth.onChange((event, session) => {
      if (!this.active) return
      if (event === 'SIGNED_OUT') {
        this.invalidate()
        this.session = null
        this.update({ kind: 'signedOut' })
      } else if (this.view.kind !== 'signingOut' && this.view.kind !== 'logoutFailed') {
        // GoTrue can emit SIGNED_IN again on refocus. Keep a verified workspace
        // (or its pending check) intact only for the exact same non-null session.
        if (event === 'SIGNED_IN' && session && this.session &&
          (this.view.kind === 'enrolled' || this.view.kind === 'verifying') &&
          session.user.id === this.session.user.id && session.access_token === this.session.access_token) return
        this.accept(session)
      }
    })
    this.restore()
  }

  private restore() {
    const before = this.revision
    void this.auth.getSession().then(({ session, error }) => {
      if (!this.active || this.revision !== before) return
      if (error) {
        this.invalidate()
        this.update({ kind: 'outage' })
      } else this.accept(session)
    }).catch(() => {
      if (this.active && this.revision === before) this.update({ kind: 'outage' })
    })
  }

  private accept(session: AuthSession | null) {
    const rev = this.invalidate()
    this.session = session
    if (!session) {
      this.update({ kind: 'signedOut' })
      return
    }
    this.update({ kind: 'verifying' })
    const controller = new AbortController()
    this.abort = controller
    // Deferred outside the auth callback; no SDK call is made in this path.
    queueMicrotask(() => {
      if (!this.active || rev !== this.revision) return
      void this.me(session.access_token, session.user.id, controller.signal).then(result => {
        if (!this.active || rev !== this.revision || controller.signal.aborted) return
        if (result.kind === 'enrolled') this.update({ kind: 'enrolled', profile: result.profile })
        else this.update(result)
      }).catch(() => {
        if (this.active && rev === this.revision && !controller.signal.aborted) this.update({ kind: 'outage' })
      })
    })
  }

  async signIn(email: string, password: string) {
    if (!this.active || (this.view.kind !== 'signedOut' && this.view.kind !== 'expired')) return
    const rev = this.invalidate()
    this.session = null
    this.update({ kind: 'signingIn' })
    try {
      const { session, error } = await this.auth.signIn(email, password)
      if (!this.active || rev !== this.revision) return
      if (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
        this.update(code === 'invalid_credentials' ? { kind: 'signedOut', credentialError: true } : { kind: 'outage' })
      } else if (!session) this.update({ kind: 'outage' })
      else this.accept(session)
    } catch {
      if (this.active && rev === this.revision) this.update({ kind: 'outage' })
    }
  }

  async signInWithGoogle() {
    if (!this.active || (this.view.kind !== 'signedOut' && this.view.kind !== 'expired')) return
    const rev = this.invalidate()
    this.session = null
    this.update({ kind: 'signingIn' })
    try {
      const { error } = await this.auth.signInWithGoogle()
      if (!this.active || rev !== this.revision) return
      // A successful OAuth initiation redirects the browser; session restoration and
      // onAuthStateChange verify the returned session after that redirect.
      if (error) this.update({ kind: 'signedOut', oauthError: true })
    } catch {
      if (this.active && rev === this.revision) this.update({ kind: 'signedOut', oauthError: true })
    }
  }

  async signOut() {
    if (!this.active || this.view.kind === 'signingOut') return
    const rev = this.invalidate()
    this.session = null
    this.update({ kind: 'signingOut' })
    try {
      const { error } = await this.auth.signOutLocal()
      if (!this.active || this.revision !== rev) return
      this.update({ kind: error ? 'logoutFailed' : 'signedOut' })
    } catch {
      if (this.active && this.revision === rev) this.update({ kind: 'logoutFailed' })
    }
  }

  retry() {
    if (!this.active || this.view.kind !== 'outage') return
    if (this.session) this.accept(this.session)
    else {
      this.update({ kind: 'restoring' })
      this.restore()
    }
  }

  // An enrolled-only API rejected a token/enrollment. Hide its workspace first,
  // then re-read the current SDK session outside the auth-state callback and /me.
  recheckAccess() {
    if (!this.active || this.view.kind !== 'enrolled') return
    this.invalidate()
    this.session = null
    this.update({ kind: 'verifying' })
    this.restore()
  }

  dispose() {
    this.active = false
    this.invalidate()
    this.unsubscribe?.()
  }
}
