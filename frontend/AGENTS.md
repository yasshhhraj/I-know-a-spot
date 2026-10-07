# Frontend instructions (scoped to `frontend/`)

- Follow `../PRD.md` and `../BUILD_SCOPE_36H.md` for the current mobile-web pilot; `../FUTURE_SCOPE.md` is deferred work. This folder is a scaffold until real user flows are implemented and checked.
- Keep React/TypeScript/Vite output static-buildable (`dist/index.html`) for later Capacitor packaging. No server-only libraries or native plugins in the frontend bundle.
- Keep backend access behind `src/config.ts`'s `apiBaseUrl`. Development frontend port: 5173; anticipated backend port: 3001. Do not assume API contracts beyond the anticipated `GET /health` without backend coordination.
- Only public configuration may use Vite's `VITE_` prefix. Never put private keys, service-role credentials, model secrets, or individual spot/member data in source or environment examples. Authorization and protected media access must be enforced on the server.
- The Supabase client factory is lazy; do not claim the presence of a client library means auth, RLS, or feeds are implemented. Keep UI truthful about unavailable flows and failures.
- Preserve mobile-friendly browser behavior and accessibility when adding screens. Add Leaflet CSS/attribution with the actual map implementation; do not imply a map is present before one is rendered.
- Run `npm run typecheck` and `npm run build` from this folder after dependencies are installed. Never represent skipped checks as passes.
