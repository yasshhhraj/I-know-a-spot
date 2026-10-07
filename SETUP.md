# Local setup — I Know a Spot

## What exists now

- `frontend/`: React/TypeScript/Vite + Tailwind static-buildable scaffold.
- `backend/`: Node/TypeScript/Fastify scaffold with `GET /health` returning
  `{"status":"scaffold"}` and basic health/config tests.
- Auth/data/storage, maps, Sharp, and Transformers.js packages are declared for
  implementation, not integrated. No sign-in, spot/photo flow, feed, radius, AI,
  database policies, or native app is ready yet.
- `AGENTS.md`, scoped AGENTS files, `.opencode/agents/`, and `WORKBOARD.md` provide
  local agent workflow. Existing DevRelay skills/configuration are preserved.

The assistant did not install packages, download model weights, create real env
files, provision Supabase, initialize native projects, start servers, or deploy.

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
npm run dev
```

`cp -n` preserves an existing file rather than overwriting it. Configure public
values locally as needed. The scaffold page does not require Supabase credentials.
Development URL: **http://localhost:5173**. `npm run preview` previews a successful
build; `dist/index.html` and assets are the later Capacitor packaging input.

Frontend example keys:
- `VITE_API_BASE_URL`: http://localhost:3001 for local development.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`: public project values only.

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
are `PORT`, `HOST`, and `FRONTEND_ORIGIN`. Supabase/model example settings are
placeholders and remain unused at scaffold stage. Keep real keys only in local
server configuration; do not send them in chat or commit them.

Model dependencies include inference tooling, but application code does not load
or download a model. Model acquisition/revision/license/resource validation is
a separate explicitly authorized setup step, not silently performed by dev.

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

No frontend test/lint script or browser suite exists yet. Browser/native behavior,
external integrations, and product features remain unverified. Add meaningful
tests with actual features, not empty scripts. See WORKBOARD.md for next work.
