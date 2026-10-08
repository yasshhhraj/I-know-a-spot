# Reporting and operator removal — user-run activation

PRD FR-09 implementation. Contract: [API_CONTRACT.md](API_CONTRACT.md).
Plan: [REPORTING_PLAN.md](REPORTING_PLAN.md). No moderator dashboard/HTTP API.

## What is implemented, and what is not proved

- Detail offers four fixed reasons; success follows a validated acknowledgement.
  No free text, counts, public reports, automatic takedown or safety verdict.
- Caller-JWT API checks enrollment/current visibility before and after the narrow
  RPC. Radius restricts discovery, not reporting an otherwise accessible Public ID.
- Report table has no ordinary grants/policies, including reporter/owner reads.
  RPC derives reporter with auth.uid(), checks spot_visible and atomically
  deduplicates reporter/spot/reason without exposing a duplicate flag.
- Local operator commands require a validated backend privileged key, never a
  participant's JWT. List/review/remove are NOT HTTP routes. Removal derives the
  real owner and uses existing tombstone-first Storage/database cleanup.
- Reports survive spot deletion as private review evidence (UUID, not copied
  note/photo/pin); reporter-member deletion cascades their reports. Status is
  pending/reviewed; removing a spot does not implicitly mark reports reviewed.
  Limit retention to this pilot; operator privately purges when no longer needed.
- Local mocked tests and structural SQL checks do not prove applied grants/RLS,
  real persistence, Storage erasure, browser form layout or phone behavior.
  No migration or live operator removal has been run by the assistant.

## User-reported live smoke evidence

The user reports completing all five activation/check steps from the implementation
handoff and explicitly running the operator delete command: all worked as expected,
with no effect on other spots. This covers the listed migration/restart/report/
same-reason dedup/private queue/check workflow as an overall user report; separate
SQL/CLI receipts and individual direct-route/Storage checks were not inspected.
This is live smoke evidence, not an independent RLS/Storage audit, physical-media
erasure proof, controlled cleanup-failure test or phone/outdoor validation.

Later validation report: tested post-delete app/API paths and failure/stale-response
checks are as expected; phone flow/camera fix works and a real outing/real-note
search are done. Direct database/Storage checks were explicitly skipped. Do not
include those direct checks in the reported post-delete pass or infer physical
Storage erasure/controlled-cleanup-failure success from this aggregate report.

## 1. Apply migration0005 once

Prerequisites: earlier0001–0004 migrations and existing working spot visibility/
protected Storage setup. As the trusted database operator, privately apply:

`backend/supabase/migrations/202610080005_spot_reports.sql`

Use your existing SQL editor/migration workflow. Do not paste credentials, real
reports or member IDs into chat, screenshots or repository files. This migration
creates a new table/function; rerunning it is intentionally not a silent upsert.
On an existing-object conflict inspect the actual schema rather than overwriting.
Missing migration produces503, never a fake successful submission.

Backend reporting needs only existing URL/publishable key and caller JWT. The
local operator separately needs existing server-only `SUPABASE_SECRET_KEY`, or
supported genuine service-role JWT fallback. No new key or VITE_ value is needed.
Keep private configuration in backend/.env or protected process environment;
never enter keys as command arguments. Do not run privileged tooling on an
untrusted/shared machine or expose that credential to enrolled participants.

## 2. Restart/reload and try the form

After updating code, restart backend/dev and reload the frontend. For production
run the newly built bundle/API. From each respective folder:

```sh
npm run typecheck
npm run build
npm test
```

1. Open a real disposable spot you can access. Pick a reason and submit; expect
   **Report received for private operator review**. Directions/explored remain
   separate. No report outcome/status/count appears publicly.
2. Reopen the same detail and explicitly submit the same reason. Operator should
   privately see exactly one matching reporter/spot/reason row, not two.
3. Submit a different reason; that is deliberately a separate report. Another
   eligible member's report is also independent. Neither gains queue access.
4. Public detail outside your saved radius can still be reported. Unconnected
   Connections-only, removed/missing, signed-out and unenrolled requests must fail.
5. On timeout/network/5xx/malformed response, do not assume failure/success. The
   form preserves the reason and offers explicit same-reason retry; database
   uniqueness makes that retry safe. There is no automatic retry.
6. Switch account/detail or leave while pending; old success AND errors must not
   affect the new screen, including access-recheck/missing callbacks.

## 3. Privately review reports — trusted local terminal only

