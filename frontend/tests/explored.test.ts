import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exploredRequest, parseExploration, ExploredApiError, EXPLORED_READ_TIMEOUT_MS, EXPLORED_WRITE_TIMEOUT_MS } from '../src/exploredApi.ts'
import { ExploredController, type ExploredState } from '../src/exploredController.ts'

const base = 'https://api.example.test'
const spot = '00000000-0000-4000-8000-000000000010'
const otherSpot = '00000000-0000-4000-8000-000000000011'
const member = '00000000-0000-4000-8000-000000000001'
const otherMember = '00000000-0000-4000-8000-000000000002'
const valid = (explored: boolean) => ({ exploration: { spotId: spot, explored } })
const session = async () => ({ access_token: 'session-token', user: { id: member } })
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const deferred = <T>() => { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const kind = (name: string) => (error: unknown) => error instanceof ExploredApiError && error.failure.kind === name && !error.message.includes('secret')

test('exact response schema, requested ID and desired write value; absent row is only false on valid GET', () => {
  assert.equal(parseExploration(valid(false), spot), false)
  assert.equal(parseExploration(valid(true), spot, true), true)
  assert.equal(parseExploration(valid(false), spot, false), false)
  for (const malformed of [null, {}, { exploration: null }, { exploration: {} },
    { exploration: { spotId: otherSpot, explored: false } },
    { exploration: { spotId: spot, explored: 0 } },
    { exploration: { spotId: spot, explored: false, userId: member } },
    { exploration: { spotId: spot, explored: false, createdAt: 'now' } },
    { ...valid(false), count: 3 }]) {
    assert.throws(() => parseExploration(malformed, spot), kind('unavailable'))
    assert.throws(() => parseExploration(malformed, spot, true), kind('uncertain'))
  }
  assert.throws(() => parseExploration(valid(false), spot, true), kind('uncertain'))
})

test('GET and PUT use only current JWT, no identity/query, strict JSON desired boolean and no-store', async () => {
  const previous = globalThis.fetch
  try {
    const methods: string[] = []
    globalThis.fetch = async (url, init) => {
      assert.equal(url, `${base}/spots/${spot}/explored`)
      assert.equal(init?.cache, 'no-store')
      assert.deepEqual(init?.headers, { Authorization: 'Bearer session-token', ...(init?.method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) })
      methods.push(init?.method || '')
      if (init?.method === 'PUT') {
        assert.equal(init.body, '{"explored":true}')
        return Response.json(valid(true))
      }
      assert.equal(init?.body, undefined)
      return Response.json(valid(false))
    }
    const signal = new AbortController().signal
    assert.equal(await exploredRequest(base, 'session-token', spot, signal), false)
    assert.equal(await exploredRequest(base, 'session-token', spot, signal, true), true)
    assert.deepEqual(methods, ['GET', 'PUT'])
    await assert.rejects(exploredRequest(base, 'session-token', 'bad/id', signal), kind('invalid'))
    assert.deepEqual(methods, ['GET', 'PUT'])
  } finally { globalThis.fetch = previous }
})

test('safe HTTP classification: read errors never imply false; uncertain write only for ambiguous outcomes', async () => {
  const previous = globalThis.fetch
  try {
    for (const [status, code, read, write] of [
      [400, 'BAD_REQUEST', 'invalid', 'invalid'], [401, 'UNAUTHORIZED', 'auth', 'auth'],
      [403, 'NOT_ENROLLED', 'auth', 'auth'], [404, 'NOT_FOUND', 'missing', 'missing'],
      [503, 'SERVICE_UNAVAILABLE', 'unavailable', 'uncertain'], [500, 'UPSTREAM', 'unavailable', 'uncertain'],
    ] as const) {
      globalThis.fetch = async () => Response.json({ error: { code, message: 'secret upstream detail' } }, { status })
      await assert.rejects(exploredRequest(base, 'token', spot, new AbortController().signal), kind(read))
      await assert.rejects(exploredRequest(base, 'token', spot, new AbortController().signal, false), kind(write))
    }
    globalThis.fetch = async () => new Response('not json', { status: 200 })
    await assert.rejects(exploredRequest(base, 'token', spot, new AbortController().signal), kind('unavailable'))
    await assert.rejects(exploredRequest(base, 'token', spot, new AbortController().signal, true), kind('uncertain'))
    globalThis.fetch = async () => Response.json(valid(true), { status: 201 })
    await assert.rejects(exploredRequest(base, 'token', spot, new AbortController().signal, true), kind('uncertain'))
    globalThis.fetch = async () => new Response('not json', { status: 400 })
    await assert.rejects(exploredRequest(base, 'token', spot, new AbortController().signal, true), kind('invalid'))
    globalThis.fetch = async () => Response.json({ exploration: { spotId: otherSpot, explored: true } })
    await assert.rejects(exploredRequest(base, 'token', spot, new AbortController().signal, true), kind('uncertain'))
    globalThis.fetch = async () => { throw new TypeError('network secret') }
    await assert.rejects(exploredRequest(base, 'token', spot, new AbortController().signal), kind('unavailable'))
    await assert.rejects(exploredRequest(base, 'token', spot, new AbortController().signal, false), kind('uncertain'))
  } finally { globalThis.fetch = previous }
})

test('30s/35s budgets, caller abort and timeout; no automatic mutation retry', async () => {
  assert.equal(EXPLORED_READ_TIMEOUT_MS, 30_000)
  assert.equal(EXPLORED_WRITE_TIMEOUT_MS, 35_000)
  const previous = globalThis.fetch
  let calls = 0
  let received!: AbortSignal
  try {
    globalThis.fetch = async (_url, init) => {
      calls++
      received = init?.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => {
        const fail = () => reject(new DOMException('aborted', 'AbortError'))
        if (received.aborted) fail()
        else received.addEventListener('abort', fail, { once: true })
      })
    }
    const caller = new AbortController()
    const read = exploredRequest(base, 'token', spot, caller.signal, undefined, 1000)
    caller.abort()
    await assert.rejects(read, kind('unavailable'))
    assert.equal(received.aborted, true)
    const nextCaller = new AbortController()
    await assert.rejects(exploredRequest(base, 'token', spot, nextCaller.signal, true, 10), kind('uncertain'))
    assert.equal(received.aborted, true)
    assert.equal(nextCaller.signal.aborted, false)
    assert.equal(calls, 2)
  } finally { globalThis.fetch = previous }
})

