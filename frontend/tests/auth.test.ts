import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchMe, parseMe, type MeResult } from '../src/api.ts'
import { AuthController, type AuthPort, type AuthSession, type AuthView } from '../src/authController.ts'
import { isSupabasePublishableKey } from '../src/publicKey.ts'

const user = '11111111-1111-1111-1111-111111111111'
const other = '22222222-2222-2222-2222-222222222222'
const session = (id: string, token = id): AuthSession => ({ user: { id }, access_token: token })
const profile = (id: string) => ({ id, displayName: 'Pilot member', publicRadiusKm: 5 })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }

test('GET /me handles accepted status/envelope and validates profile, including caller identity', () => {
  assert.deepEqual(parseMe(200, { profile: profile(user) }, user), { kind: 'enrolled', profile: profile(user) })
  assert.deepEqual(parseMe(401, { error: { code: 'UNAUTHORIZED', message: 'Expired' } }, user), { kind: 'expired' })
  assert.deepEqual(parseMe(403, { error: { code: 'NOT_ENROLLED', message: 'Denied' } }, user), { kind: 'denied' })
  assert.deepEqual(parseMe(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'Down' } }, user), { kind: 'outage' })
  for (const body of [{ profile: profile(other) }, { profile: { ...profile(user), publicRadiusKm: 26 } }, { profile: { ...profile(user), displayName: '' } }, { profile: null }, null]) {
    assert.deepEqual(parseMe(200, body, user), { kind: 'outage' })
  }
  assert.deepEqual(parseMe(401, { error: { code: 'NOT_ENROLLED', message: 'Wrong' } }, user), { kind: 'outage' })
})

test('fetchMe attaches bearer, sends no-store, and treats invalid JSON/network as outage', async () => {
  const oldFetch = globalThis.fetch
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, 'https://example.test/me')
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer user-token')
      assert.equal(init?.cache, 'no-store')
      return new Response(JSON.stringify({ profile: profile(user) }), { status: 200 })
    }
    assert.equal((await fetchMe('https://example.test', 'user-token', user, new AbortController().signal)).kind, 'enrolled')
    globalThis.fetch = async () => new Response('broken', { status: 200 })
    assert.deepEqual(await fetchMe('https://example.test', 'user-token', user, new AbortController().signal), { kind: 'outage' })
    globalThis.fetch = async () => { throw new TypeError('Network unavailable') }
    assert.deepEqual(await fetchMe('https://example.test', 'user-token', user, new AbortController().signal), { kind: 'outage' })
  } finally { globalThis.fetch = oldFetch }
})