From **backend/** after `npm run build`:

```sh
node --env-file-if-exists=.env dist/operator.js list
```

Outputs at most50 pending records, oldest-first then ID, as JSON lines: private
report/spot/reporter IDs, reason, status, created_at. Empty output with exit0 means
no pending reports. Do NOT save this output in git/public logs or share it as demo
evidence. This is a bounded pilot queue, not pagination/full moderation software.

Privately inspect the indicated spot using existing trusted Supabase operator
tools (spot row and private Storage object) or an otherwise-authorized app account.
Do not make the bucket public, mint broadly shared media URLs, or change pilot
enrollment/connections just to obtain access. Do not infer safety from a report.

After deliberate review, substitute a report UUID only in your private terminal:

```sh
node --env-file-if-exists=.env dist/operator.js review <report-uuid> --confirm-review
```

Replace angle-bracket placeholders before running; they are not literal shell
arguments. Marks this pending report reviewed only, does not remove content.
Already reviewed/missing returns nonzero; no invented successful action. Repeated
identical submissions do not reopen a reviewed report. If a response is uncertain,
inspect the private row/status before deciding whether another command is needed.

## 4. Deliberately remove a disposable spot

This is consequential. Privately verify the exact spot ID and correct project
before running; there is no undo/restore operation. Replace placeholder locally:

```sh
node --env-file-if-exists=.env dist/operator.js remove <spot-uuid> --confirm-remove
```

The command derives the owner, tombstones first, removes canonical private image,
then deletes metadata. It does not accept client owner IDs. Successful cleanup
prints **Spot removed and cleanup completed**, exit0. Missing returns nonzero.
`Spot hidden; media cleanup pending` means the tombstone remains; do not claim the
object is erased. After private inspection, explicitly rerun the same confirmed
command to finish cleanup. No blind/automatic retry or restore on any failure.
If tombstone outcome is uncertain, inspect removed_at/Storage privately first.

Before marking the pilot ready, use actual separate caller tokens to verify:

| Ordinary access after operator removal | Expected |
| --- | --- |
| Connections and Public browse/map | No removed spot after fresh request |
| POST /spots/search, both relevant feeds | No removed candidate, even previously cached |
| GET /spots/:id and /photo | Neutral404; no new bytes |
| GET/PUT /spots/:id/explored | Neutral404 |
| POST /spots/:id/reports | Neutral404, even identical old reason |
| Direct spots SELECT / Storage download | Inaccessible under caller RLS |
| Ordinary direct report-table SELECT/INSERT/UPDATE/DELETE | Denied, even reporter/owner |
| Ordinary DELETE /spots/:id for another owner's post | Neutral404; reporting grants no removal |

Test both full cleanup and a controlled media-cleanup failure in a disposable test
environment. Do not break production Storage settings to simulate it. Tombstones
must exclude content before cleanup. Previously returned cards/photos/downloaded
copies cannot be recalled. The CLI does not evict another API process's vector
cache; current feed eligibility/text revalidation prevents those entries granting
access. Physical deletion cascades explored marks, but retains private reports.

## 5. Optional rollback-only direct-role script

`backend/supabase/check_reporting_boundaries.sql` requires four DISTINCT existing
disposable Auth accounts with no pilot-member rows. It refuses existing fixture
spot/report/media collisions, adds fictional metadata only, simulates role/JWT
claims and ALWAYS rolls back. Use a trusted operator psql connection configured
privately, not a connection string/password in arguments or source. From backend/:

```sh
psql -X -v ON_ERROR_STOP=1 \
  -v member_a=REPLACE_WITH_DISPOSABLE_AUTH_UUID_A \
  -v member_b=REPLACE_WITH_DISPOSABLE_AUTH_UUID_B \
  -v unconnected=REPLACE_WITH_DISPOSABLE_AUTH_UUID_C \
  -v unenrolled=REPLACE_WITH_DISPOSABLE_AUTH_UUID_D \
  -f supabase/check_reporting_boundaries.sql
```

Checks no ordinary table privileges/policies, function ACL/path/output, current
audience/enrollment, caller-derived identity, duplicate and different reasons,
reviewed duplicate preservation, private queue, reporter mutation denial,
revocation/tombstone and retention/member cascade. No actual JWT delivery or
Storage objects; pair it with the real-token/API/media matrix above. SQL has only
been structurally checked locally, not executed on PostgreSQL by the assistant.

Report safe pass/fail/status outcomes only. Keep credentials, filled-in scripts,
private spot/member identifiers and queue records out of this repository.
