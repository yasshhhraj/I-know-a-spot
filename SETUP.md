# Local setup — I Know a Spot

## What exists now

- `frontend/`: React/TypeScript/Vite + Tailwind, pilot email/password sign-in,
  session restoration/sign-out, protected profile gate, sharing form, Leaflet pin
  picker, Connections/Public feed/map switch, saved radius/manual discovery center,
  protected photos, owner edits/deletion, semantic search, private explored control
  and directions;
  static-buildable. The sharing workspace is lazy-loaded with a failure boundary.
- `backend/`: Node/TypeScript/Fastify with `GET /me` verifying caller/enrollment;
  authenticated spot/detail/media and owner create/edit/delete endpoints, Public
  caller-JWT RPC adapter, caller-scoped radius PATCH /me, local MiniLM POST search
  and own-state GET/PUT explored endpoints;
  `GET /health` still reports `{"status":"scaffold"}`, not service readiness.
- Supabase migrations are prepared, never executed by the assistant. User-reported
  live auth is partial evidence; direct RLS and spot/Storage setup remain unverified.
  See [SUPABASE_SETUP.md](SUPABASE_SETUP.md),
  [SPOT_SHARING_SETUP.md](SPOT_SHARING_SETUP.md) and
  [PUBLIC_DISCOVERY_SETUP.md](PUBLIC_DISCOVERY_SETUP.md) for user-run steps.
- User reports Public loading/radius persistence/exclusion working. Direct SQL/RLS
  and browser/phone checks remain pending. MiniLM search is implemented locally and
  compared with keywords on synthetic fixtures; listed live search/radius smoke
  checks are user-confirmed, broader authorization/phone checks remain pending.
  Explored state is implemented locally but requires new user-run migration0004;
  see [EXPLORED_SETUP.md](EXPLORED_SETUP.md). Reporting and native app are not implemented. See
  [SEMANTIC_SEARCH_SETUP.md](SEMANTIC_SEARCH_SETUP.md) for guarded user-run seed/
  cleanup scripts; no new search migration or embedding backfill is required.
- `AGENTS.md`, scoped AGENTS files, `.opencode/agents/`, and `WORKBOARD.md` provide
  local agent workflow. Existing DevRelay skills/configuration are preserved.

The assistant downloaded pinned MiniLM weights only after explicit user approval.
No package installation, real env file inspection/edit, remote SQL, Supabase
provisioning, native project initialization or deployment was performed.

## Runtime

Use **Node.js 24 LTS** and npm for both directories. This machine reports Node
`v24.13.1` and npm `11.8.0`; no runtime setting was changed. Check your shell:

```sh
node --version
npm --version
```

There is no root npm package or monorepo install. Each directory has its own
manifest; `npm install` creates its local node_modules and package-lock.json.
Retain the lockfiles after installation for reproducible subsequent `npm ci`.

## Frontend — terminal 1

Run from the workspace root:

```sh
cd frontend
npm install
cp -n .env.example .env.local
npm run typecheck
npm run build
npm test
npm run dev
```

`cp -n` preserves an existing file rather than overwriting it. Configure public
values locally as needed. Sign-in needs public Supabase/API configuration; missing
values display a configuration state rather than pretending login is available.
Development URL: **http://localhost:5173**. `npm run preview` previews a successful
build; `dist/index.html` and assets are the later Capacitor packaging input.

Frontend example keys:
- `VITE_API_BASE_URL`: http://localhost:3001 for local development.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`: public project values only.
- Optional `VITE_PILOT_CENTER_LAT`, `VITE_PILOT_CENTER_LON`: public, labelled pilot
  area fallback. Missing/invalid values require explicit manual choice for Public;
  no device location is inferred or automatically requested.

VITE_ values are shipped to browsers. Never place a service-role or secret key
there. Restart the dev server after changing environment files.

## Backend — terminal 2

From the workspace root in a separate terminal:

```sh
cd backend
npm install
cp -n .env.example .env
npm run typecheck
npm run build
npm test
npm run dev
```

URL: **http://localhost:3001** (loopback-only by default). Check in another terminal:

```sh
curl http://localhost:3001/health
```

Expected scaffold response: `{"status":"scaffold"}`. After a successful build,
`npm start` runs compiled code; use it **instead of** dev, not simultaneously on
the same port. Ctrl-C stops a running server.

Backend uses Node's env-file flag; no dotenv package is required. Active settings
are `PORT`, `HOST`, and `FRONTEND_ORIGIN`, plus `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` for `/me`. Use a new sb_publishable_ key; secret keys
and legacy JWTs are rejected as that configuration. Spot writes additionally require
backend-only `SUPABASE_SECRET_KEY=sb_secret_...` (preferred) or a genuine unexpired
legacy `SUPABASE_SERVICE_ROLE_KEY` JWT. `/me` does not use either privileged key.
Keep keys in correct local configuration; don't send them in chat/commits. Follow
SPOT_SHARING_SETUP.md before enabling sharing against your project.

Search lazily loads verified local MiniLM q8 artifacts using `MODEL_ID` and
`MODEL_CACHE_DIR` (default `.cache/models`, relative to backend/). It never downloads
in a route. Use `node scripts/minilm-smoke.mjs` to check the existing ignored cache;
explicit `--download` prepares missing pinned artifacts. Missing/model failure
returns honest search unavailability without blocking ordinary browsing/sharing.
See SEMANTIC_SEARCH_SETUP.md and SEMANTIC_SEARCH_EVALUATION.md for setup, limits and
the actual synthetic comparison. Search deadline is separate from mutation timing.

