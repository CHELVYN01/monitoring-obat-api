# Auth & Keamanan

**Status:** belum diimplementasikan. Ini data kesehatan (UU PDP), jadi perlakukan sebagai prioritas.

## Token

| Token | Umur | Penyimpanan di server | Catatan |
|---|---|---|---|
| Access JWT | 15 menit | tidak disimpan | Berisi `sub` (user id) dan `role` |
| Refresh token | 30 hari | hanya **hash** di `RefreshToken` | Bisa dicabut (`revokedAt`); rotasi tiap refresh |

- Password di-hash dengan **argon2**.
- Dua secret terpisah: `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET`.
- Refresh: cocokkan hash, cek `expiresAt` dan `revokedAt`; terbitkan pasangan baru dan cabut yang lama. Pemakaian ulang token lama → cabut seluruh sesi user.
- Logout mencabut refresh token. User `isActive = false` ditolak saat login dan refresh.

## Otorisasi

- `JwtAuthGuard` global, endpoint publik ditandai dekorator `@Public()` (`/auth/login`, `/auth/refresh`, `/health`).
- `RolesGuard` + `@Roles(...)` per endpoint (lihat [endpoints.md](endpoints.md)).
- **Kepemilikan** dicek di service: penjaga hanya boleh membaca/menulis tugas dengan `caregiverId = user.id`. Role guard saja tidak cukup (IDOR).
- Jangan percaya `caregiverId`/`officerId` dari body; ambil dari token.

## Hardening

| Kontrol | Cara |
|---|---|
| Header keamanan | `helmet` |
| Rate limit | `@nestjs/throttler`, lebih ketat di `/auth/*` |
| Validasi input | `ValidationPipe` global (whitelist) |
| CORS | Hanya origin admin; bila cookie dipakai, `credentials: true` dengan origin eksplisit (bukan `*`) |
| Batas ukuran | Body JSON dibatasi; ukuran foto dibatasi di presign |
| Transport | HTTPS saja (otomatis di Railway/R2) |
| Secret | Environment variable, tidak di-commit |

## Foto bukti

- Bucket **privat**. Akses hanya lewat presigned URL berumur 5–10 menit.
- Kunci objek dibuat server (`logs/<caregiverId>/<logId>.jpg`); presign hanya untuk `logId` milik pemanggil.
- Presigned GET hanya untuk Admin/Petugas; catat siapa yang melihat jika diperlukan.
- Konfigurasikan CORS bucket hanya untuk domain admin.

## Audit

Tulis ke `AuditLog` untuk: login gagal berulang, buat/ubah tugas, verifikasi/tolak, perubahan user/role, akses foto, penghapusan data. Simpan `actorId`, `action`, `entity`, `entityId`, `meta`.

## Logging

Gunakan logger terstruktur; **jangan** mencatat password, token, atau isi data pasien. Sentry: scrub data sensitif sebelum dikirim.

## Catatan untuk admin web

Karena admin memakai Svelte biasa (bukan SvelteKit), cara membawa token di browser belum diputuskan; lihat [../../admin/docs/auth.md](../../admin/docs/auth.md). Jika memakai cookie httpOnly dari API, tambahkan perlindungan CSRF.
