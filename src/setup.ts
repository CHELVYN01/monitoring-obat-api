import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Konfigurasi HTTP yang dipakai aplikasi sungguhan dan e2e test agar perilakunya sama. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);

  // Di belakang proxy (Railway), IP klien dibaca dari X-Forwarded-For; tanpa ini rate limit
  // menganggap semua pengguna satu IP. Isi TRUST_PROXY=1 hanya bila memang di belakang proxy.
  const hops = Number(config.get('TRUST_PROXY') ?? 0);
  if (hops > 0) app.set('trust proxy', hops);

  app.use(helmet());
  app.enableCors({
    origin: String(config.get('CORS_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
}
