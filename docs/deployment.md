# Deployment

## Docker

`apps/api/Dockerfile` (multi-stage, base `oven/bun:1`):

1. `deps` — `bun install --frozen-lockfile`
2. `build` — `bun run build`: `prebuild` menjalankan `prisma generate` (memakai `DATABASE_URL` dummy hanya agar `prisma.config.ts` termuat), lalu `nest build` menghasilkan `dist/` (termasuk Prisma Client hasil generate)
3. `prod-deps` — `bun install --frozen-lockfile --production` (`prisma` CLI dan `dotenv` ada di `dependencies` karena dipakai saat start)
4. `runner` — salin `node_modules` production, `dist`, `prisma/`, `prisma.config.ts`; jalan sebagai user `bun`, port 3000;
   `CMD`: `bunx prisma migrate deploy && bun dist/main.js` (migrasi otomatis tiap start, sesuai Blueprint)

Build manual dari root project:

```bash
docker build -t obat-api ./apps/api
docker run --rm -p 3000:3000 --env-file apps/api/.env -e DATABASE_URL=... obat-api
```

> Image **sudah dibangun dan dijalankan** dengan `docker compose`: container start, menerapkan migrasi (`prisma migrate deploy`), `/health` menjawab `db: up`, dan login berhasil terhadap data seed.

## Docker Compose (dev)

`docker-compose.yml` di root:

| Service | Image | Port | Catatan |
|---|---|---|---|
| `postgres` | `postgres:16` | host **5433** → container 5432 | Healthcheck `pg_isready`, volume `pgdata`. Port host 5433 menghindari bentrok dengan Postgres lokal di 5432 |
| `minio` | `minio/minio` | 9000, 9001 | Pengganti R2 saat dev, volume `miniodata` |
| `api` | build `./apps/api` | 3000 | Menunggu postgres sehat |

```bash
docker compose up -d postgres minio      # dependensi saja
docker compose up --build api            # + API
docker compose down                      # stop (data tetap di volume)
docker compose down -v                   # stop + HAPUS data
```

Bucket MinIO harus dibuat manual lewat console (`http://localhost:9001`) sebelum upload.

## Environment

| Variabel | Dev | Produksi |
|---|---|---|
| `PORT` | 3000 | disediakan Railway |
| `DATABASE_URL` | Postgres compose | plugin PostgreSQL Railway |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | nilai acak lokal | secret kuat, berbeda |
| `S3_ENDPOINT` | `http://localhost:9000` | kosong (R2 memakai endpoint akun) |
| `R2_*` | kredensial MinIO | kredensial R2 |
| `SENTRY_DSN` | kosong | diisi |

Di dalam compose, host database adalah `postgres` port 5432 (bukan `localhost:5433`): `postgresql://obat:obat@postgres:5432/obat_dev?schema=public`. Service `api` membaca secret dari `apps/api/.env` (`env_file`) dan menimpa `DATABASE_URL`. Pastikan `.env` ada (salin dari `.env.example`) sebelum `docker compose up api`.

## Railway (produksi)

- Deploy dari GitHub, root `apps/api`; bisa memakai `Dockerfile` yang ada.
- Setelah Prisma ditambahkan: jalankan `prisma migrate deploy` sebelum start (mis. sebagai pre-deploy command), lalu `bun dist/main.js`.
- Health check ke `GET /health`.
- Aktifkan backup PostgreSQL.
- Semua secret di Variables Railway.

## Checklist sebelum rilis

- [ ] Secret produksi berbeda dari dev, tidak ada di repo
- [ ] `migrate deploy` berhasil di database staging
- [ ] CORS terbatas ke domain admin; bucket R2 privat
- [ ] Rate limit dan helmet aktif
- [ ] Sentry terpasang, data sensitif di-scrub
- [ ] Backup database aktif dan pernah dites restore
