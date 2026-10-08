# Implementation workboard

Only the lead edits this board while agents run in parallel. Claim bounded items
and record actual evidence, not anticipated success. No private payloads here.

## Current state

Pilot auth/sharing, Connections/Public feed/radius, MiniLM search, explored state
and reporting/operator CLI are implemented with local tests: frontend62/backend137
last passed; both typecheck/build. The schema/RLS
migrations have not been applied by the assistant. The user reports that live enrolled
sign-in shows the expected screen and an unenrolled account shows “Not enrolled.”
The user also confirms refresh/session restoration behaves as expected.
Sign-out and subsequent account switching are now user-confirmed. Direct database/
RLS boundaries still need verification using SUPABASE_SETUP.md. User-reported UI
success is not an independent RLS audit.
The user also reported completing a second enrolled account and mutual connection,
and confirmed that the second account can see the shared spot. This is user-reported
end-to-end preview evidence; direct RLS/Storage authorization is still unverified.
The user now confirms the owner sees Edit/Delete while the connected viewer sees
external Directions without owner controls. This verifies the live UI behavior for
the tested accounts. The latest validation report confirms the tested access
matrix. Direct database/Storage checks were initially skipped; subsequent direct
spots SELECT checks for B/C are partially user-confirmed below, not a full audit.
The user confirms photos load for uploader and connected viewer, Public detail is
viewable by ID, and deletion works as expected. The user clarified that the
unconnected account cannot open a Connections-only spot but successfully opens a
Public spot by ID. This confirms the tested browser detail audience matrix, not
an independent direct Storage or mutation audit. Phone testing through a user-run
HTTPS tunnel now works as expected, including the camera-return fix (user report).
The user also reports a real outing and real-note search completed; no private
locations, device details, query outcomes or new quality measurements were supplied.
Frontend retains the documented tree-shaking workaround; lazy-loading now avoids
the >500 kB chunk warning. No credentials or private locations are recorded here.
Tested Public-to-Connections revocation, post-delete app/API paths and failure/
stale-response checks are now user-confirmed. Direct spots SELECT now succeeds
for B's tested accessible row; non-owner C reads Public (one row) and is filtered
from Connections-only (zero rows, no error). C's corresponding detail/photo API
statuses are200/200 and404/404. Direct Storage and forbidden database/Storage writes
remain unverified; independent RLS/grant/media-erasure and controlled failure audits are not
inferred from browser success.
After identifying the missing Public migration as the 503 blocker and receiving
the user-run setup instructions, the user confirms a shared Public spot now loads
successfully in the Public feed. The user confirms radius changes and reload
persistence work. Reducing the radius excludes the tested Public spot from the
list while its copied ID URL still opens, matching radius-independent detail access.
Exact inside/on/outside boundaries and the direct RPC/RLS audit remain pending.
MiniLM q8 weights are in the ignored backend cache; real local CPU/injected-HTTP
search passed a 12-query synthetic comparison (11/11 positive Hit@3 versus 7/11
keywords, one unrelated negative rejected). The user now reports all checks in the
final “How to try it” section passed: the listed live semantic queries and saved
radius 5-to-1 km pond exclusion behaved as expected. This is user-reported browser
smoke evidence, not independent SQL/RLS or media verification. The seed/cleanup
workflow is covered by that overall report, without separately inspected SQL
receipts. Real-note search and the tested phone flow are now user-reported done;
no actual-corpus comparison scores, deployed-resource measurements or new timings
were supplied. Direct SQL/RPC/RLS checks remain pending. No search migration is needed.
The user now reports the listed Explored activation/browser checks passed: explored
and unexplored persist across reopen/reload/sign-in, and another eligible account
has independent state. Migration activation is covered by that overall workflow
report; no separate SQL receipts or direct RLS checks were inspected. Broader
direct SQL/cascade and controlled failure audits remain pending. Tested revocation/
post-delete app paths and phone flow are user-confirmed. Reporting/operator
CLI is implemented; the user reports all five listed activation/check steps passed
and the operator delete command worked without affecting other spots. Migration
activation, submission/dedup/private queue and the referenced checks are covered
by that overall report, without separately inspected receipts. Broader direct
SQL/Storage, every-path removal and failure-recovery audits remain pending.
Native flows are unimplemented. See REPORTING_SETUP.md,
EXPLORED_SETUP.md, SEMANTIC_SEARCH_SETUP.md and
SEMANTIC_SEARCH_EVALUATION.md for actual steps/evidence and limitations.
Local tests do not prove remote RLS or a finished pilot.

