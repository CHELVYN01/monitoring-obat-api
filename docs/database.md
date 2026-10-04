# Database

**Status:** sudah ada. Prisma 7 + PostgreSQL, skema di [../prisma/schema.prisma](../prisma/schema.prisma), migrasi di `prisma/migrations/` (migrasi `init` sudah diterapkan). Desain asal: [Blueprint.md](../../../Blueprint.md) bagian 5, ditambah `CareType`, `CaregiverType`, `LogResult`, dan kolom verifikasi di `MedicationTask`.

## Perintah

```bash
bun run db:generate   # buat Prisma Client setelah schema berubah (output: src/generated/prisma)
bun run db:migrate    # buat + terapkan migrasi baru (dev), mis. -- --name tambah_x
bun run db:deploy     # terapkan migrasi yang ada (produksi / container)
bun run db:seed       # data demo; MENGHAPUS isi database (ditolak bila bukan database lokal)
```

`DATABASE_URL` dev: `postgresql://obat:obat@localhost:5433/obat_dev` (Postgres dari `docker-compose.yml`, port host **5433** agar tidak bentrok dengan Postgres lokal di 5432). Konfigurasi Prisma ada di `prisma.config.ts` (URL dibaca dari `.env`). Jangan edit migrasi yang sudah diterapkan; buat migrasi baru.

## Entitas

| Model | Fungsi | Catatan |
|---|---|---|
| `User` | Admin, Petugas, Penjaga | `role`, `caregiverType` (`STAFF`/`FAMILY`, hanya untuk penjaga), `phone`, `pushToken`, `isActive`; password disimpan sebagai hash argon2 |
| `RefreshToken` | Sesi | Hanya hash token; bisa dicabut (`revokedAt`) |
| `Patient` | Pasien | `careType` (`INPATIENT` rawat inap / `OUTPATIENT` rawat jalan), `room` (inap), `address` (jalan, data pribadi), `phone`, `notes` |
| `MedicationTask` | Mandat obat | Punya `caregiverId` dan `officerId`; `dueUntil` = batas sebelum `MISSED` |
| `MedicationLog` | Bukti pemberian dari HP | `id` dibuat klien; `photoKey` menunjuk objek di storage |
| `AuditLog` | Jejak aksi penting | `meta` JSON |

## Enum

- `Role`: `ADMIN`, `OFFICER`, `CAREGIVER`
- `CareType`: `INPATIENT`, `OUTPATIENT`
- `CaregiverType`: `STAFF`, `FAMILY`
- `TaskStatus`: `PENDING`, `GIVEN`, `REFUSED`, `MISSED`, `VERIFIED`, `REJECTED`

```
PENDING → GIVEN | REFUSED | MISSED → VERIFIED | REJECTED
```

`MedicationLog.result` hanya boleh `GIVEN` atau `REFUSED` (validasi di service/DTO, bukan di enum).

## Indeks penting

- `MedicationTask @@index([caregiverId, updatedAt])` — query `sync/pull`.
- `MedicationTask @@index([status, dueUntil])` — job penanda `MISSED`.
- `MedicationLog @@index([taskId])`.
- `User.email` unik.

## Aturan data

- `updatedAt` pada `MedicationTask` harus berubah pada **setiap** perubahan yang perlu sampai ke mobile (termasuk status `MISSED`/`VERIFIED`), karena dipakai sebagai cursor pull.
- `MedicationLog` tidak pernah di-update setelah dibuat; kirim ulang dengan `id` sama dianggap sukses (idempoten, jangan duplikat).
- Validasi: pasien `OUTPATIENT` wajib punya `address`; `INPATIENT` memakai `room`. `caregiverType` hanya boleh terisi untuk `role = CAREGIVER`.
- Penjaga `FAMILY` hanya boleh ditugaskan untuk pasien rawat jalan (sudah diterapkan di `TasksService`). **Celah yang diketahui:** belum ada tabel relasi pasien↔penjaga, jadi API belum bisa mencegah keluarga A ditugaskan ke pasien rawat jalan keluarga B. Ini terkait pertanyaan terbuka di Blueprint (apakah satu pasien boleh punya beberapa akun keluarga).
- Tidak ada data lokasi (GPS) yang disimpan.
- Hindari hard delete data klinis; pakai `isActive`/status. Jika perlu hapus, catat di `AuditLog`.
- Pasien dan log adalah data kesehatan (UU PDP): jangan tulis isi sensitif ke log aplikasi.
