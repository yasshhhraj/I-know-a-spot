# Next feature plan — Public discovery, saved radius and manual area

**Status:** Implemented locally on October 8, 2026; historical design below.
Contract: `API_CONTRACT.md`. Migration/live steps: `PUBLIC_DISCOVERY_SETUP.md`.
Backend 86 tests / frontend 32 tests passed; remote SQL and live Public/radius
checks remain pending. No claim that the full pilot is complete.

## Why this is next

The current live slice proves authenticated sharing, a Connections preview, detail,
directions, and owner controls. The next acceptance gap is the product's core
cross-network discovery behavior:

- An unconnected enrolled member can discover an author's **Public** spot.
- Connections-only spots remain absent from Public.
- Public results are filtered by a saved per-user radius around an explicitly
  selected discovery center.
- Connections and Public use one reusable feed/map surface and switch without a
  reload.

Implementing AI before this would create an unauthorized or incorrectly scoped
candidate set. The server must establish feed eligibility and radius filtering
first; a later encoder may rank only those candidates.

This follows PRD FR-03 and FR-08 and the required scope table in
`BUILD_SCOPE_36H.md`. It excludes semantic search, explored state, reports,
native location plugins, geocoding and social connection management.

## User-visible acceptance criteria

1. The enrolled user sees a top-center **Connections / Public** switch above one
   reusable card feed and map.
2. Connections remains newest-first and shows the current user's spots plus spots
   from configured mutual connections. Radius does not affect this feed.
3. Public shows only active `audience='public'` spots by enrolled authors, including
   nonconnections, whose destination is within the viewer's saved radius. Sort by
   straight-line distance ascending, then newest first.
4. Public cards show photo, title, note excerpt, display name, Public badge and
   approximate distance from the selected discovery center. The map pins and cards
   contain the same eligible spot IDs.
5. Profile/settings shows the fixed display name and a labelled radius control from
   **1 to 25 km**, defaulting to the existing saved value (normally 5 km). Saving
   persists only the radius and does not change another member's settings.
6. Public shows an explicitly labelled discovery center. The first implementation
   uses an operator-configured pilot-area fallback and a manual coordinate/map
   picker. Browser device location is optional and should be cut before removing
   manual selection.
7. Changing feed, radius or center cancels/ignores stale requests. A Public empty
   state explains that the user can adjust the radius or area; it never widens the
   query silently.
8. A tile/map failure leaves the eligible list and numeric center controls usable.
   No location permission is required to browse or open directions.
9. A known Public spot outside the current radius can still open by ID; radius is
   discovery filtering, not detail authorization.

## Proposed API contract

Preserve the existing `GET /spots` Connections behavior for compatibility. Extend
the endpoint with an explicit feed query rather than creating a second feed stack:

```text
GET /spots?feed=connections
GET /spots?feed=public&centerLat=<finite>&centerLon=<finite>
Authorization: Bearer <Supabase access token>
```

- `feed` defaults to `connections` for existing clients; accepted values are
  `connections` and `public`.
- Public requires finite `centerLat` in `[-90,90]` and `centerLon` in `[-180,180]`.
  Reject missing/malformed values with `400 BAD_REQUEST`; do not silently use a
  client-supplied radius or a hidden fallback.
- The backend reads `public_radius_km` from the authenticated caller's enrolled
  `pilot_members` row. The client cannot override it. The center is transient
  request state, not a stored member location.
- Connections response remains `{spots:[Spot...]}` sorted newest first.
- Public response remains `{spots:[Spot...]}`, with an optional `distanceKm` on each
  returned Spot. The server sorts by distance ascending, then `created_at desc`,
  then ID descending. Distances are approximate display values, not travel times.
- Every route still verifies enrollment. Public candidates filter active rows,
  enrolled authors and `audience='public'` before distance sorting. Connections
  keeps owner/connection authorization server-side.
- Existing detail and photo routes remain the authorization source of truth. No
  public bucket, signed URL, client owner ID or client radius is introduced.

Add a caller-scoped radius mutation:

```text
PATCH /me
Authorization: Bearer <Supabase access token>
Content-Type: application/json

{"publicRadiusKm": 8}
```

Return the same safe profile shape as `GET /me` with `Cache-Control: private,
no-store`. Validate integer 1–25 both in the route and database. Use the caller's
publishable-key client with its JWT and existing RLS grant; do not use the admin
secret for this personal setting. Invalid/foreign fields return `400`, an
unenrolled caller returns `403`, and provider/schema failure returns `503`.

Before implementation, update `API_CONTRACT.md` with the final names and have the
backend/frontend owners use exactly those shapes.

## Data and backend design

### Migration

Prepare a new operator-run migration after the two existing migrations, for
example `202610080003_public_feed_radius.sql`. Do not edit or silently rerun the
applied migrations.

