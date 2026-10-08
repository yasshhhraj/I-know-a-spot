# MiniLM semantic-search evaluation — October 8, 2026

## Actual execution

From `backend/`:

```sh
npm run typecheck && npm run build && npm test
node scripts/evaluate-semantic-search.mjs
```

Backend typecheck/build passed; six test files / **105 tests passed**. Frontend
`npm run typecheck && npm run build && npm test` also passed, **37 tests**; build
4.20s, entry 426.86 kB / workspace 194.11 kB. Tree-shaking workaround retained.

The evaluation exercised actual `POST /spots/search` via Fastify injection, the
actual local MiniLM q8 encoder/cache/ranker and response/freshness code. Auth and
candidate listing used a synthetic provider/store. No server socket, Supabase
connection, real member text, private env or model-network request was used.

**This is not a live authorization audit, browser test or pilot-corpus benchmark.**
The seed/cleanup SQL has not been executed. Structural tests keep its text and
distances consistent with the synthetic evaluation corpus; they do not validate
running PostgreSQL/RLS/grants. Live checks are in SEMANTIC_SEARCH_SETUP.md.

## Dataset and comparison

Versioned corpus: `backend/supabase/semantic_search_fixture.json`, 14 fictional
spots, 12 queries. The injected B-like viewer is connected to author A but not C,
with saved radius 5 km and an explicitly synthetic (0,0) center.
Public eligible set: 10 spots; Connections eligible set: 10 spots. Excluded
fixtures include an unconnected private garden, removed garden and out-of-radius
Public garden with highly relevant text. Existing actual feeds remain capped at 50.

Keyword baseline: lowercase alphanumeric token overlap after the script's explicit
stop-word removal, nonzero matches only, up to three; deterministic eligible-feed
ties. It is a deliberately simple baseline, not BM25 or a claim about all lexical
search systems. Both approaches use the same eligible candidate sets.

Model: `Xenova/all-MiniLM-L6-v2` revision
`751bff37182d3f1213fa05d7196b954e230abad9`; Apache-2.0; Transformers.js 4.3.1,
Node 24.13.1; q8 CPU, 384-dimensional mean-pooled normalized vectors, token cap 256.
The initial relevance cutoff is **cosine >= 0.35**; no score appears in API/cards.

## Results

| Query | Feed | Expected | Semantic top results | Keyword top results |
| --- | --- | --- | --- | --- |
| somewhere to sit with a novel away from sunshine | Public | garden | garden | none |
| elaborate masonry by an entrance | Public | doorway | doorway | doorway |
| bright steps for taking pictures | Public | stairs | stairs | none |
| a place beside moving water | Public | river | river | river, pond |
| watch pollinators visiting blooms | Public | flowers | flowers | none |
| an outdoor game with hoops | Public | court | court | court |
| watch the horizon as daylight fades | Public | sunset | sunset | none |
| put down a picnic blanket | Public | meadow | garden, meadow | meadow |
| birds swimming on still water | Public | pond | pond | pond, river |
| paintings directly on a wall | Public | mural | mural | mural |
| weathered brick archway | Connections | private_arch | private_arch, doorway, stairs | private_arch |
| a shop selling replacement laptop batteries | Public | no matches | none | none |

- Positive-query Hit@3: **11/11 semantic versus 7/11 keyword**.
- Positive-query expected top-one: **10/11 semantic versus 7/11 keyword**.
- Four marked vocabulary-gap cases succeeded semantically where baseline returned
  no matches. “Elaborate masonry” also had a useful lexical match; it is not counted
  as a semantic-only improvement.
- One unrelated negative query returned no matches in both approaches.
- Returned IDs stayed inside each synthetic eligible set; originals/relative
  authorized photo paths preserved; no vectors or confidence fields returned.

Observed local injected-route timing in the recorded run: first request **630.153
ms**, remaining requests **7.668–35.639 ms**, warm median **10.082 ms**. First includes
lazy initialization and description encoding; later requests benefit from cache.
No real Supabase HTTP/network, browser rendering or deployed proxy latency is
included. Do not promise those numbers on the hosting target or under concurrency.

## Limitations and next acceptance work

- Picnic ranks garden above the expected meadow. The private arch query also returns
  related but less-specific doorway/stairs. Good Hit@3 is not perfect relevance or
  top-one ranking; returning fewer/better matches may require threshold changes.
- 0.35 has been exercised on this small **synthetic** corpus only. It remains
  provisional for real notes. Do not interpret it as 35% confidence or a universal
  cutoff; test sparse/noisy descriptions, multiple plausible matches, unsupported
  attributes, negatives and English language limitations with the actual pilot.
- Data/query expectations were authored for this feature; sample is tiny and not
  held out. This demonstrates real vocabulary-gap retrieval, not statistical quality.
- Permission/radius changes are mocked locally. Verify with separate real JWTs and
  direct RPC/RLS calls, including Public->Connections, membership changes, removal,
  exact geographic boundaries and live list/map agreement. Ordinary detail/media
  still require their separate protected-access checks.
- User-run seed creates metadata only; photo failures are expected and cannot prove
  Storage/media behavior. Do not take an outdoor trip to these fictional destinations.
- Browser/StrictMode/mobile checks, target memory/startup/latency, concurrency/busy
  usability and full real-provider deadlines remain unrun.

## Community rationale

[Dicardo9's retrieval-metrics walkthrough](https://dev.to/dicardo9/practice-rag-retrieval-metrics-offline-a-tiny-stdlib-eval-loop-synthetic-data-dm3)
argues for a fixed dataset/metric when swapping retrievers and warns against claiming
production quality from synthetic results. The article's comments support that
controlled substitution. This report follows that distinction; it does not use the
article as evidence of MiniLM's performance or applied authorization policies.
