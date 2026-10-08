# API contract — pilot authentication, spot sharing, Public discovery and search

Scope: pilot authentication, spot creation/viewing/owner corrections, Public
discovery/radius, semantic search and per-user explored state. Reports remain
separate. Contracts below are agreed for their bounded implementations;
implementation/check evidence belongs in WORKBOARD.md.

## GET /me

Request: `Authorization: Bearer <Supabase user access token>`.
The public API key alone is not a user token. Backend validates identity with
Supabase Auth, then reads the caller's row under that user's database/RLS context.
Never trust an owner ID passed in a query/body or create a shared mutable user client.

200:

```json
{"profile":{"id":"00000000-0000-4000-8000-000000000001","displayName":"Pilot member","publicRadiusKm":5}}
```

Radius is an integer in 1–25 km; profile is returned only for an enrolled account.
Email, tokens, keys, connection lists, and other users' settings are not returned.

Error envelope: `{"error":{"code":"CODE","message":"Safe user-facing message"}}`.

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | UNAUTHORIZED | Missing/malformed header or invalid/expired user token |
| 403 | NOT_ENROLLED | Verified identity has no enrolled pilot profile |
| 503 | SERVICE_UNAVAILABLE | Missing integration configuration, provider/network failure, or profile/schema lookup failure |

Auth/profile responses use `Cache-Control: private, no-store`. No raw upstream
errors, token/header values, or credentials in responses/logs. A temporary outage
must not be represented as invalid credentials or enrollment denial.

## Supabase schema and settings

- `public.pilot_members`: `user_id` (auth user UUID primary key), `display_name`,
  `enrolled` (default false), `public_radius_km` (integer default 5, bounds 1–25).
- `public.connections`: ordered `member_a`, `member_b` pair referencing member
  rows; no self-pairs or duplicate/reversed pairs. Operator seeds consented pairs.
- Authenticated users read their own member row, including enrollment status.
  They cannot insert/delete members, change enrollment/name, or create connections.
  If radius UPDATE is granted, restrict it to that column and own enrolled row.
- Connection SELECT only for an enrolled participant in the pair; no client writes.
- Anonymous access denied. The publishable key is not an enrollment mechanism.
- SQL migration and boundary-check scripts are versioned under backend/; execution
  and account creation remain user-run. No service-role key is required by `/me`.

