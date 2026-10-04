# Dokumentasi API

Indeks dokumen backend NestJS. Ringkasan dan cara menjalankan ada di [../README.md](../README.md); desain sistem di [../../../Blueprint.md](../../../Blueprint.md).

> Status: bagian admin (auth, users, patients, tasks, reports, health) **sudah jadi dan teruji**. Bagian mobile (sync, upload foto, push, job `MISSED`) **belum**. Tiap dokumen menandai mana yang sudah ada dan mana yang masih rencana.

| Dokumen | Isi |
|---|---|
| [architecture.md](architecture.md) | Modul, lapisan, alur request, konvensi kode |
| [database.md](database.md) | Model Prisma, relasi, indeks, migrasi |
| [endpoints.md](endpoints.md) | Daftar endpoint, hak akses, kontrak sync dan upload (usulan) |
| [auth-security.md](auth-security.md) | JWT, refresh token, role guard, hardening, audit |
| [deployment.md](deployment.md) | Docker, docker-compose, Railway, environment |
| [testing.md](testing.md) | Strategi unit dan e2e |
| [logging.md](logging.md) | Log terstruktur, request ID, event auth/audit, data yang tidak boleh dilog |
