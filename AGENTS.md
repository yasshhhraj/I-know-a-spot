# I Know a Spot — workspace agent instructions

## Source of truth

Read `PRD.md`, `BUILD_SCOPE_36H.md`, and `WORKBOARD.md` before implementation.
`FUTURE_SCOPE.md` is excluded unless the user explicitly changes scope.
The release includes Connections/Public feeds, a top-center feed switch, saved
Public radius, browser photo capture/selection, directions, and explored state.
Auth and the spot-sharing/Connections-preview slice have local tests. The user
reports live auth working, but direct RLS and spot/Storage/browser checks are still
pending. Public feed/radius, AI, explored and reporting remain unimplemented.
Read API_CONTRACT.md plus SUPABASE_SETUP.md and SPOT_SHARING_SETUP.md for user-run
external steps; never mistake prepared migrations for applied policies.

## Stack and ownership

- `frontend/`: React, TypeScript, Vite, Tailwind, Leaflet/React Leaflet, public
  Supabase client configuration. Preserve a static bundle for later Capacitor.
- `backend/`: Node, TypeScript, Fastify, Supabase integration, Sharp, and eventual
  Transformers.js inference. Read the scoped AGENTS.md in each folder.
- Root coordination/documentation belongs to the lead agent. Do not overwrite
  another agent's files or modify shared API contracts without coordination.
- Two bounded implementation parts can run in parallel with separate ownership.
  Investigations, review, and integration stay with the lead unless delegated.
  Do not launch nested agents automatically or create worktrees/branches unasked.

## Workflow for each slice

1. Choose one acceptance criterion; inspect existing files and direct callers.
2. Claim a WORKBOARD item with named owner, files, dependencies, and intended check.
   Only the lead edits the shared board during parallel work.
3. Agree API request/response/error shapes before frontend/backend integration.
4. Make the smallest complete change; preserve unrelated work and existing stack.
5. Run the actual relevant checks; report command, folder, result, and gaps.
6. Hand back changed paths, behavior, API changes, actual checks, and next step.
7. Lead reviews/integrates, runs combined checks, and marks completed only on evidence.

## Authority and privacy

- The user installs packages themselves. Until explicitly authorized otherwise,
  do not run npm install, npm ci, package-installing npx, model downloads, or change
  dependency/global runtime settings. Missing dependencies are a blocker, not a pass.
- No deployments, commits, pushes, service provisioning, or publishing without
  the user's request. Never read private env files unless the task needs them.
- Keep .env files, real credentials, logs, private locations, and raw transcripts
  out of versioned documentation and examples. Use placeholders only.
- VITE_ variables are public. Privileged Supabase credentials are server-only.
- CORS is not authorization. Public pilot means signed-in enrolled accounts,
  not anonymous read access. Audience/media/owner rules must apply to direct requests.
- Server-side Public radius filtering precedes AI ranking. Never send photos,
  coordinates, or member IDs to the text encoder; no background user tracking.
- No claims that auth, RLS, feeds, photo protection, AI, or native wrapping work
  until implemented and verified. Health currently says scaffold, not readiness.
- Local skills already in `.opencode/skills/` remain intact. Do not create a new
  skill or copy private notes into behavior memory without an explicit request.

## Real commands after the user installs dependencies

- `frontend/`: `npm run typecheck`, `npm run build`; `npm run dev` on port 5173.
- `backend/`: `npm run typecheck`, `npm run build`, `npm test`;
  `npm run dev` on port 3001. `GET /health` returns scaffold status.
- `frontend/`: `npm test` runs dependency-free Node auth/API-controller tests.
  No frontend lint or browser integration suite exists yet. Add meaningful checks
  as behavior is implemented; never add no-op scripts.
- See `SETUP.md` for exact environment commands and current limitations.
