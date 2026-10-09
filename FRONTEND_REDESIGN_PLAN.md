# I Know a Spot — mobile-first frontend redesign plan

Status: **planning only; user review and implementation authorization pending**.
Prepared in the current session, not as unattended/background work.
Scope: redesign the existing frontend, information hierarchy and component layout.
Do not change APIs, audience/radius rules, authentication, model, backend or schema.
Sources of truth remain PRD.md, BUILD_SCOPE_36H.md, API_CONTRACT.md and WORKBOARD.md.
Research/provenance: FRONTEND_DESIGN_RESEARCH.md. Logo study: SPOTMARK_CONCEPT.svg.

## 1. Design objective and current problems

Make the app feel like a calm, contemporary outdoor-discovery product, not an
operator dashboard. Start at 320–430px phone widths; expand deliberately for desktop.
This is a visual/navigation refactor of working features, not a new product scope.

Observed in current source (not a visual usability study):
- App.tsx keeps a large Pilot access/welcome/verification explanation around the
  entire enrolled workspace. This consumes the first screen before useful content.
- SpotWorkspace.tsx combines forms, feed, area editor, map, detail and settings.
- Discovery shows long system explanations, numeric area inputs, map, search help
  and several action rows simultaneously. Actions compete with the spots.
- Detail always opens the full reporting form alongside explored, owner actions,
  coordinates, access prose and map. A rarely needed action dominates the page.
- Nearly every button has similar bordered emphasis. There is little visual rank.
- Colors are reasonable outdoors but scattered utility values are not a design
  system. The brand has no distinctive original mark or intentional landing page.

Acceptance direction:
1. A phone user can recognize Discover, Add a spot and Profile without a tutorial.
2. The first signed-in view prioritizes eligible spot cards or an honest empty state.
3. Primary actions are clear; related controls are grouped, not duplicated.
4. Area editing, reporting and owner correction appear in focused secondary views.
5. Required audience/access warnings and failure recovery remain readable/discoverable.
6. Camera return, fresh-session checks and all existing regression behavior survive.

## 2. Recommended visual direction: Forest & Opal

Nature-adjacent, editorial, light. Deep forest is the action color; warm white is
the canvas; mint creates quiet selected states. Opal is a visual direction/name,
not a dependency or claim about a prescribed Material palette.
Avoid neon green, glassmorphism, excessive gradients, stacked shadows and all-caps
paragraphs. Photographs provide the variety; the UI stays restrained.

| Token | Hex | Use |
| --- | --- | --- |
| primary | #1F6B50 | Main CTA, focused controls, selected indicators |
| primaryContainer | #DCEFE5 | Selected segment/nav surface; dark text, NOT white |
| canvas | #F7F8F4 | Warm off-white page background |
| surface | #FFFFFF | Cards, sheets and inputs |
| textPrimary | #172C25 | Titles/body/selected text |
| textSecondary | #52645B | Metadata, labels, explanatory text |
| divider | #D7DED6 | Decorative card/section separation only |
| interactiveOutline | #7C8B83 | Input/control boundaries where outline identifies control |
| warningText / warningSurface | #795B00 / #FFF1C2 | Uncertain outcomes/access cautions |
| errorText / errorSurface | #B42318 / #FEE4E2 | Validation/errors/destructive confirmation |

Numerically checked opaque sRGB pairs (approximate ratios, not a rendered UI audit):
white/primary 6.408:1; textPrimary/canvas 13.832:1; textSecondary/canvas 5.908:1;
textPrimary/mint 12.309:1; interactiveOutline/white 3.573:1;
warningText/warningSurface 5.624:1; errorText/errorSurface 5.450:1.
Do not reduce text opacity or put these colors on photographs without rechecking.
Light divider is not sufficient as the sole boundary of an interactive control.

Alternatives prepared, not mixed into the same theme:
- **Stone & Sky:** primary#315DA8, canvas#FAF9F5, white cards; crisper/cooler.
  White on primary6.438:1. Less directly connected to Touch Grass than Forest.
