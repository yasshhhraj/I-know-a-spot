import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSearchResult, searchBody, searchQuery, searchSpots, SEARCH_TIMEOUT_MS, SearchApiError } from '../src/searchApi.ts'
import { ScopedResultsController } from '../src/searchController.ts'

const id = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const base = 'https://api.example.test'
const spot = { id, ownerId: id, authorName: 'Member', title: 'Carved doorway', note: 'Original note', audience: 'connections', latitude: 1, longitude: 2, accessConfirmed: true, accessNote: '', createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z', photoUrl: `/spots/${id}/photo` }
const session = async () => ({ access_token: 'token', user: { id } })
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const bad = (value: unknown, feed: 'connections' | 'public' = 'connections', query = 'door') => assert.throws(() => parseSearchResult(value, base, feed, query), (error: unknown) => error instanceof SearchApiError && error.failure.kind === 'unavailable')

test('Unicode query trim and 200 code-point limit, exact Public center payload, no client radius or IDs', () => {
  assert.equal(searchQuery(`  ${'😀'.repeat(200)}  `), '😀'.repeat(200))
  assert.throws(() => searchQuery('😀'.repeat(201)), (error: unknown) => error instanceof SearchApiError && error.failure.kind === 'invalid')
  assert.deepEqual(searchBody('  brick  ', 'connections', { latitude: 12, longitude: 30 }), { query: 'brick', feed: 'connections' })
  assert.deepEqual(searchBody('brick', 'public', { latitude: -90, longitude: 180 }), { query: 'brick', feed: 'public', centerLat: -90, centerLon: 180 })
  for (const center of [null, { latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }]) {
    assert.throws(() => searchBody('brick', 'public', center), SearchApiError)
  }
})

test('semantic/browse success shape, cap, feed, distance and empty reasons reject malformed payload', () => {
  const semantic = { mode: 'semantic', spots: [spot], candidateLimit: 50 }
  assert.deepEqual(parseSearchResult(semantic, base, 'connections', 'door').spots, [spot])
  const publicSpot = { ...spot, audience: 'public', distanceKm: 0 }
  assert.deepEqual(parseSearchResult({ ...semantic, spots: [publicSpot] }, base, 'public', 'door').spots, [publicSpot])
  assert.deepEqual(parseSearchResult({ mode: 'browse', spots: [], candidateLimit: 50, emptyReason: 'no_candidates' }, base, 'connections', '  ').spots, [])
  assert.equal(parseSearchResult({ ...semantic, spots: [], emptyReason: 'no_matches' }, base, 'connections', 'door').emptyReason, 'no_matches')
  assert.equal(parseSearchResult({ ...semantic, spots: [], emptyReason: 'no_candidates' }, base, 'connections', 'door').emptyReason, 'no_candidates')
  for (const value of [
    { ...semantic, mode: 'browse' }, { ...semantic, candidateLimit: 49 }, { ...semantic, spots: Array(4).fill(spot) },
    { ...semantic, spots: [], emptyReason: undefined }, { ...semantic, emptyReason: 'no_matches' },
    { ...semantic, spots: [spot, spot] }, { ...semantic, spots: [{ ...spot, ownerId: 'bad' }] },
    { ...semantic, spots: [{ ...spot, distanceKm: 3 }] }, { ...semantic, score: 0.99 },
    { ...semantic, spots: [{ ...spot, id: other, photoUrl: `/spots/${id}/photo` }] },
  ]) bad(value)
  bad({ mode: 'browse', candidateLimit: 50, spots: [], emptyReason: 'no_matches' }, 'connections', '')
  bad({ ...semantic, spots: [spot] }, 'public')
  for (const distanceKm of [-1, Infinity, '1']) bad({ ...semantic, spots: [{ ...publicSpot, distanceKm }] }, 'public')
  bad({ mode: 'browse', spots: Array(51).fill(spot), candidateLimit: 50 }, 'connections', '')
})

test('read-only POST sends body not URL, no-store Bearer; safe failures and no mutation uncertainty', async () => {
  const prior = globalThis.fetch
  try {
    let calls = 0
    globalThis.fetch = async (url, init) => {
      calls++
      assert.equal(url, `${base}/spots/search`)
      assert.equal(init?.method, 'POST'); assert.equal(init?.cache, 'no-store')
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer token')
      assert.equal((init?.headers as Record<string, string>)['Content-Type'], 'application/json')
      assert.deepEqual(JSON.parse(init?.body as string), { query: 'shade', feed: 'public', centerLat: 0, centerLon: 180 })
      return Response.json({ mode: 'semantic', candidateLimit: 50, spots: [], emptyReason: 'no_matches' })
    }
    assert.equal((await searchSpots(base, 'token', ' shade ', 'public', { latitude: 0, longitude: 180 }, new AbortController().signal)).emptyReason, 'no_matches')
    assert.equal(calls, 1)
    await assert.rejects(searchSpots(base, 'token', 'shade', 'public', null, new AbortController().signal), SearchApiError)
    assert.equal(calls, 1)
    for (const [status, code, kind] of [[400, 'BAD_REQUEST', 'invalid'], [401, 'UNAUTHORIZED', 'auth'], [403, 'NOT_ENROLLED', 'auth'], [429, 'SEARCH_BUSY', 'busy'], [503, 'SERVICE_UNAVAILABLE', 'unavailable'], [503, 'SEARCH_UNAVAILABLE', 'unavailable']] as const) {
      globalThis.fetch = async () => Response.json({ error: { code, message: 'secret upstream message' } }, { status })
      await assert.rejects(searchSpots(base, 'token', 'shade', 'connections', null, new AbortController().signal), (error: unknown) => error instanceof SearchApiError && error.failure.kind === kind && !error.message.includes('secret') && !error.message.includes('may have completed'))
    }
    globalThis.fetch = async () => Response.json({ mode: 'semantic', candidateLimit: 50, spots: [spot, spot] })
    await assert.rejects(searchSpots(base, 'token', 'shade', 'connections', null, new AbortController().signal), (error: unknown) => error instanceof SearchApiError && error.failure.kind === 'unavailable')
  } finally { globalThis.fetch = prior }
})

test('45s default budget, caller abort and shorter read timeout never retry or mutate', async () => {
  assert.equal(SEARCH_TIMEOUT_MS, 45_000)
  const prior = globalThis.fetch
  let calls = 0
  let requestSignal!: AbortSignal
  try {
    globalThis.fetch = async (_url, init) => {
      calls++
      requestSignal = init?.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => {
        const fail = () => reject(new DOMException('aborted', 'AbortError'))
        if (requestSignal.aborted) fail()
        else requestSignal.addEventListener('abort', fail, { once: true })
      })
    }
    const caller = new AbortController()
    const request = searchSpots(base, 'token', 'door', 'connections', null, caller.signal, 1_000)
    caller.abort()
    await assert.rejects(request, (error: unknown) => error instanceof SearchApiError && error.failure.kind === 'unavailable')
    assert.equal(requestSignal.aborted, true)
    const newCaller = new AbortController()
    await assert.rejects(searchSpots(base, 'token', 'door', 'connections', null, newCaller.signal, 20), (error: unknown) => error instanceof SearchApiError && error.failure.kind === 'unavailable')
    assert.equal(requestSignal.aborted, true)
    assert.equal(newCaller.signal.aborted, false)
    assert.equal(calls, 2)
  } finally { globalThis.fetch = prior }
})

