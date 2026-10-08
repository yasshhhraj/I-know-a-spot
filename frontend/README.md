# I Know a Spot — frontend pilot sharing slice

React + TypeScript + Vite mobile web app with Tailwind CSS v4, Leaflet and Supabase Auth. Pre-created pilot accounts can sign in and verify enrollment with `GET /me`. The workspace offers **Connections/Public feeds** (up to 50), a matching map, saved radius/manual center, create/edit/delete, protected photo display, detail by `?spot=<id>`, semantic search, own explored-state control and external directions. Listed live search/radius smoke checks are user-confirmed; broader authorization/browser checks remain pending. Explored requires user-run migration0004 and live persistence checks; reporting remains unavailable. Product requirements are in [../PRD.md](../PRD.md) and the current release plan in [../BUILD_SCOPE_36H.md](../BUILD_SCOPE_36H.md).

## Local setup

Use Node.js 24 LTS (recommended for both folders; see `package.json` engines).
From `frontend/`:

```sh
npm install
cp -n .env.example .env.local
npm run dev
```

The Vite development URL is `http://localhost:5173`. Configure `VITE_API_BASE_URL` for the separate backend (locally `http://localhost:3001`), plus the public Supabase project URL and a new-format **`sb_publishable_`** key. Missing settings or a key of another family show a configuration state, not a fake login. The backend must implement the agreed [auth and spot contract](../API_CONTRACT.md), trust only a verified Bearer user token, and enroll accounts separately; this frontend gate alone does not grant access. From a phone, `localhost` refers to the phone, so set reachable HTTPS/LAN service origins and allowed CORS origins accordingly.

For checks and a static production bundle, still from `frontend/`:

```sh
npm run typecheck
npm run build
npm test
npm run preview
```

`npm run build` typechecks and writes static assets under `dist/`, including `index.html`, for a web deployment and later Capacitor packaging. `npm test` runs Node's built-in test runner over auth/API boundary tests. `npm run preview` serves an existing build. Install dependencies yourself before running checks.

## Configuration boundaries

- `src/config.ts` centralizes the API base from `VITE_API_BASE_URL`; `/me`, spot metadata and photos use this base. No API URL defaults to the web origin. The optional `VITE_MAP_TILE_URL` and `VITE_MAP_TILE_ATTRIBUTION` are **public** map-service settings; absent a custom tile URL, Leaflet requests OpenStreetMap tiles with visible OpenStreetMap attribution. For another provider, configure its correct attribution, permission to use its service, and HTTPS tile URL. Map/tile providers and Google Maps directions receive destination/map coordinates independently of the app API. Do not put tokens or private user data in tile URL templates.
- `src/supabase.ts` lazily creates a browser auth client from the public settings. Supabase persists the local browser session; `getSession` is only a bootstrap, not enrollment proof. An auth-state listener invalidates stale profile checks when the account or token changes. Sign-out uses `{scope:'local'}` (this browser), not global revocation.
- `/me` is sent with a Bearer user access token and `no-store`, with a 15-second timeout and caller abort on account changes/sign-out. Only a validated profile matching the current auth user reaches the welcome view. 401 asks for sign-in, 403 denies access, and a 503, timeout, network failure or malformed response keeps access hidden with a retry option and without signing the browser out.
- `VITE_` values are bundled into browser assets. Only public Supabase project URL and `sb_publishable_` key belong here; never add a secret/service-role key. The key-family runtime guard **does not** prevent exposure if a privileged key was accidentally bundled; rotate any exposed credential. Audience and ownership checks belong on the backend, not in hidden frontend controls.
- Enrolled workspace operations obtain a fresh Supabase session outside auth callbacks, require its user ID to match the gated profile, and send the token in `Authorization: Bearer` rather than query parameters. A 401/403 hides the workspace and rechecks `/me`. Pending requests are aborted/ignored on workspace unmount or account/token change; blob URLs are revoked on replacement/unmount. These browser measures are **not** server authorization. Backend audience/owner/RLS rules must protect all direct spot and private-media reads/writes.
- The form requires a chosen map pin (no default location), title/note/access confirmation and one photo on creation. Numeric latitude/longitude inputs provide a keyboard path if tiles or map interaction fail. Camera capture is a separate browser file input where supported; the ordinary picker remains available. Client type/size checks are hints: the server validates image bytes, dimensions, animation and strips EXIF before storing a clean derivative. Existing photos cannot be replaced through edit in this slice.
- POST uses multipart `data` JSON plus `photo`; PATCH sends the full metadata object as JSON without a photo. Failed forms retain inputs in that screen session. On uncertain timeout/network writes the app does not retry automatically; check the refreshed preview and open possible matches before explicitly resubmitting. DELETE 204 removes the item; `MEDIA_CLEANUP_PENDING` hides it and offers an explicit deletion retry, **not** a claim that photo bytes are gone. A deleted photo already downloaded by another device cannot be recalled.
- Reads use a 15-second browser deadline; POST/PATCH/DELETE mutations use a bounded 35-second deadline because backend verification and ordered Storage/database work can exceed 15 seconds. A timeout still leaves the outcome unknown; a deployed proxy or provider can impose another deadline. No automatic retry is performed.
- Search uses a separate read-only POST helper with a 45-second deadline, not mutation-uncertainty messaging. Explicit Find spots submits a draft; Clear restores browsing. Cards/pins share the returned semantic array (up to three), original notes only. Submitted query is scoped to account/feed/confirmed center/saved radius/refresh; stale successes AND errors are ignored, including StrictMode replay. Busy/unavailable/no-candidates/no-matches states stay distinct. Model weights/dependencies do not enter the frontend bundle. See [../SEMANTIC_SEARCH_SETUP.md](../SEMANTIC_SEARCH_SETUP.md) for synthetic fixture SQL/cleanup and live checks.

