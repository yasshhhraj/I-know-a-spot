import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configuredPilotCenter, normalizeCenter } from '../src/discovery.ts'
import { asSpot, asSpots, readOwnConnectionSpots, spotsPath, SpotApiError } from '../src/spotApi.ts'
import { parseMe, radiusValue, RadiusError, saveRadius } from '../src/api.ts'
import { FeedScopeLifecycle, SpotScope } from '../src/spotScope.ts'

const id = '00000000-0000-4000-8000-000000000001'
const spot = { id, ownerId: id, authorName: 'Member', title: 'A place', note: 'Visible from pavement', audience: 'public', latitude: 10, longitude: 20, accessConfirmed: true, accessNote: '', createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z', photoUrl: `/spots/${id}/photo` }
const base = 'https://api.example.test'
const profile = { id, displayName: 'Member', publicRadiusKm: 5 }

test('center normalization and fallback reject missing, invalid and out-of-bounds coordinates without silent zero', () => {
  assert.equal(configuredPilotCenter(undefined, '10'), null)
  assert.equal(configuredPilotCenter('YOUR_PILOT_CENTER_LAT', '10'), null)
  assert.equal(configuredPilotCenter('', ''), null)
  assert.deepEqual(configuredPilotCenter('0', '-180'), { latitude: 0, longitude: -180 })
  assert.deepEqual(normalizeCenter(90, 180), { latitude: 90, longitude: 180 })
  for (const center of [[NaN, 1], [Infinity, 1], [91, 0], [0, -181], ['', 0]]) assert.equal(normalizeCenter(...center), null)
})

test('feed path sends center only for Public; never sends client radius', () => {
  assert.equal(spotsPath('connections'), '/spots?feed=connections')
  const url = new URL(spotsPath('public', { latitude: -33.25, longitude: 180 }), base)
  assert.deepEqual([...url.searchParams.entries()], [['feed', 'public'], ['centerLat', '-33.25'], ['centerLon', '180']])
  for (const center of [undefined, { latitude: Infinity, longitude: 0 }, { latitude: 0, longitude: 181 }]) assert.throws(() => spotsPath('public', center))
})

test('Public rows require finite nonnegative distance and public audience; detail remains radius-independent', () => {
  assert.deepEqual(asSpots({ spots: [{ ...spot, distanceKm: 0 }, { ...spot, id: '00000000-0000-4000-8000-000000000002', photoUrl: '/spots/00000000-0000-4000-8000-000000000002/photo', distanceKm: 3.7 }] }, base, 'public').map(s => s.distanceKm), [0, 3.7])
  assert.deepEqual(asSpot({ spot }, base).distanceKm, undefined)
  for (const distanceKm of [NaN, Infinity, -0.01, '3', null]) assert.throws(() => asSpots({ spots: [{ ...spot, distanceKm }] }, base, 'public'), SpotApiError)
  assert.throws(() => asSpots({ spots: [spot] }, base, 'public'), SpotApiError)
  assert.throws(() => asSpots({ spots: [{ ...spot, audience: 'connections', distanceKm: 0 }] }, base, 'public'), SpotApiError)
  assert.throws(() => asSpots({ spots: [{ ...spot, distanceKm: 0 }] }, base), SpotApiError)
})

test('radius parser and profile enforce integer bounds including endpoints', () => {
  for (const n of ['1', '25', ' 5 ']) assert.ok(radiusValue(n) !== null)
  for (const n of ['', '0', '26', '3.5', '1e1', 'Infinity', '-1']) assert.equal(radiusValue(n), null)
  assert.equal(parseMe(200, { profile: { ...profile, publicRadiusKm: 25 } }, id).kind, 'enrolled')
  assert.equal(parseMe(200, { profile: { ...profile, publicRadiusKm: 25.5 } }, id).kind, 'outage')
})

test('PATCH /me sends exactly radius; failed save does not replace prior profile', async () => {
  const prior = globalThis.fetch
  let saved = profile
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, `${base}/me`)
      assert.equal(init?.method, 'PATCH')
      assert.equal(init?.cache, 'no-store')
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer token')
      assert.deepEqual(JSON.parse(init?.body as string), { publicRadiusKm: 12 })
      return Response.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'private' } }, { status: 503 })
    }
    await assert.rejects(saveRadius(base, 'token', id, 12, new AbortController().signal), (error: unknown) => error instanceof RadiusError && error.kind === 'uncertain')
    assert.equal(saved.publicRadiusKm, 5)
    globalThis.fetch = async () => Response.json({ profile: { ...profile, publicRadiusKm: 12 } })
    saved = await saveRadius(base, 'token', id, 12, new AbortController().signal)
    assert.equal(saved.publicRadiusKm, 12)
    await assert.rejects(saveRadius(base, 'token', id, 26, new AbortController().signal), (error: unknown) => error instanceof RadiusError && error.kind === 'invalid')
  } finally { globalThis.fetch = prior }
})

test('feed scope epochs suppress stale resolved results across switch/center/radius refresh', async () => {
  const scope = new SpotScope()
  const session = async () => ({ access_token: 'token', user: { id } })
  let resolve!: (value: string) => void
  const old = scope.run(id, session, () => new Promise<string>(r => { resolve = r }))
  await new Promise(resolve => setTimeout(resolve, 0))
  scope.invalidate()
  const current = scope.run(id, session, async () => 'new Public results')
  resolve('stale Connections result')
  assert.equal(await old, undefined)
  assert.equal(await current, 'new Public results')
  scope.dispose()
})

test('uncertain-save reconciliation reads authorized Connections, not the selected Public feed', async () => {
  const prior = globalThis.fetch
  const other = '00000000-0000-4000-8000-000000000002'
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, `${base}/spots?feed=connections`)
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer token')
      return Response.json({ spots: [{ ...spot, ownerId: id }, { ...spot, id: other, ownerId: other, photoUrl: `/spots/${other}/photo`, audience: 'connections' }] })
    }
    const matches = await readOwnConnectionSpots(base, 'token', id, new AbortController().signal)
    assert.deepEqual(matches.map(match => match.ownerId), [id])
  } finally { globalThis.fetch = prior }
})

test('feed effect setup/cleanup/setup uses a fresh live scope under StrictMode replay', async () => {
  const lifecycle = new FeedScopeLifecycle()
  const session = async () => ({ access_token: 'token', user: { id } })
  const first = lifecycle.begin()
  let resolve!: (value: string) => void
  const old = first.run(id, session, () => new Promise<string>(r => { resolve = r }))
  await new Promise(resolve => setTimeout(resolve, 0))
  lifecycle.end(first)
  const second = lifecycle.begin()
  assert.notEqual(second, first)
  resolve('stale first setup')
  assert.equal(await old, undefined)
  assert.equal(await second.run(id, session, async () => 'fresh feed'), 'fresh feed')
  lifecycle.invalidate()
  assert.equal(await second.run(id, session, async () => 'still usable after invalidation'), 'still usable after invalidation')
  lifecycle.end(second)
  assert.equal(await second.run(id, session, async () => 'must not run'), undefined)
  const third = lifecycle.begin()
  assert.equal(await third.run(id, session, async () => 'fresh after cleanup'), 'fresh after cleanup')
  lifecycle.end(third)
})
