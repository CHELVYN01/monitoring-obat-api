# Endpoint

**Status:** endpoint untuk admin **sudah diimplementasikan dan teruji** (`test/api.e2e-spec.ts`). Endpoint untuk mobile (sync, upload, push token) **belum ada**; kontraknya di bagian bawah masih usulan.

Spesifikasi hidup ada di Swagger: `/docs` (JSON: `/docs-json`) saat dev. Peran: **A**=Admin, **P**=Petugas, **K**=Penjaga.

## Konvensi

- Auth: `Authorization: Bearer <accessToken>`. Access token 15 menit; perbarui lewat `/auth/refresh`.
- Validasi: field di luar DTO ditolak (400). Pesan error berbahasa Indonesia, format bawaan Nest: `{ "statusCode", "message", "error" }`.
- Waktu: ISO 8601 UTC.
- Kode umum: 400 validasi/aturan bisnis, 401 token tidak ada/salah, 403 peran tidak berhak, 404 tidak ada, 409 konflik status/email.
- Rate limit: umum 120/menit/IP; `/auth/login` 5/menit; `/auth/refresh` 20/menit.

## Auth

| Method | Path | Body | Respons |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ accessToken, refreshToken, expiresIn, user }` |
| POST | `/auth/refresh` | `{ refreshToken }` | pasangan token baru (token lama dicabut) |
| POST | `/auth/logout` | `{ refreshToken }` | 204, idempoten |
| GET | `/auth/me` | — | profil (A P K) |

Login salah memberi pesan yang sama untuk email tidak dikenal dan sandi salah. Akun nonaktif: 403 (hanya setelah sandi benar).

## Users (A; Petugas hanya `GET` penjaga)

- `GET /users?role=&search=` · `GET /users/:id`
- `POST /users` `{ name, email, role, caregiverType?, phone?, password }` — `caregiverType` (`STAFF`/`FAMILY`) wajib bila `role = CAREGIVER`.
- `PATCH /users/:id` `{ name?, email?, role?, caregiverType?, phone?, isActive?, password? }`. Admin tidak bisa menonaktifkan atau mengubah peran akunnya sendiri. Nonaktif/reset sandi/ganti peran mencabut semua sesi pengguna itu.
- Respons tidak pernah memuat `passwordHash` atau `pushToken`.

## Patients (A P)

- `GET /patients?careType=&search=` · `GET /patients/:id`
- `POST /patients` `{ name, careType, room?, address?, phone?, notes? }`
- `PATCH /patients/:id` (parsial)
- `careType = OUTPATIENT` → `address` wajib, `room` dikosongkan. `INPATIENT` → `address` dikosongkan.

## Tasks

- `GET /tasks` (A P) — query: `status` (koma, mis. `GIVEN,REFUSED`), `caregiverId`, `patientId`, `from`, `to`, `search`, `order` (`asc`/`desc`), `skip`, `take` (maks. 200). Respons `{ items, total, skip, take }`.
- `GET /tasks/:id` (A P)
- `POST /tasks` (P) `{ patientId, caregiverId, medicine, dose, scheduledAt, dueUntil, notes? }`
- `PATCH /tasks/:id` (P) — hanya status `PENDING`.
- `PATCH /tasks/:id/verify` (P) `{ approve, note? }` — hanya `GIVEN`/`REFUSED`; `note` wajib bila `approve = false`.

Bentuk item (rata, mengikuti model Task admin):

```json
{
  "id": "uuid", "patientId": "uuid", "patientName": "Ibu Sari", "careType": "INPATIENT",
  "caregiverId": "uuid", "caregiverName": "Siti", "caregiverType": "STAFF",
  "officerId": "uuid", "officerName": "Nur Aini",
  "medicine": "Amlodipine", "dose": "5 mg",
  "scheduledAt": "...", "dueUntil": "...", "status": "GIVEN",
  "notes": null, "verifyNote": null, "verifiedAt": null,
  "log": { "id": "uuid", "result": "GIVEN", "takenAt": "...", "syncedAt": "...", "note": null, "hasPhoto": true }
}
```

Aturan pembuatan: `dueUntil` setelah `scheduledAt`; pasien dan penjaga harus ada, penjaga aktif dan berperan CAREGIVER; penjaga `FAMILY` hanya untuk pasien rawat jalan. Foto diambil lewat presigned URL (modul uploads, belum ada) — kunci objek tidak ikut dikirim.

## Reports (A P)

- `GET /reports/dashboard` → `{ today: { date, total, given, missed, complianceRate }, awaitingVerification, week: [{ date, total, pending, given, rejected, missed }] }`. "Hari ini" menurut `TZ_OFFSET_MINUTES`.
- `GET /reports/compliance?from=YYYY-MM-DD&to=YYYY-MM-DD` (default 7 hari, maks. 92 hari) → `{ from, to, overall, byDay[], byCaregiver[], byPatient[] }`, tiap entri `{ total, ok, rate }`.

## Health

`GET /health` (publik) → `{ status: "ok", db: "up" }`, atau 503 bila database tidak terjangkau.

## Belum ada (fase mobile) — usulan kontrak

| Method | Endpoint | Peran | Fungsi |
|---|---|---|---|
| GET | `/sync/pull?since=ISO` | K | Tugas milik penjaga dengan `updatedAt > since`; respons memuat `serverTime` |
| POST | `/sync/push` | K | Batch log maks. 100, idempoten per `id` |
| POST | `/uploads/presign` | K | Presigned PUT URL foto; kunci objek ditentukan server |
| GET | `/uploads/view/:logId` | A P | Presigned GET URL foto (5–10 menit) |
| PATCH | `/me/push-token` | K | Simpan token push |

Aturan `sync/push`: idempoten (log `id` yang sudah ada dianggap sukses tanpa duplikat); `taskId` harus milik penjaga pemanggil; satu item gagal tidak menggagalkan batch; sukses mengubah status tugas ke hasil log dan menaikkan `updatedAt`; juga memperbarui `User.lastSyncAt`. Tanpa GPS.

```json
// POST /sync/push
{ "logs": [ { "id": "uuid", "taskId": "uuid", "result": "GIVEN", "takenAt": "...", "photoKey": "logs/...", "note": null } ] }
// respons
{ "accepted": ["uuid"], "rejected": [ { "id": "uuid", "reason": "TASK_NOT_FOUND" } ] }
```