test('fetchMe times out and propagates caller abort without aborting caller or returning an enrolled profile', async () => {
  const oldFetch = globalThis.fetch
  const signals: AbortSignal[] = []
  try {
    globalThis.fetch = async (_input, init) => {
      const requestSignal = init?.signal as AbortSignal
      signals.push(requestSignal)
      return new Promise<Response>((_resolve, reject) => {
        if (requestSignal.aborted) reject(new DOMException('Aborted', 'AbortError'))
        else requestSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    }
    const timeoutCaller = new AbortController()
    assert.deepEqual(await fetchMe('https://example.test', 'user-token', user, timeoutCaller.signal, 20), { kind: 'outage' })
    assert.equal(signals[0].aborted, true)
    assert.equal(timeoutCaller.signal.aborted, false)

    const caller = new AbortController()
    const pending = fetchMe('https://example.test', 'user-token', user, caller.signal, 1_000)
    caller.abort()
    assert.deepEqual(await pending, { kind: 'outage' })
    assert.equal(signals[1].aborted, true)

    const alreadyAborted = new AbortController()
    alreadyAborted.abort()
    assert.deepEqual(await fetchMe('https://example.test', 'user-token', user, alreadyAborted.signal, 1_000), { kind: 'outage' })
    assert.equal(signals[2].aborted, true)
  } finally { globalThis.fetch = oldFetch }
})

test('only the new publishable key family passes the frontend runtime guard', () => {
  assert.equal(isSupabasePublishableKey('sb_publishable_testPublic_123'), true)
  for (const key of [undefined, '', 'YOUR_PUBLIC_PUBLISHABLE_KEY', 'sb_publishable_', 'sb_publishable_test value', 'sb_secret_private', 'eyJlegacyAnon', 'service-role-value']) {
    assert.equal(isSupabasePublishableKey(key), false)
  }
})

function harness(initial: AuthSession | null = session(user)) {
  let callback: (event: string, session: AuthSession | null) => void = () => {}
  let unsubscribed = false
  const restore = deferred<{ session: AuthSession | null; error: unknown }>()
  const requests: Array<{ token: string; id: string; signal: AbortSignal; done: ReturnType<typeof deferred<MeResult>> }> = []
  const signout = deferred<{ error: unknown }>()
  const views: AuthView[] = []
  const port: AuthPort = {
    getSession: () => restore.promise,
    onChange: cb => { callback = cb; return () => { unsubscribed = true } },
    signIn: async () => ({ session: initial, error: null }),
    signInWithGoogle: async () => ({ error: null }),
    signOutLocal: () => signout.promise,
  }
  const controller = new AuthController(port, (token, id, signal) => {
    const done = deferred<MeResult>()
    requests.push({ token, id, signal, done })
    return done.promise
  }, view => views.push(view))
  controller.start()
  const last = () => views.at(-1)
  return { controller, restore, requests, views, signout, last, changed: (event: string, s: AuthSession | null) => callback(event, s), get unsubscribed() { return unsubscribed } }
}

test('same-session SIGNED_IN on focus leaves enrolled workspace mounted without another /me', async () => {
  const h = harness()
  h.changed('SIGNED_IN', session(user, 'token-a'))
  await tick()
  h.requests[0].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  assert.deepEqual(h.views.map(view => view.kind), ['verifying', 'enrolled'])
  h.changed('SIGNED_IN', session(user, 'token-a'))
  h.changed('SIGNED_IN', session(user, 'token-a'))
  await tick()
  assert.deepEqual(h.views.map(view => view.kind), ['verifying', 'enrolled'])
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].signal.aborted, false)
  h.controller.dispose()
})

test('same-session SIGNED_IN during verification keeps the original /me alive', async () => {
  const h = harness()
  h.restore.resolve({ session: session(user, 'token-a'), error: null })
  await tick()
  h.changed('SIGNED_IN', session(user, 'token-a'))
  h.changed('SIGNED_IN', session(user, 'token-a'))
  await tick()
  assert.deepEqual(h.views.map(view => view.kind), ['verifying'])
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].signal.aborted, false)
  h.requests[0].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  assert.deepEqual(h.views.map(view => view.kind), ['verifying', 'enrolled'])
  h.controller.dispose()
})

test('changed token or user on SIGNED_IN hides enrolled view and fences older /me', async () => {
  const h = harness()
  h.changed('SIGNED_IN', session(user, 'shared-token'))
  await tick()
  h.requests[0].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  h.changed('SIGNED_IN', session(user, 'fresh-token'))
  assert.equal(h.last()?.kind, 'verifying')
  await tick()
  h.changed('SIGNED_IN', session(other, 'fresh-token'))
  assert.equal(h.last()?.kind, 'verifying')
  assert.equal(h.requests[1].signal.aborted, true)
  await tick()
  h.requests[1].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  assert.equal(h.last()?.kind, 'verifying')
  assert.deepEqual(h.requests.map(request => [request.id, request.token]), [
    [user, 'shared-token'], [user, 'fresh-token'], [other, 'fresh-token'],
  ])
  h.requests[2].done.resolve({ kind: 'enrolled', profile: profile(other) })
  await tick()
  assert.deepEqual(h.last(), { kind: 'enrolled', profile: profile(other) })
  h.changed('SIGNED_IN', session(user, 'fresh-token'))
  assert.equal(h.last()?.kind, 'verifying')
  await tick()
  assert.equal(h.requests[3].id, user)
  h.requests[3].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  // Only SIGNED_IN is deduplicated; a same-value TOKEN_REFRESHED still verifies.
  h.changed('TOKEN_REFRESHED', session(user, 'fresh-token'))
  assert.equal(h.last()?.kind, 'verifying')
  await tick()
  assert.equal(h.requests.length, 5)
  h.controller.dispose()
})