| ID | Slice | Owner / paths | State | Dependency / acceptance evidence |
| --- | --- | --- | --- | --- |
| SETUP | Scaffold and local agent workflow | Lead; frontend/backend setup contributors | Completed (scaffold only) | Manifest/config and dependency-free syntax/config checks; package checks now verified below |
| ENV | Install dependencies and copy placeholder env files | User; frontend/, backend/ | Completed (user reported) | Local package scripts execute; no private env contents read or credentials verified |
| VERIFY | Typecheck/build and backend scaffold tests | Lead | Completed (scaffold only) | Frontend typecheck/build pass; backend typecheck/build pass; 2 test files / 10 tests pass |
| BUILD_FIX | Unblock frontend production-build hang | Lead; frontend/vite.config.ts, setup docs | Completed (workaround) | Default build timed out at 120s; treeshake:false permits original npm run build to pass in 1.44s |
| OPTIMIZER | Revisit Rollup tree-shaking before release | Unassigned; frontend/ | Pending | Vite 7.1.9 / Rollup 4.64.1 hangs with default and safest tree-shaking in local tests; restore optimization only on verified toolchain, no unapproved dependency changes |
| AUTH-BE | Verified /me implementation, pilot schema/RLS migration preparation | backend-builder; backend/ only | Completed (local; live partial) | Backend typecheck/build and 51 tests pass; user reports expected access/denial screens; direct remote RLS checks pending |
| AUTH-FE | Email/password login, session restoration, sign-out and /me gate | frontend-builder; frontend/ only | Completed (local; live partial) | Frontend typecheck/build and 10 tests pass; user-reported live enrolled/unenrolled screens match expectations |
| AUTH-LIVE | Real sign-in/session and direct RLS checks | User then lead | Partial | Enrolled/unenrolled access, refresh restoration, sign-out and subsequent account switching user-confirmed; direct Data API and SQL boundaries still pending |
| SHARE-BE | Spot schema, protected media, owner write/delete endpoints | backend-builder; backend/ only; lead integration | Completed (local only) | Lead typecheck/build and 73 tests pass; ambiguous INSERT retains media, real JPEG/PNG/WebP metadata/orientation fixtures; SQL user-run |
| SHARE-FE | Browser photo/pin/note/audience form and connection preview/detail | frontend-builder; frontend/ only; lead integration | Completed (local only) | Lead typecheck/build and 22 tests pass; Unicode/uncertain-response, wrapped longitude/stale scopes; browser map/load/camera checks unrun |
| SHARE-LIVE | Apply spot/storage migration and test connected/unconnected access | User then lead | Partial (user-reported validation passed) | Access matrix, Public-to-Connections revocation, post-delete app/API paths and phone flow as expected; direct database/Storage explicitly skipped; independent grants/media cleanup audit pending |
| FEEDS | Shared Connections/Public feed/map, Profile radius/area | Lead contract/integration; backend-builder `backend/`; frontend-builder `frontend/` | Completed (local only) | Lead typecheck/build: backend 86 tests, frontend 32 tests pass; SQL RPC/script prepared, no live execution |
| FEEDS-LIVE | Public migration and real radius/RPC/browser tests | User then lead; PUBLIC_DISCOVERY_SETUP.md | Partial (user-reported core flow passed) | Public load, radius change/reload persistence and out-of-radius list exclusion with ID detail access confirmed; exact boundary, list/map agreement and direct RPC/RLS checks pending |
| AI | Real open-weight encoder and feed-scoped search | Lead integration/docs; backend-builder `backend/src/`, `backend/tests/`; frontend-builder `frontend/src/`, `frontend/tests/` | Completed (local; live smoke user-confirmed) | Backend 105/frontend 37 tests and real 12-query synthetic comparison passed; user confirms listed live queries and 5-to-1 km pond exclusion; broader direct authorization/revocation/mobile checks pending |
| AI-SQL | Search-check seed/cleanup scripts, no embedding migration | Lead; `backend/supabase/seed_semantic_search.sql`, `cleanup_semantic_search.sql`, `SEMANTIC_SEARCH_SETUP.md` | Completed (prepared only) | 14 guarded synthetic fixtures, three existing enrolled accounts, collision/media/marker safeguards; 3 structural tests passed; no PostgreSQL execution or Storage objects |
| AI-LIVE | Populate optional fixtures and verify real-token search, revocation/radius/phone behavior | User then lead; SEMANTIC_SEARCH_SETUP.md | Partial (user-reported validation/search done) | Listed queries/radius reduction plus tested revocation/post-delete/failure/phone flow as expected; real-note search done, no new comparison scores; direct database/Storage skipped, exact RPC/RLS/threshold/resources pending |
| AI-PREP | Download pinned MiniLM and plan integration; no search implementation | Lead plan/verification; backend-builder `backend/scripts/minilm-smoke.mjs` | Completed (local preparation only) | Pinned q8 weight checksum matches HF; synthetic CPU and cache-only checks pass; backend typecheck/build/86 tests pass; plan in `SEMANTIC_SEARCH_PLAN.md` |
| SAFETY | Reports and protected operator removal | Lead contract/SQL/docs; backend-builder src/tests; frontend-builder src/tests | Completed (local; listed live smoke user-confirmed) | 137 backend/56 frontend tests and typecheck/build; user confirms all five activation/check steps and operator deletion with other spots unaffected; independent direct SQL/Storage and failure audits pending |
| SAFETY-LIVE | Apply0005 and test private persistence/queue/removal boundaries | User then lead; REPORTING_SETUP.md | Partial (user-reported app/API validation passed) | Five-step workflow/operator removal and tested post-delete app/API paths as expected; direct database/Storage explicitly skipped; no independent SQL/CLI/media-erasure/controlled-cleanup audit |
| CAMERA-RETURN | Prevent unchanged auth refocus from resetting Add form | frontend-builder `frontend/src/authController.ts`, `frontend/tests/auth.test.ts`; lead docs/checks | Completed (local; handset user-confirmed) | 62 frontend tests/typecheck/build pass; user reports camera fix works and phone flow as expected; new tokens/account changes/explicit rechecks still fail-closed; no full browser-discard recovery claim |
| EXPLORED | Per-user self-reported explored state | Lead contract/SQL/docs; backend-builder `backend/src/`, `backend/tests/`; frontend-builder `frontend/src/`, `frontend/tests/` | Completed (local; listed live smoke user-confirmed) | 118 backend/46 frontend tests and typecheck/build pass; user confirms true/false persistence across reopen/reload/sign-in and independent account state; direct SQL/RLS and broader boundaries remain pending |
| EXPLORED-LIVE | Apply migration0004 and verify persistence, isolation and removal boundaries | User then lead; EXPLORED_SETUP.md | Partial (user-reported quick checks passed) | Listed activation/browser persistence/two-account checks confirmed; no independent SQL receipts, direct table/RPC audit, revocation/tombstone/cascade or phone proof |
| PILOT | Combined mobile/outdoor test and submission evidence | User then lead | Partial (phone/outing user-confirmed) | Tested phone flow as expected; real outing and real-note search done; direct database/Storage skipped, metrics/demo/submission artifacts and remaining checks not supplied; no unrequested publication |

