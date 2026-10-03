# Endpoint

**Status:** belum ada (hanya `GET /` bawaan template). Daftar dari [Blueprint.md](../../../Blueprint.md); kontrak request/response di bagian "usulan" adalah draf untuk disepakati, bukan implementasi.

## Daftar & hak akses

| Method | Endpoint | Peran | Fungsi |
|---|---|---|---|
| POST | `/auth/login` | Publik | Dapat access + refresh token |
| POST | `/auth/refresh` | Publik (refresh token) | Perbarui access token |
| POST | `/auth/logout` | Semua | Cabut refresh token |
| GET/POST/PATCH | `/users` | Admin | Kelola akun |
| GET/POST/PATCH | `/patients` | Admin, Petugas | Kelola pasien |
| GET/POST/PATCH | `/tasks` | Petugas | Buat & kelola mandat |
| PATCH | `/tasks/:id/verify` | Petugas | Verifikasi / tolak bukti |
| GET | `/sync/pull?since=ISO` | Penjaga | Tugas berubah sejak sync terakhir |
| POST | `/sync/push` | Penjaga | Kirim batch log (maks. 100) |
| POST | `/uploads/presign` | Penjaga | Presigned PUT URL foto |
| GET | `/uploads/view/:logId` | Admin, Petugas | Presigned GET URL foto |
| PATCH | `/me/push-token` | Penjaga | Simpan token push |
| GET | `/reports/compliance` | Admin, Petugas | Statistik kepatuhan |
| GET | `/health` | Publik | Health check |

## Usulan kontrak

### `POST /auth/login`

```json
// request
{ "email": "penjaga@contoh.id", "password": "..." }
// response
{ "accessToken": "...", "refreshToken": "...", "user": { "id": "...", "name": "...", "role": "CAREGIVER" } }
```

### `GET /sync/pull?since=2026-10-03T00:00:00.000Z`

Hanya tugas milik penjaga pemanggil dengan `updatedAt > since`. Tanpa `since` = ambil semua yang aktif.

```json
{
  "serverTime": "2026-10-03T08:00:00.000Z",
  "tasks": [
    { "id": "uuid", "patientName": "...", "medicine": "...", "dose": "...",
      "scheduledAt": "...", "dueUntil": "...", "status": "PENDING", "updatedAt": "..." }
  ]
}
```

Mobile menyimpan `serverTime` sebagai `last_pulled_at` berikutnya (bukan jam HP).

### `POST /uploads/presign`

```json
// request
{ "logId": "uuid", "contentType": "image/jpeg", "size": 184320 }
// response
{ "photoKey": "logs/<caregiverId>/<logId>.jpg", "uploadUrl": "https://...", "expiresIn": 300 }
```

Batasi `contentType` (JPEG), `size` maksimum, dan kunci objek ditentukan server, bukan klien.

### `POST /sync/push`

```json
// request (maks. 100 item)
{ "logs": [ { "id": "uuid", "taskId": "uuid", "result": "GIVEN",
              "takenAt": "...", "photoKey": "logs/...", "note": null } ] }
// response
{ "accepted": ["uuid"], "rejected": [ { "id": "uuid", "reason": "TASK_NOT_FOUND" } ] }
```

Aturan:

- Idempoten: `id` yang sudah ada → masuk `accepted` tanpa membuat duplikat.
- `taskId` harus milik penjaga pemanggil, kalau tidak → `rejected` (`FORBIDDEN`/`TASK_NOT_FOUND`).
- Satu item gagal tidak menggagalkan seluruh batch.
- Sukses mengubah status tugas ke `result` dan menaikkan `updatedAt`.
- Validasi `photoKey` memang berawalan folder milik penjaga tersebut.

## Format error (usulan)

```json
{ "statusCode": 403, "message": "Forbidden", "error": "Forbidden" }
```

Gunakan format bawaan Nest; kode bisnis untuk `rejected` di sync memakai string konstan agar mobile bisa memutuskan retry atau menyerah.