test('independent load, duplicate pending disabled, explicit desired sets and confirmed value only on success', async () => {
  const controller = new ExploredController()
  const states: ExploredState[] = []
  const read = deferred<boolean>(); const write = deferred<boolean>()
  const calls: (boolean | undefined)[] = []
  const handle = controller.begin(member, spot, session, async (_token, _spot, _signal, desired) => {
    calls.push(desired)
    return desired === undefined ? read.promise : write.promise
  }, s => states.push(s), () => assert.fail('auth'), () => assert.fail('missing'))
  assert.equal(states.at(-1)?.phase, 'loading')
  assert.equal(handle.set(true), false)
  await tick(); read.resolve(false); await tick()
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.confirmed], ['ready', false])
  assert.equal(handle.set(true), true)
  assert.equal(handle.set(true), false)
  assert.equal(handle.set(false), false)
  assert.equal(handle.reload(), false)
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.confirmed], ['saving', false])
  await tick(); write.resolve(true); await tick()
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.confirmed], ['ready', true])
  assert.deepEqual(calls, [undefined, true])
  handle.dispose()
})

test('failed read unknown, deterministic write retains confirmation; auth recheck and 404 clear', async () => {
  for (const [failure, expected] of [['invalid', 'ready'], ['auth', 'ready'], ['missing', 'ready']] as const) {
    const controller = new ExploredController()
    const states: ExploredState[] = []; let auth = 0; let missing = 0
    const handle = controller.begin(member, spot, session,
      async (_token, _spot, _signal, desired) => {
        if (desired === undefined) return false
        throw new ExploredApiError({ kind: failure, message: `${failure} safe` })
      }, s => states.push(s), () => auth++, () => missing++)
    await tick(); handle.set(true); await tick()
    assert.equal(states.at(-1)?.phase, expected)
    assert.equal(states.at(-1)?.confirmed, false)
    assert.equal(auth, failure === 'auth' ? 1 : 0)
    assert.equal(missing, failure === 'missing' ? 1 : 0)
    handle.dispose()
  }
  const states: ExploredState[] = []
  let call = 0
  const handle = new ExploredController().begin(member, spot, session, async () => {
    if (call++ === 0) throw new ExploredApiError({ kind: 'unavailable', message: 'Read unavailable' })
    return false
  }, s => states.push(s), () => {}, () => {})
  await tick()
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.confirmed], ['error', null])
  assert.equal(handle.set(true), false)
  handle.reload(); await tick()
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.confirmed], ['ready', false])
  handle.dispose()
})