test('explicit same-token recheck hides workspace and can deny or report outage', async () => {
  for (const outcome of ['denied', 'outage'] as const) {
    const h = harness()
    h.changed('SIGNED_IN', session(user, 'token-a'))
    await tick()
    h.requests[0].done.resolve({ kind: 'enrolled', profile: profile(user) })
    await tick()
    h.controller.recheckAccess()
    assert.equal(h.last()?.kind, 'verifying')
    h.restore.resolve({ session: session(user, 'token-a'), error: null })
    await tick()
    assert.equal(h.requests.length, 2)
    h.requests[1].done.resolve({ kind: outcome })
    await tick()
    assert.equal(h.last()?.kind, outcome)
    if (outcome === 'outage') {
      h.controller.retry()
      await tick()
      assert.equal(h.requests.length, 3)
      assert.equal(h.requests[2].token, 'token-a')
    } else {
      h.changed('SIGNED_IN', session(user, 'token-a'))
      await tick()
      assert.equal(h.requests.length, 3)
    }
    h.controller.dispose()
  }
})

test('null SIGNED_IN clears previously enrolled workspace rather than deduplicating', async () => {
  const h = harness()
  h.changed('SIGNED_IN', session(user, 'token-a'))
  await tick()
  h.requests[0].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  h.changed('SIGNED_IN', null)
  assert.equal(h.last()?.kind, 'signedOut')
  assert.equal(h.requests.length, 1)
  h.controller.dispose()
})

test('duplicate SIGNED_IN after expired/outage retries; signout and dispose still fence callbacks', async () => {
  const h = harness()
  h.changed('SIGNED_IN', session(user, 'token-a'))
  await tick()
  h.requests[0].done.resolve({ kind: 'expired' })
  await tick()
  h.changed('SIGNED_IN', session(user, 'token-a'))
  await tick()
  assert.equal(h.requests.length, 2)
  h.requests[1].done.resolve({ kind: 'outage' })
  await tick()
  h.changed('SIGNED_IN', session(user, 'token-a'))
  await tick()
  assert.equal(h.requests.length, 3)
  h.changed('SIGNED_OUT', null)
  assert.equal(h.requests[2].signal.aborted, true)
  assert.equal(h.last()?.kind, 'signedOut')
  h.requests[2].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  assert.equal(h.last()?.kind, 'signedOut')
  h.changed('SIGNED_IN', session(user, 'token-a'))
  await tick()
  assert.equal(h.requests.length, 4)
  const viewCount = h.views.length
  h.controller.dispose()
  assert.equal(h.requests[3].signal.aborted, true)
  assert.equal(h.unsubscribed, true)
  h.changed('SIGNED_IN', session(user, 'token-a'))
  h.requests[3].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  assert.equal(h.views.length, viewCount)
  assert.equal(h.requests.length, 4)
})

test('restoration alone never enrolls; 403 denies and 503/outage retries without signout', async () => {
  const h = harness()
  h.restore.resolve({ session: session(user), error: null })
  await tick()
  assert.equal(h.last()?.kind, 'verifying')
  h.requests[0].done.resolve({ kind: 'denied' })
  await tick()
  assert.equal(h.last()?.kind, 'denied')
  h.changed('TOKEN_REFRESHED', session(user, 'new-token'))
  await tick()
  h.requests[1].done.resolve({ kind: 'outage' })
  await tick()
  assert.equal(h.last()?.kind, 'outage')
  h.controller.retry()
  await tick()
  assert.equal(h.requests[2].token, 'new-token')
  h.requests[2].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  assert.equal(h.last()?.kind, 'enrolled')
  h.controller.dispose()
})

test('signout immediately hides prior profile and ignores pending response and late restore', async () => {
  const h = harness()
  h.changed('SIGNED_IN', session(user))
  await tick()
  h.requests[0].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  assert.equal(h.last()?.kind, 'enrolled')
  h.changed('TOKEN_REFRESHED', session(user, 'refresh'))
  await tick()
  const signingOut = h.controller.signOut()
  assert.equal(h.last()?.kind, 'signingOut')
  assert.equal(h.requests[1].signal.aborted, true)
  h.restore.resolve({ session: session(user), error: null })
  h.requests[1].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  assert.equal(h.last()?.kind, 'signingOut')
  h.signout.resolve({ error: null })
  await signingOut
  assert.equal(h.last()?.kind, 'signedOut')
  h.controller.dispose()
  assert.equal(h.unsubscribed, true)
})

