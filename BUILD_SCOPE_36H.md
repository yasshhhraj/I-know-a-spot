# I Know a Spot — 36-hour build scope

This file contains the current build plan only. Deferred features are maintained
separately in [FUTURE_SCOPE.md](FUTURE_SCOPE.md).

Product requirements and the web-first, later-Capacitor direction are defined in
[PRD.md](PRD.md). The current release is a mobile web app; native packaging is deferred.

## Goal and time budget

Ship a mobile-friendly pilot with **Connections and Public feeds**, a **top-center
feed switch**, and **public spots inside a user-controlled radius saved in Profile**.
Participants share overlooked places, find them through open-weight AI, visit,
and mark explored. This replaces the earlier private-group-only scope.

**Core loop:** share a real spot with an audience → choose Connections or Public →
discover a spot (Public within radius) → open directions → visit → mark explored.

This is a **36-hour elapsed sprint**, not 36 uninterrupted working hours:
28 planned working hours, 6 hours reserved for rest/breaks, and 2 hours of final
contingency. Availability of ordinary hosting and account access is assumed;
missing infrastructure must be resolved at the first gate, not late in the build.
The schedule is a planning budget, not a guarantee of completion.

**Pilot boundary:** one neighborhood, 3–5 pre-enrolled participants with some
consented mutual connections preconfigured by the operator, and roughly 10–15
real spots. Include nonconnections and both audiences to test public discovery.
Public posts are visible across authenticated pilot accounts, not anonymous web
visitors. No unrestricted signup or general social platform. Label demo data.

**Photo capture is included:** use a browser input to take or choose one photo,
with camera behavior depending on the device/browser. Native camera plugins and
a custom in-app camera are not required. Test capture/selection on pilot phones.

**Success:** another person can find and visit a spot without developer
assistance, and the AI discovery feature demonstrably adds something beyond
ordinary keyword/tag matching. Nonconnections' public spots are discoverable
within the chosen radius; private spots are not leaked by either feed or AI.

## Required features — nothing more

| Feature | Minimum implementation | Acceptance check |
| --- | --- | --- |
| Pilot access and connections | Individual authentication, pre-enrolled accounts, operator-configured mutual connections. No connection requests or invitation UI. | Signed-out/unenrolled users cannot read content; unconnected users see public but not connections-only posts/media. |
| Share a spot | One photo, confirmed pin, title/note, access information, Connections only (default) or Public audience. Public exposes the exact destination/content to pilot participants. | Correct content appears for eligible viewers; explicit public selection; bounded validated uploads with metadata stripped. |
| Two feeds and map | Top-center Connections/Public switch; reusable photo-card feed and matching pins. Connections = own/connected authors' posts, newest first; Public = public spots inside radius, nearest first. | Nonconnection public spots appear in Public; no private posts there; switch updates cards/pins and cancels stale responses. |
| Profile radius and discovery area | Fixed name plus saved Public radius; proposed 5 km default, 1–25 km control. Explicit manual area center, labelled pilot fallback; optional one-time device-location shortcut. | Radius persists; inside/on/outside boundary tests pass server-side; denied location does not block manual selection. |
| Open-weight AI discovery | Text embeddings rank only selected-feed candidates after audience/removal and Public-radius filtering. Up to three real spots. | Vocabulary-gap matching improves over keywords; never includes private/out-of-radius candidates or invented places. |
| Spot detail and leave-app action | Photo, original note, author, access information, map position, and external directions link. | Coordinates in the directions link match the pin. User is told directions open an external provider. |
| Mark explored | A voluntary per-user toggle; no GPS proof, photo upload, scores, or public activity stream. | State persists per user; toggling it changes no other member's record. Label as self-reported, not verified. |
| Owner corrections | Edit text/location/access/audience or delete own spot. | Ownership enforced; fresh embeddings; Public → Connections only revokes nonconnection access; deletion stops app media/search access. |
| Reporting and removal | Report spot with predefined reason; operator privately reviews and removes via protected existing backend tooling, not a new dashboard. | Reports are private; reporter cannot remove posts; operator removal excludes content/media from both feeds and AI. |

The small pilot is still a real shared app: simulated user switching is not a
substitute for authentication, and an unlisted URL is not privacy protection.
“Public post” is an audience choice, not a claim of independently verified public
access to the physical place. Radius is measured to the spot, not its author.

## Exactly what the AI does

**Input:** a query such as “somewhere tucked away with interesting textures,”
and real member-written descriptions of spots.

**Output:** up to three semantically ranked spot cards showing the original
notes. Label these as semantic matches, not verified recommendations.

