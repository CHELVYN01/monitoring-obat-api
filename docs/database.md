# Database

**Status:** belum ada. Prisma belum dipasang. Skema di bawah dari [Blueprint.md](../../../Blueprint.md) bagian 5.

## Setup (saat Prisma ditambahkan)

```bash
bun add @prisma/client
bun add -d prisma
bunx prisma init
bunx prisma migrate dev --name init
bunx prisma generate
```

`DATABASE_URL` dev: `postgresql://obat:obat@localhost:5432/obat_dev` (Postgres dari `docker-compose.yml`). Produksi: `prisma migrate deploy`.

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
- Penjaga `FAMILY` hanya boleh ditugaskan untuk pasien rawat jalan miliknya; jangan bocorkan data pasien lain.
- Tidak ada data lokasi (GPS) yang disimpan.
- Hindari hard delete data klinis; pakai `isActive`/status. Jika perlu hapus, catat di `AuditLog`.
- Pasien dan log adalah data kesehatan (UU PDP): jangan tulis isi sensitif ke log aplikasi.