The demo is online-only. Account creation/enrollment and RLS are operator/backend responsibilities. Prepared SQL/storage migrations are not proof of deployed policies: the operator must apply them, configure the backend-only admin secret privately, and complete three-account connected/unconnected + signed-out direct API/media checks. Node tests/typecheck/build do not verify a running backend, a real browser/phone camera, Sharp's emitted image bytes, Storage policies, external tiles/directions, or a deployed Capacitor origin. Test selection and capture on pilot phones, then verify save/read/edit/delete and audience revocation live. Native Capacitor packaging and login-origin behavior remain later steps.

## Current build caveat

Latest lead checks: typecheck/build and **46 tests** pass. The enrolled workspace
loads through React.lazy/Suspense and a scoped failure boundary; a failed chunk
offers a deliberate page reload while sign-out remains outside the boundary.
Build output is426.86 kB entry JS +199.74 kB workspace, with no >500 kB warning.
These are build measurements, not verified browser performance. Unicode response
limits match backend code points; HTML maxLength remains conservative for emoji.
Use [../SPOT_SHARING_SETUP.md](../SPOT_SHARING_SETUP.md) for the unrun live checks.

Public discovery setup is in [../PUBLIC_DISCOVERY_SETUP.md](../PUBLIC_DISCOVERY_SETUP.md).
Optional public Vite pilot-center latitude/longitude fallbacks are labelled as an
area, not user location. Without them, choose/confirm a manual center. Only radius
persists on the backend; no automatic device-location access or center storage.
Each feed effect owns a fresh request scope for StrictMode cleanup/setup replay.
Node lifecycle tests are not browser/Leaflet or real SQL/RLS verification.

Explored control: [../EXPLORED_SETUP.md](../EXPLORED_SETUP.md). It loads own state
independently on detail, with30s GET/35s PUT budgets and current-member/spot scopes.
No optimistic saved state; ambiguous writes require explicit reload before another
change. State is voluntary/self-reported and not stored in localStorage or passed
to search. A migration/provider failure does not become false or disable directions.

Local production builds with Vite 7.1.9 / Rollup 4.64.1 hung in the optimizer path.
`vite.config.ts` temporarily disables tree-shaking; typechecking, bundling, CSS,
and minification still run, but unused code remains. The original build command
passes with this workaround. Revisit optimization before release; do not change
dependency versions or claim the upstream issue is fixed without verification.
