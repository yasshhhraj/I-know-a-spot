# Public discovery — user-run setup and verification

Connections/Public feeds, manual discovery center and saved radius are implemented
and locally checked. **The new migration and live Public-feed checks have not been
executed by the assistant.** Existing sharing/auth remain available independently.

## 1. Apply the new migration once

In your existing Supabase project, inspect and run the full file in SQL Editor
as the operator, after the auth and spots/Storage migrations:

`backend/supabase/migrations/202610080003_public_feed_radius.sql`

It creates `public.list_public_spots(p_center_lat, p_center_lon)`, a narrowly
granted function that:
- Uses `auth.uid()` and the enrolled caller's saved `public_radius_km`.
- Returns only active Public spots by enrolled authors, including nonconnections.
- Filters with inclusive great-circle distance `<= radius` on the server.
- Orders nearest first, then newest, then ID descending; returns at most 50.
- Returns distance/card columns, never Storage paths or private profile settings.
- Denies anonymous execution and checks enrollment even on direct RPC calls.

The function is security-definer, so its explicit caller/enrollment/audience/
removal checks are essential. Do not remove them or broaden execution grants.
No PostGIS extension, new bucket, new credential or new package is needed.
On an existing-function/migration conflict, stop and inspect history rather than
rerunning earlier migrations or replacing policies blindly. Without this migration,
Public requests return safe 503; Connections and existing detail access can continue.

## 2. Restart and choose an area

Restart the backend and frontend with `npm run dev` from each folder in separate
terminals. Open **http://localhost:5173** and sign in as an enrolled account.

1. Connections opens first. Select **Public** in the top-center switch.
2. If no pilot center is configured, type latitude/longitude around the area you
   want to browse. The map can preview the typed point; select **Confirm discovery
   center** to change the actual query. Map panning/clicking alone does not change
   the confirmed area.
3. Open **Profile & radius**, set a whole number from **1 to 25 km**, then Save.
4. Return to Public. Only posts within the saved radius of the confirmed center
   appear. Distances are approximate straight-line distance, not route length/time.

No device location is requested. The center is transient UI/request state, never
a stored member location. Reload discards manual center; saved radius persists.

Optional labelled pilot fallback in **frontend/.env.local**, configured privately
by the operator (values are public browser configuration, not a live user position):

```dotenv
VITE_PILOT_CENTER_LAT=REPLACE_WITH_PILOT_AREA_LATITUDE
VITE_PILOT_CENTER_LON=REPLACE_WITH_PILOT_AREA_LONGITUDE
```

Replace both with finite numeric coordinates and restart Vite. Invalid/missing
values require manual choice; `[0,0]` is never silently a confirmed discovery
center. A world overview in the add-spot picker is only a viewport, not a saved pin.

## 3. Quick live acceptance test

Use your existing uploader A, connected B and unconnected enrolled C. Use only
appropriate consented test spots and keep private coordinates/account IDs out of
chat and reports.

- As C, select Public and confirm a center near A's Public spot. It should appear
  with its photo/distance and corresponding map pin; it remains absent from C's
  Connections feed. A's Connections-only spot must not appear in Public.
- As B, Connections includes A's Public and Connections-only posts, newest first,
  independent of the radius. Card/pin selection opens the same detail.
- As C, save a radius, reload, and inspect Profile: the saved radius must persist.
  Pick the area again if no pilot fallback is configured. A/B settings must not change.
- Move the confirmed center or narrow radius so a Public spot is outside it.
  It must disappear from Public, but still open by its ID when otherwise authorized.
- Stage another numeric/map center without confirming: results still use the old
  confirmed area. Confirming refreshes them. An empty feed must not widen silently.
- Switch feeds quickly while requests are loading. Only the final selected feed's
  cards and pins should appear; no old private cards should linger in Public.
- As A, change Public → Connections-only. C's fresh Public/detail/photo requests
  must stop exposing it; B retains Connections access. Repeat after deletion.
- Signed-out and unenrolled callers must not read either feed or change radius.
  Direct PATCH /me cannot accept someone else's ID, enrollment, name or radius
  outside 1–25. Client-supplied radius in the Public query is rejected, not honored.
- Tile failure must leave the list and numeric controls usable. Mobile tests remain
  pending until an authorized reachable/secure frontend/backend setup exists.

The API shapes are in `API_CONTRACT.md`: `GET /spots?feed=public&centerLat=…&centerLon=…`
and `PATCH /me` with exactly `{"publicRadiusKm":8}`. Reads/settings use caller JWT
and publishable configuration; spot writes still use the backend-only admin key.
Response logs exclude the query, bodies and discovery coordinates.

## 4. SQL boundary checks — optional operator workflow

Prepared rollback-only script:

`backend/supabase/check_public_feed_boundaries.sql`

Use **three distinct disposable existing Auth users with no member rows** and
a privately configured operator psql connection. From `backend/`:

```sh
psql -X -v ON_ERROR_STOP=1 \
  -v member_a=REPLACE_WITH_DISPOSABLE_AUTH_UUID_A \
  -v member_b=REPLACE_WITH_DISPOSABLE_AUTH_UUID_B \
  -v outsider=REPLACE_WITH_DISPOSABLE_AUTH_UUID_C \
  -f supabase/check_public_feed_boundaries.sql
```

This uses psql variable syntax, not a paste-ready SQL Editor script. Keep operator
credentials out of commands/source/chat. Success rolls back fixtures; with
ON_ERROR_STOP a failing psql session closes and rolls back the open transaction.
It refuses existing fixture member rows or unrelated Public posts within 25 km
of the synthetic `[0,0]` area; use an isolated test project if contaminated.

It tests simulated authenticated/anonymous database roles, inside/on/outside radius,
saved settings, private/removed/de-enrolled authors, ordering/cap and function grants.
It creates **no Storage objects**, so it does not prove photo delivery or real JWT
transport. Near-boundary display rounding is not the comparison; SQL uses full
precision distance. Real-user RPC/API/Storage checks remain separately necessary.

## Evidence and limitations

At completion of the Public/radius slice, combined local checks were backend
typecheck/build and **86 tests**; frontend
typecheck/build and **32 tests**, all passed. Frontend static build: 3.05s, entry
426.86 kB and workspace 188.47 kB; tree-shaking workaround retained.
StrictMode feed setup/cleanup replay and stale-response suppression are covered by
dependency-free lifecycle tests, not a browser integration suite. SQL tests locally
check migration/script structure and mocked transport, not PostgreSQL execution.

No live migration, browser/Leaflet, true radius-boundary/RLS or phone check is marked
passed. No installation, private env read, model download, deployment or commit was
performed for that slice. MiniLM search is now implemented and checked locally;
see SEMANTIC_SEARCH_SETUP.md and SEMANTIC_SEARCH_EVALUATION.md. Current user-reported
Public/radius results and remaining live audits are in WORKBOARD.md. Explored state
is implemented with listed persistence/two-account smoke checks user-confirmed;
see EXPLORED_SETUP.md. Reporting/operator CLI is locally implemented; see
REPORTING_SETUP.md for user-run migration0005 and live private-queue/removal checks.
Native wrapping remains unimplemented.
