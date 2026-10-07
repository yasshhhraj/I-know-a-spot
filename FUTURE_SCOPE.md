# I Know a Spot — future scope

The current sprint is defined in [BUILD_SCOPE_36H.md](BUILD_SCOPE_36H.md), with
product requirements in [PRD.md](PRD.md).
Everything below is **excluded from the 36-hour build**. These tracks are a
backlog, not delivery promises, and their order is not a committed schedule.

## Track A: richer contribution and discovery

- Manual tags and reviewed AI tag suggestions.
- Visit photos, visit notes, saves, and structured best-time information.
- Stronger search evaluation, better relevance handling, and preference controls.
- Map clustering and larger-area exploration.

## Track B: group growth

- Self-service connection requests/acceptance and connection management. The current
  pilot uses operator-configured consented mutual connections.
- Self-service group creation, invitations, join requests, member administration.
- Multiple groups, cross-group sharing, full profiles, and activity summaries.
  Minimal Profile with a saved Public discovery radius is included now.
- Group-export/deletion tools and broader moderation dashboards/appeals. Basic
  spot reporting and protected operator removal are included now.

## Track C: lightweight motivation

- Group challenges, badges, favorite photos, private visit/save counts.
- Optional notifications and summaries without an engagement-maximizing feed.
- Test whether these increase actual outings before building leaderboards.

## Track D: outdoor convenience and advanced AI

- Capacitor packaging of the web frontend for Android/iOS.
- Native camera/location plugins, login callbacks/deep links, and native navigation behavior.
- Native-device testing, signing, and app-store distribution.
- Custom camera UI and multiple photos per spot. Browser capture/selection of one
  photo is already included in the current release, not deferred.
- Offline spot packs, PWA installation, offline maps, and on-device inference.
- Grounded multi-stop outing planning backed by reliable walking/access data.
- Opt-in photo understanding with review and clear uncertainty boundaries.
- Accessibility-aware suggestions based on verified poster-supplied information.

## Track E: broader platform

- Anonymous public browsing, unrestricted signup, public groups, larger-scale
  search, and following. Radius-filtered Public and Connections feeds for signed-in
  pilot accounts are included in the 36-hour release, not deferred.
- Dedicated vector infrastructure only after measured need.
- Optional visit verification only after privacy/abuse tradeoffs are evaluated.
- Sponsor integrations or prize-track-specific additions only when genuinely
  useful; none are needed to qualify for the overall challenge.

## Guardrail

Do not pull items into the current sprint unless its scope is explicitly revised.
Finish and verify audience-aware sharing → Connections/Public discovery with
saved radius → AI search → directions → explored first. Use pilot feedback to
decide which future work earns its place. No private locations or user whereabouts
are automatically made public by this revised scope.
