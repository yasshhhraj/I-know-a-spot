# API contract — pilot authentication and spot sharing

Scope: pilot authentication plus spot creation/viewing and owner corrections.
The full Connections/Public discovery switch, Public radius endpoint, explored
records, reports, and AI are separate slices. A Connections-only preview list
exists to test sharing between the pilot accounts; no radius-free Public feed.

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

### GET /spots — Connections preview

200 `{spots:[Spot...]}`: newest-first active spots by caller and enrolled connected
authors only, including their public posts, up to 50 for the small pilot. This is
not global Public discovery. The backend filters authors, not just client cards.

### GET /spots/:id

200 `{spot}` for an active, accessible spot. Owner and enrolled connections may
read connections-only spots; all enrolled accounts may open public spot details
by ID. No general Public listing in this slice; future discovery will enforce radius.
404 `NOT_FOUND` for unknown/deleted/inaccessible spots without revealing existence.

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
