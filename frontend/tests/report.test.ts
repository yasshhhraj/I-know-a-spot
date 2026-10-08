import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REPORT_TIMEOUT_MS, ReportApiError, parseReport, submitReport, type ReportReason } from '../src/reportApi.ts'
import { ReportController, type ReportState } from '../src/reportController.ts'

const base = 'https://api.example.test'
const spot = '00000000-0000-4000-8000-000000000010'
const otherSpot = '00000000-0000-4000-8000-000000000011'
const member = '00000000-0000-4000-8000-000000000001'
const otherMember = '00000000-0000-4000-8000-000000000002'
const reason: ReportReason = 'private_property'
const ack = (id = spot, value: unknown = reason) => ({ report: { spotId: id, reason: value, accepted: true } })
const session = async () => ({ access_token: 'session-token', user: { id: member } })
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const deferred = <T>() => { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const kind = (name: string) => (error: unknown) => error instanceof ReportApiError && error.failure.kind === name && !error.message.includes('secret')

test('strict acknowledgement: exact identity, reason, true and no extra metadata', () => {
  assert.doesNotThrow(() => parseReport(ack(), spot, reason))
  for (const malformed of [null, {}, [], { report: null }, { report: {} }, ack(otherSpot), ack(spot, 'inaccurate'),
    { report: { ...ack().report, accepted: 1 } }, { report: { ...ack().report, id: 'private' } },
    { report: { ...ack().report, count: 1 } }, { report: { ...ack().report, duplicate: true } },
    { report: { ...ack().report, createdAt: 'now' } }, { ...ack(), status: 'reviewed' }]) {
    assert.throws(() => parseReport(malformed, spot, reason), kind('uncertain'))
  }
})

test('POST has exactly one reason, bearer auth and no identity/query; all reasons accepted', async () => {
  const previous = globalThis.fetch
  const reasons: ReportReason[] = ['private_property', 'sensitive_location', 'inappropriate_content', 'inaccurate']
  try {
    let calls = 0
    globalThis.fetch = async (url, init) => {
      assert.equal(url, `${base}/spots/${spot}/reports`)
      assert.equal(init?.method, 'POST'); assert.equal(init?.cache, 'no-store')
      assert.deepEqual(init?.headers, { Authorization: 'Bearer session-token', 'Content-Type': 'application/json' })
      const body = JSON.parse(init?.body as string)
      assert.deepEqual(Object.keys(body), ['reason'])
      assert.equal(body.reason, reasons[calls++])
      return Response.json(ack(spot, body.reason))
    }
    for (const value of reasons) await submitReport(base, 'session-token', spot, value, new AbortController().signal)
    await assert.rejects(submitReport(base, 'token', 'bad/id', reason, new AbortController().signal), kind('invalid'))
    await assert.rejects(submitReport(base, 'token', spot, 'invalid' as ReportReason, new AbortController().signal), kind('invalid'))
    assert.equal(calls, 4)
  } finally { globalThis.fetch = previous }
})

test('status classification and malformed/non-200 success never expose upstream messages', async () => {
  const previous = globalThis.fetch
  try {
    for (const [status, expected] of [[400, 'invalid'], [401, 'auth'], [403, 'auth'], [404, 'missing'], [503, 'uncertain'], [500, 'uncertain'], [429, 'uncertain']] as const) {
      globalThis.fetch = async () => Response.json({ error: { message: 'secret upstream' } }, { status })
      await assert.rejects(submitReport(base, 'token', spot, reason, new AbortController().signal), kind(expected))
    }
    globalThis.fetch = async () => Response.json(ack(), { status: 201 })
    await assert.rejects(submitReport(base, 'token', spot, reason, new AbortController().signal), kind('uncertain'))
    globalThis.fetch = async () => new Response('not JSON', { status: 200 })
    await assert.rejects(submitReport(base, 'token', spot, reason, new AbortController().signal), kind('uncertain'))
    globalThis.fetch = async () => { throw Error('secret network') }
    await assert.rejects(submitReport(base, 'token', spot, reason, new AbortController().signal), kind('uncertain'))
  } finally { globalThis.fetch = previous }
})

test('dedicated 35s write deadline and caller abort; no automatic retry', async () => {
  assert.equal(REPORT_TIMEOUT_MS, 35_000)
  const previous = globalThis.fetch
  let calls = 0; let received!: AbortSignal
  try {
    globalThis.fetch = async (_url, init) => {
      calls++; received = init?.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => {
        const fail = () => reject(new DOMException('aborted', 'AbortError'))
        if (received.aborted) fail()
        else received.addEventListener('abort', fail, { once: true })
      })
    }
    const caller = new AbortController()
    const pending = submitReport(base, 'token', spot, reason, caller.signal, 1000)
    caller.abort(); await assert.rejects(pending, kind('uncertain'))
    assert.equal(received.aborted, true)
    const another = new AbortController()
    await assert.rejects(submitReport(base, 'token', spot, reason, another.signal, 10), kind('uncertain'))
    assert.equal(received.aborted, true); assert.equal(another.signal.aborted, false); assert.equal(calls, 2)
  } finally { globalThis.fetch = previous }
})

test('deadline settles even when fetch or response body ignores abort', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => new Promise<Response>(() => {})
    await assert.rejects(submitReport(base, 'token', spot, reason, new AbortController().signal, 10), kind('uncertain'))
    globalThis.fetch = async () => ({ status: 200, json: async () => new Promise<unknown>(() => {}) }) as Response
    await assert.rejects(submitReport(base, 'token', spot, reason, new AbortController().signal, 10), kind('uncertain'))
  } finally { globalThis.fetch = previous }
})