- **Coastal Teal:** primary#176B73, pale seafoam/white surfaces; fresh but more generic.
  White on primary6.200:1. Reserve as the second brand direction if Forest is rejected.

## 3. Material UI/library decision

Recommended after approval: use **Material UI as the component layer**, with a
custom Forest & Opal theme. Preserve React19/Vite/Tailwind/Leaflet and static output.
Current frontend has NO MUI/Emotion/icon dependency; research is not installation.

Important: inspected MUI docs explicitly describe **Material Design2**, not stock
Material3. Use modern tonal surfaces, hierarchy and compact layouts as design
inspiration, but do not claim full Material3 compliance.

Proposed packages to review/pin/install ONLY after the user authorizes and installs:
@mui/material, @emotion/react, @emotion/styled, @mui/icons-material.
No Next.js, native framework, routing framework, state library, carousel, chart
package, MUI X/paid kit or remote font/icon CDN is required.
Published installation docs allow React19; exact selected package version/peer
compatibility and real build must still be checked when implementation begins.

Rules if MUI is approved:
- One ThemeProvider for tokens/typography/component sizes. No theme per screen.
- MUI owns controls, dialogs/cards/nav. Tailwind remains for structural utilities
  and existing Leaflet integration; don't style the same property in both systems.
- Establish MUI/Tailwind4 CSS layer/reset ordering before converting whole pages.
  Validate input/focus/map-popup styles; no indiscriminate global CSS reset.
- Import components/icons by path, e.g. @mui/material/Button and
  @mui/icons-material/CameraAltOutlined, not whole-package barrels.
- Preserve lazy workspace and treeshake:false workaround. Measure actual bundle
  growth; path imports do not magically guarantee a small production build here.
- Do not adopt generic MUI demos/templates wholesale or install a starter kit.

Fallback if no new dependencies are approved: implement the SAME layout/tokens
with existing Tailwind and native semantics. Do not alternate library strategy
between screens. MUI adoption is an explicit return-session decision.

## 4. Sizing, typography and spacing

- Type: system-ui/-apple-system/BlinkMacSystemFont/Segoe UI/sans-serif first.
  Optional self-hosted Inter after asset/license approval; no automatic CDN font.
- Body/input16px (1rem), metadata14px, screen title24–28px, card title18–20px;
  landing heading32–36px on phone /44–52px desktop. No tiny12px action labels.
- Body line height1.5; headings1.15–1.25; labels sentence case, medium weight.
- Spacing scale4/8/12/16/24/32/48px. Phone gutters16px; larger screens24–32px.
- Default action/button height48px; field minimum52–56px; icon artwork20–24px
  inside a48×48px hit target. Normal horizontal button padding16–20px.
- Full-width filled CTA only where a screen has a primary commit action (sign-in,
  Share spot, Save radius, directions). No oversized full-width button per card.
- Cards radius16px; inputs/buttons12px; only segments/chips use pill shapes.
  One subtle surface border/elevation; no floating card inside another card.
- Focus ring clearly visible, not removed. At least8px separation for independent
  adjacent controls. Never shrink targets merely to fit more controls in a row.
- Project48px target policy exceeds WCAG2.2 AA's24px target-size minimum (with
  exceptions). These are CSS pixels, not claims of platform dp or full conformance.
- Support320px without horizontal page scrolling,200% text scaling, landscape
  and keyboard focus. Inputs must retain labels; placeholder is not a label.
- Use safe-area insets and reserve space for fixed controls. Avoid100vh trapping
  forms; use dynamic viewport/fallback and normal document scrolling.
- Motion optional and short (~120–180ms), respecting prefers-reduced-motion.

## 5. Screen hierarchy: one task, one focused surface

Use the existing five product states; Landing and Sign-in are two presentations
of the Access state. Area/report/delete are contextual dialogs, not new dashboards.
Phone main navigation: **Discover / Add spot / Profile**, icons AND text labels.
Discover keeps the REQUIRED top-center **Connections / Public** switch. Do not
replace it with separate bottom destinations or silently default everyone to Public.
Desktop uses the same destinations in a compact top bar; content stays constrained.
Add/detail are focus views: Back/Close in header and task actions at bottom, not
both global bottom navigation and another stacked action bar.

