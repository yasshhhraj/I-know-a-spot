# Spot sharing — user-run setup and live checks

The sharing slice is implemented and locally checked, **not live-verified**.
No SQL, Storage configuration, accounts, private env files, or deployments were
changed by the assistant. Apply external changes yourself after inspection.
See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the prerequisite auth schema.

**Later slice:** Connections/Public feed, radius and manual center are now
implemented locally. The original preview instructions below describe the sharing
slice; use [PUBLIC_DISCOVERY_SETUP.md](PUBLIC_DISCOVERY_SETUP.md) for migration 0003
and the new feed controls. AI/explored/reporting still remain unavailable.

## 1. Apply the second migration once

After the auth migration `202610070001_pilot_members_connections.sql` has been
applied to your project, inspect and run the full contents of this file in
**Supabase → SQL Editor**, using your operator account:

`backend/supabase/migrations/202610070002_spots_storage.sql`

This transaction creates:
- `public.spots` with validated metadata, canonical photo paths and removal state.
- Narrow authenticated SELECT grants and current-enrollment/audience RLS helpers.
- A **private** `spot-photos` bucket accepting only WebP derivatives.
- Audience-aware Storage SELECT and restrictive guards against ordinary uploads,
  updates and deletion, even if unrelated permissive Storage policies exist.

Do not create a public bucket or give browser clients raw-upload permissions.
The migration deliberately fails if `spot-photos` already exists. It is not an
idempotent migration: on any existing table/bucket/function/policy conflict, stop
and inspect migration history instead of deleting data or removing the guards.
The transaction must succeed before testing the app; a SQL file in git is not
proof of applied policies. Do not repeatedly run the first migration either.

## 2. Configure the backend admin credential privately

Reads and `/me` still use the publishable key with the caller's verified token.
Creation/edit/deletion now require a separate admin credential in **backend/.env**:

```dotenv
# Preferred; replace privately with the project secret key.
SUPABASE_SECRET_KEY=REPLACE_WITH_SERVER_ONLY_SECRET
```

Alternatively, an existing **genuine, unexpired Supabase service-role JWT** may
be supplied as `SUPABASE_SERVICE_ROLE_KEY`. A placeholder, publishable key, or
user access token is not an admin credential. A valid-shaped secret key takes
precedence over the legacy setting; Supabase still validates its authenticity.
Keys and URL must belong to the same project. `/me` does not use the admin key.

Never place either privileged key in `frontend/.env.local`, a `VITE_` variable,
source, screenshots, logs, or chat. Do not replace your publishable key with it.
Restart the backend after changing settings. No dependency installation is
needed for this slice if the existing packages are already installed.

## 3. Start the existing apps

In separate terminals, from `backend/` and `frontend/`, respectively:

```sh
npm run dev
```

Open **http://localhost:5173**. Backend is **http://localhost:3001** by default.
`/health` intentionally remains `{"status":"scaffold"}`; it is not a readiness
test. An enrolled sign-in should now show **Connections preview / Add a spot**.
Missing schema or credentials shows a safe failure, not a successful save.

This slice has no Public feed/switch, saved-radius editor, semantic search,
explored state, or reporting. Public spots can be opened by ID by any enrolled
account; an unconnected author's Public post does not belong in Connections.

## 4. Two-account sharing smoke check

Use consented accounts **A** and **B**, both enrolled and mutually connected.
Their setup was user-reported; this is the first live media/visibility check.
Use separate browser profiles or clearly sign out between accounts. Use only
non-sensitive, disposable test photos and appropriate publicly accessible places.

1. As A, **Add a spot**. Choose a JPEG/PNG/WebP photo, title/note, destination pin,
   and public-access confirmation. Keep **Connections only** selected by default.
2. Cancel a subsequent photo picker: the previous photo/form should remain.
   Unsupported or oversized selections must fail clearly without saving.
3. Enter numeric coordinates: the marker/map should recenter, and the displayed
   destination must agree. Clicking the map must produce in-range coordinates.
   No current-location permission should be required.
4. Select **Share spot** once. Expect progress, then the saved detail and photo.
   Save the `?spot=<id>` link privately for direct-access testing.
5. As B, reload Connections preview. Verify A's image, note, audience, author and
   coordinates. Open detail; B must not have edit/delete controls.
6. As A, edit title/note/location/access information and save. As B, reopen/reload
   detail to check fresh values. Photo replacement is not included in edits.
7. Check **Open directions**: it opens Google Maps outside the app with the saved
   destination coordinates. No route safety or travel time is verified.