test('conscious reason, pending lock, confirmed success and separate next reason', async () => {
  const states: ReportState[] = []; const pending = deferred<void>(); const calls: ReportReason[] = []
  const handle = new ReportController().begin(member, spot, session, async (_token, _spot, selected) => {
    calls.push(selected); if (calls.length === 1) return pending.promise
  }, s => states.push(s), () => assert.fail('auth'), () => assert.fail('missing'))
  assert.equal(handle.submit(), false)
  assert.equal(handle.choose(reason), true)
  assert.equal(handle.submit(), true)
  assert.equal(states.at(-1)?.phase, 'pending')
  assert.equal(handle.submit(), false); assert.equal(handle.choose('inaccurate'), false)
  await tick(); pending.resolve(); await tick()
  assert.equal(states.at(-1)?.phase, 'success'); assert.deepEqual(calls, [reason])
  assert.equal(handle.submit(), false)
  handle.choose('inaccurate'); assert.equal(states.at(-1)?.phase, 'idle')
  assert.equal(handle.submit(), true); await tick()
  assert.equal(states.at(-1)?.phase, 'success'); assert.deepEqual(calls, [reason, 'inaccurate'])
  handle.dispose()
})

test('uncertain requires same-reason explicit retry, preserved selection; other reason is separate', async () => {
  let calls = 0; const states: ReportState[] = []
  const handle = new ReportController().begin(member, spot, session, async () => {
    calls++; if (calls === 1) throw new ReportApiError({ kind: 'uncertain', message: 'Outcome uncertain' })
  }, s => states.push(s), () => {}, () => {})
  handle.choose(reason); handle.submit(); await tick()
  assert.deepEqual([states.at(-1)?.phase, states.at(-1)?.reason], ['uncertain', reason])
  assert.equal(handle.choose(reason), false); assert.equal(states.at(-1)?.phase, 'uncertain')
  assert.equal(calls, 1); assert.equal(handle.submit(), true); await tick()
  assert.equal(states.at(-1)?.phase, 'success'); assert.equal(calls, 2)
  handle.dispose()
})

test('a late prior-account session cannot issue a report after scope replacement', async () => {
  const priorSession = deferred<Awaited<ReturnType<typeof session>>>()
  const controller = new ReportController(); const events: string[] = []; let calls = 0
  const old = controller.begin(member, spot, () => priorSession.promise, async () => { calls++ }, s => events.push(`old:${s.phase}`), () => events.push('old:auth'), () => events.push('old:missing'))
  old.choose(reason); old.submit(); old.dispose()
  const next = controller.begin(otherMember, otherSpot, async () => ({ access_token: 'new', user: { id: otherMember } }), async () => { calls++ },
    s => events.push(`new:${s.phase}`), () => events.push('new:auth'), () => events.push('new:missing'))
  priorSession.resolve({ access_token: 'old', user: { id: member } }); await tick()
  assert.equal(calls, 0); assert.deepEqual(events, ['old:idle', 'old:idle', 'old:pending', 'new:idle'])
  next.dispose()
})

test('auth recheck, missing dismissal and mismatched fresh session; no write on wrong account', async () => {
  for (const [failure, callback] of [['auth', 'auth'], ['missing', 'missing']] as const) {
    const events: string[] = []
    const handle = new ReportController().begin(member, spot, session, async () => { throw new ReportApiError({ kind: failure, message: 'Safe' }) },
      s => events.push(s.phase), () => events.push('auth'), () => events.push('missing'))
    handle.choose(reason); handle.submit(); await tick()
    assert.deepEqual(events, ['idle', 'idle', 'pending', 'error', callback]); handle.dispose()
  }
  let calls = 0; const events: string[] = []
  const handle = new ReportController().begin(member, spot, async () => ({ access_token: 'other', user: { id: otherMember } }), async () => { calls++ },
    s => events.push(s.phase), () => events.push('auth'), () => events.push('missing'))
  handle.choose(reason); handle.submit(); await tick()
  assert.equal(calls, 0); assert.deepEqual(events, ['idle', 'idle', 'pending', 'error', 'auth']); handle.dispose()
})

test('late success/error cannot cross account/detail/nav/dispose/StrictMode setup-cleanup-setup', async () => {
  for (const change of ['member', 'spot', 'navigation', 'strict']) {
    for (const outcome of ['success', 'error']) {
      const controller = new ReportController(); const events: string[] = []; const pending = deferred<void>()
      const old = controller.begin(member, spot, session, () => pending.promise, s => events.push(`old:${s.phase}`), () => events.push('old:auth'), () => events.push('old:missing'))
      old.choose(reason); old.submit(); await tick(); old.dispose()
      const nextMember = change === 'member' ? otherMember : member; const nextSpot = change === 'spot' ? otherSpot : spot
      const next = controller.begin(nextMember, nextSpot, async () => ({ access_token: 'fresh', user: { id: nextMember } }), async () => {},
        s => events.push(`new:${s.phase}`), () => events.push('new:auth'), () => events.push('new:missing'))
      if (outcome === 'success') pending.resolve()
      else pending.reject(new ReportApiError({ kind: 'missing', message: 'Old spot unavailable' }))
      await tick()
      assert.deepEqual(events, ['old:idle', 'old:idle', 'old:pending', 'new:idle'])
      assert.equal(old.submit(), false); next.dispose()
    }
  }
})