## Handoff format

### Post-install checks — October 7, 2026

- `frontend/`: `npm run typecheck && npm run build` passed after bounded config workaround.
  Original default build timed out after 120 seconds. In-memory isolation also hung
  without Tailwind/React plugins; retaining all code (`treeshake:false`) succeeded.
  This isolates the optimizer path, not a proven upstream root-cause diagnosis.
- `backend/`: `npm run typecheck && npm run build && npm test` passed.
  Vitest: 2 files, 10 tests. Tests cover scaffold health/CORS/config, not product access.
- Static output exists at frontend/dist/index.html with bundled CSS/JS; no browser
  interaction, deployment, model inference, or Supabase integration was verified.
- No dependency changes/installations, model downloads, or private env reads by assistant.

### Auth slice — October 7, 2026

- API contract: `API_CONTRACT.md`. User guide: `SUPABASE_SETUP.md`.
- Backend: getUser validates token; new request-scoped publishable-key client
  forwards caller JWT to own profile SELECT. No service-role fallback. Anonymous
  401, unenrolled 403, configuration/upstream/schema failure 503, no-store response.
- Frontend: email/password, restored-session verification, local sign-out, separate
  denied/expired/outage states, stale request invalidation and 15-second /me timeout.
- Prepared SQL: `backend/supabase/migrations/202610070001_pilot_members_connections.sql`
  and `backend/supabase/check_pilot_boundaries.sql`; neither executed remotely by
  the assistant. User-run boundary script results have not been reported.
- Actual checks in each app: `npm run typecheck && npm run build && npm test` pass.
  Backend 3 files / 51 tests; frontend 10 tests. No new dependencies installed.
- User follow-up: live enrolled sign-in screen and unenrolled “Not enrolled” screen
  match expectations; refresh/session restoration also behaves as expected.
  Recorded as user-reported evidence; no private identifiers retained.
- Remaining: sign-out/reload, separate-user token, and direct DB/RLS checks.
  Radius edits/feeds/media and
  actual connections visibility are future slices, not verified by these auth tests.

### Sharing slice — October 7, 2026

- Backend owner: backend-builder; `backend/src/app.ts`, `src/spots.ts`, config/env
  example, `tests/spots.test.ts`, and prepared `202610070002_spots_storage.sql`.
- Frontend owner: frontend-builder; `frontend/src/SpotWorkspace.tsx`, `SpotMap.tsx`,
  `spotApi.ts`, `spotScope.ts`, `mapCoordinates.ts`, App integration and tests.
- Lead reviewed integration and ran combined checks; root docs/contract stay lead-owned.
- Implemented: bounded multipart photo processing, metadata/pin/audience, newest-first
  Connections preview, authenticated blob photo/detail, owner metadata edits/deletion,
  tombstone-before-cleanup and directions. Public is enrolled-only detail by ID,
  not a Public discovery feed. Private Storage/read policies require live checks.
- Review fixes: ambiguous INSERT cannot trigger deletion solely from an immediate
  absent lookup; known SQL rejection can attempt cleanup. Frontend text response
  limits match backend Unicode code points; malformed write success is uncertain.
  Manual pins recenter, wrapped map-click longitude is normalized, tile errors are
  disclosed, and a scoped lazy-load boundary keeps sign-out available.
- Actual lead commands in each app: `npm run typecheck && npm run build && npm test`.
  Backend 4 files / 73 tests; frontend 22 tests, all passed. Frontend build 3.01s,
  entry JS 424.87 kB and workspace 178.74 kB, no chunk warning. No browser latency
  claim; tree-shaking workaround remains. Dependencies/model/private env unchanged.
- API: `API_CONTRACT.md`. User-run guide: `SPOT_SHARING_SETUP.md`. Backend privileged
  write credential is now required; never frontend. No migration applied by assistant.
