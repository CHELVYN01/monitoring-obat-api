FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
# URL dummy hanya agar `prisma generate` (prebuild) bisa memuat prisma.config.ts; tidak ada koneksi ke DB.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
RUN bun run build

FROM base AS prod-deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS runner
ENV NODE_ENV=production \
    PRISMA_HIDE_UPDATE_MESSAGE=1
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Dibutuhkan `prisma migrate deploy` saat start.
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
USER bun
EXPOSE 3000
# Terapkan migrasi lalu jalankan API (sesuai Blueprint: migrate deploy && start).
CMD ["sh", "-c", "bunx prisma migrate deploy && bun dist/main.js"]
