# Product Requirements Document — I Know a Spot

**Version:** 0.2 · **Date:** October 7, 2026
**Status:** Proposed implementation contract; stack selection follows review.
**Release:** 36-hour mobile-web pilot, not a public platform launch.

Related documents:
- [BUILD_SCOPE_36H.md](BUILD_SCOPE_36H.md): time budget, gates, and cut rules.
- [FUTURE_SCOPE.md](FUTURE_SCOPE.md): deferred backlog, excluded from this release.

This PRD includes the requested Connections/Public feeds and profile-controlled
public discovery radius in the 36-hour build. It preserves web-first/Capacitor
portability and browser photo capture/selection. It selects no framework, database,
authentication provider, hosting service, map provider, or exact model.

## 1. Product summary

**I Know a Spot is a map of overlooked discoveries shared by connections and the
nearby community. Open-weight AI helps people find a place that matches what
they want to see, then gets out of the way so they can go.**

The product maps things worth noticing: a striking doorway, patterned wall,
colorful staircase, or quiet publicly accessible corner. It is not a business
directory, travel booking service, public review network, or navigation engine.

**Core loop:** notice → photograph → pin and describe → choose audience → share →
discover → open directions → explore → mark explored.

## 2. Problem and product hypothesis

Interesting small places are often shared as photos without actionable location
context. Mainstream destination lists prioritize landmarks and businesses rather
than personal observations. Planning a large outing can also be unnecessary
friction when friends just want a small reason to get outside.

**Hypothesis:** discoveries from trusted connections and unfamiliar local
contributors can motivate short outings. Nearby public spots widen discovery
beyond an existing network. Semantic discovery connects an everyday request to
informal descriptions without requiring posters to curate a taxonomy.

These are hypotheses, not validated demand or retention claims.

## 3. Users and pilot boundary

- **Contributor:** notices an interesting detail and wants friends to see it.
- **Explorer:** wants a nearby reason to go out without extensive planning.
- One person can play both roles; there are no role-based product dashboards.
- Pilot: 3–5 pre-enrolled participants, one neighborhood, roughly 10–15 real spots.
  Include both connected and unconnected contributors so public discovery is real.
- Connections are mutual, consented relationships preconfigured by the operator;
  replace the earlier single-group access model. No connection-request UI yet.
- Each participant has an individual authenticated identity and fixed display name.
  Profile contains a saved public discovery radius, not a full public biography.
- “Public” means visible across authenticated pilot accounts, including
  nonconnections. Anonymous browsing/public registration is deferred. Public
  content is not private; onboarding explains this audience explicitly.

## 4. Goals and non-goals

### Release goals

1. Let a participant share a spot from a mobile browser, including a photo and audience.
2. Let another participant discover it through Connections or radius-filtered Public.
3. Make open-weight AI materially useful for finding places by meaning.
4. Protect connections-only content and avoid collecting unnecessary user location data.
5. Produce a real outdoor test and a reproducible challenge demonstration.
6. Preserve a practical path to bundling the frontend with Capacitor later.

### Non-goals

No anonymous browsing, public registration, connection requests, multiple groups,
invitations, full profile editing, messaging, follows, likes, popularity
scores, badges, challenges, notifications, saves, visit comments/photos, image
understanding, chatbot, route generation, visit verification, offline support,
native application build, or app-store submission. Tags, including AI tags, are
also deferred. See [FUTURE_SCOPE.md](FUTURE_SCOPE.md).

## 5. Platform and portability requirements

- Deliver a responsive, HTTPS web app that can be shared by URL and used on phones.
- Frontend must produce a bundle of static web assets with an `index.html` entry
  point suitable for later Capacitor packaging. Server operations live behind
  explicit service/API boundaries; they cannot require a server inside the app.
- Centralize the API base address and keep secrets out of shipped frontend code.
- Isolate photo selection, optional location access, and opening external links
  behind small functions so native implementations can be added without rewriting
  the domain flow. Do not build a general plugin architecture.
- Evaluate auth for later native origin/login-callback compatibility when choosing
  the stack. Actual native auth integration and CORS testing are future work.