Active backend env: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
Frontend env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_API_BASE_URL`. `/me` does not use a service-role key. Spot writes require a
separate server-only admin credential as described below.

## Browser flow

Use Supabase email/password sign-in for pre-created accounts, getSession only to
restore local session state, and `/me` to verify access. Watch auth changes without
awaiting Supabase operations inside its event callback. Cancel/invalidate late
profile requests on token/session changes and sign-out. Hide previous profile
immediately; do not let a stale response authorize the next account.

Sign-out uses local-session scope. Show distinct configuration, verifying,
sign-in, enrolled, denied, expired-session, and retryable outage states. No signup
UI or public account creation. Never retain passwords in app storage or log them.

## Spot-sharing contract

All endpoints require an enrolled caller verified like `/me`. Never trust owner
IDs from clients. Reads/downloads use a fresh publishable-key client with the
caller JWT and RLS. Writes use a separate backend admin client only after verified
enrollment and explicit owner checks; no direct client raw-upload or spot-write grants.

Server credential: prefer `SUPABASE_SECRET_KEY=sb_secret_...`; a genuine legacy
`SUPABASE_SERVICE_ROLE_KEY` may be supported backend-only. Neither is accepted
as the publishable key. Missing/invalid admin configuration gives safe 503 on
mutations; `/me` and configured reads can continue. No credential values in logs.

### Spot representation

```json
{"spot":{"id":"00000000-0000-4000-8000-000000000010","ownerId":"00000000-0000-4000-8000-000000000001","authorName":"Pilot member","title":"Patterned doorway","note":"A carved door visible from the public pavement.","audience":"connections","latitude":0,"longitude":0,"accessConfirmed":true,"accessNote":"View from the pavement only.","createdAt":"2026-10-07T00:00:00Z","updatedAt":"2026-10-07T00:00:00Z","photoUrl":"/spots/00000000-0000-4000-8000-000000000010/photo"}}
```

Example coordinates are fictional, not a proposed pilot spot. Do not return
private bucket URLs, raw storage keys, signed URLs, or original photo metadata.
Frontend fetches photoUrl with Bearer auth as a blob, displays a local object URL,
and revokes it on unmount/account change. A plain public `<img src>` is not access control.

### POST /spots — multipart

- Exactly one `data` field containing JSON and one `photo` file, in either order.
- Data: `{title,note,audience,latitude,longitude,accessConfirmed,accessNote}`.
  title 1–80 chars, note 1–500, accessNote 0–200, audience connections/public,
  finite latitude -90..90, longitude -180..180, accessConfirmed must be true.
  Owner, ID, author, photo path and status are server-derived, not client fields.
  Text limits count Unicode code points. Browser HTML maxLength controls remain
  conservative UTF-16 limits; parsed server responses accept the full contract.
- Maximum input photo 10 MiB; validated JPEG/PNG/WebP bytes and declared type;
  no SVG, HEIC, video, animation/multipage, arbitrary file extension trust, or EXIF pin.
- Backend decode bounds: 20 million pixels. Normalize orientation, resize inside
  1600×1600 without enlargement, and encode fresh WebP with Sharp. Store only
  the clean derivative; tests inspect the emitted bytes for metadata removal.
- Success 201 `{spot}`. Do not automatically retry mutation on network/timeout:
  result may be uncertain. Keep form data, reload list, and ask user to inspect
  whether their spot was saved before explicitly submitting again.

### GET /spots — Connections/Public feed

Request: `Authorization: Bearer <Supabase user access token>`.

- `GET /spots` or `GET /spots?feed=connections`: newest-first active spots by
  caller and enrolled connected authors only, including their public posts, up to
  50 for the small pilot. The backend filters authors, not just client cards.
- `GET /spots?feed=public&centerLat=<lat>&centerLon=<lon>`: active public spots
  by enrolled authors, including nonconnections, whose destination is within the
  authenticated caller's saved `public_radius_km`. The center is transient request
  state and is never persisted or sent to the model. Sort nearest first, newest on
  ties, then ID descending. Radius filtering is server-side and inclusive.
- `feed` accepts only `connections` or `public`. Public requires finite
  `centerLat` in `[-90,90]` and `centerLon` in `[-180,180]`. Missing, malformed,
  or extra feed values return `400 BAD_REQUEST`; the server never accepts a
  client-supplied radius or silently widens an empty result.

200 `{spots:[Spot...]}`. Public spots include `distanceKm` (finite nonnegative
number) for display; Connections spots omit it. Both feeds are capped at 50.
Connections-only content is never a Public candidate. Direct detail-by-ID remains
radius-independent for an otherwise authorized active Public spot.

### POST /spots/search — read-only semantic search

Bearer authentication and enrollment required; JSON body exactly:

```json
{"query":"somewhere tucked away with interesting textures","feed":"connections"}
```

Public requires `centerLat` and `centerLon` as finite numbers with the same bounds
as listing. Connections forbids center fields. No query-string parameters, unknown
body keys, client radius, owner IDs, candidate IDs or model override. Query is a
string trimmed for use, at most 200 Unicode code points; body limit 2 KiB. No
query/body/coordinate/token logging. Request text is not placed in a URL.

200:

```json
{"mode":"semantic","spots":[],"candidateLimit":50,"emptyReason":"no_matches"}
```

- `mode: "semantic"` for nonempty queries: up to three existing `Spot` objects,
  original notes and authorized photo endpoints, Public `distanceKm` preserved.
- `mode: "browse"` for empty/whitespace queries: ordinary selected feed up to 50,
  no encoder call. Both paths enforce current caller-JWT feed/audience/removal rules.
- `candidateLimit` is always 50: search covers the existing newest Connections or
  nearest Public window, not unlimited history. Public uses the saved radius; no
  widening to fill results. Empty candidate set requires no encoder invocation.
- `emptyReason` is present only for an empty list: `no_candidates` or `no_matches`;
  browse can use only `no_candidates`. Clients explain the selected-feed context.
- No vectors, scores/confidence percentages, generated explanations or query echo.
- Semantic ranking receives only eligible title/note text and query; re-read the
  eligible feed before responding and reject changed text/inaccessible candidates.
  Cache entries never grant access. Concurrent updates after the final read remain
  possible, as with ordinary feeds; direct detail/photo always recheck access.
- All success/errors use `Cache-Control: private, no-store`.

Errors retain the safe envelope: 400 `BAD_REQUEST` (including malformed/oversized/
wrong-content-type body), 401 `UNAUTHORIZED`, 403 `NOT_ENROLLED`, 503
`SERVICE_UNAVAILABLE` for upstream auth/feed failures. Search additionally uses
503 `SEARCH_UNAVAILABLE` for model/processing/overall deadline failure and 429
`SEARCH_BUSY` for bounded capacity. No automatic retry or save-uncertain messaging:
POST here is read-only. Frontend search timeout 45s; overall backend deadline 40s,
inference stage 5s. Timed-out native work holds its capacity permit until settled.

MiniLM is backend-local, pinned q8 CPU, mean pooled and normalized, 256-token cap.
Derived vectors are bounded in-memory text-version entries, not database records.
No search migration is required; existing spot rows become searchable on demand.
Missing weights/failure must not break ordinary browsing, sharing or directions.
Model setup and actual evaluation are documented in SEMANTIC_SEARCH_PLAN.md and
SEMANTIC_SEARCH_SETUP.md. Release relevance thresholds require corpus evaluation,
not an invented probability/confidence interpretation.

### PATCH /me — saved Public radius

Request: `Authorization: Bearer <Supabase user access token>`, JSON body exactly
`{"publicRadiusKm":1}` with an integer from 1 through 25.

200 returns the normal `{profile}` shape with the new saved radius and
`Cache-Control: private, no-store`. The update uses the caller JWT and existing
RLS, never the server admin credential. Extra/unknown fields, non-integers and
out-of-range values return `400 BAD_REQUEST`; auth/enrollment/provider errors
retain the existing 401/403/503 envelope.

### GET /spots/:id

200 `{spot}` for an active, accessible spot. Owner and enrolled connections may
read connections-only spots; all enrolled accounts may open public spot details
by ID regardless of the current discovery radius. Public listing enforces the
saved radius; detail authorization remains based on enrollment/audience/removal.
404 `NOT_FOUND` for unknown/deleted/inaccessible spots without revealing existence.

### GET /spots/:id/explored and PUT /spots/:id/explored

Require verified enrolled caller and current access to the active spot. Public
detail/explored access remains radius-independent; connections-only follows the
usual owner/mutual-connection rules. This concerns the viewer's own private state,
not the spot owner's state or a verified physical visit.

PUT requires `Content-Type: application/json` and exactly `{"explored":true}` or
false, with a 2 KiB body bound. GET has no body/query; both forbid query parameters,
client user IDs and unknown fields. Set a desired boolean, never invert server state.

200 for both: `{"exploration":{"spotId":"<requested-uuid>","explored":true}}`.
GET returns false for an absent own record only after a successful authorized table
query; missing migration/schema/provider failure is503, not a false default. The
response exposes no user IDs, timestamps, other participants' marks or public counts.

Errors:400 BAD_REQUEST invalid ID/body/content type,401 UNAUTHORIZED,403 NOT_ENROLLED,
neutral404 NOT_FOUND inaccessible/deleted/revoked spot,503 SERVICE_UNAVAILABLE
configuration/schema/provider failure. All success/errors use private,no-store.

New user-run migration0004: composite-key private `spot_explorations`, narrow grants,
own/current-spot RLS and authenticated-only security-invoker `set_spot_explored` RPC.
The backend uses a fresh publishable-key client with caller JWT, never admin fallback.
Auth.uid() derives RPC identity; only explored may update. GET/PUT surround the
operation with current spot authorization reads. Same-boolean repeated PUT is
idempotent; concurrent clients' explicit sets are last-committed-write-wins.
Tombstones hide marks via visibility; final spot deletion cascades records.

Frontend loads detail-state separately, uses30s GET/35s PUT budgets, disables pending
controls, and changes displayed state only on validated success. Uncertain writes
offer explicit Reload state before another change; no blind/automatic retry and no
claim a snapshot proves an in-flight write failed. Late responses after navigation/
account changes are discarded. No explored data is sent to MiniLM or changes feeds.
Migration and direct-user checks: EXPLORED_SETUP.md. Remote execution remains user-run.

### GET /spots/:id/photo

Recheck current audience/removal/enrollment on every request; return clean WebP
bytes with `Content-Type: image/webp`, `Cache-Control: private, no-store` and
`X-Content-Type-Options: nosniff`. Authenticated private Storage SELECT must obey
equivalent spot visibility rules. No presigned bearer URLs in this slice.

### PATCH /spots/:id

JSON with the full editable metadata object used in POST's data field (no photo).
Only owner may edit. 200 `{spot}`. Owner/public-to-connections changes apply to
all subsequent direct reads and photo access. Already downloaded copies cannot
be recalled; do not promise revocation of another device's existing image memory.

### DELETE /spots/:id

Only owner. Hide/tombstone first so RLS/app reads immediately fail, then remove
photo object and finalize deletion. 204 on complete cleanup. If cleanup fails,
503 `MEDIA_CLEANUP_PENDING`: spot stays hidden and owner can explicitly retry
deletion; never restore visible content or claim photo bytes were deleted.
Creation attempts orphan cleanup only on definitive PostgreSQL data/constraint
rejection with a confirmed absent row. Ambiguous insert outcomes retain the photo:
an immediate absent lookup does not prove rollback. Leftover objects without an
active authorized spot are unreadable to ordinary clients under the verified
policies and require deliberate operator inspection/cleanup. No idempotency key
or distributed transaction exists; explicit resubmission may create duplicates.

### Errors and storage schema

Use the existing safe `{error:{code,message}}` envelope:
- 401 UNAUTHORIZED / 403 NOT_ENROLLED as for /me.
- 400 BAD_REQUEST for invalid fields, coordinates, multipart, or IDs.
- 404 NOT_FOUND for inaccessible/nonexistent/non-owned mutation targets.
- 413 PHOTO_TOO_LARGE; 415 UNSUPPORTED_PHOTO.
- 503 SERVICE_UNAVAILABLE / MEDIA_CLEANUP_PENDING for unavailable operations.

New migration: active/tombstoned `public.spots`, explicit client SELECT-only grants,
current-user enrollment/connection visibility helpers, private `spot-photos`
bucket, audience-aware Storage SELECT, and denial of ordinary client mutations
for this bucket. Do not weaken other buckets or trust broad pre-existing policies;
use restrictive guards for this bucket when needed. Operator executes migration;
assistant prepares/tests local code only. Remote storage/RLS remain unverified.