- Unrun: live spots/Storage/RLS, phone/camera/picker, tile/recenter/chunk recovery,
  audience revocation and end-to-end owner cleanup. No deployment, commits or publishing.
- Next: user applies migration/configures admin key privately, tests A→B sharing,
  then C-unconnected/D-unenrolled direct API/Storage boundaries; report safe outcomes.
  Do not label the full pilot complete. Full feeds/radius/AI/explored/reporting remain.

### Uncertain-save RCA — October 8, 2026

- User report: adding or editing a spot sometimes displayed “The save may have
  completed. Check the list/detail before submitting again.”
- Root cause supported by code: frontend `spotRequest` used a 15-second timeout
  for mutations. Backend verification alone can consume up to two sequential 5s
  Supabase calls; POST then adds Sharp + Storage upload + insert, while PATCH adds
  an owner lookup + update. A normal slow mutation could therefore outlive the
  browser request. The backend may continue after the browser aborts, leaving the
  outcome unknown and making blind retry unsafe.
- Contributing classification issue: any mutation 5xx, including a failure before
  the write starts, is intentionally rendered as outcome-uncertain because the
  client cannot distinguish a provider failure before commit from a lost response.
  This was not changed without live evidence; no automatic retry was added.
- Fix: `frontend/src/spotApi.ts` now keeps reads at 15s but gives POST/PATCH/DELETE
  a bounded 35s timeout, with caller/account abort still taking precedence. The
  message now says timeout/network/server response may be uncertain. Deterministic
  timeout tests cover both budgets, internal abort, and no caller-signal abort.
- Actual check: frontend `npm run typecheck && npm run build && npm test` passed;
  **23 tests**, build 2.08s, entry 424.87 kB and workspace 178.80 kB. Backend was
  unchanged and its prior 73-test check remains passed.
- Remaining live check: add and edit with a real account; record elapsed time and
  whether the saved result appears after any timeout. A deployed proxy/provider
  may have its own deadline. If saves still exceed 35s, capture only safe status
  codes/timing and investigate server/provider latency; do not paste tokens.

### API response logging — October 8, 2026

- Added a Fastify `onResponse` hook in `backend/src/app.ts`. Every completed API
  call logs JSON with `event`, request ID, method, route template, HTTP status and
  duration. Headers, tokens, bodies, multipart/photo data, coordinates and query
  strings are excluded.
- Added a regression test for a successful `/spots` response with a query string;
  the log contains `/spots`, status 200 and no query/token content.
- Backend `npm run typecheck && npm run build && npm test`: passed, **74 tests**.

### CORS preflight RCA — October 8, 2026

- User logs showed `OPTIONS * 204` followed by `GET /spots 200`, but no POST/PATCH.
  This means the browser reached the backend for preflight, then withheld the
  mutation request. The concrete cause was `@fastify/cors`'s default
  `Access-Control-Allow-Methods: GET,HEAD,POST`; PATCH and DELETE were omitted.
  A 204 preflight status alone does not mean the browser accepted the requested
  method.
- Fixed `backend/src/app.ts` to explicitly allow GET, HEAD, POST, PATCH, DELETE,
  OPTIONS plus Authorization and Content-Type headers. Added preflight regression
  coverage for POST/PATCH/DELETE and both mutation headers.
- Backend checks now pass: typecheck/build and **75 tests**. Restart the backend,
  then retry add/edit. A real POST/PATCH response log should now appear. If POST
  still produces only OPTIONS, capture the browser console CORS error and the
  preflight response headers, not credentials.

### User-run live verification update — October 8, 2026

- Uploader and connected viewer both load the photo.
- Public spot detail is viewable via its ID URL; no global Public dashboard/feed
  exists yet. Current dashboard is Connections-only, including connected authors'
  Public posts; unrelated Public posts need the upcoming Public feed.
- Sign-out followed by login as an unconnected account denies the Connections-only
  spot's ID URL and allows the Public spot's ID URL (user clarification). Both
  tested browser detail audience cases match expectations. Separate direct photo/
  Storage and mutation tests have not been inferred from these detail checks.
- Deletion works as expected (user report). Independent post-delete photo/Storage
  byte denial and physical cleanup have not been verified.
- Mobile-specific checks were not run because frontend/backend are currently
  reachable only on the development device. No LAN exposure/tunnel/deployment
  changes authorized or made. This gap remains a pilot/release requirement.
- Remaining: test Public→Connections revocation and non-owner direct writes/Storage
  boundaries; phone checks later. The clarified detail matrix supports proceeding
  with the planned Public-feed/radius slice without claiming release readiness.

### Public discovery/radius slice — October 8, 2026

- Contract: GET /spots defaults to Connections; explicit Public query requires
  centerLat/centerLon and uses enrolled caller's saved radius inside a narrow SQL
  RPC. Public distance/order/cap and active/enrolled-author predicates precede
  response. PATCH /me updates only caller's integer radius 1–25 through RLS.
- Backend owns app/profile/spots adapters and me/spots tests; migration 0003 and
  rollback-only `backend/supabase/check_public_feed_boundaries.sql` prepared, not run.