- Browser navigation, form keyboard behavior, loading feedback, and touch controls
  must work now. Capacitor does not automatically provide offline data or maps.
- The demo is online-only. If connectivity fails, show errors, not a claim that
  publishing or search completed. No background sync queue in this release.

## 6. User journeys

### A. Share a discovery

1. Sign in as a pre-enrolled member; select **Add a spot** from the map.
2. Take or choose one photo; inspect the preview and replace it if necessary.
3. Enter a short title and personal note; place/confirm a map pin.
4. Choose **Connections only** (default) or **Public**. Public exposes the spot,
   photo, note, and display name to all authenticated pilot participants.
5. Confirm the spot is appropriate to share and publicly accessible; optionally
   add known access restrictions in plain text. Physical public access is distinct
   from whether the post audience is Public or Connections only.
6. Select **Share spot**; see progress and then the saved spot detail.
7. Another eligible participant sees it in the appropriate feed without developer help.

Cancelled photo selection leaves the form intact. A failed upload/save shows a
retryable error and preserves entered fields during that screen session. A
disabled/pending submit prevents duplicate submissions.

### B. Discover and go

1. Use the **top-center Connections / Public segmented switch** above the feed/map.
   Connections opens first. Public shows spots inside the profile's saved radius.
2. Browse photo cards/pins or search “somewhere tucked away with interesting
   textures.” AI uses only the selected feed's eligible spots. Inspect up to three
   semantic matches with original member-written notes.
3. Open a spot detail, inspect its access information, and select **Open directions**.
4. The external directions provider receives the destination coordinates.
5. Return after the outing and mark **Explored**. This is voluntary and self-reported.

No device-location permission is necessary to browse or choose a destination.

### B2. Set nearby public discovery

1. Open **Profile**; change **Public discovery radius** and save.
2. Return to Public: cards, pins, and search candidates use the saved radius.
3. Center discovery on **Use my location** (one-time browser permission) or
   **Choose area** (manual map point). Default to the visibly labelled pilot area.
4. Denial/unavailability leaves manual area selection usable. Never silently claim
   the pilot center is the user's current position. Map panning alone does not
   change discovery center; the user explicitly confirms a new area.

### C. Correct or remove a discovery

1. Open one's own spot; edit title/note/location/access/audience or delete it.
2. Confirm deletion before it is performed.
3. Changes appear to eligible viewers and in search; deleted content stops being
   served by the app. Other members never receive owner controls or write authority.

## 7. Functional requirements

All requirements below are **P0** unless marked optional. Optional features are
not release blockers and are cut first.

### FR-01 — Individual access and audience authorization

- Authenticate each member; provide sign-out. Deny nonmember access with clear UI.
- Public posts are readable by any authenticated enrolled participant. Connections-only
  posts are readable only by their owner and that owner's configured connections.
- Enforce audience rules on the server for reads, photos, and search; writes stay
  owner-only. Explored records and profile settings belong to the authenticated user.
  A hidden UI control or unlisted URL is not access protection.
- Derive identity/ownership from authenticated context, not trusted client IDs.
- Handle an expired session without exposing cached private content to another user.

**Acceptance:** direct requests by signed-out users/nonmembers cannot access
content; unconnected enrolled users see public but not connections-only posts;
members cannot impersonate another owner or modify another user's records.

### FR-02 — Share a spot, including photo capture/selection

Required fields: one photo, title, personal note, map pin, and public-access
confirmation, plus audience (Connections only by default). Optional: plain-text
access note. Tags are not part of this form. Public selection must visibly explain
that unfamiliar participants will see the exact destination pin and shared content.

Suggested pilot limits to finalize before implementation:
- Title: 1–80 characters; note: 1–500; access note: up to 200; query: up to 200.
- One image, maximum 10 MB input, validated JPEG/PNG/WebP; reencode and strip
  metadata before shared storage. Explain unsupported formats clearly; broader
  format conversion is not required. Do not trust file extensions alone.
- Validate latitude/longitude. Location comes from the confirmed map pin, not EXIF.