8. Create a separate disposable spot and delete it as A after confirmation. Expect
   removal from the refreshed list and unavailable detail/photo on fresh requests.
   A successful deletion is 204; cleanup pending is not complete deletion.

**Passing this smoke check does not prove access security. Continue below.**

## 5. Connected, unconnected and denied access checks

Keep A/B connected. Enroll a third consented account **C** without any connection
to A. Keep a separate **D** account unenrolled (the earlier denial account can be
reused). Do not enroll D merely to run these checks. Use a disposable A spot.

| Caller | Connections-only detail/photo | Public detail/photo | Edit/delete A's spot |
| --- | --- | --- | --- |
| A (owner) | 200 | 200 | Allowed |
| B (connected, enrolled) | 200 | 200 | 404 |
| C (unconnected, enrolled) | 404 | 200 | 404 |
| D (authenticated, unenrolled) | 403 | 403 | 403 |
| Signed out / invalid token | 401 | 401 | 401 |

Check both `GET /spots/:id` and `GET /spots/:id/photo` directly, not just visible
buttons. The photo is an authenticated API response, not a public image URL;
opening it in the address bar without a Bearer header is expected to fail.
Inaccessible/nonowned targets must not disclose private titles or raw errors.

- As A, change Connections → Public after reading the disclosure. C can now open
  the private link, but A's post still does not appear in C's Connections preview.
- Change Public → Connections. Fresh C detail/photo requests must return 404;
  B retains access. Reload the views rather than trusting an existing image.
- As B/C, issue direct PATCH/DELETE attempts on a disposable A spot. Hidden owner
  buttons alone are not verification; both attempts must return 404.
- As operator, temporarily set a disposable viewer's enrollment false. Fresh API
  and user-scoped Storage requests must fail; restore enrollment deliberately.
- Deleting a spot must deny fresh ordinary reads even if cleanup is pending.
  Do not claim already downloaded copies were recalled.

### Optional development-console API probe

For the local Vite **dev** app only, you can run this inspected snippet in your
own browser console after signing in. It obtains the existing session locally;
it does not ask you to copy a token into chat or shell history. Replace the spot
ID privately. Reload the page and rerun for each account. Do not share console
or network dumps containing session data, coordinates or account identifiers.

```js
const { getSupabaseClient } = await import('/src/supabase.ts');
const { apiBaseUrl } = await import('/src/config.ts');
const client = getSupabaseClient();
const { data: { session } } = await client.auth.getSession();
const spotId = 'REPLACE_WITH_DISPOSABLE_SPOT_UUID';
async function apiStatus(path, method = 'GET', body) {
  const response = await fetch(apiBaseUrl + path, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  return response.status;
}
await apiStatus(`/spots/${spotId}`);
await apiStatus(`/spots/${spotId}/photo`);
```

Only run with a signed-in session, including for D's denied-account check. For
B/C's PATCH test, supply the full editable metadata object from API_CONTRACT.md,
not an invalid body which would merely test validation. DELETE is destructive if
authorization is broken: use a disposable A spot and expect 404.

For a signed-out API check, a plain `fetch(apiBaseUrl + '/spots/' + spotId)` with
no Authorization must return 401. An expired/invalid user token must also fail.
These console helpers are not part of the production bundle or an automated suite.

## 6. Direct database and Storage boundaries

Test using **ordinary user sessions**, never an operator/secret/service-role
client. Admin credentials bypass RLS and are not evidence of ordinary access.

- Authenticated Data API SELECT of `spots` must return only active authorized
  rows. For example, using the development-console client above:

  ```js
  const result = await client.from('spots')
    .select('id,owner_id,title,audience,removed_at').eq('id', spotId);
  ({ failed: Boolean(result.error), rowCount: result.data?.length ?? 0 });
  ```

  Expect one row when allowed, zero for an inaccessible/removed spot. Do not use
  `select('*')`: `photo_path` intentionally has no ordinary column SELECT grant.
- A/B/C cannot directly INSERT/UPDATE/DELETE `spots`, including their own rows.
  Try otherwise-valid disposable writes: they must be denied by privileges/RLS,
  not merely by a malformed payload. Backend-mediated owner writes are separate.
- A/B/C cannot raw-upload, overwrite, move, or delete objects in `spot-photos`.
  Test with a valid small WebP and disposable target; an unsupported MIME error
  alone is not proof of authorization. If a write succeeds, stop pilot use.
- For an existing object, derive its canonical path privately from the API's
  ownerId and spot ID: `<owner-uuid>/<spot-uuid>.webp`. User-scoped Storage
  `.download(path)` must follow the same audience/removal/enrollment matrix.
  Storage denial status varies by provider: expect no successful bytes, not a
  particular 404/403. The backend's neutral 404 is a separate API guarantee.
