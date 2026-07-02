# ── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Install build deps for argon2 native compilation.
RUN apk add --no-cache python3 make g++ openssl

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund || npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# ── Runtime stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Runtime: only prod deps. argon2 has a native binary; rebuild for the runtime
# Alpine variant.
RUN apk add --no-cache openssl tini

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./src/db/migrations

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# tini handles SIGTERM properly so the server shuts down gracefully.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
