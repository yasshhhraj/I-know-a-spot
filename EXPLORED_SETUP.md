# Explored state — operator migration and live checks

The detail control records **your own self-reported explored/unexplored state**.
It is voluntary: no GPS, verified visit, timestamp, photo, public count, leaderboard
or influence on semantic search. Other participants never see your mark.

## 1. Apply the new migration once

In your Supabase SQL editor/operator migration workflow, apply:

**`backend/supabase/migrations/202610080004_spot_explorations.sql`**

Run once as the trusted project operator, after already-applied0001/0002/0003.
It creates a new table/function; it deliberately fails on an existing object rather
than replacing data or policies. Inspect conflicts—do not drop existing records to
force it through. No migration was executed remotely by the assistant.

No new key or frontend configuration is needed. Reads and sets use the existing
publishable configuration with a caller's Bearer user token, **not** the admin key.
Restart the backend and reload the frontend after setup.

The migration provides:

- `spot_explorations(user_id,spot_id,explored)`, composite key and boolean state only.
- Own-row SELECT/INSERT/UPDATE policies AND current `spot_visible(spot_id)` checks.
  Enrollment, active spot, author enrollment and audience/connection rules apply.
- Narrow column grants, no ordinary DELETE or identifier UPDATE; no anonymous reads.
- `set_spot_explored(uuid,boolean)` security-invoker RPC, fixed empty search_path,
  authenticated-only EXECUTE, identity from auth.uid(), atomic desired-state upsert.
- Foreign-key cascades on actual spot/member deletion. Tombstones/revoked audience
  hide historical marks immediately through visibility policies; they need not erase
  a mark until physical cleanup. Already downloaded values cannot be recalled.

Missing/misconfigured table or RPC returns safe503, not an unexplored false default.
The rest of spot detail/photo/directions remains usable when this control fails.

## 2. Quick browser persistence check

Use a real accessible spot created through the app (or a clearly labelled synthetic
spot for state-only checks). Do not claim exploring a fictional seed destination as
a real outing, and do not remove a real shared spot merely to test cleanup.

1. Sign in as an enrolled account; open spot detail. Find **Explored (self-reported)**.
2. Wait for its independent state load. For a new own mark, expect unexplored.
   Another member having explored it must not change that default.
3. Select **Mark explored**. Wait for saved success; button changes to **Mark unexplored**.
4. Reopen the spot, reload the app, then sign out/in as the same account: true persists.
5. Select **Mark unexplored**; reopen/reload: false persists.
6. Sign in as a different eligible participant. Their own prior state must be shown,
   not the first person's mark. Marking it must not change the first person's state.
7. Open an otherwise-authorized Public spot outside your discovery radius by ID.
   Explored state remains available: radius filters discovery, not detail access.

The button is disabled during loading/saving. No optimistic success. A timeout,
5xx/network failure or malformed write response shows **outcome uncertain** while
retaining the last confirmed value. Explicit **Reload state** is required before
another change; no automatic retries. A reload is a current snapshot, not proof an
in-flight write cannot commit later. Concurrent explicit sets across tabs/devices
are last-committed-write-wins, not automatic toggle/invert operations.

## 3. Direct API and current-access checks

Contract: `GET /spots/<uuid>/explored` and `PUT` same path; Bearer user token privately.
PUT `Content-Type: application/json`, body exactly `{"explored":true}` or false.
Both return200 `{"exploration":{"spotId":"<requested-uuid>","explored":true}}`.
No client user ID, timestamps, query parameters, extra fields or aggregate endpoint.
Browser budgets:30s GET/35s PUT, with5s per Supabase fetch.

Use your existing private API/token tooling or browser network panel; never paste
tokens, keys, real UUIDs or member activity into chat/git/log reports.

| Case | Expected |
| --- | --- |
| Signed out or expired token |401 UNAUTHORIZED, no state served |
| Verified but unenrolled |403 NOT_ENROLLED |
| Owner or enrolled connection on Connections-only spot | Own state allowed |
| Enrolled nonconnection on active Public spot | Own state allowed, including outside discovery radius |
| Nonconnection on Connections-only spot | Neutral404 NOT_FOUND |
| Missing/deleted/tombstoned spot | Neutral404, no historical state served |
| Repeated `PUT {explored:true}` | Same true value, one own composite-key record |
| `PUT {explored:false}` | Own false value; others unchanged |
| Wrong UUID/body/content type/extra fields/query/oversized JSON |400 BAD_REQUEST |
| Missing/grant/schema/provider failure |503 SERVICE_UNAVAILABLE, not a false default |

