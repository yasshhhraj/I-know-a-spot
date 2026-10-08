# Explored state — bounded implementation plan

Date: October 8, 2026. Scope: PRD FR-06 and spot-detail display in FR-05.
User authorized planning followed by implementation in the current session.
No background/offline scheduling, remote SQL, deployment or publishing is implied.
Status: implemented locally; backend 118/frontend 46 tests and both builds/typechecks
passed. Migration0004 and rollback checks are prepared, not remotely executed.
Follow EXPLORED_SETUP.md for activation and real-account/browser verification.

## Observable result

An enrolled participant opens an accessible spot, sees their own **Explored
(self-reported)** state, marks it explored or unexplored, and sees the saved value
after reopening/reloading/signing in again. Another participant's state is unchanged
and never displayed. Directions remain usable while the explored service fails.
This is not location tracking, a verified visit, a count, ranking or public activity.

## API contract (agreed before parallel implementation)

- `GET /spots/:id/explored`: own state only. Missing row means false **only after**
  successfully querying the configured table for an accessible spot.
- `PUT /spots/:id/explored`: JSON exactly `{"explored":true}` or false; explicit
  desired state, never a server-side invert/toggle. Repeated same PUT is idempotent.
- Both return 200 `{"exploration":{"spotId":"<requested-uuid>","explored":true}}`.
  No member IDs, timestamps, other-user records or public counts.
- Verified caller/enrollment and current spot audience/removal authorization required.
  Public detail/explored access is radius-independent. Owner does not control others'
  marks. No client-supplied user identity, query parameters or unknown fields.
- 400 BAD_REQUEST for invalid UUID/body/content type/extra fields, 401 UNAUTHORIZED,
  403 NOT_ENROLLED, neutral 404 NOT_FOUND for inaccessible/deleted spots, 503
  SERVICE_UNAVAILABLE for configuration/schema/provider failures. All private no-store.
- Initial and final caller-JWT spot reads surround the operation. Table RLS is the
  primary same-statement authorization boundary; final read reduces revocation races,
  not a promise of instant recall of already downloaded data.
- GET browser budget 30s, PUT35s: existing auth can consume10s and initial/read-or-RPC/
  final spot checks5s each. Per-provider fetches stay5s. No automatic mutation retry.

## Data and permissions: new migration is needed

`202610080004_spot_explorations.sql`, user-run once after0003:

- `public.spot_explorations(user_id,spot_id,explored)` with composite primary key,
  boolean NOT NULL, member/spot foreign keys ON DELETE CASCADE.
- RLS SELECT/INSERT/UPDATE require user_id=auth.uid() AND current `spot_visible(spot_id)`.
  Visibility includes both enrollments, active spot and its audience/connection rules.
  Hidden/tombstoned rows cannot be read/written; physical spot deletion cascades marks.
- Revoke public/anon/authenticated defaults; authenticated gets narrow SELECT/INSERT
  columns and UPDATE(explored), no DELETE or identifier UPDATE. No widening existing tables.
- Narrow **SECURITY INVOKER** `set_spot_explored(uuid,boolean)` RPC performs an atomic
  INSERT/ON CONFLICT UPDATE of only explored, deriving user_id from auth.uid().
  Visibility/nonnull-state guard gives zero rows when inaccessible. Own/read policies
  still apply; no service role or definer bypass. Restrict function EXECUTE to authenticated.
- No new visit timestamps/GPS/media/analytics collected. False rows may remain; absence
  and false mean unexplored, but unavailable reads do not silently become false.

## Frontend behavior

One detail-only component/control, keyed by member+spot. Load state independently
from the spot so a missing migration does not break photo/detail/directions. Button
disabled during load/save; show confirmed state, not optimistic success. Explicit
Reload state after uncertain timeout/5xx/network/malformed-write response; prevent
another change until reconciliation. That read is a current snapshot, not proof a
still-running write cannot commit later. No automatic retries or inversion endpoint.

Dispose/invalidate old work on spot navigation/account/sign-out/StrictMode replay.
401/403 rechecks the auth gate;404 clears inaccessible detail and refreshes eligible
results. Labels say self-reported; no badges/counts on feed/map, no effects on ranking.

## Ownership and checks

- Lead: root contract/plan/WORKBOARD, SQL migration and rollback-only boundary script,
  user-run EXPLORED_SETUP.md, combined review/verification. Never execute remote SQL.
- backend-builder: backend adapter, API wiring/CORS PUT and meaningful route/transport tests.
- frontend-builder: isolated explored API/controller/control, detail wiring and Node tests.
- Run each app's `npm run typecheck && npm run build && npm test`. Preserve tree-shaking
  workaround, installed dependencies, static frontend and all existing search/sharing flows.
- Tests: signed-out/unenrolled, owner/connection/unconnected Public/private, other-user
  deny, radius-independent detail, absent/false rows, same-set repetition, true/false,
  RPC identity/policies, revoked/deleted spot, no migration/schema errors, invalid body,
  no logs, authoritative failures, late success/error, uncertain reconciliation.
- Prepared rollback script verifies SQL grants/owner isolation/repetition/revocation/
  tombstone/cascade using disposable Auth users and simulated DB roles. Static local
  SQL tests do not establish applied policies; real token/browser/phone checks remain user-run.

## Community rationale

[Supabase Row Level Security: The Policies That Actually Ship SaaS](https://dev.to/ethan__par_ker/supabase-row-level-security-the-policies-that-actually-ship-saas-1ell)
distinguishes USING from WITH CHECK and warns that privileged SQL-editor success does
not prove authenticated-user isolation. Use both policy sides, a caller-JWT invoker
path and explicit simulated/real-user checks. No comments were returned for this post.
