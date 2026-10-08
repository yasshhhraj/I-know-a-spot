# Semantic search — local setup and user-run database checks

Semantic search uses pinned MiniLM on the backend CPU. It returns original member
notes from the current Connections/Public feed, up to three matches; it generates
no descriptions, safety/access claims, directions or confidence percentages.

## 1. Migration decision

**No new search migration or embedding backfill is needed.** Existing spot rows
become searchable when a nonempty search first encodes their eligible titles/notes.
Derived vectors are bounded backend-memory entries, not database columns. Restart
rebuilds them on demand. Saved-radius filtering still requires existing migration
`202610080003_public_feed_radius.sql`, after 0001 and 0002; do not reapply already
applied migrations. See PUBLIC_DISCOVERY_SETUP.md for those separate checks.

The new SQL below is **test-data population**, not a migration and not a live
security audit. Nothing has been applied remotely by the assistant.

## 2. Start/check the implementation

Use the existing Supabase configuration privately; no extra credential or privileged
read fallback is needed for search. From `backend/`:

```sh
node scripts/minilm-smoke.mjs
npm run typecheck
npm run build
npm test
node scripts/evaluate-semantic-search.mjs
npm run dev
```

The smoke and evaluation commands use only synthetic data; no `.env` or real
database reads. The evaluation injects HTTP calls into the real route with actual
local MiniLM and a synthetic auth/store adapter. Its success does **not** prove
Supabase RLS, Storage or the regular browser flow.

The app reads `MODEL_ID` (only `Xenova/all-MiniLM-L6-v2` is supported) and
`MODEL_CACHE_DIR` (default `.cache/models`, relative to backend/). It resolves the
fixed revision `751bff37182d3f1213fa05d7196b954e230abad9`, verifies artifacts and
loads only local files. First search initializes lazily; it never downloads in a
handler. If files are missing, explicitly prepare them with
`node scripts/minilm-smoke.mjs --download`, then restart the backend. A failed
initialization is retained by that encoder instance; Retry alone cannot repair a
missing/corrupted artifact. Never silently replace a checksum-mismatched model.

From `frontend/`, `npm run dev` serves the existing local frontend. Select a feed,
enter a query, and press **Find spots**. Typing alone does not search. Clear search
restores normal browsing. Public requires a confirmed discovery center and uses
the currently saved radius. Changing feed/center/radius invalidates old results
and resubmits the active query; photos/details use their usual authorization paths.

Only server-eligible title/note strings and the query reach the text encoder.
Photos, coordinates, IDs, author and access metadata do not. Queries are JSON
request bodies, not URLs or localStorage. No query analytics/payload logging.

## 3. Populate synthetic searchable spots

Run **`backend/supabase/seed_semantic_search.sql`** in your Supabase SQL editor as
the trusted project operator, preferably in an isolated test project. It commits
14 synthetic metadata rows; unlike rollback-only boundary scripts, they remain for
browser/real-token testing until you clean them up.

Before executing, replace three UUID placeholders **only in your private editor**:

| Placeholder | Existing account required |
| --- | --- |
| `REPLACE_WITH_ENROLLED_CONNECTED_AUTHOR_UUID` | A: enrolled author connected to B |
| `REPLACE_WITH_ENROLLED_VIEWER_UUID` | B: enrolled viewer with mutual A connection |
| `REPLACE_WITH_ENROLLED_UNCONNECTED_AUTHOR_UUID` | C: enrolled author connected to neither A nor B |

Never paste passwords, access tokens, privileged keys or filled-in private SQL into
chat/git. The script does not create users, enroll anyone, add connections or change
radius. Set up consented pilot accounts separately via SUPABASE_SETUP.md if needed.

Guards refuse duplicate/mis-enrolled accounts, incorrect connection assumptions,
missing migrations, fixture ID collisions, existing media at fixture paths, or
unrelated Public spots within 25 km of the synthetic area. No upserts, overwrite,
policy changes or cleanup of unrelated rows. A failure rolls back the transaction;
inspect the error rather than weaken guards or remove real data.

### Important fixture limitations

- The discovery center is **latitude 0, longitude 0**. Confirm it manually only for
  these labelled tests; it is not the user's location or an actual destination.
- All titles start with “Synthetic,” and access notes explicitly say not to visit.
  **Do not use Open directions or claim a real outdoor test for these rows.**
- No photo bytes/Storage objects are uploaded. Expected UI: **Photo unavailable**;
  authorized fixture photo requests can return 503. This is not a successful media
  test, and photo failures must not prevent textual search/cards from rendering.
- SQL does not generate/store vectors; first authorized search computes them locally.
- Use app-created spots with real consented photos/locations for media/mobile/outdoor
  checks. Do not manually add Storage photos to these fixtures just to hide errors:
  cleanup intentionally refuses uploaded media so it cannot orphan real objects.

## 4. Browser checks using the seeded rows

Sign in as **B**. Note your original saved radius; set it to **5 km** through Profile
for these tests. Restore it afterward. Select Public and explicitly confirm (0,0).