test('account switch and token refresh reject stale profiles, including after disposal', async () => {
  const h = harness()
  h.changed('SIGNED_IN', session(user))
  await tick()
  h.changed('SIGNED_IN', session(other))
  await tick()
  assert.equal(h.requests[0].signal.aborted, true)
  h.requests[0].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  assert.equal(h.last()?.kind, 'verifying')
  h.requests[1].done.resolve({ kind: 'enrolled', profile: profile(other) })
  await tick()
  assert.deepEqual(h.last(), { kind: 'enrolled', profile: profile(other) })
  h.changed('TOKEN_REFRESHED', session(other, 'fresh'))
  await tick()
  h.controller.dispose()
  h.requests[2].done.resolve({ kind: 'enrolled', profile: profile(other) })
  await tick()
  assert.equal(h.last()?.kind, 'verifying')
})

test('a late 401 for a replaced token cannot expire a freshly verified account', async () => {
  const h = harness()
  h.changed('SIGNED_IN', session(user, 'old'))
  await tick()
  h.changed('TOKEN_REFRESHED', session(user, 'new'))
  await tick()
  h.requests[1].done.resolve({ kind: 'enrolled', profile: profile(user) })
  await tick()
  h.requests[0].done.resolve({ kind: 'expired' })
  await tick()
  assert.equal(h.last()?.kind, 'enrolled')
  h.controller.dispose()
})

test('invalid credentials are distinct from outages and passwords do not enter views', async () => {
  let callback: (event: string, session: AuthSession | null) => void = () => {}
  let error: unknown = { code: 'invalid_credentials' }
  const seen: AuthView[] = []
  const gate = new AuthController({
    getSession: async () => ({ session: null, error: null }),
    onChange: cb => { callback = cb; return () => {} },
    signIn: async () => ({ session: null, error }),
    signInWithGoogle: async () => ({ error: null }),
    signOutLocal: async () => ({ error: null }),
  }, async () => ({ kind: 'outage' }), view => seen.push(view))
  gate.start()
  callback('INITIAL_SESSION', null)
  await tick()
  await gate.signIn('pilot@example.test', 'not-a-real-password')
  assert.deepEqual(seen.at(-1), { kind: 'signedOut', credentialError: true })
  assert.equal(JSON.stringify(seen).includes('not-a-real-password'), false)
  error = { code: 'network_error' }
  await gate.signIn('pilot@example.test', 'not-a-real-password')
  assert.equal(seen.at(-1)?.kind, 'outage')
  gate.dispose()
})

test('Google OAuth initiation delegates to the auth port and reports initiation failure', async () => {
  let starts = 0
  const seen: AuthView[] = []
  const gate = new AuthController({
    getSession: async () => ({ session: null, error: null }), onChange: () => () => {},
    signIn: async () => ({ session: null, error: null }), signOutLocal: async () => ({ error: null }),
    signInWithGoogle: async () => { starts++; return { error: new Error('provider unavailable') } },
  }, async () => ({ kind: 'outage' }), view => seen.push(view))
  gate.start()
  await tick()
  await gate.signInWithGoogle()
  assert.equal(starts, 1)
  assert.deepEqual(seen.at(-1), { kind: 'signedOut', oauthError: true })
  gate.dispose()
})

test('401 expires gate and local signout failure does not reveal old profile', async () => {
  const h = harness()
  h.changed('SIGNED_IN', session(user))
  await tick()
  h.requests[0].done.resolve({ kind: 'expired' })
  await tick()
  assert.equal(h.last()?.kind, 'expired')
  const pending = h.controller.signOut()
  h.signout.resolve({ error: new Error('failure') })
  await pending
  assert.equal(h.last()?.kind, 'logoutFailed')
  h.controller.dispose()
})
