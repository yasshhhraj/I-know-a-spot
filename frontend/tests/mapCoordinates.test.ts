import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mapViewport, wrapLongitude } from '../src/mapCoordinates.ts'

test('wrapped map clicks produce valid API longitudes across world copies and antimeridian', () => {
  for (const [clicked, expected] of [[0, 0], [179, 179], [180, -180], [-180, -180], [181, -179], [-181, 179], [540, -180], [-540, -180], [721, 1]] as const) {
    assert.equal(wrapLongitude(clicked), expected)
  }
  assert.ok(Number.isNaN(wrapLongitude(Infinity)))
  assert.ok(Number.isNaN(wrapLongitude(NaN)))
})

test('only explicit creation picker uses world overview when no pin; discovery has no silent center', () => {
  assert.deepEqual(mapViewport(null, null, null, true), { center: [0, 0], zoom: 2, worldOverview: true })
  assert.equal(mapViewport(null, null, null, false), null)
  assert.deepEqual(mapViewport(null, [20, 30], [-10, -20], false), { center: [-10, -20], zoom: 13, worldOverview: false })
  assert.deepEqual(mapViewport([1, 2], [20, 30], [-10, -20], true), { center: [1, 2], zoom: 13, worldOverview: false })
})
