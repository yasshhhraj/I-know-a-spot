import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asSpot, asSpots, multipart, photoEndpoint, safeFailure, spotRequest, SPOT_MUTATION_TIMEOUT_MS, SPOT_READ_TIMEOUT_MS, SpotApiError, validateData, validatePhoto, type SpotData } from '../src/spotApi.ts'
import { SpotScope } from '../src/spotScope.ts'
import { AuthController, type AuthSession, type AuthView } from '../src/authController.ts'

const id = '00000000-0000-0000-0000-000000000010'
const owner = '00000000-0000-0000-0000-000000000001'
const base = 'https://api.example.test'
const data: SpotData = { title: 'A doorway', note: 'Look from the pavement', audience: 'connections', latitude: 0, longitude: 0, accessConfirmed: true, accessNote: '' }
const spot = { ...data, id, ownerId: owner, authorName: 'Member', photoUrl: `/spots/${id}/photo`, createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z' }
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }

test('form requires explicitly selected valid pin and confirmation; photo hints are bounded, server authoritative', () => {
  assert.equal(validateData(data), null)
  assert.match(validateData({ ...data, latitude: NaN })!, /pin/)
  assert.match(validateData({ ...data, latitude: 91 })!, /pin/)
  assert.match(validateData({ ...data, longitude: -181 })!, /pin/)
  assert.match(validateData({ ...data, accessConfirmed: false })!, /Confirm/)
  assert.match(validateData({ ...data, title: 'x'.repeat(81) })!, /Title/)
  assert.match(validateData({ ...data, note: 'x'.repeat(501) })!, /Note/)
  assert.match(validateData({ ...data, accessNote: 'x'.repeat(201) })!, /Access note/)
  assert.match(validatePhoto(null)!, /Choose/)
  assert.match(validatePhoto(new File(['x'], 'image.heic', { type: 'image/heic' }))!, /HEIC/)
  assert.match(validatePhoto(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))!, /10 MiB/)
  assert.equal(validatePhoto(new File(['x'], 'tiny.png', { type: 'image/png' })), null)
})

test('Unicode code-point limits accept backend-valid astral text and reject overflow in parsed responses', () => {
  const astral = '😀'
  const boundary = { ...data, title: astral.repeat(80), note: astral.repeat(500), accessNote: astral.repeat(200) }
  assert.equal(validateData(boundary), null)
  assert.deepEqual(asSpot({ spot: { ...spot, ...boundary } }, base), { ...spot, ...boundary })
  assert.deepEqual(asSpots({ spots: [{ ...spot, ...boundary }] }, base), [{ ...spot, ...boundary }])
  for (const [field, count, message] of [['title', 81, /Title/], ['note', 501, /Note/], ['accessNote', 201, /Access note/]] as const) {
    const tooLong = { ...boundary, [field]: astral.repeat(count) }
    assert.match(validateData(tooLong)!, message)
    assert.throws(() => asSpot({ spot: { ...spot, ...tooLong } }, base), (error: unknown) => error instanceof SpotApiError && error.failure.kind === 'unavailable')
  }
  assert.throws(() => asSpots({ spots: [spot, { ...spot, ...boundary, note: astral.repeat(501) }] }, base), SpotApiError)
})

test('multipart carries only contracted metadata and a single photo (no owner or token)', () => {
  const file = new File(['photo'], 'sample.png', { type: 'image/png' })
  const body = multipart(data, file)
  assert.deepEqual([...body.keys()], ['data', 'photo'])
  assert.deepEqual(JSON.parse(body.get('data') as string), data)
  assert.equal(body.get('photo'), file)
})

test('spot responses and media paths reject unsafe/mismatched URLs and malformed lists', () => {
  assert.deepEqual(asSpot({ spot }, base), spot)
  assert.deepEqual(asSpots({ spots: [spot] }, base), [spot])
  for (const path of [`https://evil.test/spots/${id}/photo`, `//evil.test/spots/${id}/photo`, `/spots/${owner}/photo`, `/spots/${id}/photo?token=secret`, `/spots/../${id}/photo`]) {
    assert.equal(photoEndpoint(base, path, id), null)
    assert.throws(() => asSpot({ spot: { ...spot, photoUrl: path } }, base), SpotApiError)
  }
  assert.throws(() => asSpots({ spots: [spot, { ...spot, ownerId: 'oops' }] }, base), SpotApiError)
})

