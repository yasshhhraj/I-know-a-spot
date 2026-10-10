# I Know a Spot — backend pilot API

Node.js + TypeScript + Fastify. `GET /health` still returns
`{"status":"scaffold"}` (not integration readiness). `GET /me` verifies a
Supabase user token and reads that user's pre-enrolled profile. A migration is
provided but **has not been applied by this implementation**. Spot sharing and a
Connections/Public feeds and saved radius update are implemented locally. Public
requires migration 0003 and live SQL/RPC verification; local MiniLM semantic search
is implemented. Own self-reported explored state is implemented locally and needs
user-run migration0004. Reporting and local protected operator CLI are implemented
locally and require migration0005 plus live checks. This is not a
verified working pilot.

## Local setup

Use Node.js 24 LTS (recommended for both folders; see `package.json` engines).
From `backend/`:

```sh
npm install
cp -n .env.example .env
npm run dev
```

In another terminal, `curl http://127.0.0.1:3001/health` returns scaffold status.
The server binds `127.0.0.1:3001` by default. `PORT` must be 1–65535;
`HOST` accepts `localhost` or an IP address (use `0.0.0.0` only when intentional).
`FRONTEND_ORIGIN` is the exact allowed browser origin, default
`http://localhost:5173`; it must be a single HTTP(S) origin without a path.
The `.env` file is loaded by Node's `--env-file-if-exists` flag in dev/start;
shell-provided environment variables take precedence. Do not commit `.env`.

Set `SUPABASE_URL` and a **new-format** `SUPABASE_PUBLISHABLE_KEY` beginning
`sb_publishable_` to enable `/me`. The suffix must be nonempty and contain only
ASCII letters, digits, `_` or `-`. Missing/malformed settings, `sb_secret_`
keys, and legacy JWT keys return 503 before any `/me` provider request. Spot
reads use the same publishable key and caller JWT. Spot mutations additionally
require a **server-only** `SUPABASE_SECRET_KEY=sb_secret_...` (preferred), or a
genuine unexpired `SUPABASE_SERVICE_ROLE_KEY` JWT with `service_role` (legacy).
Do not supply user tokens or expose either admin key to the browser. Config is
shape-checked locally and validated by Supabase upon use; a missing/invalid admin
key yields 503 for mutations without blocking `/me` or configured reads. `MODEL_ID`
defaults in the example to `Xenova/all-MiniLM-L6-v2` and `MODEL_CACHE_DIR` to
`.cache/models`; both are now read by the API. MiniLM's pinned q8 weights were
downloaded and real synthetic CPU/HTTP search was verified locally. Search uses
caller-JWT eligible candidates before ranking, then fresh eligibility/text-version
revalidation. See [../SEMANTIC_SEARCH_SETUP.md](../SEMANTIC_SEARCH_SETUP.md) for
local setup, fixture SQL/cleanup, errors and live checks, and
[../SEMANTIC_SEARCH_EVALUATION.md](../SEMANTIC_SEARCH_EVALUATION.md) for measurements.

From `backend/`, `node scripts/minilm-smoke.mjs` checks the existing local model
artifacts and synthetic inference without model networking. The explicit
`node scripts/minilm-smoke.mjs --download` prepares missing pinned artifacts first.
The ignored cache is `backend/.cache/models`; weights are not shipped in git or
frontend assets. This is a model smoke check, not an authenticated-search test.
After building, `node scripts/evaluate-semantic-search.mjs` runs the real route/
encoder against synthetic auth/candidates, not a real Supabase session. No new
search migration is required: existing rows are encoded on demand into bounded
memory. Seed/cleanup SQL commits fictional metadata only; missing photos are expected.

## Checks (after installing dependencies)

Run from `backend/`:

```sh
npm run typecheck
npm run build
npm test
npm start
```

`npm start` serves the compiled `dist/server.js` after a successful build;
stop it with Ctrl-C. Tests inject HTTP requests without opening a listening
socket, including mock-transport Supabase Auth/PostgREST boundary checks. These
do not prove live remote configuration, applied policies, or live RLS behavior.

## Docker / ECS Fargate image

The `Dockerfile` builds an `linux/amd64`-compatible runtime image for ECS
Fargate. It typechecks/builds the backend, downloads and verifies the pinned
MiniLM artifacts during the image build, runs the cache-only model smoke check,
and copies only compiled output, production dependencies and verified model
artifacts into the runtime stage. Secrets are not copied into the image.

From `backend/`:

```sh
docker build --platform linux/amd64 -t i-know-a-spot-backend:local .
docker run --rm --env-file .env -p 3001:3001 i-know-a-spot-backend:local
```

For ECR, replace the local tag with the full private-repository image URI and
push a unique release tag rather than relying only on `latest`. The runtime
expects `HOST=0.0.0.0`, `PORT=3001`, the exact deployed `FRONTEND_ORIGIN`, and
the Supabase/model variables from the task definition or its secret references.
The image includes a container healthcheck for `/health`; that endpoint is still
only a liveness/scaffold response, not a claim of integration readiness.