### Access: landing and sign-in

Landing composition:
1. Original mark + I Know a Spot wordmark, compact Sign in action.
2. Headline: **Small discoveries. A reason to go outside.**
3. Supporting copy: **Share overlooked places with your connections. Find Public
   spots around an area you choose, and search by what you feel like seeing.**
4. One filled CTA: **Sign in to explore**. Secondary text link: **How it works**.
5. One restrained abstract illustration of a doorway/leaf/pin/card, not a giant
   fake map or an actual private member photograph. Illustrations clearly not data.
6. Three short steps: Notice & share / Find by meaning / Go & mark explored.
7. Small pilot/privacy note: **For pre-enrolled pilot members. Public posts are
   visible to other enrolled members.** No signup/waitlist CTA or anonymous feed.

Phone: one-column copy then illustration, short enough CTA is not buried. Desktop:
two-column hero with identical copy. No fake user counts, reviews, app-store badges,
guaranteed safety, verified visits or exaggerated AI claims. Footer has privacy/data
flow and pilot information; no social features implied.
CTA opens focused sign-in screen/section: logo, email/password, one sign-in button,
error/status area and Back. Keep restoration/verification/denied/outage/logoutFailed
separate and truthful. Enrolled users go directly to Discover, not another landing.

### Discover

Visible normal phone layout, ordered:
- Compact brand header; optional refresh icon with an accessible label, no giant
  Welcome/Pilot access card or implementation/debug text.
- Top-center Connections/Public segmented control (both48px targets).
- Labelled **Find spots by meaning** field with explicit submit control/keyboard
  Search action. Only one example prompt; no permanent multi-paragraph tutorial.
- Public only: **5 km · Pilot area** or **5 km · Chosen area** compact button. Opens
  Choose area; radius remains saved in Profile. No numeric coordinates in feed.
  Without confirmed center: concise empty/setup state with Choose area CTA; no
  automatic location request or silent(0,0)/radius widening.
- Low-emphasis List/Map view control and results/status line. On phones display
  ONE representation at a time; the selected feed/query and same returned spots
  drive both. List default; Map intentional alternative. No simultaneous giant
  world map before the cards. Do not add sort/filter controls unsupported by APIs.
- Photo cards: fixed3:2 image area, title, short ORIGINAL note excerpt, author and
  audience label; distance only for Public. No likes/saves/ratings/public visits.
  One accessible opening target; avoid nested clickable card and controls.
- Bottom navigation Discover/Add spot/Profile; no duplicate Add FAB plus Add row.

Search results use the same cards, label **Semantic matches**, max3. Active search
shows a small submitted-query row and Clear action; don't imply typing submits.
Preserve separate draft/submitted query and exact busy/unavailable/empty states.
Refresh remains possible via compact control; pull-to-refresh is not required.
Long system explanations move to Profile -> About & privacy, not removed from docs.

Desktop, >=900px: optionally list + map side by side when both are useful, with
shared current result data. Phone/tablet view change must not duplicate fetches,
mount two separate domain controllers or reset an in-progress draft.

### Choose area (contextual surface)

Triggered by Public area summary. Compact phone sheet/fullscreen dialog with title,
close/back, map to STAGE a center, numeric coordinate alternatives, current source
label and **Confirm area** CTA. Optional Use configured pilot area if configured.
Map pan/tap/numeric edits cannot change discovery until confirmation. Cancel keeps
prior confirmed area. A View radius in Profile link is secondary, not another slider
with unsaved settings. No geocoder/background GPS/Use my location feature added.

### Add/edit spot

Focused single scrolling form with three sections, NOT a long multi-step wizard:
1. **Photo & story**: equal-rank Take photo / Choose photo controls, one preview,
   Title and Note with compact limits. Existing edit has no replacement-photo UI.
