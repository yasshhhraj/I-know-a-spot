# Frontend redesign research notes

Status: planning reference only. No package was installed and no external site was
used as permission to change the application. The recommendations in
`FRONTEND_REDESIGN_PLAN.md` should be reviewed against the repository's product and
security requirements before implementation.

## Repository context checked

- `AGENTS.md`, `PRD.md`, `BUILD_SCOPE_36H.md`, `WORKBOARD.md`.
- `frontend/AGENTS.md`, `frontend/package.json`, `frontend/vite.config.ts`.
- `frontend/src/App.tsx`, `SpotWorkspace.tsx`, `SpotMap.tsx`, `styles.css`, and
  the existing auth/API/search/explored/reporting modules.
- Existing constraints retained: React 19, Vite, Tailwind 4, Leaflet, static
  bundle direction, protected media, audience/radius boundaries, camera flow,
  fail-closed account/session behavior and current test commands.

## Official design references

### Material UI

- [Material UI overview](https://mui.com/material-ui/getting-started/overview/)
  describes the React component library and its installation model.
- [Theming](https://mui.com/material-ui/customization/theming/) supports a
  centralized theme with palette, typography and component defaults.
- [Responsive UI](https://mui.com/material-ui/guides/responsive-ui/) documents
  breakpoint-oriented responsive patterns.
- [Minimizing bundle size](https://mui.com/material-ui/guides/minimizing-bundle-size/)
  recommends path imports. This matters more here because the current Vite config
  intentionally keeps `treeshake: false` after a prior build hang.
- [Tailwind CSS v4 integration](https://mui.com/material-ui/integrations/tailwindcss/tailwindcss-v4/)
  describes layer ordering and reset concerns for a hybrid stack.
- [Button](https://mui.com/material-ui/react-button/) and
  [Bottom navigation](https://mui.com/material-ui/react-bottom-navigation/)
  provide component-level affordance references, not a mandate to copy defaults.

The inspected MUI documentation is Material Design 2-oriented. The plan therefore
uses Material principles—clear hierarchy, feedback, touchable controls and tonal
surfaces—without describing the proposed theme as full Material 3.

### Accessibility and interaction

- [WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
  gives a 24×24 CSS-pixel minimum with exceptions. The plan chooses approximately
  48px controls for comfort, not as a claim that size alone proves accessibility.
- [WCAG 2.2 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
  supports the need to check normal text, large text and UI boundaries separately.
- [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
  supports keeping advanced area/reporting/access controls available while moving
  them out of the first-run/primary feed hierarchy.

### Community wisdom

- [Designing Mobile-First UX: Responsive Design in Practice](https://dev.to/pipipi-dev/designing-mobile-first-ux-responsive-design-in-practice-g96)
  was used as a community reference for starting from constrained screens, scaling
  content deliberately and testing real responsive states rather than treating a
  desktop layout as a shrunken phone layout.

Community sources are directional and not authoritative for this product's privacy,
authorization, radius or media behavior. Repository docs and existing tests win.

## Palette check

The following opaque foreground/background pairs were calculated during planning
using the WCAG relative-luminance contrast formula; they still require rendered
component and focus-state review:

| Pair | Approx. ratio |
| --- | ---: |
| `#FFFFFF` on `#1F6B50` | 6.408:1 |
| `#172C25` on `#F7F8F4` | 13.832:1 |
| `#52645B` on `#F7F8F4` | 5.908:1 |
| `#172C25` on `#DCEFE5` | 12.309:1 |
| `#7C8B83` on `#FFFFFF` | 3.573:1 |
| `#795B00` on `#FFF1C2` | 5.624:1 |
| `#B42318` on `#FEE4E2` | 5.450:1 |

The muted outline is intended for non-text control boundaries and should not be
used as normal body text. Divider color is decorative and cannot be the only
indicator of an interactive control. Images, hover, focus, disabled and selected
states need a separate rendered audit.

## Decision log

1. **Do not install MUI during planning.** The current app does not have MUI,
   Emotion or MUI icons. Adding them changes dependencies and build behavior, so
   the user must approve the library choice and install packages themselves.
2. **Prefer one component strategy.** If MUI is approved, use it for controls and
   a single theme while retaining Tailwind for layout. If not, reproduce the same
   tokens and component boundaries with the existing Tailwind/native stack. Do not
   mix two competing button/field systems screen-by-screen.
3. **Avoid feature expansion.** No likes, saves, ratings, background location,
   geocoding, social counts, anonymous feed, public signup or auto-submission was
   added to the redesign proposal.
4. **Treat the brand mark as a study.** `SPOTMARK_CONCEPT.svg` is an original
   forest-pin/leaf sketch for review, not a final asset or trademark-clearance claim.

## Suggested verification when implementation starts

- Run the real frontend `npm run typecheck`, `npm run build`, and `npm test` from
  `frontend/` after each meaningful slice.
- Compare production chunks before/after any UI dependency. The known baseline
  after the camera fix was approximately 427.22 kB entry and 205.21 kB lazy
  workspace; confirm against the current build rather than treating these as a
  current measurement.
- Test 320/360/390/430/768/900/1280px, 200% text, portrait/landscape, keyboard
  focus, camera return, account/session transitions and protected media behavior.
- Recheck feed switch, confirmed Public center, saved radius, submitted semantic
  query, explored uncertainty, report receipt/uncertainty and delete cleanup.
