# API — NestJS

Backend sistem monitoring pemberian obat untuk pasien **rawat inap dan rawat jalan (di rumah)**. Melayani web admin dan aplikasi mobile penjaga pasien. Desain lengkap: [../../Blueprint.md](../../Blueprint.md).

**Dokumentasi rinci:** [docs/](docs/README.md) (arsitektur, database, endpoint, auth, deployment, testing).

> **Status:** bagian untuk **admin** sudah jadi dan teruji: auth, users, patients, tasks (+verifikasi), laporan, health. **Belum ada** (untuk fase mobile): `sync/pull`, `sync/push`, upload foto (presigned URL), push notification, job penanda `MISSED`. Lihat tabel endpoint di bawah.

## Stack

- NestJS 12, TypeScript strict, **ESM** (import relatif wajib berekstensi `.js`)
- Runtime & package manager: **bun**; test: vitest + supertest; lint: oxlint
- Prisma 7 (driver adapter `pg`) + PostgreSQL 16
- Auth: JWT access token + refresh token (di-hash, dirotasi), password argon2 (`@node-rs/argon2`)
- Keamanan: helmet, `@nestjs/throttler`, ValidationPipe whitelist, deny-by-default role guard
- Dokumentasi: Swagger di `/docs` (dan `/docs-json`)

## Menjalankan (pertama kali)

Dari root project, nyalakan database lalu siapkan API:

```bash
docker compose up -d postgres         # Postgres di localhost:5433
cd apps/api
bun install
cp .env.example .env                  # lalu ganti kedua JWT secret (min. 32 karakter acak)
bun run db:generate                   # buat Prisma Client (src/generated, tidak di-commit)
bun run db:migrate                    # terapkan migrasi ke obat_dev
bun run db:seed                       # data demo (MENGHAPUS isi DB, hanya untuk lokal)
bun run start:dev                     # http://localhost:3000  (Swagger: /docs)
```

> Postgres compose memakai port host **5433** karena port 5432 sering sudah dipakai Postgres lokal. Di dalam jaringan Docker tetap `postgres:5432`.

Login demo setelah seed (kata sandi semua akun: `demo1234`): `admin@contoh.id`, `nur@contoh.id` (Petugas), `dimas@contoh.id` (Petugas). Akun penjaga ada (`siti@`, `andi@`, `lina@`, `doni@`, `fitri@contoh.id`) dan dipakai aplikasi mobile.

### Perintah

```bash
bun run start:dev     # watch mode
bun run build         # prisma generate + nest build -> dist/main.js
bun run lint          # oxlint --type-aware
bun run test          # unit (vitest)
bun run test:e2e      # e2e ke database TERPISAH obat_test (dibuat otomatis)
bun run db:generate   # setelah mengubah prisma/schema.prisma
bun run db:migrate    # buat + terapkan migrasi baru (dev)
bun run db:deploy     # terapkan migrasi yang ada (produksi)
bun run db:seed
```

### Lewat Docker

```bash
docker compose up -d postgres         # hanya dependensi, API jalan lokal
docker compose up --build api         # API di container, port 3000
```

Container menjalankan `prisma migrate deploy` lalu `bun dist/main.js`. Swagger nonaktif di container (NODE_ENV=production) kecuali `SWAGGER_ENABLED=true`.

| Service | Alamat | Kredensial dev |
|---|---|---|
| PostgreSQL | `localhost:5433`, db `obat_dev` | `obat` / `obat` |
| MinIO API | `localhost:9000` | `minio` / `minio12345` |
| MinIO console | `localhost:9001` | sama |

## Environment variable

Lihat [.env.example](.env.example). Nilai tidak valid membuat API menolak start dengan pesan jelas.

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | Mis. `postgresql://obat:obat@localhost:5433/obat_dev?schema=public` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Wajib, min. 32 karakter, harus berbeda |
| `JWT_ACCESS_TTL_SECONDS` | Default 900 (15 menit) |
| `JWT_REFRESH_TTL_DAYS` | Default 30 |
| `CORS_ORIGINS` | Origin admin, dipisah koma. Default `http://localhost:5173` |
| `TZ_OFFSET_MINUTES` | Batas "hari ini" di laporan. Default 420 (WIB) |
| `TRUST_PROXY` | Isi 1 di belakang proxy (Railway) agar rate limit membaca IP klien yang benar |
| `SWAGGER_ENABLED` | `true`/`false`; default aktif kecuali production |
| `PORT` | Default 3000 |