Use a browser photo input with camera capture available where supported and
photo-library selection available. Browser/device behavior varies: no guarantee
of a custom camera UI or identical picker choices. Test the selected pilot phones.
Native Capacitor camera plugins, video, cropping tools, and multiple photos are out.

**Acceptance:** a second member sees the saved image/note at the right pin; an
unsupported/oversized upload fails clearly; photo cancellation causes no save;
shared images contain no original EXIF/GPS metadata.

### FR-03 — Connections and Public feeds with matching map

- Place a top-center segmented **Connections / Public** switch above the content.
  Use a single reusable photo-card feed and matching map, not duplicate screen stacks.
- Connections: own posts plus posts by configured connections, including their public
  posts; newest first. Public radius does not constrain Connections in this release.
- Public: public posts by all enrolled authors, including nonconnections, whose
  destination pins are within the saved radius; nearest first, newest on ties.
- Card minimum: photo, title, note excerpt, contributor display name, audience badge;
  Public also shows approximate straight-line distance from the selected area.
- Cards and pins represent the same selected-feed eligibility. Selecting either
  opens the same detail view. No likes, comments, popularity sorting, or engagement feed.
- Provide empty, loading, and failure states. A map-provider failure should leave
  available spot-list information usable, not invent a rendered map.
- Reset/cancel stale feed/search responses when audience, area, or radius changes.
  Public with no nearby spots explains how to adjust area/radius; never widens silently.
- Radius and manual area selection are required (FR-08); optional current-location
  shortcut can be cut. No background location collection.

**Acceptance:** toggling changes cards/pins without an app reload; an unconnected
author's nearby public spot appears only in Public; connections-only content never
appears in Public. Map/feed agree on eligible spots and work on phone/keyboard.

### FR-04 — Open-weight semantic discovery

- Use one real open-weight text embedding model, with identified license and
  inference environment. Exact model/runtime choice is deferred to stack selection.
- Embed member-written titles/notes; compare a query against authorized candidates.
  Do not send photos, coordinates, or member identifiers into model inputs.
- Return up to three ranked, existing spot cards. Show the original notes rather
  than generated claims. Label results as semantic matches, not guaranteed suitability.
- Enforce selected feed, audience, removal status, and (for Public) geographic
  radius before semantic ranking. AI never sees unauthorized candidate descriptions.
  Small stored vectors/direct comparison suffice; no dedicated vector infrastructure.
- Empty query returns ordinary browsing. No connections and no nearby public spots
  have distinct empty states. Public radius must not expand to fill search results.
- Low-quality matches must not be described as confident recommendations. Any
  match threshold is empirically chosen on the pilot corpus, not a universal value.
- Show unavailable/retry state when inference fails; browsing remains available.
- Keep new/edited spot embeddings tied to the current text version. Until ready,
  the spot can appear in ordinary browsing with discovery processing indicated,
  but must not be falsely described as searchable or use an outdated vector.

**Acceptance:** realistic vocabulary-gap queries find helpful spots beyond a
keyword baseline; results always resolve to authorized current spots; failure
does not fabricate matches; unsupported attributes are never invented.

### FR-05 — Spot detail and external directions

- Show title, photo, original personal note, poster display name, map position,
  audience, poster-confirmed access information, explored state, **Open directions**,
  and **Report spot**.
- Access statements are attributed to the poster, not independently verified.
- Open an external directions provider for the confirmed coordinates; tell users
  they are leaving the app. Do not claim verified walking time or a safe route.
- Missing/deleted/unauthorized spots have a neutral unavailable state, without
  leaking private titles or author details.

**Acceptance:** destination coordinates match the saved spot, and cancelling or
returning from external navigation does not corrupt spot/explored state.

### FR-06 — Self-reported explored state

- Toggle explored/unexplored per user and spot; persist across sessions.
- Label as self-reported. No GPS proof, public count, rankings, or visit media.
- Do not expose other members' explored records in this release.

**Acceptance:** repeated toggles are consistent, one user's changes do not affect
another user's state, and failed writes are not presented as successful.

### FR-07 — Owner edit and deletion

