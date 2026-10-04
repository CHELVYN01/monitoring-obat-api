import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './setup.js';

async function bootstrap() {
  // bufferLogs: log saat boot ditahan sampai logger pino siap, jadi semuanya berformat sama.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const config = app.get(ConfigService);
  configureApp(app);

  // Swagger = sumber tipe untuk admin dan mobile. Nonaktif di produksi kecuali SWAGGER_ENABLED=true.
  const flag = config.get<string>('SWAGGER_ENABLED');
  const swaggerOn = flag ? flag === 'true' : process.env.NODE_ENV !== 'production';
  if (swaggerOn) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Monitoring Obat API')
        .setDescription('API sistem monitoring pemberian obat (rawat inap dan rawat jalan).')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs-json' });
  }

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  logger.log(`API berjalan di port ${port}${swaggerOn ? ' (Swagger: /docs)' : ''}`, 'Bootstrap');
}

// Kegagalan di luar request (boot gagal, promise tak tertangani) harus tetap masuk log terstruktur.
bootstrap().catch((err: unknown) => {
  console.error(JSON.stringify({ level: 'fatal', msg: 'Gagal start API', err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err) }));
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({ level: 'fatal', msg: 'unhandledRejection', err: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason) }));
  process.exit(1); // sama seperti perilaku bawaan Node; container akan di-restart platform
});