## Safe API response logging

The backend emits one JSON log line after every request completes, including
unknown routes and errors. Example:

```json
{"event":"api_response","requestId":"req-1","method":"POST","route":"/spots","status":503,"durationMs":412}
```

The log contains only request ID, method, route template, status and elapsed
milliseconds. It does not log authorization headers, tokens, request bodies,
multipart fields, photo bytes, coordinates or query strings. For a quick uncertain
save, inspect the backend terminal for the matching `POST /spots` or
`PATCH /spots/:id` status and duration. A fast `503` points to a backend/provider
failure; a duration near the client mutation deadline points to a timeout. Do not
paste log lines containing private infrastructure identifiers into chat.

The API explicitly permits browser preflight for `POST`, `PATCH` and `DELETE`
with `Authorization` and `Content-Type`. A preflight `204` without a subsequent
mutation log indicates the browser rejected the preflight response or the request
was blocked before dispatch; inspect the browser console and preflight headers.

## Operator setup — user-run only

1. In your own Supabase project, apply
   `supabase/migrations/202610070001_pilot_members_connections.sql` once with
   the SQL editor/operator role or your existing migration workflow. Do not
   execute as `anon` or a pilot member. Then apply
   `supabase/migrations/202610070002_spots_storage.sql` **once**, after 0001,
   with the operator role. The second migration creates the spots table, narrow
   client SELECT grants, SQL visibility helpers and a private `spot-photos` bucket
   with restrictive Storage guards. It deliberately fails if that bucket already
   exists; inspect a conflict rather than repurposing data. No migration or SQL
   was executed by this change. No users are automatically enrolled and no
   trigger copies Auth metadata.
2. In Supabase Auth, create 3–5 pilot accounts with consent using your normal
   account-creation process. Disable public signups in your Auth settings for a
   pre-enrolled pilot. Save their Auth UUIDs privately; do not commit passwords,
   emails, or UUIDs of real members to fixtures.
3. As the operator only, enroll chosen users with private SQL, e.g. replace
   placeholders **privately** in the SQL editor:

   ```sql
   insert into public.pilot_members (user_id, display_name, enrolled)
   values ('<existing-auth-user-uuid>'::uuid, 'Pilot member', true);
   ```

   Unspecified enrollment defaults to false; the name is fixed for members.
   Seed each consented pair once in canonical UUID order:

   ```sql
   insert into public.connections (member_a, member_b)
   values (least('<first-auth-uuid>'::uuid, '<second-auth-uuid>'::uuid),
           greatest('<first-auth-uuid>'::uuid, '<second-auth-uuid>'::uuid));
   ```

4. For boundary checks, use **three distinct disposable Auth users without member
   rows**, a trusted operator `psql` connection, and the supplied rollback-only
   script. Substitute the three UUID placeholders locally; never put the DB
   connection string/password in source or shell history. The script uses a
   transaction and ends in `ROLLBACK`; `ON_ERROR_STOP` stops on failure. A
   connection interruption while a transaction is open also rolls it back.

   ```sh
   psql -X -v ON_ERROR_STOP=1 \
     -v member_a=REPLACE_WITH_DISPOSABLE_AUTH_UUID_A \
     -v member_b=REPLACE_WITH_DISPOSABLE_AUTH_UUID_B \
     -v outsider=REPLACE_WITH_DISPOSABLE_AUTH_UUID_C \
     -f supabase/check_pilot_boundaries.sql
   ```

   This checks grants, constraints and simulated authenticated RLS claims, not
   actual user JWT delivery. Also manually verify with two real signed-in
   accounts that `/me` returns only each user's own profile, that unenrolled
   identities receive 403, and that direct user-scoped table requests obey RLS.
   No live SQL or sign-in has been run by this code change.

`GET /me` requires `Authorization: Bearer <Supabase user access token>` (the
Bearer scheme is case-insensitive; exactly one space and a token68 value) and
returns `{ "profile": { "id": "...", "displayName": "...", "publicRadiusKm": 5 } }`
for an enrolled account. Errors: 401 `UNAUTHORIZED` for missing/invalid/expired
tokens; 403 `NOT_ENROLLED` for verified users with absent/unenrolled profiles;
503 `SERVICE_UNAVAILABLE` for missing config or upstream/schema failures. Every
response sets `Cache-Control: private, no-store`. The API creates a new
publishable-key Supabase client per request, verifies with `auth.getUser(token)`,
then forwards that token to PostgREST for an RLS-scoped own-row SELECT. No
service-role lookup, shared session, or token logging is used. Requests time out
at the transport after five seconds per fetch. CORS alone never authorizes.

## Spot API and limits

