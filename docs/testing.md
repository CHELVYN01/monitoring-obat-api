# Testing

Alat: **vitest** (`vitest.config.ts` unit, `vitest.config.e2e.ts` e2e), `supertest`, `@nestjs/testing`. Dekorator/DI berjalan di vitest tanpa konfigurasi tambahan.

```bash
bun run test        # unit: src/**/*.spec.ts
bun run test:e2e    # e2e: test/*.e2e-spec.ts (butuh Postgres compose menyala)
bun run test:cov
bun run lint
```

`pretest` / `pretest:e2e` menjalankan `prisma generate` otomatis.

## Status

| Suite | Isi | Hasil terakhir |
|---|---|---|
| Unit `reports/compliance.spec.ts` | Aturan kepatuhan (PENDING, penolakan pasien, REJECTED/MISSED) | 4 lulus |
| E2E `test/api.e2e-spec.ts` | Health, auth, users, patients, alur tugas, laporan | 26 lulus |

Di sesi pengembangan, guard role sengaja dirusak sekali untuk memastikan e2e memang gagal (8 test gagal), lalu dikembalikan.

## E2E memakai database terpisah

- Database `obat_test` di Postgres compose (port 5433), **dibuat otomatis** oleh `test/global-setup.ts` lalu `prisma migrate deploy`.
- Nama database harus mengandung `test` (pengaman agar tidak menyentuh data dev).
- Override dengan `TEST_DATABASE_URL`. Secret JWT untuk test ada di `test/test-env.ts` (bukan rahasia).
- Tiap run membersihkan semua tabel di `obat_test` dulu. File e2e berjalan satu per satu (`fileParallelism: false`) karena berbagi database.
- Rate limit dimatikan saat `NODE_ENV=test`.

## Yang diuji e2e

- **Proteksi:** tanpa token / token palsu → 401; field di luar DTO → 400.
- **Auth:** pesan login sama untuk email salah vs sandi salah; rotasi refresh; pemakaian ulang token lama mencabut sesi; logout; akun nonaktif langsung ditolak (token lama juga).
- **Users:** `caregiverType` wajib untuk penjaga; email ganda 409; Petugas/Penjaga tidak boleh membuat user; Petugas hanya melihat penjaga; Admin tidak bisa menonaktifkan/mengubah peran diri sendiri.
- **Patients:** rawat jalan wajib beralamat; normalisasi `room`/`address`; Penjaga tidak boleh membaca pasien.
- **Tugas:** validasi jadwal, aturan keluarga↔rawat inap, penjaga harus CAREGIVER, Admin tidak boleh membuat; verifikasi sebelum dikerjakan 409; penolakan wajib catatan; tidak bisa diverifikasi/diubah dua kali; audit tercatat; filter status koma dan batas `take`; kunci foto tidak bocor.
- **Laporan:** bentuk dashboard, kepatuhan, batas rentang 92 hari, Penjaga ditolak.

## Belum diuji / belum ada

- `sync/pull`, `sync/push` (idempotensi, kepemilikan tugas) — modulnya belum ada. Hasil `sync/push` saat ini **disimulasikan** langsung di database pada e2e.
- Job `MISSED`, upload foto, push notification.
- Beban/performa (laporan dihitung di memori; cukup untuk skala kecil).

## Konvensi

- Unit di samping kodenya (`*.spec.ts`), e2e di `test/`.
- Import relatif berekstensi `.js` (ESM).
- Mock storage/push; jangan memanggil R2 atau Expo Push sungguhan dari test.
