# Private reporting and protected removal

Scope: PRD FR-09, no dashboard/free text/automatic thresholds/notifications.
Contract: API_CONTRACT.md, POST /spots/:id/reports and local operator tooling.

## Acceptance and ownership

- An enrolled viewer reports a currently accessible active spot with one of four
  fixed reasons and receives validated acknowledgement. Invalid/inaccessible
  requests fail safely; identical explicit retries store just one record.
- Reports are sealed even from reporter/owner ordinary SQL roles. RPC uses
  auth.uid/current spot visibility and returns no report records or count.
- Protected local CLI lists pending reports, explicitly marks a report reviewed,
  and removes any spot via the existing tombstone/media-cleanup path. No web route.
- Pending/uncertain requests are truthful; stale success/error cannot cross
  account/detail/StrictMode lifecycle; form is independent of other detail actions.
- Removed spots fail subsequent feed/map/detail/media/search/explored access;
  cleanup errors leave tombstones hidden. Previously delivered copies remain.

Lead: shared contract, migration0005, rollback-only direct-role boundary script,
setup/coordination docs and combined review/checks.
Backend-builder: backend/src reporting adapter/routes/operator CLI and tests only.
Frontend-builder: frontend/src detail form/API/controller and tests only.
No nested delegation, dependencies, private env reads, remote SQL or live removal.

## Data and trust boundary

spot_reports: id UUID, spot_id UUID (retained after physical spot removal),
reporter_id FK pilot_members ON DELETE CASCADE, reason fixed enum CHECK,
status pending/reviewed, created_at. Unique reporter/spot/reason.
No ordinary table privileges/policies. Existing service role/operator may inspect.
Definer RPC has fixed empty search_path, schema-qualified objects, auth.uid-derived
identity, current spot_visible check and literal reason allowlist. No arbitrary
SQL/identifiers/lookup or duplicate-existence oracle. Empty result for inaccessible
target; database failure is never success. Helper returns only spot_id/reason.

CLI uses existing server configuration and privileged key validation. Explicit
confirmation flags required for review/removal, bounded requests, safe error
messages; no auto retry or credential arguments. Removal fetches real owner and
reuses SpotStore.remove rather than weakening HTTP owner checks. Same process
search invalidation is unnecessary for CLI: API search rechecks current feeds.

## Evidence to collect

Local: both apps' typecheck/build/tests, strict parsing/caller identity/RPC results,
no-table-read adapter, duplicates, authorization/final recheck, operator fail-closed
parsing/credential requirements/tombstone retry, stale form response tests and real
MiniLM regression. SQL static tests are structural only.
User-run: apply0005 once after0001–0004; report twice, inspect exactly one private
record; owner/reporter cannot read queue/direct-write it; anonymous/unenrolled/
unconnected private targets denied. Review only operator; remove a disposable
spot and test each ordinary access path and explicit pending-cleanup retry.
Rollback direct-role script uses four disposable Auth users and fictional metadata,
no Storage objects; no live execution by assistant.

## Research

Cenk KURTOĞLU's RLS leak article distinguishes policy intent from grants/role
blast radius. Its comment by Elijah Brown cautions that even narrow helpers can
be enumeration oracles. Here the RPC returns only an acknowledgement for a
currently accessible spot; no report existence/count/identity or unauthenticated
helper. This is design guidance, not a security audit:
https://dev.to/cekuu35/3-supabase-rls-leaks-i-found-in-production-apps-this-week-and-the-30-second-check-for-each-4pk0

## Implemented local evidence — October8,2026

Both bounded parts integrated; backend11 files/137 tests and frontend56 tests,
typecheck/build passed. Lead added structural migration/check-script tests and
simulated-RLS integration of warmed search cache, CLI tombstone/pending cleanup
and all ordinary read/explored/report route exclusions. Real MiniLM synthetic
comparison remains11/11 positive versus7/11 lexical; negative empty. Setup guide:
REPORTING_SETUP.md. Remote SQL, live queue/persistence/removal/Storage/RLS/browser/
phone checks remain user-run; do not call the pilot finished.