- Owner may edit title, note, coordinates, access information, and audience. Changing
  Connections only to Public requires the same explicit audience explanation as creation.
  Photo replacement after publication is not required; correcting the photo can
  use delete/recreate.
- Confirm deletion; remove it from map, list, discovery candidates, and detail.
- Stop serving deleted photos; remove media objects and derived search content.
  Already downloaded copies cannot be recalled. If signed URLs are used, document
  their expiry/revocation limitation rather than promise immediate global erasure.
- Enforce ownership on direct requests as well as in the interface.
- Public → Connections only removes the spot from Public and unconnected direct
  access, including photo/search access. Recheck authorization rather than trusting
  cached visibility; record any already-issued media-URL expiry limitations honestly.

**Acceptance:** another member cannot edit/delete; edited text never uses stale
search representations; app endpoints no longer serve deleted content.

### FR-08 — Minimal Profile and radius-controlled Public discovery

- Profile/settings shows fixed display name and saved **Public discovery radius**.
  Proposed pilot default: 5 km; labelled slider or numeric control from 1–25 km,
  with Save. Final bounds are confirmed during implementation, not expanded scope.
- Save radius per user; validate bounds server-side; restore on later sessions and
  use immediately on returning to Public. Show current radius in the Public header.
- Discovery center is an explicitly selected point: labelled default pilot area,
  a manually chosen area, or optional one-time browser location. No geocoder needed.
- Radius measures straight-line geographic distance between center and destination
  pin, not author location, travel time, walking distance, or map zoom level.
- Use a geodesic distance calculation; an approximate bounding box alone is not
  sufficient. Inclusive boundary: distance <= radius; radius filtering is server-side.
- Center coordinates can be sent to the server for the request, never to the AI;
  retain only as transient UI/request state, not a live tracking record or analytics.
  Persist radius, not precise device location. Reload may return to labelled pilot area.
- A radius is a discovery preference, not access authorization: a known public spot
  outside the radius may still open via detail, but never appears in that feed/search.

**Acceptance:** save/reload preserves radius; changing it changes eligible cards,
pins, and semantic candidates. Test just inside, on, and outside the radius.
Denied location still permits manual-area discovery. No other user's settings change.

### FR-09 — Minimum reporting and operator removal

- A signed-in viewer can report an accessible spot using a short predefined reason
  (private property, sensitive location, inappropriate photo/content, or inaccurate).
  Acknowledge submission; reports are not public or automatic takedown votes.
- Store spot/reporter/reason for private operator review; deduplicate repeated
  identical reports. No chat, free-text moderation conversation, or new admin UI.
- Operator can inspect reports and hide/remove a spot through existing backend
  tooling or a documented protected operator action. Confirm this path before pilot.
- Removed/hidden spots and associated media stop being served to ordinary viewers
  in both feeds, direct detail, and AI candidates. Reporters cannot remove arbitrary posts.
- Pre-enrolled pilot is bounded; unrestricted signup and full moderation are deferred.

**Acceptance:** report persists privately; ordinary users cannot read all reports or
invoke operator removal; a removed spot disappears from every ordinary access path.

## 8. Information architecture

Five primary screen states, not five mandatory separate pages:

| Screen | Required controls/content |
| --- | --- |
| Access | Sign-in, sign-out where applicable, nonmember/session-error messages |
| Discover | Top-center Connections/Public switch, photo-card feed/map, scoped search, Public area/radius summary, Add a spot, Profile access |
| Add/edit | Photo input/preview on creation, title/note, pin, access information, audience, save/cancel |
| Spot detail | Photo, note, author, audience, access, directions, explored, report, owner edit/delete |
| Profile/settings | Fixed display name, saved public-radius control, save feedback, sign-out |

Use clear touch targets, readable contrast, labelled form inputs, visible focus,
and announced save/search errors. The list provides a path that does not depend
on interpreting map graphics. No heavy animation or bespoke design system.

## 9. Minimum logical data model

This is a domain model, not a database or API design decision.