test('uncertain write preserves confirmed value and blocks changes until explicit successful reload', async () => {
  const states: ExploredState[] = []
  let reads = 0; let writes = 0
  const handle = new ExploredController().begin(member, spot, session, async (_token, _spot, _signal, desired) => {
    if (desired === undefined) { reads++; if (reads === 2) throw new Error('outage'); return reads === 1 ? false : true }
    writes++
    throw new ExploredApiError({ kind: 'uncertain', message: 'May have saved.' })
  }, s => states.push(s), () => {}, () => {})
  await tick(); assert.equal(handle.set(true), true); await tick()
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.confirmed], ['uncertain', false])
  assert.equal(handle.set(true), false)
  assert.equal(reads, 1); assert.equal(writes, 1)
  handle.reload(); await tick()
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.confirmed], ['uncertain', false])
  assert.equal(handle.set(true), false)
  handle.reload(); await tick()
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.confirmed], ['ready', true])
  assert.equal(handle.set(true), false)
  handle.dispose()
})

test('failed reload preserves the last confirmed value but disables changes until a successful read', async () => {
  const states: ExploredState[] = []
  let reads = 0
  const handle = new ExploredController().begin(member, spot, session, async () => {
    if (++reads === 2) throw new ExploredApiError({ kind: 'unavailable', message: 'Read failed' })
    return true
  }, s => states.push(s), () => {}, () => {})
  await tick(); assert.equal(states.at(-1)?.confirmed, true)
  handle.reload(); await tick()
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.confirmed], ['error', true])
  assert.equal(handle.set(false), false)
  handle.reload(); await tick()
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.confirmed], ['ready', true])
  handle.dispose()
})

test('late GET/PUT successes and errors cannot publish across detail navigation, member switch, or StrictMode replay', async () => {
  for (const change of ['spot', 'member', 'navigation', 'strict']) {
    const controller = new ExploredController()
    const events: string[] = []
    const oldRead = deferred<boolean>()
    const old = controller.begin(member, spot, session, () => oldRead.promise, s => events.push(`old:${s.phase}`), () => events.push('old:auth'), () => events.push('old:missing'))
    await tick(); old.dispose()
    const newId = change === 'spot' ? otherSpot : spot
    const newMember = change === 'member' ? otherMember : member
    const replay = controller.begin(newMember, newId, async () => ({ access_token: 'new', user: { id: newMember } }), async () => false,
      s => events.push(`new:${s.phase}`), () => events.push('new:auth'), () => events.push('new:missing'))
    oldRead.resolve(true); await tick()
    assert.deepEqual(events, ['old:loading', 'new:loading', 'new:ready'])
    replay.dispose()
    const staleRead = deferred<boolean>(); const readEvents: string[] = []
    const stale = controller.begin(member, spot, session, () => staleRead.promise, s => readEvents.push(`old:${s.phase}`), () => readEvents.push('old:auth'), () => readEvents.push('old:missing'))
    await tick(); stale.dispose()
    const currentRead = controller.begin(newMember, newId, async () => ({ access_token: 'new', user: { id: newMember } }), async () => false,
      s => readEvents.push(`new:${s.phase}`), () => readEvents.push('new:auth'), () => readEvents.push('new:missing'))
    staleRead.reject(new ExploredApiError({ kind: 'auth', message: 'Old auth' })); await tick()
    assert.deepEqual(readEvents, ['old:loading', 'new:loading', 'new:ready'])
    currentRead.dispose()
    const oldWrite = deferred<boolean>(); const more: string[] = []
    const started = controller.begin(member, spot, session, async (_token, _id, _signal, desired) => desired === undefined ? false : oldWrite.promise,
      s => more.push(`old:${s.phase}`), () => more.push('old:auth'), () => more.push('old:missing'))
    await tick(); started.set(true); await tick(); started.dispose()
    const fresh = controller.begin(newMember, newId, async () => ({ access_token: 'new', user: { id: newMember } }), async () => false,
      s => more.push(`new:${s.phase}`), () => more.push('new:auth'), () => more.push('new:missing'))
    oldWrite.reject(new ExploredApiError({ kind: 'missing', message: 'Old spot removed' })); await tick()
    assert.deepEqual(more, ['old:loading', 'old:ready', 'old:saving', 'new:loading', 'new:ready'])
    fresh.dispose()
    const lateSuccess = deferred<boolean>(); const successEvents: string[] = []
    const prior = controller.begin(member, spot, session, async (_token, _id, _signal, desired) => desired === undefined ? false : lateSuccess.promise,
      s => successEvents.push(`old:${s.phase}`), () => successEvents.push('old:auth'), () => successEvents.push('old:missing'))
    await tick(); prior.set(true); await tick(); prior.dispose()
    const next = controller.begin(newMember, newId, async () => ({ access_token: 'new', user: { id: newMember } }), async () => false,
      s => successEvents.push(`new:${s.phase}`), () => successEvents.push('new:auth'), () => successEvents.push('new:missing'))
    lateSuccess.resolve(true); await tick()
    assert.deepEqual(successEvents, ['old:loading', 'old:ready', 'old:saving', 'new:loading', 'new:ready'])
    next.dispose()
  }
})
