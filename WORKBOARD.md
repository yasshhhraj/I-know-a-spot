# Implementation workboard

Only the lead edits this board while agents run in parallel. Claim bounded items
and record actual evidence, not anticipated success. No private payloads here.

## Current state

Pilot auth/sharing and Connections/Public feed/radius are implemented with local tests:
frontend 32 tests and backend 86 tests last passed; both typecheck/build. The schema/RLS
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
the tested accounts; direct mutation-denial and Storage checks remain pending.
The user confirms photos load for uploader and connected viewer, Public detail is
viewable by ID, and deletion works as expected. The user clarified that the
unconnected account cannot open a Connections-only spot but successfully opens a
Public spot by ID. This confirms the tested browser detail audience matrix, not
an independent direct Storage or mutation audit. Mobile testing remains unrun under
the current single-device local server configuration.
Frontend retains the documented tree-shaking workaround; lazy-loading now avoids
the >500 kB chunk warning. No private env contents were inspected. Direct media/
mutation boundaries, audience revocation and browser-specific checks remain pending.
After identifying the missing Public migration as the 503 blocker and receiving
the user-run setup instructions, the user confirms a shared Public spot now loads
successfully in the Public feed. The user confirms radius changes and reload
persistence work. Reducing the radius excludes the tested Public spot from the
list while its copied ID URL still opens, matching radius-independent detail access.
Exact inside/on/outside boundaries and the direct RPC/RLS audit remain pending.
AI, explored, reporting and native flows are unimplemented.
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
| SHARE-LIVE | Apply spot/storage migration and test connected/unconnected access | User then lead | Partial (user-reported live flow) | Owner/connection photos load; owner controls and deletion work; unconnected account denied Connections-only detail and allowed Public detail by ID; direct mutation/Storage checks and audience revocation pending |
| FEEDS | Shared Connections/Public feed/map, Profile radius/area | Lead contract/integration; backend-builder `backend/`; frontend-builder `frontend/` | Completed (local only) | Lead typecheck/build: backend 86 tests, frontend 32 tests pass; SQL RPC/script prepared, no live execution |
| FEEDS-LIVE | Public migration and real radius/RPC/browser tests | User then lead; PUBLIC_DISCOVERY_SETUP.md | Partial (user-reported core flow passed) | Public load, radius change/reload persistence and out-of-radius list exclusion with ID detail access confirmed; exact boundary, list/map agreement and direct RPC/RLS checks pending |
| AI | Real open-weight encoder and feed-scoped search | Unassigned; backend/ then frontend/ | Pending | Hour-2 inference gate; keyword comparison and failure handling |
| SAFETY | Reports and protected operator removal | Unassigned; backend/ then frontend/ | Pending | Removed content unavailable through all ordinary access paths |
| PILOT | Combined mobile/outdoor test and submission evidence | Lead | Pending | Document actual checks, real outing, limits, and a draft; no unrequested publication |

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
