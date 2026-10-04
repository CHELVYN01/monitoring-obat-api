# Arsitektur API

**Status:** modul `prisma`, `audit`, `auth`, `users`, `patients`, `tasks`, `reports`, `health` sudah ada. Modul `sync`, `uploads`, `notifications` dan job terjadwal `MISSED` belum.

## Peran API dalam sistem

```
Mobile (offline-first) ──HTTPS──► NestJS ──► PostgreSQL
Admin web              ──HTTPS──►   │
                                    └─► presigned URL ─► R2 / MinIO (foto)
                                    └─► Expo Push (notifikasi)
```

- API adalah satu-satunya yang menulis ke database.
- Foto **tidak** melewati API; klien upload langsung ke storage lewat presigned URL.
- Mobile menulis lokal dulu; API menerima hasil lewat `sync/push` dan menyajikan perubahan lewat `sync/pull`.

## Modul (di `src/`; yang belum ada ditandai)

| Modul | Tanggung jawab |
|---|---|
| `prisma` | `PrismaService` global (koneksi, shutdown hook) |
| `auth` | Login, refresh, logout, JWT strategy, `RolesGuard` |
| `users` | CRUD akun (Admin) |
| `patients` | CRUD pasien |
| `tasks` | Mandat obat, verifikasi bukti |
| `sync` *(belum)* | `pull` dan `push` untuk mobile, idempoten |
| `uploads` *(belum)* | Presigned PUT/GET URL |
| `notifications` *(belum)* | Push Expo saat tugas baru |
| `audit` | `AuditService` global, menulis ke `AuditLog` |
| `reports` | Statistik kepatuhan, data ekspor |
| `health` | `GET /health` |

Tiap modul: `*.module.ts`, `*.controller.ts` (tipis, hanya HTTP), `*.service.ts` (logika), `dto/` (validasi), `*.spec.ts`.

## Konvensi

- **ESM:** import relatif wajib berekstensi `.js`, mis. `import { AppModule } from './app.module.js'`.
- **Validasi:** `ValidationPipe` global (`src/setup.ts`) dengan `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`; semua input lewat DTO `class-validator`.
- **Prisma 7:** client digenerate ke `src/generated/prisma` (diabaikan git; jalankan `bun run db:generate`), memakai driver adapter `@prisma/adapter-pg`. Import dari `../generated/prisma/client.js`.
- **Guard global (urutan):** `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`. Endpoint non-publik tanpa `@Roles` ditolak (deny by default).
- **Respons tugas** dibentuk `toTaskView()` (rata, tanpa kunci objek foto).
- **ID:** UUID. Untuk `MedicationLog` UUID dibuat klien (kunci idempotensi); lainnya `@default(uuid())`.
- **Waktu:** simpan UTC (`DateTime`), kirim ISO 8601. `updatedAt` dipakai sebagai cursor sync.
- **Error:** pakai exception bawaan Nest (`NotFoundException`, `ForbiddenException`, ...); jangan membocorkan detail internal ke klien.
- **Otorisasi dua lapis:** role guard di controller + cek kepemilikan di service (penjaga hanya tugasnya sendiri).
- **Dokumentasi:** `@nestjs/swagger` menjadi sumber tipe untuk admin (`openapi-typescript`) dan mobile.

## Job terjadwal

`@nestjs/schedule`: tandai `MedicationTask` berstatus `PENDING` yang `dueUntil` lewat menjadi `MISSED` (cek berkala, mis. tiap menit). Update harus menaikkan `updatedAt` agar tersinkron ke mobile.

## Keputusan terbuka (dari Blueprint)

- Tugas bisa dialihkan ke penjaga lain? Satu pasien rawat jalan boleh punya lebih dari satu akun keluarga?
- Jadwal berulang dibuat otomatis?
- Kebijakan retensi foto bukti?
- Bentuk dan pencatatan persetujuan (consent) pasien/keluarga.

## Keputusan yang sudah diambil

- Pasien **rawat inap** (kamar) dan **rawat jalan** (dirawat di rumah, alamat rumah). Enum `CareType`.
- Penjaga bertipe `STAFF` (banyak pasien rawat inap) atau `FAMILY` (keluarga pasien rawat jalan). Enum `CaregiverType` pada `User`.
- **GPS tidak dipakai.** Tidak ada kolom lokasi di `MedicationLog`; bukti hanya foto.
- Alamat dan telepon pasien adalah data pribadi: hanya Admin dan Petugas yang boleh membacanya; penjaga hanya menerima yang diperlukan untuk tugasnya. Jangan menaruh alamat di log aplikasi.