test('safe errors do not display untrusted backend content; access loss is always reverified', () => {
  for (const status of [401, 403]) assert.equal(safeFailure(status, { error: { code: 'unexpected', message: 'secret' } }, false).kind, 'auth')
  assert.equal(safeFailure(503, { error: { code: 'MEDIA_CLEANUP_PENDING', message: 'secret' } }, true).kind, 'cleanup')
  assert.equal(safeFailure(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'secret' } }, true).kind, 'uncertain')
  assert.match(safeFailure(0, null, true).message, /timed out|network|uncertain/i)
  assert.equal(safeFailure(415, { error: { code: 'UNSUPPORTED_PHOTO', message: 'secret' } }, true).kind, 'invalid')
  assert.equal(safeFailure(404, null, false).message, 'Spot service unavailable. Try again later.')
})

test('protected media uses Bearer no-store fetch, requires WebP, and never puts token into URL', async () => {
  const prior = globalThis.fetch
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, `${base}/spots/${id}/photo`)
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer example-token')
      assert.equal(init?.cache, 'no-store')
      assert.equal(init?.method, 'GET')
      return new Response(new Blob(['clean'], { type: 'image/webp' }), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' } })
    }
    assert.ok(await spotRequest(base, 'example-token', `/spots/${id}/photo`, new AbortController().signal) instanceof Blob)
    globalThis.fetch = async () => new Response('not an image', { headers: { 'Content-Type': 'text/html' } })
    await assert.rejects(spotRequest(base, 'example-token', `/spots/${id}/photo`, new AbortController().signal), SpotApiError)
  } finally { globalThis.fetch = prior }
})

test('DELETE 204 differs from 503 cleanup pending; PATCH serializes JSON metadata', async () => {
  const prior = globalThis.fetch
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init?.method, 'PATCH')
      assert.equal((init?.headers as Record<string, string>)['Content-Type'], 'application/json')
      assert.deepEqual(JSON.parse(init?.body as string), data)
      return Response.json({ spot })
    }
    assert.deepEqual(asSpot(await spotRequest(base, 'token', `/spots/${id}`, new AbortController().signal, 'PATCH', JSON.stringify(data), 'application/json'), base, true), spot)
    globalThis.fetch = async () => new Response(null, { status: 204 })
    assert.equal(await spotRequest(base, 'token', `/spots/${id}`, new AbortController().signal, 'DELETE'), null)
    globalThis.fetch = async () => Response.json({ error: { code: 'MEDIA_CLEANUP_PENDING', message: 'private details' } }, { status: 503 })
    await assert.rejects(spotRequest(base, 'token', `/spots/${id}`, new AbortController().signal, 'DELETE'), (err: unknown) => err instanceof SpotApiError && err.failure.kind === 'cleanup')
  } finally { globalThis.fetch = prior }
})

test('malformed successful POST/PATCH response is uncertain, while malformed GET response remains unavailable', async () => {
  const prior = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async () => { calls++; return Response.json({ spot: { ...spot, ownerId: 'invalid' } }) }
    for (const method of ['POST', 'PATCH'] as const) {
      const payload = await spotRequest(base, 'token', '/spots', new AbortController().signal, method)
      assert.throws(() => asSpot(payload, base, true), (error: unknown) => error instanceof SpotApiError && error.failure.kind === 'uncertain' && /may have completed/.test(error.failure.message))
    }
    assert.equal(calls, 2) // Neither mutation is retried after a malformed success body.
    assert.throws(() => asSpot({ spot: { ...spot, ownerId: 'invalid' } }, base), (error: unknown) => error instanceof SpotApiError && error.failure.kind === 'unavailable')
  } finally { globalThis.fetch = prior }
})

test('an interrupted write never retries automatically and cannot present a success', async () => {
  const prior = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async (_url, init) => {
      calls++
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal
        if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'))
        else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    }
    const caller = new AbortController()
    const request = spotRequest(base, 'token', '/spots', caller.signal, 'POST', multipart(data, new File(['x'], 'image.png', { type: 'image/png' })))
    caller.abort()
    await assert.rejects(request, (err: unknown) => err instanceof SpotApiError && err.failure.kind === 'uncertain')
    assert.equal(calls, 1)
  } finally { globalThis.fetch = prior }
})

