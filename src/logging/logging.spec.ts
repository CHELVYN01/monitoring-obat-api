import { Controller, Get, Logger as NestLogger, NotFoundException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Logger, LoggerModule, PinoLogger } from 'nestjs-pino';
import { Writable } from 'node:stream';
import request from 'supertest';
import { buildLoggerParams } from './logging.config.js';

@Controller()
class DemoController {
  private readonly logger = new NestLogger('Demo');

  constructor(private readonly pino: PinoLogger) {}

  @Get('who')
  who() {
    this.pino.assign({ userId: 'u-1' });
    return {};
  }

  @Get('ok')
  ok() {
    this.logger.log({ event: 'demo.ok', msg: 'di dalam handler', password: 'rahasia' });
    return { ok: true };
  }

  @Get('missing')
  missing() {
    throw new NotFoundException('tidak ada');
  }

  @Get('boom')
  boom() {
    throw new Error('kaboom');
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

describe('logging', () => {
  let app: NestExpressApplication;
  let lines: Record<string, any>[];

  beforeEach(async () => {
    lines = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        for (const l of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(l));
        cb();
      },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot(buildLoggerParams({ NODE_ENV: 'production', LOG_LEVEL: 'debug' }, stream))],
      controllers: [DemoController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());

  it('mencatat request selesai dengan reqId yang sama di log handler dan mengirim X-Request-Id', async () => {
    const res = await http().get('/ok?search=Budi Santoso').set('Authorization', 'Bearer rahasia');
    const reqId = res.headers['x-request-id'];
    expect(reqId).toBeTruthy();

    const inner = lines.find((l) => l.event === 'demo.ok');
    const done = lines.find((l) => l.msg === 'GET /ok 200');
    expect(inner?.req?.id).toBe(reqId);
    expect(done).toMatchObject({ level: 'info', req: { id: reqId, method: 'GET', url: '/ok' }, res: { statusCode: 200 } });
    expect(typeof done?.durationMs).toBe('number');
  });

  it('tidak membocorkan query string, header Authorization, maupun field sensitif', async () => {
    await http().get('/ok?search=Budi Santoso').set('Authorization', 'Bearer rahasia');
    const dump = JSON.stringify(lines);
    expect(dump).not.toContain('Budi');
    expect(dump).not.toContain('Bearer rahasia');
    expect(lines.find((l) => l.event === 'demo.ok')?.password).toBe('[REDACTED]');
    expect(dump).not.toContain('"rahasia"');
  });

  it('4xx = warn, 5xx = error dengan stack trace', async () => {
    await http().get('/missing');
    await http().get('/boom');
    expect(lines.find((l) => l.msg === 'GET /missing 404')?.level).toBe('warn');
    expect(lines.find((l) => l.msg === 'GET /boom 500')?.level).toBe('error');
    expect(JSON.stringify(lines)).toContain('kaboom');
  });

  it('menolak X-Request-Id berbahaya dan memakai yang aman dari klien/proxy', async () => {
    const safe = await http().get('/ok').set('X-Request-Id', 'abc-12345678');
    expect(safe.headers['x-request-id']).toBe('abc-12345678');
    const bad = await http().get('/ok').set('X-Request-Id', 'x"},{"level":"fatal');
    expect(bad.headers['x-request-id']).not.toContain('fatal');
  });

  it('field dari PinoLogger.assign (userId) ikut di log akhir request', async () => {
    await http().get('/who');
    expect(lines.find((l) => l.msg === 'GET /who 200')?.userId).toBe('u-1');
  });

  it('health check sukses tidak dicatat', async () => {
    await http().get('/health');
    expect(lines.filter((l) => l.req?.url === '/health')).toHaveLength(0);
  });
});
