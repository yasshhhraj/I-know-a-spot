import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wrapLongitude } from '../src/mapCoordinates.ts'

test('wrapped map clicks produce valid API longitudes across world copies and antimeridian', () => {
  for (const [clicked, expected] of [[0, 0], [179, 179], [180, -180], [-180, -180], [181, -179], [-181, 179], [540, -180], [-540, -180], [721, 1]] as const) {
    assert.equal(wrapLongitude(clicked), expected)
  }
  assert.ok(Number.isNaN(wrapLongitude(Infinity)))
  assert.ok(Number.isNaN(wrapLongitude(NaN)))
})
