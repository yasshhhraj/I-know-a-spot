// Actual local MiniLM + injected HTTP route; only the versioned synthetic corpus.
// Run from backend/: npm run build && node scripts/evaluate-semantic-search.mjs
// No .env, real accounts/database, model downloads, or listening socket.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createApp } from '../dist/app.js';
import { readConfig } from '../dist/config.js';
import { RELEVANCE_THRESHOLD } from '../dist/search.js';

const data = JSON.parse(await readFile(new URL('../supabase/semantic_search_fixture.json', import.meta.url), 'utf8'));
const viewer = '00000000-0000-4000-8000-000000000001';
const owners = { connected: '00000000-0000-4000-8000-000000000002', unconnected: '00000000-0000-4000-8000-000000000003' };
const rows = data.spots.map((spot, index) => ({
  id: spot.id, owner_id: owners[spot.owner], author_name: 'Synthetic contributor', title: spot.title, note: spot.note,
  audience: spot.audience, latitude: 0, longitude: spot.distanceKm / 6371 * 180 / Math.PI,
  access_confirmed: true, access_note: data.marker,
  created_at: new Date(Date.UTC(2026, 9, 8) - index * 1000).toISOString(), updated_at: '2026-10-08T00:00:00Z', removed_at: spot.removed ? '2026-10-08T01:00:00Z' : null,
  distance_km: spot.distanceKm,
}));
const sourceById = new Map(data.spots.map(spot => [spot.id, spot]));
const eligible = feed => rows.filter(row => !row.removed_at && (feed === 'connections'
  ? row.owner_id === owners.connected : row.audience === 'public' && row.distance_km <= 5))
  .sort((a, b) => (feed === 'public' ? a.distance_km - b.distance_km : 0) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
const unused = async () => { throw new Error('Unused synthetic store operation'); };
const store = { configured: true, async list(_token, _caller, options) {
  return eligible(options.feed).map(row => {
    if (options.feed === 'public') return { ...row };
    const { distance_km, ...connectionRow } = row;
    return connectionRow;
  });
}, get: unused, photo: unused, create: unused, update: unused, remove: unused };
const profile = async () => ({ kind: 'ok', profile: { id: viewer, displayName: 'Synthetic viewer', publicRadiusKm: 5 } });
const app = createApp(readConfig({}), profile, store);
const stopWords = new Set('a an the to with from by in on of and or for as is at where can i it this somewhere place'.split(' '));
const tokens = text => new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(word => !stopWords.has(word)));
const keyword = (query, feed) => {
  const wanted = tokens(query);
  return eligible(feed).map((row, position) => {
    const words = tokens(`${row.title}\n${row.note}`);
    return { key: sourceById.get(row.id).key, score: [...wanted].filter(word => words.has(word)).length, position };
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.position - b.position).slice(0, 3).map(row => row.key);
};
const results = [];
try {
  for (const example of data.queries) {
    const started = performance.now();
    const response = await app.inject({ method: 'POST', url: '/spots/search',
      headers: { authorization: 'Bearer synthetic-evaluation', 'content-type': 'application/json' },
      payload: { query: example.query, feed: example.feed, ...(example.feed === 'public' ? { centerLat: 0, centerLon: 0 } : {}) },
    });
    const latencyMs = Math.round((performance.now() - started) * 1000) / 1000;
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    const body = response.json();
    assert.equal(body.mode, 'semantic');
    assert.equal(body.candidateLimit, 50);
    assert.ok(body.spots.length <= 3);
    const allowed = new Set(eligible(example.feed).map(row => row.id));
    for (const spot of body.spots) {
      assert.ok(allowed.has(spot.id), 'Excluded synthetic spot leaked');
      assert.equal(spot.note, sourceById.get(spot.id).note);
      assert.equal(spot.photoUrl, `/spots/${spot.id}/photo`);
      assert.ok(!Object.hasOwn(spot, 'score'));
    }
    const actual = body.spots.map(spot => sourceById.get(spot.id).key);
    const lexical = keyword(example.query, example.feed);
    const hit = keys => example.expected.length ? keys.some(key => example.expected.includes(key)) : keys.length === 0;
    results.push({ query: example.query, feed: example.feed, expected: example.expected, semantic: actual, keyword: lexical,
      semanticHit: hit(actual), keywordHit: hit(lexical), vocabularyGap: !!example.vocabularyGap, latencyMs });
  }
  console.log(JSON.stringify({
    evidence: 'Real cached MiniLM plus injected HTTP; synthetic authorization provider/store, not live SQL/RLS',
    threshold: RELEVANCE_THRESHOLD,
    queryCount: results.length,
    positiveSemanticHits: results.filter(row => row.expected.length && row.semanticHit).length,
    positiveKeywordHits: results.filter(row => row.expected.length && row.keywordHit).length,
    positiveQueryCount: results.filter(row => row.expected.length).length,
    negativeQueryCorrect: results.filter(row => !row.expected.length).every(row => row.semanticHit),
    vocabularyGapImprovementCount: results.filter(row => row.vocabularyGap && row.semanticHit && !row.keywordHit).length,
    results,
  }, null, 2));
} finally { await app.close(); }
