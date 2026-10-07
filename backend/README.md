# I Know a Spot — backend scaffold

Node.js + TypeScript + Fastify. This is **setup only**: `GET /health` returns
`{"status":"scaffold"}`. There is no sign-in, Supabase connection, database
schema, photo upload/storage, spot feed, geographic filtering, or AI inference.
The declared integration packages reserve the chosen stack; importing or
installing them does not implement product requirements.

## Local setup

Use Node.js 24 LTS (recommended for both folders; see `package.json` engines).
From `backend/`:

```sh
npm install
cp .env.example .env
npm run dev
```

In another terminal, `curl http://127.0.0.1:3001/health` returns scaffold status.
The server binds `127.0.0.1:3001` by default. `PORT` must be 1–65535;
`HOST` accepts `localhost` or an IP address (use `0.0.0.0` only when intentional).
`FRONTEND_ORIGIN` is the exact allowed browser origin, default
`http://localhost:5173`; it must be a single HTTP(S) origin without a path.
The `.env` file is loaded by Node's `--env-file-if-exists` flag in dev/start;
shell-provided environment variables take precedence. Do not commit `.env`.

The example Supabase URL and service-role key are **placeholders**, unused by
this scaffold. Keep real service-role credentials on the server only. `MODEL_ID`
defaults in the example to `Xenova/all-MiniLM-L6-v2` and `MODEL_CACHE_DIR` to
`.cache/models`, but neither is read, loaded, or downloaded yet. Confirm the
model's exact revision/license and runtime before implementing inference.

## Checks (after installing dependencies)

Run from `backend/`:

```sh
npm run typecheck
npm run build
npm test
npm start
```

`npm start` serves the compiled `dist/server.js` after a successful build;
stop it with Ctrl-C. The tests inject HTTP requests without opening a listening
socket and check scaffold health, CORS origin, and port/host/origin validation.
No integration tests or product-feature checks exist yet.

## Future boundaries

Follow the root `PRD.md` and `BUILD_SCOPE_36H.md` for the pilot. Before enabling
spots or search, implement individual pilot authentication and enforce audience
and ownership for direct reads, media, and writes on the server. A CORS header
is not authorization. Do not claim Supabase row-level security until actual
policies have been written and tested; do not create custom authentication.
Public discovery uses the member's saved radius and explicit request center;
filter eligible spots by geodesic straight-line distance **before** semantic
ranking. Do not send photos, coordinates, or member IDs into the text encoder.
The current health endpoint deliberately cannot indicate readiness of those
future services.