- Reuse `pilot_members.public_radius_km` and its existing 1–25 check/grant/policy.
- Add a narrow server-side function/RPC for Public listing, such as
  `public.list_public_spots(center_lat, center_lon)`, that reads the caller's
  enrolled radius and enforces `auth.uid()` itself.
- The function must return only the public card/detail columns, never `photo_path`,
  member settings or connection data. Revoke anonymous execution and grant only
  to authenticated users.
- Filter `removed_at is null`, author enrollment, `audience='public'`, and the
  exact geodesic distance `<= radiusKm` inside SQL. The boundary comparison must
  be inclusive.
- Use a numerically safe Haversine/great-circle expression for the small pilot,
  clamping the `acos` input to `[-1,1]` if that form is used. A bounding box may be
  an optional prefilter, never the final authorization/filter condition. Do not
  enable PostGIS or add a vector database for 10–15 spots without evidence it is
  needed.
- If the RPC uses `security definer`, set `search_path` explicitly and keep every
  enrollment/audience/removal predicate in the function. Audit grants and direct
  calls as part of the user-run SQL checklist; service-role reads are not evidence.

### Backend ownership

Backend slice owns:

- Query parsing and finite coordinate validation in `backend/src/app.ts`.
- `SpotStore.list` feed options in `backend/src/spots.ts`, preserving caller JWT
  reads for Connections and using the caller JWT for the Public RPC.
- `PATCH /me` radius validation/update in `backend/src/profile.ts` and its route.
- A small pure distance/coordinate helper if needed for request/display shaping;
  SQL remains authoritative for Public eligibility.
- Safe errors, no raw Supabase messages, no request-body/coordinate logging.

Backend tests should cover:

- Invalid/missing/NaN/infinite/out-of-range center and feed values.
- Caller token is forwarded to reads/RPC; admin credentials are never used for
  Public reads or radius updates.
- Client-supplied radius, owner ID, audience or sorting parameters cannot widen
  eligibility.
- Public response ordering and `distanceKm` parsing.
- Radius update accepts 1, 5 and 25; rejects 0, 26, fractional, string and extra
  fields; does not update another user's row.
- Removed, connections-only, unenrolled-author and unconnected candidates are
  excluded before the response.
- Existing Connections behavior and detail-by-ID behavior do not regress.

## Frontend implementation slices

Keep ownership split so the two agents do not edit the same files:

### Backend builder — `backend/` only

1. Add/agree contract and migration draft; do not apply remote SQL.
2. Implement feed/radius parsing, profile update and store adapters.
3. Add mocked transport/route tests, including inside/on/outside fixtures.
4. Return changed paths, API shapes, test command/results and live SQL gaps.

### Frontend builder — `frontend/` only

1. Extend `spotApi.ts` with feed query construction, `distanceKm` parsing and safe
   radius/profile mutation handling. Do not filter unauthorized cards locally.
2. Refactor the current Connections preview into a reusable `SpotFeed` state that
   takes `mode`, returned spots, loading/error/empty states and selection callback.
3. Add the top-center segmented control with keyboard-visible focus, `aria-pressed`
   state and a single feed/map rendering path.
4. Extend `SpotMap` for multiple pins, selected pin, explicit center and optional
   radius visualization. Keep numeric center entry and list usable when tiles fail.
5. Add a minimal Profile/radius panel. Save with `PATCH /me`; show pending/saved/
   invalid/outage states and keep the previous saved value on failure.
6. Store center only in transient component state. On reload use the labelled pilot
   fallback; do not persist precise device coordinates or request location on mount.
7. Reuse `SpotScope` epochs/abort behavior so feed/mode/center/radius changes cannot
   allow a late response to overwrite current cards or pins.

Frontend tests should cover:

- Query construction includes feed/center but never a client radius override.
- Radius 1–25 validation, save success and failed-save preservation.
- Public response accepts distance values and rejects unsafe/malformed spot data.
- Switching mode cancels/ignores an old response; old cards do not replace current
  cards after center/radius changes.
- Empty Public state differs from Connections empty state.
- Map coordinate normalization and manual-center fallback remain keyboard usable.
- Existing owner controls, protected media and external directions remain unchanged.

Avoid adding a new map library, geocoder, state-management package or location
plugin. The current Leaflet surface and `SpotScope` are sufficient.

## Live acceptance checklist

Use at least four consented pilot identities:

- **A and B:** enrolled and mutually connected.
- **C:** enrolled, not connected to A.
- **D:** authenticated but unenrolled.

Prepare disposable spots at known test coordinates around a labelled pilot center:

1. A creates a Connections-only spot. C does not see it in either Public feed or
   direct photo; B sees it in Connections.