## Phone testing later

`localhost` on a phone means the phone, not this computer. Intentionally exposing
dev servers requires LAN host/API settings, an exact allowed frontend origin,
and network access. Device camera/geolocation commonly require a secure context;
plain LAN HTTP is not equivalent to localhost. Use an authorized HTTPS test setup
when doing the outdoor pilot. No tunnel or public exposure is configured here.

## Agentic workflow

1. Lead reads PRD/build scope, chooses one acceptance criterion, and claims a
   WORKBOARD row with owner, bounded files, dependencies, and intended checks.
2. Agree the API contract before splitting frontend/backend integration.
3. Assign independent implementation parts to `frontend-builder` and
   `backend-builder` (workspace-local agent definitions), or give equivalent bounded
   prompts to general task agents. Agent-file discovery depends on the client;
   these files do not schedule or automatically run agents.
4. Lead alone updates the shared board and root docs. Agents return evidence using
   the handoff format. No nested agents, installs, or commits without authorization.
5. Lead reviews and runs combined checks; completed means verified, not merely coded.

Example first slice after local install: verify scaffolds, then establish pilot
authentication/audience/media contracts. Test denial paths before building feeds.
Model inference feasibility must also be resolved early, as required by the plan.

## Verification status

Checks actually run during setup:

- `node --version` / `npm --version`: runtime available (versions above).
- `npm pkg get name engines scripts` in each app: manifests readable.
- `python3 -m json.tool` on both tsconfig files: valid JSON.
- `node --check` on backend source/tests and non-JSX frontend/config files:
  syntax passed. This is not TypeScript typechecking or React/browser validation.
- Dependency-free Node assertions importing `backend/src/config.ts`: defaults,
  explicit settings, invalid port/host/origin cases passed at initial scaffold setup.
- `git diff --check`: no tracked whitespace errors. `git check-ignore` confirmed
  env/dependencies/build/model-cache paths are ignored; examples remain visible.

### After user installation — October 7, 2026

| Folder | Command | Actual result |
| --- | --- | --- |
| frontend/ | npm run typecheck | Passed |
| frontend/ | npm run build | Passed after the workaround below; Vite build 1.44s |
| backend/ | npm run typecheck | Passed |
| backend/ | npm run build | Passed |
| backend/ | npm test | Passed: 2 files / 10 scaffold tests |

**Temporary frontend build workaround:** Vite 7.1.9 with installed Rollup 4.64.1
timed out after 120 seconds with default tree-shaking. Isolated builds hung even
without Tailwind/React plugins; disabling tree-shaking completed successfully.
`frontend/vite.config.ts` sets `build.rollupOptions.treeshake: false`. Compilation,
typechecking, CSS generation, and minification remain enabled, but unused code is
retained, making bundles larger. This is a workaround, not a diagnosed upstream
fix; investigate/restore optimization on a verified toolchain before release.
No package versions were changed during this verification.

### Authentication implementation verification — October 7, 2026

After the auth slice, both apps passed `npm run typecheck`, `npm run build`, and
`npm test`: frontend 10 auth/API-state tests; backend 51 tests across 3 files.
Backend uses injected/mocked Auth and PostgREST transports. Frontend tests run with
Node's built-in runner and need no additional installed test package.

No frontend lint or browser suite exists yet. The user subsequently reported live
enrolled/unenrolled access and session restoration working. This is not an
independent migration/RLS audit; sign-out/reload and direct database checks are
still pending. See SUPABASE_SETUP.md and WORKBOARD.md.

### Sharing implementation verification — October 7, 2026

Lead reran `npm run typecheck && npm run build && npm test` in each app:
- Backend: passed, 4 files / **73 tests**. Includes all spot-route enrollment gates,
  spoofing/ownership boundaries, ambiguous writes/cleanup, and actual Sharp output
  fixtures for JPEG/PNG/WebP orientation and metadata removal.
- Frontend: passed, **22 tests**. Includes protected-media requests, stale account
  scopes/object URLs, field/response validation, wrapped longitude and uncertain
  mutation results. These are Node tests, not React/Leaflet browser tests.
- Static frontend build: **3.01s**, entry JS **424.87 kB** (gzip 121.92), lazy
  workspace **178.74 kB** (gzip 53.22); no >500 kB chunk warning. Earlier combined
  sharing chunk was 601.87 kB. This is a split, not measured browser latency.
  The tree-shaking workaround remains; no dependency versions changed.

Spot/Storage migration, real upload/read/edit/delete, audience revocation, direct
Storage/RLS, tile-failure and lazy-chunk recovery, camera/phone and directions
checks are **unrun**. Use SPOT_SHARING_SETUP.md; no live photo-protection or full
pilot-readiness claim follows from mocked transport and generated-image tests.

### Public discovery/radius — October 8, 2026

Lead ran `npm run typecheck && npm run build && npm test` in both apps: backend
86 tests and frontend 32 tests passed. Frontend build 3.05s; entry JS 426.86 kB,
workspace 188.47 kB. Preserved tree-shaking workaround and installed stack.

Prepared `202610080003_public_feed_radius.sql` and rollback-only operator SQL
boundary script. Neither was executed. Live Public feed/radius, direct RPC grants,
PostgreSQL distance boundaries and browser map/picker/StrictMode checks are unrun.
See PUBLIC_DISCOVERY_SETUP.md. No new credentials, dependencies or deployment.
