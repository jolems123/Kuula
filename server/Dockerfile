# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /app

ARG NPM_RESOLUTION_BEFORE=2026-08-23T00:00:00.000Z

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global npm@10.9.2 \
    && test "$(npm --version)" = "10.9.2"

# The repository's historical server lockfile is incomplete. Until a canonical
# lockfile can be regenerated and committed, freeze resolution to a fixed npm
# version and publication cutoff, generate the complete lock deterministically,
# then install exactly from that generated lock with npm ci.
COPY package.json package-lock.json ./
RUN npm install --package-lock-only --ignore-scripts --before="$NPM_RESOLUTION_BEFORE" --no-audit --no-fund \
    && npm ci --no-audit --no-fund

COPY prisma ./prisma
COPY scripts ./scripts
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/api/ready').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