2. **Destination**: selected-pin preview/summary + Choose destination button opens
   focused pin-picker surface; numeric alternatives remain available there. A map
   overview is never a saved pin; pin confirmation stays explicit.
3. **Audience & access**: Connections only default / Public radio options; Public
   disclosure stays beside that option. Required appropriate-public-access checkbox
   remains visible and distinct from audience. Optional Known restrictions field
   can expand on request, while any existing nonempty value is visible on edit.

Commit footer: one Share spot / Save changes button, plus low-emphasis Cancel/back.
Don't disable scrolling or obscure focused fields with footer/keyboard. Display
field errors inline and uncertain-outcome recovery persistently near commit area;
not transient snackbars. Uncertain create still checks own Connections separately.
The original File, fields and mutation state live in one stable form owner, outside
temporary pin-picker dialogs. Camera refocus guard unchanged; no viewport-dependent
key, remount on focus or persistent photo/draft storage. Never auto-submit on file
selection, picker return, step change or dialog close.

### Spot detail

- Back, concise title and owner-only More actions button in header.
- Protected hero photo, author/audience metadata, full original note.
- A compact **Access information** section with poster attribution; important
  restrictions remain visible before directions, not hidden inside an About menu.
- Destination map/coordinates in secondary disclosure; the map/list alternative
  remains available. No precision coordinates redundantly repeated everywhere.
- One prominent **Open directions** action and short external-provider notice.
- Compact **Explored (self-reported)** state/control, own record only; retain loading,
  error, pending and explicit Reload state after uncertainty. Not a verified badge.
- Always-discoverable **Report a concern** text/icon row opens report dialog. Don't
  hide reporting entirely inside an unlabeled owner menu.
- Owner menu: Edit spot / Delete spot. Delete opens confirmation, never immediate
  trash-icon deletion. Cleanup-pending recovery remains available after hiding.

Report surface: four reasons, private-review notice, explicit Submit report, cancel;
no free text/count/automatic takedown. Retain validated receipt, uncertainty and
same-reason explicit retry; auth/missing callbacks close and clear inaccessible UI.

### Profile/settings

Fixed name, enrolled-pilot context (not public bio), saved Public radius1–25km with
number entry and optionally synchronized slider, one Save radius action. Explicit
save only; the last confirmed value remains on failure. Explain straight-line
discovery distance once. Add About & privacy disclosure and separate Sign out row.
No avatar upload/name edit/connection-management toggles or settings not implemented.
Sign out remains accessible even if a lazy workspace chunk fails.

## 6. Icons and branding

One consistent outlined Material icon family,20–24px; SVG path imports, not an icon
font/CDN. Do not load icons from multiple sets or decorate every paragraph.

| Purpose | Proposed MUI icon | Label rule |
| --- | --- | --- |
| Discover | ExploreOutlined | Text in navigation |
| Add | AddCircleOutline | Add spot text in navigation |
| Profile | PersonOutline | Profile text in navigation |
| Search | Search | Accessible Find spots label; keyboard submit |
| List / Map | ViewListOutlined / MapOutlined | Visible List/Map labels |
| Area/destination | PlaceOutlined | Choose area/destination text |
| Capture / library | CameraAltOutlined / PhotoLibraryOutlined | Both text labels |
| Directions | DirectionsOutlined | Open directions text, external notice |
| Explored | CheckCircleOutline | Self-reported text; not only green color |
| Report | FlagOutlined | Report a concern visible text |
| More / back / close | MoreHoriz / ArrowBack / Close | aria-label + focus target |
| Delete | DeleteOutline | Labelled destructive confirmation |
| Refresh | Refresh | Accessible label, not repeated per card |

Brand recommendation: **Spotmark**, an original rounded destination pin enclosing
a simple leaf/grass motif. Pin=place, leaf=notice the outdoors; not a radar/live
location tracking logo. Use with full I Know a Spot wordmark, not an obscure acronym.
Primary forest on warm/white; mint inset; monochrome version for small contexts.
Prepared original concept SVG is a design study, not installed brand assets or a
trademark-clearance claim. Verify readability at24/32px and export favicon variants
only after approval. Avoid copying Google Maps pins or importing another brand mark.

