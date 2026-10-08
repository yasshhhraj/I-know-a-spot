# MiniLM preparation and semantic-search integration plan

Date: October 8, 2026. Scope: PRD FR-04, with existing FR-01/03/07/08 boundaries.
The user selected MiniLM and first authorized weight downloads/planning, then
authorized implementation. **Search is now implemented and locally checked**;
this document preserves the original design/preparation evidence. Current contract:
API_CONTRACT.md. User-run fixtures/checks: SEMANTIC_SEARCH_SETUP.md. Actual local
comparison: SEMANTIC_SEARCH_EVALUATION.md. No deployment, private env inspection,
remote Supabase changes, package installation or commit was performed.

## 1. Model decision and verified artifacts

| Setting | Selected value |
| --- | --- |
| Source model | `sentence-transformers/all-MiniLM-L6-v2` |
| ONNX repository | `Xenova/all-MiniLM-L6-v2` |
| Pinned ONNX revision | `751bff37182d3f1213fa05d7196b954e230abad9` |
| License | Apache-2.0, declared by source and ONNX model cards |
| Runtime tested | Node v24.13.1, Transformers.js 4.3.1, native CPU ONNX |
| Weight variant | `dtype: 'q8'`, `onnx/model_quantized.onnx` |
| Weight size | 22,972,370 bytes (about 21.91 MiB); complete cache about 23 MiB on disk |
| Representation | 384 floating-point dimensions, attention-mask mean pooling, L2 normalization |
| Text policy | English-first; maximum 256 word pieces, matching upstream sentence-transformers policy |
| CPU session | `intraOpNumThreads: 2`, `interOpNumThreads: 1` |
| Weight SHA-256 | `afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1` |

The downloaded weight hash matches the revision's published Hugging Face LFS
SHA-256. The preparation script also checks captured hashes for config, tokenizer,
tokenizer config and the ONNX README before loading. These ancillary hashes are
local reproducibility checks, not signatures from an independent trust authority.

Cache location, relative to the workspace:

```text
backend/.cache/models/Xenova/all-MiniLM-L6-v2/751bff37182d3f1213fa05d7196b954e230abad9/
```

Contains `config.json`, `tokenizer.json`, `tokenizer_config.json`, `README.md`, and
`onnx/model_quantized.onnx`. `.gitignore` excludes `.cache/`; weights stay out of git
and out of the frontend bundle. No fp32/other quantization variants were downloaded.

### Reproduce the preparation

Run from `backend/`, using already-installed dependencies:

```sh
# Explicit network-enabled artifact preparation; skips existing regular files.
node scripts/minilm-smoke.mjs --download

# Default is local-only, with all model-runtime fetches rejected.
node scripts/minilm-smoke.mjs
```

The script uses only synthetic descriptions and a synthetic query; it never reads
`.env` or fetches application data. Downloads use public HTTPS artifact URLs at the
pinned revision, no auth headers, 60-second fetch deadlines and atomic temporary
file replacement. A checksum mismatch fails rather than silently replacing data.

**Runtime issue found:** Transformers.js 4.3.1's `pipeline()` and tokenizer
preflight helpers perform preliminary lookups without forwarding the revision
options. A strict pinned-URL guard rejected requests against `main`. The working
preparation explicitly downloads the known pinned artifacts, then loads the
absolute local directory with `AutoTokenizer`, `AutoModel` and
`FeatureExtractionPipeline`; `allowRemoteModels=false`, `local_files_only=true`,
and a rejecting `env.fetch`. No dependency or installed-library modification.
The tokenizer's in-memory config caps input at 256 tokens without changing cached
JSON; a long synthetic input verifies that cap.

### Actual local inference evidence

Latest cache-only run after adding artifact verification:

| Measurement | Observed |
| --- | --- |
| Model/tokenizer initialization | 285.791 ms, excludes package import and artifact hashing |
| First short-description embedding | 21.546 ms |
| Warm short-query embedding, median of five | 7.366 ms |
| RSS before loading | 92.08 MiB |
| RSS after smoke inference | 165.54 MiB |