test('reads keep a bounded timeout while writes use the longer bounded timeout', async () => {
  const prior = globalThis.fetch
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const hangingFetch = (capture: (signal: AbortSignal) => void) => async (_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal as AbortSignal
    capture(signal)
    const fail = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
  try {
    let readSignal!: AbortSignal
    globalThis.fetch = hangingFetch(signal => { readSignal = signal })
    const readCaller = new AbortController()
    const read = spotRequest(base, 'token', '/spots', readCaller.signal, 'GET', undefined, undefined, 20)
    await wait(5)
    assert.equal(readSignal.aborted, false)
    await assert.rejects(read, (err: unknown) => err instanceof SpotApiError && err.failure.kind === 'unavailable')
    assert.equal(readSignal.aborted, true)
    assert.equal(readCaller.signal.aborted, false)

    let mutationSignal!: AbortSignal
    globalThis.fetch = hangingFetch(signal => { mutationSignal = signal })
    const mutation = spotRequest(base, 'token', '/spots', new AbortController().signal, 'POST', undefined, undefined, 40)
    await wait(20)
    assert.equal(mutationSignal.aborted, false)
    await assert.rejects(mutation, (err: unknown) => err instanceof SpotApiError && err.failure.kind === 'uncertain')
    assert.equal(mutationSignal.aborted, true)
  } finally { globalThis.fetch = prior }
  assert.equal(SPOT_READ_TIMEOUT_MS, 15_000)
  assert.equal(SPOT_MUTATION_TIMEOUT_MS, 35_000)
  assert.ok(SPOT_MUTATION_TIMEOUT_MS > SPOT_READ_TIMEOUT_MS)
})

test('scope blocks old account and late responses, aborts requests and revokes replaced preview URLs', async () => {
  const create = URL.createObjectURL
  const revoke = URL.revokeObjectURL
  const revoked: string[] = []
  let serial = 0
  URL.createObjectURL = () => `blob:fake-${++serial}`
  URL.revokeObjectURL = url => { revoked.push(url) }
  try {
    const scope = new SpotScope()
    await assert.rejects(scope.run(owner, async () => ({ access_token: 'token', user: { id } }), async () => 'never'), (err: unknown) => err instanceof SpotApiError && err.failure.kind === 'auth')
    const pendingSession = deferred<{ access_token: string; user: { id: string } }>()
    const old = scope.run(owner, () => pendingSession.promise, async () => 'should not run')
    scope.invalidate()
    pendingSession.resolve({ access_token: 'old', user: { id: owner } })
    assert.equal(await old, undefined)
    const delayed = deferred<string>()
    let signal!: AbortSignal
    const request = scope.run(owner, async () => ({ access_token: 'fresh', user: { id: owner } }), async (_, s) => { signal = s; return delayed.promise })
    await tick()
    const first = scope.track(new Blob(['photo']))
    scope.revoke(first)
    scope.track(new Blob(['second']))
    scope.dispose()
    assert.equal(signal.aborted, true)
    delayed.resolve('old account content')
    assert.equal(await request, undefined)
    assert.deepEqual(revoked, ['blob:fake-1', 'blob:fake-2'])
  } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke }
})

test('a spot 401/403 recheck hides enrolled view before fresh session and /me verification', async () => {
  const restores: Array<ReturnType<typeof deferred<{ session: AuthSession | null; error: unknown }>>> = []
  const me = deferred<{ kind: 'enrolled'; profile: { id: string; displayName: string; publicRadiusKm: number } }>()
  const views: AuthView[] = []
  const gate = new AuthController({
    getSession: () => { const next = deferred<{ session: AuthSession | null; error: unknown }>(); restores.push(next); return next.promise },
    onChange: () => () => {}, signIn: async () => ({ session: null, error: null }), signOutLocal: async () => ({ error: null }),
  }, () => me.promise, view => views.push(view))
  gate.start()
  const session = { access_token: 'token', user: { id: owner } }
  restores[0].resolve({ session, error: null })
  await tick()
  me.resolve({ kind: 'enrolled', profile: { id: owner, displayName: 'Member', publicRadiusKm: 5 } })
  await tick()
  assert.equal(views.at(-1)?.kind, 'enrolled')
  gate.recheckAccess()
  assert.equal(views.at(-1)?.kind, 'verifying')
  restores[1].resolve({ session: null, error: null })
  await tick()
  assert.equal(views.at(-1)?.kind, 'signedOut')
  gate.dispose()
})