Every spot route requires verified enrollment. `POST /spots` accepts exactly a
`data` JSON field and `photo` file in multipart form (either order); the full
metadata object is `{title,note,audience,latitude,longitude,accessConfirmed,accessNote}`.
`PATCH /spots/:id` accepts the same full JSON metadata without a photo. Title
1–80 characters, note 1–500, access note 0–200, audience `connections` or
`public`, finite coordinates within ±90/±180, `accessConfirmed: true`. The
author/owner and UUID are generated by the server. Only owners can patch/delete;
unknown/non-owned/hidden targets return neutral 404. `GET /spots` defaults to
newest-first Connections (up to 50); explicit `feed=public` uses saved radius and
required `centerLat`/`centerLon` through caller-JWT `list_public_spots` RPC.
`GET /spots/:id` permits any enrolled user for Public, owner/connected enrolled
users for Connections. `GET /spots/:id/photo` rechecks visibility and returns
clean WebP with `private, no-store` and `nosniff`; `photoUrl` is a relative API
path, not a signed or public Storage URL. Browser clients must fetch it using
Bearer auth and revoke local object URLs on account change. Already downloaded
bytes cannot be recalled.

Photo input is one JPEG/PNG/WebP of at most 10 MiB. The backend checks declared
MIME against decoded format, rejects animation/multipage and more than 20 million
pixels, rotates EXIF orientation, resizes within 1600×1600, and emits new WebP
quality 80 without original metadata. No raw upload reaches Storage. `DELETE`
tombstones first; failed object cleanup returns `MEDIA_CLEANUP_PENDING` (503),
keeping ordinary access hidden so the owner can deliberately retry. On insert
failure orphan cleanup is attempted only for a definitive PostgreSQL data/constraint
rejection, after a fresh admin lookup finds no row. A timeout/transport/unknown
result retains the object, even if an immediate lookup would be absent, because
the INSERT might still commit. Operator inspection is required for settled orphans.
No mutation is automatically retried after uncertain provider results.

Error envelope: `{ "error": { "code": "...", "message": "..." } }`.
401 `UNAUTHORIZED`, 403 `NOT_ENROLLED`, 400 `BAD_REQUEST`, 404 `NOT_FOUND`,
413 `PHOTO_TOO_LARGE`, 415 `UNSUPPORTED_PHOTO`, 503 `SERVICE_UNAVAILABLE` or
`MEDIA_CLEANUP_PENDING`. Safe responses never contain provider errors/keys.
The reads rely on live RLS and Storage policies, not CORS. Before any pilot use,
the operator must verify these policies remotely with separate enrolled connected,
enrolled unconnected, and unenrolled user tokens, including direct Storage
requests, audience revocation, tombstones and object cleanup. Local mocked tests
do **not** establish that the migration was applied or that remote RLS works.

See [../SPOT_SHARING_SETUP.md](../SPOT_SHARING_SETUP.md) for the operator-run
migration/configuration, direct API/Storage matrix and cleanup procedure. Latest
lead checks: typecheck/build and 11 files / 137 tests pass locally; direct remote audits remain pending.

Public setup: [../PUBLIC_DISCOVERY_SETUP.md](../PUBLIC_DISCOVERY_SETUP.md).
Apply `202610080003_public_feed_radius.sql` once after 0002. Prepared rollback
boundary script tests SQL, not media, and has not been executed. PATCH /me accepts
only caller's integer publicRadiusKm 1–25, using caller JWT and existing RLS;
no privileged read/update fallback. Public detail-by-ID remains radius-independent.

## Security boundaries

Explored activation: [../EXPLORED_SETUP.md](../EXPLORED_SETUP.md). Apply
`supabase/migrations/202610080004_spot_explorations.sql` once after0003. Own state
uses caller JWT/publishable key and a security-invoker boolean setter, not admin
fallback. No GPS/visit timestamps/public counts. Missing migration is503, not false.
Listed live persistence/two-account checks are user-confirmed; rollback-only SQL/RLS
script is prepared but not assistant-executed. Direct role boundaries remain unverified.

Reporting/operator activation: [../REPORTING_SETUP.md](../REPORTING_SETUP.md).
Apply `supabase/migrations/202610080005_spot_reports.sql` once after0004. Submission
uses only caller JWT/publishable key and a narrow authenticated definer RPC, with
no report-table privileges for ordinary users. Unique reporter/spot/reason accepts
identical retries without extra rows or duplicate flags. Only server-configured
local `dist/operator.js list|review|remove` commands may inspect/review the private
queue or remove any spot. Removal derives owner and reuses existing tombstone/media
cleanup; confirmation flags mandatory. No operator web API or new frontend secret.
Local tests pass, including warmed-cache/route exclusions under simulated caller
RLS. Migration/live queue/Storage/removal checks remain user-run, not proven by mocks.

Follow the root `PRD.md` and `BUILD_SCOPE_36H.md` for the pilot. Public discovery
and search must enforce audience and ownership for direct
reads, media and writes on the server. A CORS header is not authorization. Do
not claim live Supabase row-level security until policies are applied and tested.
Public discovery uses the member's saved radius and explicit request center;
filter eligible spots by geodesic straight-line distance **before** semantic
ranking. Do not send photos, coordinates, or member IDs into the text encoder.
The health endpoint deliberately does not indicate readiness of these or future
services.