2. A creates a Public spot within C's saved radius. C sees it in Public, not in
   C's Connections feed. The card distance and map/list IDs agree.
3. Set a Public spot just inside, exactly on, and just outside the radius. Confirm
   inside and boundary appear, outside does not. Use the same center and avoid
   rounded display distance for the assertion.
4. Change C's radius to 1, then 25, reload, and verify the saved value persists.
   A's radius and other member settings remain unchanged.
5. Choose a different manual center and verify results change only after explicit
   confirmation. Reload returns to the labelled pilot fallback, not a retained
   precise device location.
6. Deny browser location if the optional shortcut exists. Manual center still works.
   If time is tight, cut this shortcut and retain manual area selection.
7. Switch Connections/Public repeatedly during slow responses. The final selected
   mode must determine visible cards and pins.
8. Change Public to Connections-only as A. C's refreshed Public list/detail/photo
   must no longer expose it; B still has Connections access.
9. As D and signed-out/invalid-token callers, direct feed/radius/detail/photo
   requests fail with the safe auth/enrollment statuses.
10. Block tile requests or simulate a tile failure. Public list, radius controls,
    center inputs and directions remain available without an invented map.

Record safe status codes, count/order/distance observations and device/browser,
not tokens, private coordinates, raw network bodies or account identifiers.

## Execution order and stop rules

1. **Contract review:** settle `GET /spots` query names and `PATCH /me` body before
   parallel code. Stop if the migration cannot enforce radius from the caller's
   saved profile.
2. **Backend authorization first:** add tests and migration draft. Stop if Public
   eligibility is only client-side or if an admin read bypasses caller visibility.
3. **Frontend integration:** implement feed switch/radius/manual center against
   mocked contract. Preserve the working sharing form and owner controls.
4. **Combined local checks:** run both app check commands and `git diff --check`.
5. **User-run remote migration:** apply once, inspect conflicts, configure no new
   secret beyond the existing backend setup, and run the matrix above.
6. **Only after live Public boundaries pass:** begin AI search. AI must consume the
   already-filtered candidate list and never receive coordinates/photos/member IDs.

Hard cuts if time is limited:

1. Cut browser device-location shortcut.
2. Cut radius visualization circle while retaining numeric radius filtering.
3. Keep manual numeric center instead of a more polished area picker.

Do not cut server-side radius filtering, the Public/Connections switch, saved radius,
manual center fallback, stale-response cancellation, or direct authorization tests.

## Expected deliverables

- Updated `API_CONTRACT.md` and `WORKBOARD.md` with final evidence.
- Prepared, unexecuted `202610080003_public_feed_radius.sql` migration.
- Backend route/store/profile tests and frontend feed/radius/stale-response tests.
- `NEXT_FEATURE_PLAN.md` retained as the implementation handoff until the slice is
  completed or explicitly rescheduled.
- User-run live checklist results, including known gaps. No deployment, commit,
  external SQL execution or model download without explicit instruction.

## Community research informing this plan

The plan prefers a simple exact geodesic calculation for this pilot rather than
introducing a GIS stack, while preserving a path to a database geospatial index if
the corpus grows. It also keeps RLS/column grants and the server function as the
security boundary instead of trusting a filtered client response.

### 🌐 Community Wisdom: [PostgreSQL earthdistance](https://dev.to/dshumw/postgres-earthdistance-23g0)
> **Source**: [dshumw](https://dev.to/dshumw)
> **Tags**: `database`, `postgres`, `sql`
>
> The article notes that PostgreSQL's `earthdistance` plus `cube` can support
> nearby searches, with a fast bounding-box prefilter followed by exact distance;
> it also cautions that this is spherical distance, not a replacement for PostGIS.
> For this 10–15 spot pilot, an exact bounded SQL expression is simpler, but the
> extension is a future performance option—not a reason to weaken boundary tests.
>
> 🔗 [Read Full Discussion](https://dev.to/dshumw/postgres-earthdistance-23g0)

### 🌐 Community Wisdom: [Supabase RLS is great. Here's the part you'll still build yourself.](https://dev.to/supero/supabase-rls-is-great-heres-the-part-youll-still-build-yourself-59ea)
> **Source**: [supero](https://dev.to/supero)
> **Tags**: `webdev`, `database`, `security`, `saas`
>
> The author emphasizes that RLS is a strong row boundary, but it does not replace
> column grants, policy audits or careful handling of service-role bypasses. That
> supports returning only card columns, keeping the admin key out of Public reads,
> and testing ordinary user-token RPC/Data API behavior separately from operator
> inspection.
>
> 🔗 [Read Full Discussion](https://dev.to/supero/supabase-rls-is-great-heres-the-part-youll-still-build-yourself-59ea)