| Entity | Minimum information |
| --- | --- |
| Member/settings | Authenticated identity, fixed display name, saved public radius |
| Connection | Consented mutual member pair, preconfigured for pilot |
| Spot | ID, owner, audience (connections/public), title, note, pin coordinates, protected photo reference, access confirmation/note, timestamps/text version, active/removed status |
| Search representation | Spot/text version, model identifier/version, embedding, processing/error status |
| Explored record | Member, spot, explored state; unique association |
| Report | Accessible spot, reporter, predefined reason, review status; private to operator |

Feeds are filtered views, not duplicate stored posts. No challenge/badge/like/
follow/tag model or user-location-history table. Photo metadata is not a location
source. Ownership and audience authorization survive client manipulation.

## 10. Privacy, safety, and operational requirements

- Protected transport and audience-aware photo access; do not place connections-only
  media in a public bucket. Public posts do not expose private user settings/activity.
- Confirm an appropriate publicly accessible spot; discourage private homes,
  trespassing, identifiable bystanders, and precise sensitive-wildlife locations.
- Notes may contain sensitive information even without coordinates. Disclose where
  inference runs and minimize payload logging; do not claim complete privacy merely
  because the model is open or self-hosted.
- No live member tracking or background geolocation. Directions/maps can receive
  location data independently of AI; disclose those flows.
- Enforce upload/text limits and bounded search requests to avoid resource abuse.
  Pick concrete request/timeout limits during technical design.
- Keep credentials, private records, and raw private session transcripts out of
  repository files, public screenshots, analytics, and demo fixtures.
- Private means connections-controlled; this release does not claim end-to-end
  encryption, regulatory compliance, guaranteed safety, or permanent offline access.

## 11. Pilot validation and success measures

Targets below are validation goals, not achieved results. Small-sample pilot
findings must not be presented as statistical proof or retention forecasts.

| Measure | How to assess |
| --- | --- |
| Sharing works | At least one nondeveloper participant adds a real spot without developer intervention |
| Discovery becomes action | Another participant finds a spot and attempts a real outing; include a nonconnection's public discovery and record outcomes with consent |
| AI adds value | Compare 8–12 realistic queries with a keyword baseline; include both feeds, radius exclusions, vocabulary gaps, ambiguity, and unsupported requests |
| Privacy boundaries hold | Direct-request tests for anonymous, unenrolled, owner, connected, and unconnected accounts; audience changes and operator removal |
| Mobile usability | Test photo capture, feed switch, saved radius/manual area, search, directions, and explored persistence on two pilot devices where available |
| Responsiveness | Record actual search/save latency on the deployed target; show immediate progress and bounded failure/retry behavior |

Report wins and failures separately. An explored toggle alone is not evidence of
a physical visit. Validation can use consensual observation/interviews and local
test records; a production analytics platform is not necessary.

## 12. Release gates and delivery

Time budget remains **28 planned working hours + 6 rest/break hours + 2 contingency
hours within 36 elapsed hours**. Detailed blocks live in BUILD_SCOPE_36H.md.

- **Hour 2:** infrastructure access and one real model inference verified.
- **Hour 6:** auth, connection/public authorization, storage, and deployment skeleton work.
- **Hour 12:** sharing, audience choice, both feeds, detail, directions, explored work.
- **Hour 21:** saved radius/manual center, scoped AI, reporting/removal work.
- **Hour 24:** feature freeze; only core fixes and validation afterward.
- **Hour 31:** actual checks and outdoor attempt documented.
- **Hour 34:** reproducible demo, README, and local submission draft prepared.
- **Hour 36:** final blocker fixes and smoke test complete, or gaps disclosed.

Required deliverables:
1. Working deployed web pilot or clearly reproducible demonstration.
2. Source, setup instructions, environment placeholders, actual run/check commands.
3. Model identity/license attribution and honest data-flow/limitations documentation.
4. Real query comparison results, boundary checks, and outdoor test account.
5. Short demo/screenshots and an English DEV draft using the official submission
   template and `#hf26challenge`. Publishing requires a later explicit decision.

