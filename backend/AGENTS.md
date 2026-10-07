# Backend scope for future contributors

- Read root `PRD.md` and `BUILD_SCOPE_36H.md` before adding product routes. `FUTURE_SCOPE.md` is excluded from this release.
- This directory currently contains only a scaffold. Keep `/health` honest; add separate readiness checks only when integrations really work.
- Use an established identity provider for individually authenticated, pre-enrolled pilot members. Do not invent custom authentication or trust client-provided owner IDs. Enforce owner, connection, enrolled-public, removal, and media-access checks on every relevant server path, including direct URLs and search. CORS is not access control.
- Treat `SUPABASE_SERVICE_ROLE_KEY` and any other privileged credentials as server-only. Never serialize, log, or send them to the frontend. Do not describe row-level security as implemented without real tested policies; a service-role client bypasses RLS.
- For Public feeds and search, enforce audience/removal and the saved member radius against an explicit center using geodesic distance (inclusive `<= radius`) before AI ranking. For Connections, enforce owner/consented mutual connections. Test signed-out, unenrolled, connected, and unconnected cases, ownership changes, removal, and just-inside/on/just-outside radius boundaries.
- Only title/note text may reach the eventual local encoder. No photos, coordinates, or member IDs in model inputs. Treat upload validation, metadata stripping, protected photo retrieval, and stale embedding invalidation as required before claiming feature readiness.
- Run `npm run typecheck`, `npm run build`, and `npm test` from `backend/` after installing dependencies; document actual failures rather than declaring unrun checks successful.