The AI bridges wording differences, such as “interesting textures” matching a
description of carved doors or patterned brickwork. It does **not** infer opening
hours, safety, public access, wildlife presence, walking time, or photo contents.
Do not present unsupported properties as explanations.

Implementation boundary:

- Select one documented open-weight text embedding model with a suitable license
  and runtime during the first two hours. Record its exact identifier, license,
  and where inference runs. A text encoder can satisfy the AI function; a
  generative chatbot is not necessary.
- Use one local/self-hosted inference path under developer control. Do not claim
  on-device/offline inference unless that is actually implemented and tested.
- Embed only title/note text; keep coordinates, member identifiers, and photos out
  of the model payload. Notes can still contain personal information: disclose
  that they are processed and avoid unnecessary payload logging.
- For 10–15 spots, stored embeddings and direct cosine comparisons are enough.
  No dedicated vector database, agent framework, training, or reranking service.
- Enforce audience, selected-feed, removal, and Public-radius filters before ranking.
  Client-side filters are not authorization. Changing radius/center affects AI too.
- Use geodesic straight-line distance (<= radius); bounding-box-only filtering is
  insufficient. Profile persists radius, not precise current location. Discovery
  center is explicit transient state; manual selection remains available.
- Request device location only on user action; never require/retain a live history.
  Center coordinates may reach the backend for filtering, but never the AI.
  No AI route planning or “30-minute walk” promise.
- State “no spots yet” or “search unavailable” honestly. Show ordinary browsing
  as a labeled fallback, not as fake AI results.
- Ensure edited spots do not serve stale embeddings; deleted spots cannot remain
  in the candidate set. Keep model availability/errors visible and recoverable.

**Tags and AI tag suggestions are deferred.** They duplicate discovery work and
are not necessary to demonstrate this loop.

## Minimal screens and data

Five screen states only:

1. Sign in / access denied.
2. Top-center Connections/Public switch, photo-card feed/map and scoped AI search.
3. Add/edit spot.
4. Spot detail with directions and explored toggle.
5. Minimal Profile/settings with saved Public-radius control.

Minimum data: authenticated users/settings (radius), preconfigured connection
pairs, spots (owner/audience/text/pin/photo/access/removal status), derived embeddings,
per-user explored records, and private reports. Feeds are filtered views, not
duplicate posts. No challenge, badge, score, notification, or full profile schema.

Photos require protected storage or appropriately short-lived authorized URLs.
Use a supported metadata-removal/image-reencoding library rather than relying
on the client to remove EXIF. Connections-only means access-controlled, not
end-to-end encrypted. Map/directions services may receive location information;
document the actual data flow rather than promising complete privacy.

## 36-hour schedule and gates

| Elapsed hours | Work | Required output / stop rule |
| --- | --- | --- |
| 0–2 | Freeze scope; choose the existing-familiar app stack, authentication, protected photo storage, map component, and model/runtime. | One sample embedding succeeds on the actual target; hosting/auth/storage access confirmed. If model inference cannot work within this gate, choose a lighter suitable open model, not a closed replacement. |
| 2–6 | Deployment skeleton, auth, preconfigured connections, audience-aware schema/authorization and protected uploads. | Connected/unconnected access rules work; signed-out/unenrolled callers denied. |
| 6–12 | Add/edit/delete with audience, reusable Connections/Public photo feed/map switch, detail, directions, explored. | Both feeds and non-AI sharing-to-visit loop work; public opt-in and owner permissions verified. |
| 12–15 | Rest/break block. | No new scope. |
| 15–21 | Saved profile radius/manual area, server geographic filtering, real scoped embeddings, reports/operator removal; collect real spots. | Radius/feed/AI rules work; private reporting/removal path works. Reuse components and keep Profile to radius only. |
| 21–24 | Compare 8–12 realistic queries against keywords; mobile/deployment/error-state stabilization. | Both feeds, radius boundaries, upload limits and directions work. Feature freeze at hour 24. |
| 24–27 | Rest/break block. | No new scope. |
| 27–31 | Actual checks, audience/radius/media boundaries, second-device smoke test, real outing including nonconnection public discovery. | Document results/failures and consensual evidence; no fake location/visit validation. |
| 31–34 | Finish README, model/data-flow disclosures, demo recording/screenshots, and local DEV submission draft. | Judges can inspect/run the project and understand what open AI contributed. No automatic publishing. |
| 34–36 | Contingency for fixes and final smoke test. | Fix blockers only. If stable, use the time to clarify the write-up, not add features. |

At hour 24, everything not required for the core loop moves to the future
track. Any cut or unresolved limitation must appear in the handoff/README.