The process high-water mark reported 687.285 MiB **already before model loading**,
and did not change in this run. It cannot be attributed to MiniLM's incremental
usage; remeasure startup/peak memory in the eventual isolated hosting process.
Other local runs varied: cache-only load 245–413 ms and warm medians about 5–9 ms.
These are tiny synthetic checks, not a deployment benchmark or full HTTP latency.
The successful `--download` rerun found already-fetched files, so its sub-ms artifact
preparation timing is **not** the original download duration.

Assertions passed: finite 384-dimensional unit vectors, stable repeated encoding,
self cosine approximately one, 256-token truncation, and five artifact hashes.
For “A peaceful place to read in the shade,” synthetic results were:

| Synthetic description ID | Cosine similarity |
| --- | --- |
| garden | 0.630 |
| doorway | 0.318 |
| court | 0.225 |

These scores are not probabilities, and this easy fixture does not establish real
retrieval quality or a relevance threshold. No real member descriptions were read.

## 2. Smallest proposed integration

Keep one backend-local encoder and reuse the existing eligible-feed providers:

1. Verify caller identity/enrollment using the existing profile provider.
2. Validate query/feed/center; derive radius from the member record, not the body.
3. Call `SpotStore.list` using the caller JWT and the chosen feed. Connections uses
   own/connected enrolled authors; Public uses the existing saved-radius SQL RPC.
4. If no eligible candidates, return an honest feed-specific empty result without
   loading or invoking the encoder. Empty query uses ordinary browsing.
5. Encode only current candidate `title.trim() + '\n' + note.trim()` and the query.
   No author/access metadata, photos, coordinates, member IDs or spot IDs in tensors.
6. Compare normalized vectors by dot product (cosine), select up to three relevant
   matches; use deterministic ties and an empirically evaluated relevance threshold.
7. Re-read the eligible feed immediately before responding. Intersect with the
   current IDs and exact text versions; drop changed/removed/revoked/out-of-radius
   candidates rather than return stale representations. Return current spot fields.
8. Use normal authorized detail/photo endpoints; never return vectors or private
   Storage paths. All responses are `Cache-Control: private, no-store`.

There is still a concurrent-update window after the final database read, as with
ordinary feeds; do not promise transactional instant revocation of downloaded data.
Revalidation failure returns an error, not the previously cached result.

### Candidate window

Both existing feeds cap at **50**. The initial search deliberately ranks that same
eligible window, which covers the intended 10–15-spot pilot. It does not search an
unlimited history: Connections window is newest-first, Public is nearest-first.
Expose/document `candidateLimit: 50`; no silent radius widening or privileged
full-database scan. Larger-scale completeness/pagination is a separate decision.

### Derived-vector state: no new SQL migration proposed

- Use a bounded in-memory LRU cache (initial limit 100 vectors, five-minute idle
  TTL), keyed by spot ID, SHA-256 of the exact title/note text, model revision,
  dtype, token cap and preprocessing version. Do not retain raw text in this cache.
- Cache existence never proves eligibility. Fresh caller-scoped listing always
  precedes vector lookup, inference and ranking. No shared cached search responses.
- Deduplicate in-flight work for the same text-version key; never let an older
  completion overwrite the new version for the same spot.
- Successful authoritative edits invalidate that spot's prior entry. Removed or
  tombstoned spots cannot be candidates; eviction/deletion cleanup must remove
  derived entries as well. Text hashing and final revalidation also protect edits
  by another backend instance or an ambiguous write outcome.
- Cache misses are encoded lazily during search. Save/browse do not wait for AI;
  search shows processing while fresh vectors are computed. Never use the old
  vector while displaying new text. Fail the search honestly if processing fails.
- Restart rebuilds on demand. No background global scan, stored member queries,
  database embeddings, new provider, vector DB or pgvector extension for this pilot.

Model files persist locally; member-derived vectors do not persist to disk in this
proposal. If deployment later needs durable vectors, design separate RLS, text-version
and tombstone cleanup rules rather than adding an admin read shortcut.

## 3. API design — implemented locally, see API_CONTRACT.md

Add **`POST /spots/search`**, a read-only operation with Bearer authentication.
Using a JSON body avoids putting query text into URLs/history/access logs. Existing
`GET /spots` and its strict allowed query fields remain unchanged.

```json
{"query":"somewhere with interesting textures","feed":"connections"}
```

Public request adds finite `centerLat`/`centerLon` with existing geographic bounds:

