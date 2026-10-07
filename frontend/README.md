# I Know a Spot — frontend scaffold

React + TypeScript + Vite mobile-web scaffold, with Tailwind CSS v4, Leaflet / React Leaflet, and a lazy Supabase JS client dependency. This is **setup only**: the displayed page makes no API requests, and there are no working feeds, authentication, maps, photo uploads, or AI search yet. Product requirements are in [../PRD.md](../PRD.md), the current release plan in [../BUILD_SCOPE_36H.md](../BUILD_SCOPE_36H.md), and deferred work in [../FUTURE_SCOPE.md](../FUTURE_SCOPE.md).

## Local setup

Use Node.js 24 LTS (recommended for both folders; see `package.json` engines).
From `frontend/`:

```sh
npm install
cp .env.example .env.local
npm run dev
```

The Vite development URL is `http://localhost:5173` (port 5173). The anticipated backend is separate, at `http://localhost:3001`; its only anticipated endpoint at setup time is `GET /health`. The scaffold does not call it. Configure `VITE_API_BASE_URL` in `.env.local` for later API integration. The public Supabase URL and **publishable** key placeholders can be filled when the corresponding project is available; the current page renders without them because the client factory is lazy.

For checks and a static production bundle, still from `frontend/`:

```sh
npm run typecheck
npm run build
npm run preview
```

`npm run build` typechecks and writes static assets under `dist/`, including `index.html`, for a web deployment and later Capacitor packaging. `npm run preview` serves a local preview of an existing build. Install dependencies yourself before running checks; none are installed by this scaffold. If connecting from a phone later, the server must be made reachable on your LAN and API/Supabase origins configured for that device; `localhost` refers to the device itself.

## Configuration boundaries

- `src/config.ts` centralizes the API base from `VITE_API_BASE_URL`; future requests should use that value instead of hardcoded origins.
- `src/supabase.ts` creates a browser client only when a future feature requests it and both public settings are provided. It is not an authentication implementation.
- `VITE_` values are bundled into browser assets. Only public Supabase project URL and publishable key belong here; never add a secret/service-role key. Audience and ownership checks belong on the backend, not in hidden frontend controls.
- Leaflet and React Leaflet are declared for later map work. Add Leaflet CSS and any marker assets when implementing an actual map; none is rendered by this scaffold.

The future demo is online-only. Native Capacitor packaging, browser/device integration, and application flows are separate implementation steps.

## Current build caveat

Local production builds with Vite 7.1.9 / Rollup 4.64.1 hung in the optimizer path.
`vite.config.ts` temporarily disables tree-shaking; typechecking, bundling, CSS,
and minification still run, but unused code remains. The original build command
passes with this workaround. Revisit optimization before release; do not change
dependency versions or claim the upstream issue is fixed without verification.