## 7. Proposed component boundaries

Paths are proposed, NOT files already implemented. Extract a cohesive feature,
not one file per label. Keep business/state logic in current tested controllers.

| Area / proposed path | Responsibility |
| --- | --- |
| src/theme/theme.ts + tokens.ts | Approved color/type/spacing/size tokens and MUI overrides |
| src/components/brand/BrandLogo.tsx | Original mark + wordmark variants, no data |
| src/components/layout/AppShell.tsx | Enrolled header, constrained body, safe-area nav |
| src/components/layout/PrimaryNavigation.tsx | Shared Discover/Add/Profile destinations |
| src/components/ui/StatusPanel.tsx | Explicit loading/empty/error/uncertain variants and retry |
| src/features/access/LandingPage.tsx | Public marketing copy/abstract illustration only |
| src/features/access/SignInForm.tsx + AccessStatus.tsx | UI driven by existing AuthController |
| src/features/discovery/DiscoveryPage.tsx | Feed/query/view orchestration, one result source |
| src/features/discovery/FeedSwitch.tsx + SemanticSearchBar.tsx | Controlled inputs, no independent fetch |
| src/features/discovery/DiscoveryAreaDialog.tsx | Staged center; confirm/cancel contract |
| src/features/spots/SpotCard.tsx + SpotList.tsx | Same authorized rows as map, no fake stats |
| src/features/spots/ProtectedPhoto.tsx | Existing caller-JWT blob URL ownership/cleanup |
| src/features/spots/SpotDetailPage.tsx | Note/access/directions/explored/report entry |
| src/features/spots/SpotEditor.tsx | Single owner of File/fields/uncertainty/pending state |
| src/features/spots/PhotoPicker.tsx + DestinationPickerDialog.tsx | Input presentation/staged pin, not draft ownership |
| src/features/spots/AudienceAccessFields.tsx | Mandatory audience/disclosure/access semantics |
| src/features/spots/OwnerActionsMenu.tsx + DeleteSpotDialog.tsx | Owner-only actions and deliberate confirmation |
| src/features/reporting/ReportDialog.tsx | Reuse report controller/API, not new report workflow |
| src/features/profile/ProfilePage.tsx + RadiusForm.tsx | Saved caller radius, fixed name, sign-out entry |

Reuse/re-style current ExploredControl rather than duplicate its controller. Keep
SpotMap as the Leaflet adapter until a separate focused move is justified. Retain
access to its numeric alternatives and OSM attribution. A purpose-named shared
button/field wrapper is optional only when needed; don't build a generic UI framework.

Existing modules to preserve before any intentional refactor:
authController, api, supabase, config, publicKey, spotApi, spotScope, discovery,
mapCoordinates, searchApi/searchController, exploredApi/exploredController,
reportApi/reportController. Keep their tests and request semantics. No global state
manager just to coordinate three pages; extract a small workspace hook only if it
reduces current orchestration without duplicating state or changing cache scope.

Examples of explicit ownership:
- SemanticSearchBar receives draft/submitted state, callbacks and pending state;
  it doesn't own a second query state machine or call the encoder/API itself.
- SpotList and map receive exactly the same authorized array and selection callback.
- PhotoPicker returns a File or validation event to SpotEditor. Opening destination
  picker does not unmount PhotoPicker or change form identity.
- Dialog content belongs inside the verified user subtree. On sign-out/account/token
  changes, close dialogs and destroy inaccessible private content/blob URLs.
- Do not create separate mobile/desktop editor mounts, use viewport-derived keys,
  duplicate AuthControllers or keep an unverified workspace hidden behind CSS.

## 8. Implementation sequence for the return session

No implementation is authorized by this planning document alone.