```json
{"query":"a shaded reading corner","feed":"public","centerLat":0,"centerLon":0}
```

Coordinates above are synthetic examples, not a proposed pilot area. Body must be
an object with exactly the allowed fields: required `query` string and `feed`,
center fields only for Public. No client radius, candidate IDs, owner IDs or model
choice. Trim query and enforce at most 200 Unicode code points; body limit 2 KiB.

Success shape:

```json
{"mode":"semantic","spots":[],"candidateLimit":50,"emptyReason":"no_matches"}
```

- Normal nonempty search: `mode: "semantic"`, zero to three current `Spot` objects.
  Existing fields/photo URLs are reused; Public retains `distanceKm`.
- Empty/whitespace query: `mode: "browse"`, ordinary feed up to 50, no model call.
- `emptyReason` only on empty lists: `no_candidates` or `no_matches`. UI distinguishes
  empty Connections from no Public spots inside the saved radius using selected feed.
- No raw vectors, query echo, generated explanations or confidence percentages.
- Errors: existing 400 `BAD_REQUEST`, 401 `UNAUTHORIZED`, 403 `NOT_ENROLLED`,
  503 `SERVICE_UNAVAILABLE` for auth/feed-provider failure; proposed 503
  `SEARCH_UNAVAILABLE` for model/processing failure and 429 `SEARCH_BUSY` for capacity.
  Safe messages only; distinguish invalid JSON/body size errors from photo-upload errors.

The lead agreed this shape in `API_CONTRACT.md` before implementation. The route
now exists; live Supabase/browser verification remains a separate user-run check.

## 4. Runtime and resource limits

- Load one encoder per backend process from the verified local directory, with
  remote model fetches disabled. Never download weights in a request handler.
- Share an initialization promise; warm once outside HTTP requests. Missing/bad
  cache makes search unavailable while auth, browsing, sharing and directions work.
  Keep `/health` scaffold status honest; do not turn model readiness into app readiness.
- Bound search to one active ranking/inference job globally and per member, no
  unbounded queue. Return `SEARCH_BUSY` for competing searches. Revisit only after
  measuring real concurrent behavior. Process candidates in batches of at most four.
- Proposed inference-stage deadline: five seconds. A timeout does not cancel native
  ONNX work: retain the capacity permit until the actual work settles, skip pending
  batches, and discard late output. Do not free a permit just because Promise.race won.
- Proposed overall HTTP deadline: 40 seconds; frontend search deadline: 45 seconds.
  This leaves room for existing bounded auth and two Connections reads, which can
  together consume up to 30 seconds on slow upstream calls, plus inference.
  Enforce a shared overall deadline and skip remaining work after expiration.
  Proxy/deployment deadlines must also be checked. Target typical latency remains
  far shorter; measure full-route p50/p95 with realistic notes before release.
- Use a dedicated frontend search request helper. Existing `spotRequest` treats all
  POSTs as uncertain mutations and gives them 35 seconds; search is read-only and
  needs explicit search errors/timeout classification, not “save may have completed.”
- Do not log body/query/text/vectors, member IDs, coordinates, tokens or raw model
  exceptions. Existing response metadata logger is sufficient; no query analytics.

## 5. Frontend integration

Add a labelled search field, **Find spots** and **Clear search** inside the existing
Discover view; explicit submit rather than a network request on each keystroke.
Keep the top-center feed switch, Profile/radius and Add a spot intact.

- Store draft versus submitted query separately; announce searching/results/errors.
- Reuse current spot cards, details and `SpotMap`; in search mode cards and pins use
  the exact same result array. Show “Semantic matches,” not generated recommendations.
- Include submitted query in the scope key alongside profile identity, feed,
  confirmed center, saved radius and refresh revision. Start a fresh effect-owned
  `SpotScope` via the existing lifecycle pattern, including StrictMode replay.
- Account/sign-out, feed/center/radius changes, edits/deletions and clear-search
  invalidate late results immediately. Resubmit the active query for the new scope.
- Public without a confirmed center remains blocked with manual-area guidance.
- Clear/empty query restores ordinary browsing. On search error show Retry and
  Browse instead; never present cached ordinary feed cards as successful AI results.
- Do not store queries in URLs/localStorage; no model package/weights in static assets.

## 6. Implementation slices and acceptance checks

