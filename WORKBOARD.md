# Implementation workboard

Only the lead edits this board while agents run in parallel. Claim bounded items
and record actual evidence, not anticipated success. No private payloads here.

## Current state

Frontend/backend scaffolds and agent instructions exist. The user installed
dependencies; both apps typecheck/build and 10 backend scaffold tests pass.
Frontend uses a documented temporary tree-shaking workaround. External service
configuration has not been inspected; model inference and product features are
not implemented or verified. Stack setup does not count as MVP delivery.

| ID | Slice | Owner / paths | State | Dependency / acceptance evidence |
| --- | --- | --- | --- | --- |
| SETUP | Scaffold and local agent workflow | Lead; frontend/backend setup contributors | Completed (scaffold only) | Manifest/config and dependency-free syntax/config checks; package checks now verified below |
| ENV | Install dependencies and copy placeholder env files | User; frontend/, backend/ | Completed (user reported) | Local package scripts execute; no private env contents read or credentials verified |
| VERIFY | Typecheck/build and backend scaffold tests | Lead | Completed (scaffold only) | Frontend typecheck/build pass; backend typecheck/build pass; 2 test files / 10 tests pass |
| BUILD_FIX | Unblock frontend production-build hang | Lead; frontend/vite.config.ts, setup docs | Completed (workaround) | Default build timed out at 120s; treeshake:false permits original npm run build to pass in 1.44s |
| OPTIMIZER | Revisit Rollup tree-shaking before release | Unassigned; frontend/ | Pending | Vite 7.1.9 / Rollup 4.64.1 hangs with default and safest tree-shaking in local tests; restore optimization only on verified toolchain, no unapproved dependency changes |
| AUTH | Pilot identities, connections, audience/media access contract | Unassigned; backend/ first | Pending | Enrolled/owner/connected/unconnected/anonymous checks; real RLS/media design |
| SHARE | Browser photo, pin/note/audience, owner edit/delete | Unassigned; split folders after API agreement | Pending | Protected uploads and metadata removal; two-user flow |
| FEEDS | Shared Connections/Public feed/map, Profile radius/area | Unassigned; split folders after API agreement | Pending | Scope/radius boundary tests; stale responses cannot replace current feed |
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

### Per-slice template

- Slice / owner:
- Changed workspace-relative paths:
- User-visible behavior implemented:
- API/config changes agreed:
- Commands run, working folder, actual result:
- Unrun checks / blockers:
- Next concrete step:

Keep detailed handoffs here only when useful. Never paste credentials, private
requests, raw logs, or individual location records into this board.