All responses must have `Cache-Control: private, no-store`. Test two independent
real JWTs against direct table/RPC as well: own records only, spoofed user inserts
denied, no user_id/spot_id UPDATE/DELETE rights, RPC cannot accept a member override.
The API rejects unknown identity fields before writes; hiding a UI control is not
the authorization mechanism.

For revocation, use disposable fixtures: C marks A's Public spot, then A makes it
Connections-only while C is unconnected. C must lose explored read/write and normal
detail/photo access; connected B may retain own access. Tombstoning blocks all
ordinary state access; actual spot deletion removes associated marks. An owner is
not allowed to view a visitor's activity merely because they own the destination.

Navigate to another detail, switch feed/account or sign out while GET/PUT is pending:
late successes AND errors must not alter the new context. Test ordinary photo,
search, directions and sharing remain usable if explored loading fails. A current
404 clears inaccessible detail and refreshes eligibility; auth errors recheck the gate.

## 4. Optional rollback-only SQL/RLS check

Prepared script: **`backend/supabase/check_explored_boundaries.sql`**. Requires four
distinct existing disposable Auth users with **no pilot_members rows**. It temporarily
enrolls A/B/C, leaves D unenrolled, connects A/B, and creates two fictional metadata
spots without Storage objects. All are rolled back, including deliberate revocation,
member deletion and spot-deletion cascades. It never modifies existing pilot users
or spots. Collision guards fail instead of overwriting reserved IDs/photo paths.

From `backend/`, with your privately configured trusted operator connection:

```sh
psql -X -v ON_ERROR_STOP=1 \
  -v member_a=REPLACE_WITH_DISPOSABLE_AUTH_UUID_A \
  -v member_b=REPLACE_WITH_DISPOSABLE_AUTH_UUID_B \
  -v unconnected=REPLACE_WITH_DISPOSABLE_AUTH_UUID_C \
  -v unenrolled=REPLACE_WITH_DISPOSABLE_AUTH_UUID_D \
  -f supabase/check_explored_boundaries.sql
```

The script checks grants/invoker path, simulated authenticated/anonymous roles,
own-state separation, idempotent sets, identifier/other-user write denial,
Public/private/removed/revoked/enrollment boundaries and FK cascades. Uses transaction-
local claims; **not real JWT verification or HTTP/browser evidence**. With ON_ERROR_STOP,
a failed session stops; close it to ensure the uncommitted transaction rolls back.
Never leave a failed transaction open while doing other work. Disposable Auth users
are not created/deleted by this script; clean them up separately through your usual
private operator workflow when no longer needed.

Local structural tests inspect SQL strings, not PostgreSQL execution. No successful
SQL result has been reported yet, so do not call RLS/grants applied or audited.

## 5. Actual local checks and remaining gaps

Combined checks on October8 from each app:

```sh
npm run typecheck && npm run build && npm test
```

- Backend: 8 files / 118 tests passed, including explored route/transport and 3 SQL
  structure checks. Own state is tested with synthetic per-user stores; not real DB
  persistence, privileges, role simulation or deleted-row cascade execution.
- Frontend: 46 tests passed; controller/API coverage includes exact payloads, read-
  unknown versus false, write uncertainty/reconciliation, pending controls and stale
  success/error under detail/account/StrictMode changes. No browser integration suite.
- Frontend static build 3.69s; entry 426.86 kB, workspace 199.74 kB; optimizer workaround
  retained and no >500kB warning. These are build sizes, not device-performance proof.

The user now reports the final response's six activation/check steps passed:
true/false state persists across reopen/reload/sign-out/in, and another eligible
account has independent state. Record this as user-confirmed browser smoke evidence,
including the overall migration activation workflow, not independently inspected SQL.

Still unverified: rollback script/direct table/RPC/grants, broader cross-account
denial, live revocation/tombstone/cascade, failure recovery, phone and real outdoor
return. These are release requirements, not inferred from that smoke or a checkbox.
Reporting/operator removal remains a separate unimplemented slice.

## Rationale

[Supabase Row Level Security: The Policies That Actually Ship SaaS](https://dev.to/ethan__par_ker/supabase-row-level-security-the-policies-that-actually-ship-saas-1ell)
explains USING versus WITH CHECK and warns that an operator/superuser query does not
exercise ordinary-user policies. Its service-role warning supports this slice's
caller-JWT invoker path, not removing the existing separately authorized owner-media
admin adapter. No comments were returned; this is one reference, not proof of RLS.
