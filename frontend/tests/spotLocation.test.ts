import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SpotLocationController, type LocationPort, type SpotLocationState } from '../src/spotLocation.ts'

function harness() {
  let success!: Parameters<LocationPort['getCurrentPosition']>[0]
  let failure!: Parameters<LocationPort['getCurrentPosition']>[1]
  let calls = 0
  const states: SpotLocationState[] = []
  const port: LocationPort = { getCurrentPosition(ok, fail, options) {
    calls++
    success = ok; failure = fail
    assert.deepEqual(options, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 })
  } }
  const controller = new SpotLocationController(() => port, state => states.push(state))
  return { controller, states, get calls() { return calls }, success: (lat: number, lon: number) => success({ coords: { latitude: lat, longitude: lon } }), failure: (code: number) => failure({ code }) }
}

test('location is requested only on explicit action and valid coordinates fill at six decimals', () => {
  const h = harness()
  assert.equal(h.calls, 0)
  assert.equal(h.controller.state.kind, 'idle')
  h.controller.request(); h.controller.request()
  assert.equal(h.calls, 1)
  h.success(12.123456789, -77.3)
  assert.deepEqual(h.controller.state, { kind: 'success', latitude: '12.123457', longitude: '-77.300000' })
  assert.deepEqual(h.states.map(state => state.kind), ['pending', 'success'])
})

test('denial, timeout and unavailable have distinct retryable states', () => {
  const h = harness()
  h.controller.request(); h.failure(1)
  assert.equal(h.controller.state.kind, 'permissionDenied')
  h.controller.request(); h.failure(3)
  assert.equal(h.controller.state.kind, 'unavailable')
  h.controller.request(); h.failure(2)
  assert.equal(h.controller.state.kind, 'unavailable')
  assert.equal(h.calls, 3)
})

test('unsupported browser and thrown geolocation access are safe', () => {
  const states: SpotLocationState[] = []
  const unsupported = new SpotLocationController(() => undefined, state => states.push(state))
  unsupported.request()
  assert.equal(unsupported.state.kind, 'unsupported')
  const throwing = new SpotLocationController(() => ({ getCurrentPosition() { throw Error('unavailable') } }), state => states.push(state))
  throwing.request()
  assert.equal(throwing.state.kind, 'unavailable')
})

test('invalid coordinates are rejected and manual override/dispose fence late callbacks', () => {
  const h = harness()
  for (const [lat, lon] of [[NaN, 0], [Infinity, 0], [91, 0], [0, -181]]) {
    h.controller.request(); h.success(lat, lon)
    assert.equal(h.controller.state.kind, 'unavailable')
  }
  h.controller.request(); h.controller.cancel(); h.success(1, 2)
  assert.equal(h.controller.state.kind, 'idle')
  h.controller.request(); h.controller.dispose(); h.failure(1)
  assert.equal(h.controller.state.kind, 'pending')
})
