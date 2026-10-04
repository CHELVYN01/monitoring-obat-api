# Logging

Log terstruktur (JSON satu baris per event) memakai `nestjs-pino`. Kode: [../src/logging/](../src/logging/).

## Cara kerja

- **Output ke stdout.** Railway/Docker yang mengumpulkan dan menyimpan; tidak ada file log di dalam container. Di dev (`NODE_ENV` bukan production/test) output diformat rapi lewat `pino-pretty`.
- **Request ID.** Tiap request punya `req.id` yang sama di *semua* log-nya (log request selesai, log di service, log error) dan dikirim balik di header `X-Request-Id`. Header `X-Request-Id` dari klien/proxy dipakai bila bentuknya aman (`[\w.-]{8,64}`), selain itu dibuat UUID baru.
- **Log request selesai** satu baris per request: `GET /tasks 200`, dengan `durationMs`, `req.ip`, serta `userId` dan `role` bila sudah login (diisi `JwtAuthGuard`). Level: 5xx = `error`, 4xx = `warn`, selain itu `info`. `/health` yang sukses tidak dicatat.
- **Error tak tertangani (500)** dicatat Nest dengan stack trace dan `reqId` yang sama.
- **Event domain** memakai field `event` supaya mudah difilter:

| `event` | Level | Arti |
|---|---|---|
| `auth.login` | info | Login berhasil |
| `auth.login_failed` | warn | Login gagal; `reason` = `bad_password` / `unknown_email`, `emailHash` (bukan email utuh) |
| `auth.login_inactive` | warn | Kata sandi benar tapi akun nonaktif |
| `auth.refresh_unknown` | warn | Refresh token tidak dikenal |
| `auth.refresh_rejected` | warn | Refresh ditolak (`expired` / `inactive`) |
| `auth.refresh_reuse` | **error** | Refresh token yang sudah dicabut dipakai lagi (indikasi token dicuri); semua sesi pengguna dicabut |
| `audit` | info | Aksi tercatat di tabel `AuditLog` (`actorId`, `action`, `entity`, `entityId`) |
| `audit.failed` | error | Gagal menulis audit (aksi utama tetap jalan) |

## Yang TIDAK dicatat (UU PDP)

- Body request/response (data pasien, kata sandi, token).
- Query string (bisa berisi nama pasien pada pencarian): hanya path.
- Header `Authorization`, `Cookie`, `Set-Cookie`.
- Email utuh pada login gagal (hanya sidik jari `emailHash`); alamat rumah pasien; `meta` audit.
- Pengaman tambahan: key `password`, `passwordHash`, `accessToken`, `refreshToken`, `address` otomatis menjadi `[REDACTED]` bila ikut terlog.

Saat menambah log baru: log **ID** (userId, patientId, taskId), bukan nama/alamat/isi catatan.

## Konfigurasi

`LOG_LEVEL` = `fatal|error|warn|info|debug|trace|silent`. Default: `debug` (dev), `info` (production), `silent` (test). Untuk menyelidiki bug di production, naikkan sementara ke `debug` lalu kembalikan.

## Cara memakai untuk mencari bug

Pengguna melaporkan error → minta nilai header `X-Request-Id` (atau cari berdasarkan waktu + `userId`), lalu cari di log:

```
# filter JSON (jq) di log lokal/Docker
docker compose logs api | jq -c 'select(.req.id == "<request-id>")'
docker compose logs api | jq -c 'select(.level == "error" or .level == "warn")'
docker compose logs api | jq -c 'select(.event == "auth.login_failed")'
```

Di Railway, gunakan pencarian Log Explorer dengan `@req.id:<request-id>` atau `@level:error`.

## Menambah log di kode

```ts
private readonly logger = new Logger(TasksService.name); // dari @nestjs/common
this.logger.log({ event: 'task.created', taskId, patientId, msg: 'Mandat dibuat' });
this.logger.error({ event: 'x.failed', err, msg: 'Gagal ...' });   // err = objek Error, stack ikut tercatat
```

`Logger` dari `@nestjs/common` otomatis diarahkan ke pino dan membawa `req.id` bila dipanggil di dalam request. Untuk menambah konteks ke semua log request berjalan, inject `PinoLogger` dan panggil `assign({ ... })`.

## Rencana (belum ada)

- Pengiriman log ke layanan terpusat (Loki/Grafana, Better Stack, Sentry untuk error) dan alert pada `auth.refresh_reuse` atau lonjakan 5xx.
- Log slow query Prisma.
- Menyertakan `reqId` di body respons error 500 agar admin/mobile bisa menampilkannya ke pengguna.