| Order | Owner / bounded paths | Deliverable and actual check to run |
| --- | --- | --- |
| 1 | Lead, `API_CONTRACT.md`, `WORKBOARD.md` | Agree proposal, validate deadline/cap/empty states and document candidate-window limit |
| 2 | backend-builder, `backend/src/encoder.ts`, `search.ts`, config/app wiring, `backend/tests/search.test.ts` | Local-only singleton, bounded vectors/jobs, authenticated search and fresh revalidation; typecheck/build/tests plus actual smoke |
| 3 | frontend-builder, `frontend/src/searchApi.ts`, `SpotWorkspace.tsx`, scoped controller tests | Accessible submitted search with exact card/map agreement and fresh response scope; frontend typecheck/build/tests |
| 4 | Lead, combined checks/evaluation/docs | Realistic query comparison, direct auth/radius/revocation tests, browser/mobile validation and honest model disclosure |

Frontend/backend parts ran in parallel after the request/response contract was
agreed. Lead owns shared docs/board and combined verification. The implementation
uses lazy local initialization rather than startup warm-up, sequential chunks of
at most four candidate descriptions, and a provisional 0.35 cutoff evaluated on
synthetic fixtures. Live checks and real-corpus threshold evaluation remain pending.

Required test matrix:

1. Signed-out/unenrolled/connected/unconnected callers; provider failures; no encoder
   invocation for unauthorized/no-candidate/empty-query cases. Spy on model payloads.
2. Public/private/removed/un-enrolled-author exclusion before ranking; inclusive
   just-inside/on/outside radius, saved radius versus forged client radius.
3. Text edits during inference, public-to-private, removal/tombstone, connection or
   radius changes; final revalidation uses current rows or rejects the search.
4. Exact text/model/preprocessing cache keys; old completion cannot win, eviction/
   TTL/cleanup, process restart, failures and bounded simultaneous requests.
5. Query validation, bad JSON/content type/body size, max 200 code points, Public
   center validation, no unknown fields, normalized finite vectors, deterministic ties.
6. Missing/corrupted artifacts, failed initialization, busy/timeout and late native
   completion; ordinary auth/sharing/feed/directions remain usable.
7. Frontend stale success AND stale error under account/feed/area/radius/query changes,
   StrictMode cleanup/setup, clear search, retry, request timeout and shared cards/pins.
8. 8–12 representative vocabulary-gap, exact-name, ambiguous and irrelevant queries
   against a simple keyword baseline using the same candidate sets. Record expected
   IDs, top three, Hit@3/ranking quality, threshold/no-match failures and route timing.
   Use synthetic cases first; real notes only with appropriate authorization/consent,
   no private corpus dump in git. A tiny comparison is pilot evidence, not a benchmark.
9. Full browser and pilot-phone search/detail/directions checks, plus actual external
   SQL/RLS checks. Existing mocked/static SQL tests are not remote security evidence.

Release gate: helpful vocabulary-gap matches beyond keywords, fresh authorized
results, evaluated no-match behavior, reasonable measured target resource use and
honest failure fallback. No inference smoke or model-card score alone clears that gate.

## 7. Sources

- [MiniLM source card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2):
  English, Apache-2.0, 384 dimensions, mean pooling/normalization and 256-word-piece policy.
- [Pinned ONNX card](https://huggingface.co/Xenova/all-MiniLM-L6-v2/blob/751bff37182d3f1213fa05d7196b954e230abad9/README.md)
  and [published artifact metadata](https://huggingface.co/api/models/Xenova/all-MiniLM-L6-v2/tree/751bff37182d3f1213fa05d7196b954e230abad9/onnx).
- Installed Transformers.js 4.3.1 `pipelines.js`, `tokenization_utils.js`, registry
  helpers and feature-extraction implementation: actual preflight/pooling behavior,
  confirmed by rejected main-URL attempts and successful local-directory smoke.
- [Dicardo9: Practice RAG Retrieval Metrics Offline](https://dev.to/dicardo9/practice-rag-retrieval-metrics-offline-a-tiny-stdlib-eval-loop-synthetic-data-dm3):
  keep data and k fixed when comparing retrievers; synthetic success is not production
  quality. Jo Do's comment supports swapping a real embedding model into that same
  evaluation harness. This is educational guidance, not a MiniLM performance claim.