This expanded scope is a tighter delivery target, not a guaranteed fit. Contain
it with preconfigured connections, a single reusable feed/map, radius-only
Profile, and existing operator tooling. Do not add onboarding or a moderation UI.

## Verification and definition of done

No feature is done just because it looks correct in the author's browser.

### Core and access checks

- Two separately authenticated members can complete the sharing/discovery loop.
- Direct API/photo requests fail for signed-out/unenrolled callers; unconnected
  enrolled accounts can see public but not connections-only content.
- Connections and Public switch at top center; their cards and pins use the same
  feed rules. Late responses from previous feed/radius/area cannot overwrite state.
- Save radius in Profile and reload; test exact distance boundaries and manual
  center selection. No silent widening when Public is empty.
- Search authorization/feed/radius filtering happens server-side before ranking;
  unauthorized text never reaches a model/candidate response. Client owner IDs,
  feed selection, or radius cannot override audience authorization.
- Another member cannot edit/delete someone else's spot or modify their explored
  record. Validate coordinates, text limits, uploads, and render notes as text.
- A deleted spot disappears from search/map and protected shared media access.
- Note/location edits show the new values and current search representation.
- Audience edits revoke nonconnection access to formerly public content, including
  search/media endpoints; document already-issued signed-URL expiry limitations.
- Report submission is private; only operator can remove a spot. Removed spots
  disappear from both feeds, media access, direct detail, and AI candidates.
- No device-location permission is needed to browse or open a selected spot.
- Main flow remains usable on the second phone/device; deploy URL is reachable.

### AI checks

- Record the model ID/license/runtime and whether text leaves the device.
- Save actual query results versus a basic keyword baseline, including failures.
  This is pilot evidence, not a statistically reliable benchmark.
- Include vocabulary-gap queries, multiple plausible matches, sparse notes, and
  a request for an attribute no poster supplied. Do not invent that attribute.
- Surface irrelevant/uncertain results honestly; no arbitrary similarity number
  presented as calibrated confidence. Report search latency on the actual host.
- Simulate model failure: ordinary map browsing and directions remain usable.

### Real-world and submission evidence

- Use only consensually shared, appropriate public-access spots. Do not expose
  private homes, sensitive animal habitats, or other people's live whereabouts.
- Have another person choose and attempt an outing; record what helped or failed.
  Do not present a self-reported explored toggle as proof of a physical visit.
- README includes setup, environment-variable placeholders, run/check commands,
  model attribution/license, architecture/data flow, known limits, and demo link.
  Actual secrets and raw private locations/session material stay out of docs.
- Public code, a live demo or clearly reproducible demonstration, and an English
  DEV draft using the official template and `#hf26challenge` are prepared. Disclose
  AI assistance accurately; sanitize any optionally shared agent transcript.
- For challenge eligibility, new work must be built within the official window.
  The 36-hour plan does not change the deadline: October 12, 2026, 12:29 PM IST
  (October 11, 11:59 PM PDT). Allow time for user review/publication before it.

## Hard cut order when behind schedule

Cut in this order:

1. Animations, decorative branding, and nonessential layout work.
2. Optional device-location shortcut; keep manual area selection and required radius.
3. Extra result controls, sort options, and elaborate search explanations.
4. Additional sample content beyond enough real spots to test the loop.

**Do not cut:** honest functional AI, audience authorization, photo protection,
both feeds/top-center switch, saved radius/manual center, reporting/removal,
owner correction/deletion, sharing/directions/explored, error states, or checks.
If these cannot be delivered, describe the result as an incomplete prototype
rather than a finished audience-aware discovery app.

## Sources and rationale

- Official Week 1 challenge, inspected through DevRelay (event 79):
  https://dev.to/challenges/hacktoberfest-week1-2026-10-05
  Open-source AI must be central; writing quality is weighted most heavily.
- James Anderson, “7 Signs You're Over-Engineering Your AI App (and How to Stop)”:
  https://dev.to/james_anderson_h/7-signs-youre-over-engineering-your-ai-app-and-how-to-stop-4gb
  Start with simple infrastructure and compare to a baseline. Comments warn
  that easy fixtures can misrepresent search quality; use realistic queries.
- emorilebo, “Before an LLM request leaves your app, inspect what it contains”:
  https://dev.to/emorilebo/before-an-llm-request-leaves-your-app-inspect-what-it-contains-2om3
  Minimize and inspect model inputs; review logs, photos, and downstream data
  flows separately. These articles are design guidance, not product validation.
- Public-discovery revision requested by the user: unlike people-proximity apps,
  publish intentional destination pins, not member whereabouts or live visits.
