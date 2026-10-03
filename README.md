# API — NestJS

Backend sistem monitoring pemberian obat. Melayani web admin dan aplikasi mobile penjaga pasien. Desain lengkap: [../../Blueprint.md](../../Blueprint.md) (bagian 5, 8, 9).

> **Status:** scaffold NestJS 12. Belum ada Prisma, auth, Swagger, dan modul bisnis. Tabel "Rencana" di bawah adalah target, bukan yang sudah ada.

**Dokumentasi rinci:** [docs/](docs/README.md) (arsitektur, database, endpoint, auth, deployment, testing).

## Stack

- NestJS 12, TypeScript strict, **ESM** (import relatif wajib berekstensi `.js`)
- Runtime & package manager: **bun**; test: vitest; lint: oxlint
- Rencana: Prisma + PostgreSQL, JWT + refresh token (argon2), Swagger, Cloudflare R2 / MinIO (presigned URL), Expo push

## Menjalankan

Dari folder `apps/api`:

```bash
bun install
bun run start:dev      # watch mode, http://localhost:3000
bun run build          # output dist/main.js
bun run test           # unit (vitest)
bun run test:e2e       # e2e
bun run lint           # oxlint --type-aware
```

### Lewat Docker

Dari root project:

```bash
docker compose up -d postgres minio   # hanya dependensi, API jalan lokal
docker compose up --build api         # API ikut di container, port 3000
```

| Service | Alamat | Kredensial dev |
|---|---|---|
| PostgreSQL | `localhost:5432`, db `obat_dev` | `obat` / `obat` |
| MinIO API | `localhost:9000` | `minio` / `minio12345` |
| MinIO console | `localhost:9001` | sama |

`Dockerfile` bersifat multi-stage (`oven/bun`): install, build, lalu image runtime hanya berisi `dist` + dependensi production, berjalan sebagai user `bun` dengan `bun dist/main.js`.

## Environment variable

Belum ada file `.env`. Variabel yang akan dipakai:

| Variabel | Keterangan |
|---|---|
| `PORT` | Default 3000 |
| `DATABASE_URL` | Mis. `postgresql://obat:obat@localhost:5432/obat_dev` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Rahasia penandatangan token |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare R2 (produksi) |
| `S3_ENDPOINT` | `http://localhost:9000` untuk MinIO saat dev |
| `SENTRY_DSN` | Opsional |

Jangan commit secret; `.env*` sudah masuk `.dockerignore`.

## Struktur kode

Sekarang: `src/main.ts`, `app.module.ts`, `app.controller.ts`, `app.service.ts`.

Rencana modul di `src/`: `auth`, `users`, `patients`, `tasks`, `sync`, `uploads`, `notifications`, `reports`, `prisma`.

## Rencana endpoint

| Method | Endpoint | Peran | Fungsi |
|---|---|---|---|
| POST | `/auth/login`, `/auth/refresh`, `/auth/logout` | Semua | Sesi |
| GET/POST/PATCH | `/users` | Admin | Kelola akun |
| GET/POST/PATCH | `/patients` | Admin, Petugas | Kelola pasien |
| GET/POST/PATCH | `/tasks` | Petugas | Mandat obat |
| PATCH | `/tasks/:id/verify` | Petugas | Verifikasi / tolak bukti |
| GET | `/sync/pull?since=ISO_DATE` | Penjaga | Tugas yang berubah sejak sync terakhir |
| POST | `/sync/push` | Penjaga | Batch log (maks. 100), idempoten |
| POST | `/uploads/presign` | Penjaga | Presigned PUT URL foto |
| GET | `/uploads/view/:logId` | Admin, Petugas | Presigned GET URL foto |
| PATCH | `/me/push-token` | Penjaga | Simpan token notifikasi |
| GET | `/reports/compliance` | Admin, Petugas | Statistik kepatuhan |
| GET | `/health` | Publik | Health check |

## Aturan penting

- Semua ID dibuat klien sebagai UUID agar `sync/push` idempoten (kunci: `MedicationLog.id`).
- Foto tidak melewati API; API hanya menerbitkan presigned URL berumur 5–10 menit, bucket privat.
- Penjaga hanya boleh mengakses tugas miliknya; role guard di setiap endpoint.
- `last_pulled_at` untuk sync memakai waktu server.
- Ini data kesehatan (UU PDP): rate limit, helmet, validasi input, dan catat aksi penting di `AuditLog`.

## Deploy

Railway dari GitHub, start: `prisma migrate deploy && node dist/main` (disesuaikan dengan bun/Docker saat Prisma ditambahkan). Health check: `/health`.
