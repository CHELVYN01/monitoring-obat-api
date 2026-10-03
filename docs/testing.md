# Testing

Alat bawaan scaffold: **vitest** (`vitest.config.ts` untuk unit, `vitest.config.e2e.ts` untuk e2e), `supertest`, `@nestjs/testing`.

```bash
bun run test        # unit (src/**/*.spec.ts)
bun run test:watch
bun run test:cov
bun run test:e2e    # test/*.e2e-spec.ts
bun run lint
```

> Status: baru ada test contoh bawaan template (`app.controller.spec.ts`, `test/app.e2e-spec.ts`). Belum dijalankan di sesi setup.

## Prioritas test

| Area | Jenis | Yang diuji |
|---|---|---|
| `sync.service` push | Unit | Idempotensi (id sama dua kali → satu baris), batch parsial, tugas milik penjaga lain ditolak, status tugas berubah |
| `sync.service` pull | Unit | Hanya tugas milik pemanggil, filter `updatedAt > since`, `serverTime` dikembalikan |
| `auth` | Unit | Hash password, refresh rotasi, token dicabut/kedaluwarsa, user nonaktif |
| `RolesGuard` | Unit | Tiap role vs endpoint |
| Job `MISSED` | Unit | Hanya `PENDING` yang lewat `dueUntil`; `updatedAt` naik |
| Alur utama | e2e | login → petugas buat tugas → penjaga pull → push log → petugas verifikasi |
| Otorisasi | e2e | Penjaga A tidak bisa melihat/menulis tugas penjaga B (IDOR) |

## Database untuk e2e

Pakai database terpisah (mis. `obat_test` di Postgres compose), jalankan migrasi sebelum suite, dan bersihkan antar test. Jangan pernah mengarahkan test ke database dev yang berisi data.

## Konvensi

- File unit di samping kodenya: `*.spec.ts`. e2e di `test/`.
- Import relatif berekstensi `.js` (ESM).
- Mock storage/push; jangan memanggil R2 atau Expo Push sungguhan dari test.