- Frontend owns reusable feed/map switch, Profile/radius, staged manual center,
  distance cards and epoch-based stale response cancellation. Missing fallback
  requires explicit choice; no auto device location or coordinate persistence.
- Lead review fixes: fresh feed scope on StrictMode setup/cleanup replay, add form
  world picker without invented confirmed center, separate own Connections read
  for uncertain save while in Public, and no stale radius header claim. SQL script
  refuses pre-existing synthetic-area contamination and checks explicit search_path.
- Combined actual commands in each app: `npm run typecheck && npm run build && npm test`.
  Backend 4 files / 86 tests; frontend 32 tests passed. Build 3.05s, entry 426.86 kB
  and workspace 188.47 kB. Tree-shaking workaround and stack preserved.
- User-run instructions: PUBLIC_DISCOVERY_SETUP.md. New SQL/RPC filtering, real
  radius boundary/grants, Leaflet/StrictMode/browser/mobile remain unverified;
  local SQL tests inspect script/migration shape and mocks, not live PostgreSQL.
- Observed unrelated change: backend/.env.example contains bracketed
  FRONTEND_ORIGIN=[http://localhost:5173], incompatible with current single-origin
  parser. Preserved user change; actual private env was not inspected. Correct
  syntax for a single origin is FRONTEND_ORIGIN=http://localhost:5173.
- Next: user applies 0003 once, tests Public with a confirmed area near the existing
  unconnected author's Public spot, saves/reloads radius, then boundary/revocation
  matrix. No installs/private env reads/SQL execution/deployment/commits by assistant.

### MiniLM preparation — October 8, 2026

- User authorized MiniLM weights and integration planning, not search implementation.
- Backend-builder prepared `backend/scripts/minilm-smoke.mjs`; lead reviewed and
  fixed runtime preflight/revision handling, token cap and artifact verification.
- Model: `Xenova/all-MiniLM-L6-v2`, pinned revision
  `751bff37182d3f1213fa05d7196b954e230abad9`, Apache-2.0, q8 CPU, 384 dimensions,
  mean pooling and normalization, 256-token cap. About 23 MiB total ignored cache.
  Weight SHA-256 matches the public Hugging Face LFS metadata. No private env read,
  application data inference, dependency changes, SQL execution, deployment or commit.
- Actual commands from `backend/`: `node scripts/minilm-smoke.mjs --download`, then
  `node scripts/minilm-smoke.mjs` with remote model fetches disabled. Synthetic
  vectors finite/normalized/repeatable; shaded garden ranks first; five artifact
  checksums and long-input truncation pass. Original download completed before a
  tokenizer setter bug was fixed; rerun's preparation time is not network latency.
- Installed Transformers.js 4.3.1's pipeline/tokenizer preflights ignored revision
  options; strict guard rejected `main` requests. Explicit pinned artifact download
  plus absolute local-directory loaders resolves this without library modifications.
- Latest local-only check: load 285.791 ms, first embedding 21.546 ms, warm median
  of five 7.366 ms; RSS 92.08 MiB before / 165.54 MiB after. Reported high-water
  mark 687.285 MiB already existed before loading; not attributable to model usage.
  These are synthetic smoke observations, not target-host or full-route benchmarks.
- Verification: `npm run typecheck && npm run build && npm test` passed, 4 files /
  86 tests. `node --check scripts/minilm-smoke.mjs` and cache-only smoke passed.
  `git diff --check` passed; cache confirmed ignored. Frontend unchanged/unrun here.
- Plan: `SEMANTIC_SEARCH_PLAN.md`; proposed read-only POST `/spots/search`, current
  caller-JWT feed/radius predicates before encoding, bounded text-version cache,
  final eligibility/text revalidation, dedicated frontend search scope/failure states.
  No new SQL migration or vector DB proposed. `API_CONTRACT.md` remains unchanged;
  proposed endpoint is not active. Backend README/env example link preparation.
- Next: agree contract and implement backend/frontend bounded slices, then 8–12
  realistic query comparison and live auth/radius/revocation/mobile checks. Semantic
  search, explored state, reporting and release readiness remain unimplemented/unverified.

### Semantic search implementation — October 8, 2026

- User authorized implementation plus later SQL fixtures/migration if needed. Lead
  agreed POST `/spots/search` before parallel backend/frontend work; no migration
  required for in-memory vectors. No packages/private env/remote SQL/deployment/commit.
- Backend: `src/encoder.ts`, `search.ts`, app/config wiring and tests. Pinned local
  hash-verified MiniLM, 256-token normalized vectors, fresh caller-JWT feed before
  ranking, fresh listing/exact-text checks before returning current top-three spots.
  Empty query/candidates bypass inference. Cache limit100/idleTTL5min, single global
  permit, 5s inference/40s overall budgets; timed-out native work holds capacity.
- Frontend: `src/searchApi.ts`, `searchController.ts`, SpotWorkspace and tests.
  Dedicated read-only POST/45s timeout, labelled explicit-submit draft/clear/retry,
  same card/map array and original notes. Late successes AND errors discarded across
  session/feed/area/radius/query/refresh changes, including StrictMode replay.
- SQL: `backend/supabase/seed_semantic_search.sql` and cleanup companion. Operator
  supplies three existing enrolled UUIDs privately; A–B already connected, C linked
  to neither. Commits 14 labelled synthetic metadata spots at (0,0), no images;
  cleanup bounds IDs/marker and refuses media. Existing settings/connections untouched.
  Structural tests keep seed text/distances aligned with `semantic_search_fixture.json`;
  they are not PostgreSQL/RLS evidence. Both scripts remain unapplied.
- Actual combined commands from each app: `npm run typecheck && npm run build && npm test`.
  Backend 6 files / 105 tests, frontend 37 tests passed. Frontend build4.20s, entry
  426.86 kB / workspace194.11 kB; existing treeshake:false retained, no >500kB warning.
- Actual model/HTTP comparison: `node scripts/evaluate-semantic-search.mjs` after
  backend build. 12 synthetic queries with actual cached MiniLM and synthetic auth/
  store; positive Hit@3 11/11 versus7/11 keyword, expected top-one10/11 versus7/11,
  one unrelated negative empty, four vocabulary-gap improvements. Picnic garden
  outranks meadow; 0.35 cutoff remains provisional for actual pilot notes.
- Recorded injected-route timing: cold630.153ms, remaining7.668–35.639ms, median
  10.082ms. No Supabase network/browser/proxy latency included; not deployment promise.
- Docs: API_CONTRACT.md, SEMANTIC_SEARCH_SETUP.md, SEMANTIC_SEARCH_EVALUATION.md,
  updated plan/status/setup/readmes. No live search/UI/phone or direct SQL/Storage
  audit was run. Missing fixture photos intentionally return errors; use real
  app-created spots for media/outdoor tests. Never claim these fixtures real places.
- Next: restart/reload local apps, optionally apply guarded fixture seed privately,
  test separate user JWTs, radius1/5 behavior, private/revoked/removed exclusions,
  edits and stale browser responses, then cleanup/restore area/radius. Explored and
  reporting remain separate unimplemented slices.

### User-run semantic search smoke update — October 8, 2026

- User reports: “all checks pass as expected in the how to try it section.”
- Recorded as confirmation of that final response's workflow: listed vocabulary-gap
  queries return expected synthetic matches; saving radius from 5 km to 1 km excludes
  the 4.5 km pond. Seed/cleanup/restoration are within the overall workflow report,
  but no separate SQL execution receipts or database state were inspected.
- Do not extend this confirmation to the setup guide's broader direct-token audience
  matrix, Public-to-Connections revocation, in-flight edits, exact geographic bounds,
  model failure, real photo/Storage checks, phone testing or an outdoor outing.
- No application code changed for this update; prior 105/37 test results remain
  historical passed evidence, not rerun checks. Next implementation slice is the
  required per-user self-reported explored state; reporting remains after it.

### Explored implementation — October8,2026

- User requested planning then implementation; both completed in the current session,
  without claiming background/offline execution. Plan EXPLORED_PLAN.md and agreed
  API_CONTRACT.md preceded parallel backend/frontend implementation.
- Backend: src/explored.ts, app.ts and tests/explored.test.ts. Fresh publishable
  caller-JWT GET/PUT own state; current spot checks before/after, radius-independent
  Public detail access, no admin fallback, strict boolean setters/RPC results and
  safe no-store errors. PUT CORS verified. Existing first5 createApp arguments retained.
- Frontend: exploredApi.ts, exploredController.ts, ExploredControl.tsx, detail wiring
  and tests. Independent self-reported control; confirmed values only, pending disable,
 30s GET/35s PUT, explicit reload after uncertain writes, current member/spot scope
  rejects late success/error, auth recheck and inaccessible-detail clearing. No model
  or feed-state changes, GPS, public counts, visit timestamps or activity export.
- New prepared migration: backend/supabase/migrations/202610080004_spot_explorations.sql.
  Three-column composite-key table, own/current-spot SELECT/INSERT/UPDATE policies,
  narrow column grants and authenticated-only security-invoker RPC. True/false desired
  sets are idempotent; concurrent clients last-committed-write-win. Physical deletion
  cascades marks; tombstones/revocation hide them before physical cleanup.
- Prepared backend/supabase/check_explored_boundaries.sql requires4 distinct disposable
  existing Auth users without pilot rows; operator-run rollback-only role/grant/own
  state/revocation/enrollment/tombstone/cascade checks. No Storage objects or remote
  SQL execution.3 structural tests validate text, not applied PostgreSQL/RLS behavior.
- Actual commands from both apps: npm run typecheck && npm run build && npm test.
  Backend 8 files/118 tests, frontend 46 tests passed. Frontend build3.69s, entry426.86kB
  and workspace199.74kB, no >500kB warning; existing optimizer workaround retained.
- Lead integration also normalized accepted uppercase spot UUIDs before PostgreSQL
  result comparison and added a transport regression test. Backend checks rerun
  after this fix: typecheck/build and118 tests passed. Real MiniLM injected-HTTP
  regression still returns11/11 positive hits versus7/11 keywords, negative empty;
  no explored data enters its candidate text/model inputs.
- Root setup/readmes/AGENTS/contract/board updated. No installs, private env reads,
  remote SQL, deployment, commits or publishing. Existing search smoke evidence remains
  user-reported; explored live persistence is NOT inferred from mocks or other slices.
- Next: user applies0004 once, reopens a real eligible spot, toggles true/false with
  reload/sign-out persistence and two-user isolation; then direct-token/SQL boundary
  checks. Reporting/operator removal is the next separate required implementation slice.

### User-run Explored smoke update — October8,2026

- User reports: “checks pass,” in response to the listed six activation/check steps.
- Record true/false state, reopening/reloading/sign-out/in persistence and independent
  second-account state as user-confirmed browser smoke evidence. Migration activation
  is included in the overall workflow report, without separately inspected SQL receipts.
- Do not extend this report to direct table/RPC/grant checks, rollback SQL script,
  audience revocation, tombstones/cascades, failure recovery, phone or a verified outing.
- Documentation-only update; no code changes or new application test run. Existing
  118 backend/46 frontend results remain the last executed passing checks.
- Next required implementation: predefined reports and protected operator removal.

### Reporting/operator implementation — October8,2026

- Lead agreed REPORTING_PLAN.md/API_CONTRACT.md before bounded parallel backend
  and frontend parts. No dashboard, moderation HTTP routes, free text, public
  reports/counts, automatic removal or new dependencies.
- Backend src/reports.ts/app.ts: fixed reason allowlist, strict2KiB POST body,
  fresh publishable/caller-JWT RPC, before/after current spot authorization even
  failure/no rows, safe private no-store response. Returns only spotId/reason/
  accepted, no private identifiers/count/duplicate flag. Existing createApp first6
  injectable parameters retained, ReportStore is seventh.
- Frontend reportApi/reportController/ReportControl/detail wiring: explicit choice
  and submission, validated success only,35s deadline, scoped pending disable,
  late result dismissal/auth/missing callbacks; explicit same-reason retry after
  uncertain outcome is safe via dedup. No localStorage or operator controls.
- Local backend/src/operator.ts: validated server-only credential and URL, bounded
  private pending queue, confirmed single-report review and confirmed spot removal.
  Derives real owner and delegates existing tombstone-first SpotStore.remove;
  storage failure leaves hidden target and requires explicit retry. Never executed
  against real configuration. Queue output is private, not demo evidence.
- Prepared migration0005: sealed RLS report table with NO ordinary table privileges
  or policies, fixed-path authenticated-only narrow definer RPC derives auth.uid()
  and spot_visible, unique reporter/spot/reason. Reviewed duplicate cannot reopen;
  reports retain spot UUID after removal, reporter member deletion cascades. No SQL
  applied. Rollback-only check_reporting_boundaries.sql uses4 guarded disposable
  Auth users, synthetic metadata/no images; structural tests only, not PostgreSQL.
- Lead commands in both apps: npm run typecheck && npm run build && npm test.
  Backend11 files/137 tests passed after integrated removal regression; frontend56
  tests passed, build4.52s, entry426.97kB/workspace205.21kB, no >500kB warning.
  Existing tree-shaking workaround remains. Simulated caller-RLS route test warms
  search cache then CLI cleanup fails: subsequent feeds/search empty and detail/
  photo/explored/report return404, without another encoder/ordinary Storage call.
  This tests route composition, NOT real Supabase policies or Storage erasure.
- Real cached MiniLM/injected-HTTP regression:11/11 positive Hit@3 versus7/11
  keywords, unrelated negative empty. Synthetic corpus/auth, not live retrieval.
  git diff --check passed. No installs/private env reads/remote SQL/live removal/
  deployments/commits/publishing. Root/scoped status and setup guides updated.
- Next: user applies0005 once, report twice with same reason, privately inspect
  exactly one row, test reporter/owner direct queue denial, then deliberately
  remove a disposable target and verify all ordinary routes/direct Storage/RLS.
  REPORTING_SETUP.md contains steps and bounded rollback SQL; phone/outdoor and
  broader authorization/cleanup/revocation audits still prevent pilot readiness.

### User-run reporting/operator smoke update

- User reports: "i performed all 5 steps and executed delete spot command all works
  as expected no effect on other spots".
- Record the previous final response's five-step activation/submission/dedup/private
  queue/check workflow and explicit operator deletion as user-confirmed live smoke.
  Other spots remain unaffected in their test. No private IDs or raw output retained.
- Migration activation and referenced queue-denial/removal checks are within the
  overall report; no separate SQL/CLI receipts, full direct-token/Storage matrix,
  rollback boundary script, controlled cleanup failure or phone checks inspected.
  Do not infer physical Storage erasure or independent security-audit completion.
- Documentation-only update; no application code or new test run. Last executed
  checks remain137 backend/56 frontend with typecheck/build and MiniLM regression.
- Next: remaining direct audience/revocation/RLS/Storage/removal boundaries and
  reachable phone/browser/outdoor pilot checks; do not expand feature scope.

### Camera-return auth reset fix

- User reports Take photo -> accept photo returns to the feed repeatedly, while
  Choose photo works. Phone/browser and a true document reload were not captured.
- Lead traced native-camera/tab return to a supported SDK behavior: installed
  auth-js GoTrueClient.ts documents repeated SIGNED_IN on tab refocus. Controller
  previously accepted every event and emitted verifying; App mounts workspace
  only while enrolled, so this destroys local Add fields/file/mode.
- Before-fix synthetic event trace: verifying,enrolled,verifying,enrolled. After
  exact same reproduction: verifying,enrolled only. This proves the app reset
  path, not that the handset emitted that event or never reloaded its document.
- Changed frontend/src/authController.ts: ignore only exact same non-null user+
  access-token SIGNED_IN while enrolled/verifying; keep pending verification alive.
  New tokens/accounts, other events, sign-out, API access recheck, error recovery
  and explicit retry retain fail-closed verification/revision fencing.
- frontend-builder added6 regression tests in frontend/tests/auth.test.ts; first
  two failed before fix. Lead reran npm run typecheck && npm run build && npm test
  in frontend/:62 tests passed, build2.46s, entry427.22kB/workspace205.21kB. Backend
  untouched/unrun here; its137-test result remains historical. git diff --check passed.
- No camera API rewrite, persistent draft/photo storage, network payload logging,
  installs, private config reads/edits, Supabase changes or live operations for
  this fix. Existing user-owned Vite tunnel/proxy changes preserved.
- Research: Expo/Supabase resume UX article warns resume is a separate test surface
  (no comments); browser-camera article emphasizes lifecycle/device testing (no
  comments), but its getUserMedia/WebRTC approach was NOT adopted. Installed SDK
  comments plus deterministic controller regression are the actual fix evidence.
- Next handset check: refresh once before starting; enter title/note/pin, capture
  and accept, expect SAME Add form and preview; cancel capture preserves old fields/
  selection; repeat capture, choose-photo and save. If still resets, collect only
  phone/browser and whether verification/spinner or real document reload occurs;
  browser process discard/actual reload and genuine token refresh are not solved
  by this narrow duplicate-event guard. Keep phone acceptance pending.

### User-reported validation and camera confirmation

The user confirms the camera fix works and provides these outcomes:

| Validation area | Reported result |
| --- | --- |
| Access matrix | As expected |
| Public -> Connections revocation | As expected |
| All post-delete access paths | As expected for tested app/API paths |
| Direct database/Storage | Explicitly skipped |
| Failure/stale-response checks | As expected for tested scenarios |
| Phone flow | Works as expected, including camera-return fix |
| Real outing and real-note search | Done |

- Evidence is the user's overall report, not independently inspected network/SQL/
  Storage receipts. The explicit direct database/Storage skip applies even though
  the earlier post-delete checklist also mentioned direct database/media checks.
- Do not invent outing location/date/photos, device/browser counts, actual query
  results, AI-versus-keyword improvement, latency or phone-performance metrics.
  Existing synthetic MiniLM benchmark remains separate evidence.
- Camera/phone flow is no longer awaiting the user's retry. This does not imply
  a full browser process discard retains a draft, or genuine token changes can
  skip fail-closed verification. No persistent draft/photo storage was added.
- Failed/uncertain writes, controlled media-cleanup failure, corrupted model,
  exact radius/RPC/grant checks and SQL cascade audits are not individually
  inferred from the aggregate failure/stale-response report.
- Documentation-only update, completed after an interrupted write was found not
  to have changed files. Existing camera fix/tests preserved; no new app checks,
  migrations, deletions, private env reads, commits or live operations repeated.
- Next priority: ordinary-user direct database/RLS/Storage verification in
  SPOT_SHARING_SETUP.md section6, then record precise search/demo evidence for
  delivery. Keep this a functionally tested pilot with an outstanding security
  validation gap, not an independently security-validated release.

### User-reported ordinary-user direct spot SELECT checks

- B's tested accessible direct SELECT: failed=false,rowCount=1. The spot audience
  in that B-only report was not separately supplied; do not assume it covered every
  private/owner case.
- Non-owner unconnected enrolled C, active Public spot: direct SELECT
  failed=false,rowCount=1; audience=public,isOwner=false; detail/photo200/200.
- C, another unconnected author's Connections-only spot: audience=null and
  detail/photo404/404, then user confirms the expected SELECT summary
  failed=false,rowCount=0,errorCode=null. This is successful RLS filtering, not
  treating a failed query as an empty authorized result.
- Initial C query failure was attributed by the user to an omitted/placeholder
  spot ID; no policy weakening, admin fallback or credential change was required.
- These are user-run ordinary-session Data API checks of the listed allowed
  spot columns. No real IDs/tokens/private query output retained here. Supersedes
  the earlier total database skip only for these sampled spot-read cases.
- Still pending: direct Storage downloads/public-URL denial, forbidden direct
  table/Storage writes, ordinary report/explored grants/isolation, de-enrollment,
  deleted/revoked direct Storage/DB cases and independent SQL/media-erasure audits.
- Documentation-only update. No code/test rerun, migrations, live deletion or
  other external operations performed. Last checks remain62 frontend/137 backend.

### Template for the next slice

- Slice / owner:
- Changed workspace-relative paths:
- User-visible behavior implemented:
- API/config changes agreed:
- Commands run, working folder, actual result:
- Unrun checks / blockers:
- Next concrete step:

Keep detailed handoffs here only when useful. Never paste credentials, private
requests, raw logs, or individual location records into this board.
