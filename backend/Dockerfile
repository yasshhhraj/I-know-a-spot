FROM node:24-bookworm-slim AS build

WORKDIR /app

# Keep dependency installation cacheable when application files change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Compile and type-check the backend before producing the runtime image.
RUN npm run typecheck && npm run build

# Download and verify the pinned, local-only MiniLM artifacts during image build.
# The runtime never downloads model files from a request path.
RUN node scripts/minilm-smoke.mjs --download
RUN node scripts/minilm-smoke.mjs

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    MODEL_CACHE_DIR=/app/.cache/models

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/.cache/models ./.cache/models

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--env-file-if-exists=.env", "dist/server.js"]