| Phase | Deliverable | Gate |
| --- | --- | --- |
| 0: Review | Approve Forest & Opal, Spotmark direction, screens and MUI/no-new-deps choice | User decision; package installation separately user-run |
| 1: Foundation | Tokens/theme, brand, button/input rules, CSS-layer proof, lazy shell | Real typecheck/build; no auth state changes; bundle measured |
| 2: Extract | Move cohesive current UI pieces without restyling behavior | Existing frontend tests pass; fresh-session/camera safeguards intact |
| 3: Access + Discover | Landing/sign-in, compact app shell/feed/search/cards/area surface |320–430px hierarchy; no public member data; same list/map source |
| 4: Task screens | Detail, single-owner editor/pin picker, report/delete surfaces, Profile | Save/access/recovery work; errors remain persistent |
| 5: Phone review | Keyboard/safe-area/focus/capture/account-switch/a11y/source-data checks | User handset confirmation plus project checks; fix regressions only |

Future parallel work (only after implementation is requested): two bounded
frontend parts, one for foundation/access/new shell files and one for extracted
feature surfaces. Lead owns App/SpotWorkspace/main/styles integration and shared
contracts/board; agent files must not overlap. No automatic nested swarm/worktrees.
Do not launch implementation agents while the user asked only for planning.

## 9. Regression and visual verification checklist

- Run frontend npm run typecheck && npm run build && npm test after each meaningful
  implementation slice. Last existing evidence: 62 frontend / 137 backend tests;
  this planning session does not rerun or extend those checks.
- If APIs/authorization are unchanged, avoid unrelated backend changes/migrations.
- Camera capture/library selection/cancel/same-session refocus preserve the form;
  changed tokens/accounts/sign-out/explicit checks remain fail-closed. Long browser
  discard recovery is still not implemented; do not quietly promise draft persistence.
- Selected-feed/confirmed-center/saved-radius/submitted-query epochs and stale
  success/error rejection unchanged. Public radius before ranking, no widening.
- Cards/map/details/blob images use caller authorization; no public img URL swap.
  No protected photos/member names/notes copied to the unauthenticated landing.
- Direct ?spot links and browser Back remain correct after new navigation. Preserve
  the existing static URL scheme unless a separately agreed migration is necessary.
- Commit/error dialogs obey keyboard focus trap, visible Close/Cancel and focus
  return. Screen-reader labels/aria-pressed/status announcements remain meaningful.
- Report success/uncertainty, explored unknown/reload, delete cleanup pending and
  create reconciliation are not replaced by generic green snackbars.
- Test320/360/390/430/768/900/1280px, text zoom200%, portrait/landscape and phone
  keyboard. No content hidden under sticky actions/notches; no hover-only controls.
- Recheck final theme states' text/nontext contrast, input labels, disabled/pending,
  selection and focus. Color-token math alone isn't full WCAG conformance.
- Measure pre/post production chunks/gzip and real phone loading. Known original
  build baseline after camera fix: entry427.22kB, lazy workspace205.21kB; don't
  silently accept enormous MUI/icon/font imports with tree-shaking disabled.
- Keep failed lazy chunk recovery and sign-out available. Recheck Leaflet viewport
  resize/invalidateSize when toggling List/Map or opening a picker dialog.
- Existing direct Storage/forbidden write/security audit gaps stay recorded; visual
  polish does not count as completing them. No deployment/publishing implied.

## 10. Resume here

Ready for review: Forest & Opal tokens (with checked color pairs), original logo
study, landing/content hierarchy, six task surfaces and proposed component ownership.
Inline OmniRush mockups illustrate hierarchy only, not actual theme rendering.

When the user returns, first confirm:
1. Forest & Opal + Spotmark direction, or choose Stone & Sky/Coastal Teal.
2. Actual MUI component adoption and user-run dependency installation, or existing
   Tailwind/native fallback. Do not infer installation permission from research.
3. Approve focused screen hierarchy/single scrolling editor/contextual dialogs.

Then start Phase1 ONLY when requested. Read WORKBOARD and git status again; preserve
unrelated work and existing auth/camera/API scope tests. No private env changes,
backend rewrites or speculative new features are prerequisites for this redesign.