| Query / action | Expected observation |
| --- | --- |
| `somewhere to sit with a novel away from sunshine` | Synthetic shaded garden (`...000001`) among semantic matches |
| `bright steps for taking pictures` | Synthetic colorful staircase (`...000003`) |
| `watch pollinators visiting blooms` | Synthetic wildflower patch (`...000005`) |
| `watch the horizon as daylight fades` | Synthetic sunset terrace (`...000007`) |
| `paintings directly on a wall` | C's Public mural (`...000011`) appears despite no B–C connection |
| `birds swimming on still water` | Duck pond (`...000009`, 4.5 km) at radius 5; excluded after saving radius 1 |
| `a place beside moving water` | Riverside seat (`...000004`, 2.4 km) at radius 5; excluded at radius 1 |
| Connections + `weathered brick archway` | A's connections-only arch (`...000010`) appears |
| Public + same arch query | The private arch must never appear, even if other textures match |
| `a shop selling replacement laptop batteries` | No semantic matches on the isolated fixture corpus |
| Clear search / empty submit | Normal selected-feed browsing, not a fake semantic response |

At any supported radius centered at (0,0), B must never see the inaccessible
connections-only garden (`...000012`), removed garden (`...000013`), or far
unconnected Public garden (`...000014`, 26 km) in search. C's mural is absent from
B's Connections feed/search, but eligible in Public. Radius does not restrict
otherwise-authorized Public detail by ID; the distant garden's detail can still open.

One expected ranking limitation in the synthetic comparison: `put down a picnic
blanket` returns garden ahead of meadow. Top-three recall is not perfect top-one
ranking, and the initial 0.35 cosine cutoff is not a universal confidence boundary.
Other existing Connections posts can affect those results; inspect current eligible
data rather than expecting a globally fixed response.

## 5. Direct HTTP/current-data checks

Use the browser network panel or your existing private token tooling to call
**`POST /spots/search`** on the configured API. Supply your own Bearer access token
privately and `Content-Type: application/json`; never send an admin key as a user.

```json
{"query":"somewhere to sit with a novel away from sunshine","feed":"public","centerLat":0,"centerLon":0}
```

The full request/response/error shape is in API_CONTRACT.md. Record only synthetic
result IDs, safe status/error codes and timings—not tokens, member IDs or raw notes.

- Missing/expired identity: 401; unenrolled real account: 403; no model invocation.
- C searching Connections must not receive A's connections-only arch. B searching
  Public must not receive any private fixture. No anonymous/Public pilot access.
- Client `radiusKm`, arbitrary IDs/owner/model fields, invalid center/feed, query
  >200 Unicode code points, malformed/oversized/wrong-content-type JSON: 400.
- Edit a fixture as its owner through the app. Search must use the new text, never
  a stale vector. Keep its synthetic access marker intact for safe cleanup.
- Change the mural from Public to Connections as C; B must lose it from Public
  search/detail/photo. Restore Public as C for repeat tests. Already downloaded
  copies cannot be recalled; concurrent updates after a final read remain possible.
- Remove a fixture through the owner API; future listings/search cannot serve it.
  Delete can succeed or expose existing media-cleanup behavior for missing bytes;
  do not infer actual Storage cleanup from a missing-photo test.
- Change radius/center/query/feed while a request is pending; late successes and
  late errors must not overwrite the current scope. Test sign-out/account switch.
- Missing/corrupt model: 503 `SEARCH_UNAVAILABLE`, never fabricated matches; browsing,
  sharing/detail/directions still operate. Simultaneous search can return 429
  `SEARCH_BUSY`. Retry is explicit, not an automatic write/mutation retry.
- Full browser/phone and direct RPC/RLS checks remain user-run. Reuse the existing
  rollback-only SQL radius boundary script for exact inside/on/outside/grant checks.

Search covers the existing **50-candidate window**, not every historical spot.
Overall deadline 40s, frontend search deadline 45s, inference-stage budget 5s.
Native work is not forcibly canceled; timed-out work retains its single inference
permit until settled. Real provider/proxy latency and target memory need measurement.

## 6. Cleanup

Run **`backend/supabase/cleanup_semantic_search.sql`** as the operator. It deletes
only the 14 reserved IDs still carrying the exact synthetic marker; already-deleted
rows are harmless. It refuses rows whose marker changed or whose fixture photo
paths have Storage objects. It never alters enrollment, connections, radius,
policies, unrelated spots or Storage bytes. Investigate a refusal manually.

Restore B's original saved radius, clear the submitted query, restore your real
confirmed area and reload. Restart the backend if you want to immediately discard
all in-memory fixture vectors; current eligibility prevents their use after deletion,
and idle entries otherwise expire after five minutes.

## Evidence versus remaining work

Local checks cover mocked access/filtering, cache/freshness/resource limits and
frontend API/controller behavior. The actual MiniLM/injected-HTTP comparison uses
`backend/supabase/semantic_search_fixture.json`; SQL fixture text/distances are
checked against that same corpus by structural tests, not executed PostgreSQL.
Results/limitations are in SEMANTIC_SEARCH_EVALUATION.md. Do not call these scripts
applied, the database populated, live RLS verified, or the full pilot released until
you run the respective real checks.

### User-reported smoke result — October 8, 2026

The user confirms all checks in the final response's “How to try it” section
passed, including the listed semantic queries and radius 5-to-1 km pond exclusion.
The overall fixture/cleanup workflow is user-confirmed; individual SQL receipts
were not inspected. This is live browser smoke evidence for those steps only, not
confirmation of every direct HTTP/security/phone check in this guide. See
WORKBOARD.md for the remaining authorization, revocation, Storage and pilot checks.