test('effect-owned controller drops stale success/error on feed, query, account, radius, area, clear, and StrictMode replay', async () => {
  const controller = new ScopedResultsController()
  const events: string[] = []
  const publish = (event: { key: string; status: string }) => events.push(`${event.key}:${event.status}`)
  for (const change of ['feed', 'query', 'account', 'radius', 'area', 'clear']) {
    const old = deferred<string>()
    const end = controller.begin(`old-${change}`, id, session, () => old.promise, publish)
    await tick()
    controller.invalidate() // synchronous UI event, before React effect cleanup
    const next = controller.begin(`new-${change}`, id, session, async () => 'fresh', publish)
    old.resolve('old content')
    await tick()
    assert.deepEqual(events.splice(0), [`new-${change}:success`])
    end(); next()
    const failure = deferred<string>()
    const endFailure = controller.begin(`error-${change}`, id, session, () => failure.promise, publish)
    await tick()
    controller.invalidate()
    const replay = controller.begin(`replay-${change}`, id, session, async () => 'fresh replay', publish)
    failure.reject(new Error('stale upstream'))
    await tick()
    assert.deepEqual(events.splice(0), [`replay-${change}:success`])
    endFailure(); replay()
  }
  const strictOld = deferred<string>()
  const strictCleanup = controller.begin('strict-first', id, session, () => strictOld.promise, publish)
  await tick()
  strictCleanup()
  const strictReplay = controller.begin('strict-second', id, session, async () => 'fresh replay', publish)
  strictOld.reject(new Error('strict stale error'))
  await tick()
  assert.deepEqual(events.splice(0), ['strict-second:success'])
  strictReplay()
  const account = controller.begin('wrong-account', other, session, async () => 'no request', publish)
  await tick()
  assert.deepEqual(events.splice(0), ['wrong-account:error']) // UI calls recheck only for current auth error.
  account()
})
