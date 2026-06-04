# ─── Build stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy lockfile + manifests first for layer caching
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install all deps (including devDeps needed for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build frontend (dist/public) + backend (dist/index.js)
RUN pnpm run build

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy manifests for production install
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy migration files (needed at runtime)
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/migrate.mjs ./migrate.mjs

# Expose port (Railway sets $PORT automatically)
EXPOSE 3000

ENV NODE_ENV=production

# Run migrations then start server
CMD ["sh", "-c", "node migrate.mjs && node dist/index.js"]