Challenge context, verified earlier through DevRelay: new work within the official
Week 1 window, one entry, open-source AI central, writing quality weighted most
heavily. Deadline: **October 12, 2026, 12:29 PM IST** (October 11, 11:59 PM PDT).
Finish with time for submission review; the sprint duration does not extend it.

## 13. Risks and scope protection

| Risk | Mitigation |
| --- | --- |
| Empty feeds | Pre-arrange connected and unconnected participants; gather real public and connections-only spots |
| AI is decorative or irrelevant | Test vocabulary-gap discovery against keyword matching; narrow claims to demonstrated behavior |
| Model too slow/unavailable | Verify early on target; choose a lighter suitable open model; retain honest browsing fallback |
| Private content leaks | Enforce audience authorization/protected media; test direct requests and public-to-private changes |
| Radius mistaken for user tracking | Filter destination pins, label the chosen area, retain no location history |
| Harmful public content | Pre-enrolled pilot, explicit public opt-in, reporting and protected operator removal |
| Camera/browser differences | Test real phones early; preserve library selection and explain unsupported formats |
| Native rewrite later | Static-buildable client, service boundaries, device-action isolation; no native code in this sprint |
| Scope grows | Freeze at hour 24; move additions to FUTURE_SCOPE.md |

Cut decorative polish, optional current-location shortcut, extra sorting, and
nonessential result controls first. Never trade away authorization, real AI,
photo protection, both feeds, saved radius/manual-area filtering, basic reporting/
removal, owner correction/deletion, or actual verification to claim
completion. If the core cannot ship, label the output an incomplete prototype.

This revision increases scope within the same budget. Reuse one feed/map layout
and constrain Profile to radius. Preconfigure connections; do not implement
social onboarding. The schedule is a target, not a guarantee of completion.

## 14. Decisions to make next — stack not selected

| Decision | Must satisfy |
| --- | --- |
| Frontend/tooling | Familiar to builder, mobile-friendly, static-buildable for later Capacitor |
| Backend/data | Audience/ownership checks, radius filtering, connection settings, small-vector comparison |
| Authentication | Pre-enrolled member pilot now; feasible native origin/login callbacks later |
| Photo processing/storage | Validated bounded uploads, metadata stripping, protected retrieval/deletion |
| Map/directions | Phone usability, licensing/attribution, permitted deployment origins, cost/data-flow clarity |
| Open-weight model/runtime | Suitable license, semantic retrieval quality, real deployment latency/resource fit |
| Hosting | HTTPS, inference feasibility, ordinary account access, reproducible deployment |
| Pilot specifics | Neighborhood, consented connection pairs, nonconnected contributors, devices, formats/radius limits |
| Operator safety path | Private report review and protected removal without building an admin dashboard |

Prefer the smallest familiar stack satisfying these constraints. No provider,
library, deployment, credentials, or installation is authorized by this document.

## 15. Sources and rationale

- [Official Touch Grass challenge](https://dev.to/challenges/hacktoberfest-week1-2026-10-05),
  DEV event 79, inspected through DevRelay: theme, open-AI requirement, judging,
  entry constraints, and deadline.
- [Capacitor installation documentation](https://capacitorjs.com/docs/getting-started):
  existing web applications need built web assets with an index.html entry.
- [7 Signs You're Over-Engineering Your AI App](https://dev.to/james_anderson_h/7-signs-youre-over-engineering-your-ai-app-and-how-to-stop-4gb),
  James Anderson: simple baselines and evidence-led complexity. Discussion warns
  against overly easy search evaluations.
- [Before an LLM request leaves your app, inspect what it contains](https://dev.to/emorilebo/before-an-llm-request-leaves-your-app-inspect-what-it-contains-2om3),
  emorilebo: payload minimization and separate review of logs/downstream flows.
- [Building SayHi: An Ephemeral Proximity Discovery iOS App](https://dev.to/enes_f0d0cebca3dfc4980550/building-sayhi-an-ephemeral-proximity-discovery-ios-app-with-swiftui-mapkit-4nch):
  one author's account of obscuring people's positions. Here, public destination
  pins are intentional, while member whereabouts and visit histories stay private.

These sources inform constraints; they do not validate demand for this product.