Jangan commit `.env` (sudah di `.gitignore` dan `.dockerignore`).

## Struktur kode (`src/`)

```
main.ts, setup.ts     bootstrap + konfigurasi HTTP bersama (dipakai juga e2e)
app.module.ts         modul akar + guard global (throttle -> JWT -> role)
config/               validasi environment
prisma/               PrismaService (adapter pg)
audit/                AuditService (tulis ke AuditLog)
common/decorators.ts  @Public, @Roles, @CurrentUser
auth/                 login, refresh (rotasi), logout, me, JwtAuthGuard, RolesGuard
users/  patients/  tasks/  reports/  health/
generated/prisma/     Prisma Client hasil generate (diabaikan git)
prisma/schema.prisma, migrations/, seed.ts   (di folder prisma/ di luar src)
```

## Endpoint

Semua butuh header `Authorization: Bearer <accessToken>` kecuali yang bertanda Publik. Peran: **A**=Admin, **P**=Petugas (OFFICER), **K**=Penjaga (CAREGIVER).

| Method | Endpoint | Peran | Fungsi |
|---|---|---|---|
| POST | `/auth/login` | Publik | Access + refresh token (maks. 5/menit/IP) |
| POST | `/auth/refresh` | Publik | Rotasi token |
| POST | `/auth/logout` | Publik | Cabut refresh token |
| GET | `/auth/me` | A P K | Profil sendiri |
| GET | `/users`, `/users/:id` | A P | Daftar/detail (Petugas hanya melihat penjaga) |
| POST, PATCH | `/users`, `/users/:id` | A | Buat/ubah akun, reset sandi, nonaktifkan |
| GET, POST, PATCH | `/patients`, `/patients/:id` | A P | Pasien rawat inap/jalan |
| GET | `/tasks`, `/tasks/:id` | A P | Filter status (koma), penjaga, pasien, tanggal, cari; paginasi |
| POST | `/tasks` | P | Buat tugas |
| PATCH | `/tasks/:id` | P | Ubah tugas yang masih Menunggu |
| PATCH | `/tasks/:id/verify` | P | Setujui / tolak bukti |
| GET | `/reports/dashboard` | A P | Angka hari ini + 7 hari |
| GET | `/reports/compliance` | A P | Kepatuhan per hari/penjaga/pasien |
| GET | `/health` | Publik | Health check + cek database |

Belum ada: `GET /sync/pull`, `POST /sync/push`, `POST /uploads/presign`, `GET /uploads/view/:logId`, `PATCH /me/push-token`.

## Aturan penting

- **Deny by default:** endpoint non-publik tanpa `@Roles` ditolak. Peran dan status aktif dibaca dari database di setiap request, jadi akun yang dinonaktifkan langsung tidak bisa dipakai.
- **Refresh token** disimpan sebagai hash SHA-256 dan dirotasi; memakai token lama lagi mencabut seluruh sesi pengguna itu.
- **Rawat jalan** wajib beralamat; kolom `room`/`address` yang tidak relevan dikosongkan. Penjaga bertipe `FAMILY` hanya boleh ditugaskan untuk pasien rawat jalan.
- **Verifikasi atomik:** hanya satu verifikasi yang berhasil bila dua petugas menekan bersamaan; penolakan wajib bercatatan.
- Foto tidak melewati API; kunci objek tidak dibuka ke klien (hanya `hasPhoto`).
- **GPS tidak dipakai.** Alamat pasien tidak ditulis ke audit atau log.
- Kepatuhan: penolakan pasien tidak dihitung; terlewat dan bukti ditolak dianggap tidak patuh (sama dengan UI admin).

## Deploy

Railway dari GitHub (root `apps/api`, pakai `Dockerfile`). Start otomatis `prisma migrate deploy && bun dist/main.js`. Set `TRUST_PROXY=1`, secret JWT, `DATABASE_URL`, `CORS_ORIGINS`. Health check: `/health`. Detail: [docs/deployment.md](docs/deployment.md).