- A Storage **public** object URL must fail without authentication even for a
  Public-audience spot. Generating a URL through `.getPublicUrl()` does not make
  this private bucket public. Never loosen the bucket to fix a failed download.
- Retest direct user-scoped Storage download after Public → Connections and after
  deletion. Unconnected/de-enrolled callers must not obtain new image bytes.

The existing `backend/supabase/check_pilot_boundaries.sql` tests the **auth**
schema only. It does not test this spots migration or real Storage/user tokens.
No live spots/RLS SQL check has been run or marked passed by the assistant.

## 7. Failure recovery and operator cleanup

- POST/PATCH network timeout, 5xx, or malformed success: result may be uncertain.
  The browser allows up to 35 seconds for a mutation (reads remain 15 seconds),
  because caller verification plus ordered Storage/database work can exceed the
  old 15-second deadline. This is a bound, not a guarantee for a slow provider or
  deployed proxy. No automatic retry. Keep the current form, inspect the refreshed
  preview and fresh detail, and submit again only deliberately. The app has no
  idempotency key or cross-service transaction; duplicates remain possible after
  resubmission.
- Ambiguous INSERT completion retains its uploaded private photo. An immediate
  absent-row lookup is not proof of rollback. Only definitive PostgreSQL
  data/constraint rejection can trigger cleanup, after a no-row check. Orphans
  without an active authorized spot are unreadable to ordinary users, subject
  to the applied and verified policies.
- `MEDIA_CLEANUP_PENDING`: tombstone is confirmed; ordinary reads are hidden,
  but cleanup is not complete. Owner can deliberately retry deletion. Do not
  restore visibility, claim physical erasure, or automatically repeat mutations.
- A generic uncertain delete may already have hidden the spot. Inspect current
  state; if necessary an owner can deliberately retry DELETE by saved ID. The
  UI's pending-cleanup ID is in memory only and is lost on page reload.

Operator inspection queries (run privately, not as a pilot client):

```sql
select id, owner_id, removed_at
from public.spots where removed_at is not null;

select o.name, o.created_at
from storage.objects o
left join public.spots s on s.photo_path = o.name
where o.bucket_id = 'spot-photos' and s.id is null;
```

These are **candidates**, not authorization to delete everything returned. A
photo can temporarily precede its INSERT. Verify upstream operations have settled
and repeat the lookup before manual cleanup. Remove confirmed orphan objects
through the Storage dashboard/API; do not DELETE `storage.objects` rows with SQL
and assume physical bytes were removed. For tombstones, complete photo cleanup
before final row deletion, using owner retry or deliberate operator action.
Keep inspection output private; no automatic janitor/scheduler is implemented.

## 8. Browser/phone and release gaps

- Test camera capture and library selection/cancellation on pilot devices. HEIC,
  animation and inputs above 20 million pixels are rejected even below 10 MiB.
  A real phone capture may need conversion/downscaling; no conversion UI exists.
- Block tile requests: a map warning should appear; numeric coordinates and list
  remain usable. Test typed pin recentering and clicks across wrapped world maps.
- Default tiles use OSM's standard endpoint with visible attribution. Follow the
  [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/): browser
  caching/referrer, no scraping/prefetch/offline downloads, best-effort service.
  Custom public tile URL/attribution configuration is supported; no provider setup
  or commercial allowance is inferred. Tile viewing reveals map areas to provider.
- Block the sharing JS chunk in a production preview: workspace load failure
  should show a safe reload option while sign-out remains usable. Restore network
  and explicitly reload; no automatic reload loop is implemented.
- Sign out/switch accounts during photo loading or an upload: old content must
  disappear and late responses must not reauthorize the previous account.
- Stop backend/network during save: no false success or automatic resubmission.
- `localhost` on a phone is the phone itself. Camera behavior and outside-device
  access need a user-authorized reachable/secure setup; no tunnel is provisioned.

Local combined checks on October 7, 2026: backend typecheck/build and **73 tests**;
frontend typecheck/build and **22 tests**. Synthetic Sharp fixtures inspect JPEG,
PNG and WebP derivatives for removed EXIF/orientation and decoded dimensions.
Node tests and mocked provider requests do **not** verify live RLS, Storage,
browser/phone interactions, deployed images, or complete end-to-end publishing.
No deployment or model download occurred. Record live pass/fail by scenario only;
report safe error codes, not credentials/private locations or raw network output.
