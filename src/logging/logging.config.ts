import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

export const REQUEST_ID_HEADER = 'x-request-id';

// Id dari klien/proxy hanya dipakai bila bentuknya aman (mencegah log injection lewat header).
const SAFE_ID = /^[\w.-]{8,64}$/;

/** Path tanpa query string: query bisa memuat pencarian nama pasien (data kesehatan), jangan masuk log. */
const pathOnly = (url?: string) => (url ?? '').split('?')[0];

export function defaultLogLevel(nodeEnv?: string) {
  if (nodeEnv === 'test') return 'silent';
  return nodeEnv === 'production' ? 'info' : 'debug';
}

/**
 * Log terstruktur (JSON satu baris per event) agar mudah dicari di Railway/Docker/Loki.
 * Tiap request punya `reqId` yang sama di semua log-nya dan dikirim balik lewat header
 * `X-Request-Id`, jadi laporan bug dari pengguna bisa dilacak langsung ke lognya.
 * Body request/response TIDAK pernah dicatat (data kesehatan, UU PDP).
 */
export function buildLoggerParams(env: { NODE_ENV?: string; LOG_LEVEL?: string }, stream?: NodeJS.WritableStream): Params {
  const isProd = env.NODE_ENV === 'production';
  const level = env.LOG_LEVEL || defaultLogLevel(env.NODE_ENV);
  const pretty = !isProd && env.NODE_ENV !== 'test' && !stream;

  return {
    // Field dari PinoLogger.assign (userId, role) ikut tercatat di log akhir request.
    assignResponse: true,
    pinoHttp: [
      {
        level,
        // Pengaman terakhir bila ada objek sensitif yang ikut dilog tanpa sengaja.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            ...['password', 'passwordHash', 'accessToken', 'refreshToken', 'address'].flatMap((k) => [k, `*.${k}`]),
          ],
          censor: '[REDACTED]',
        },
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const given = req.headers[REQUEST_ID_HEADER];
          const id = typeof given === 'string' && SAFE_ID.test(given) ? given : randomUUID();
          res.setHeader(REQUEST_ID_HEADER, id);
          return id;
        },
        serializers: {
          req: (req: { id: unknown; method: string; url?: string; remoteAddress?: string }) => ({
            id: req.id,
            method: req.method,
            url: pathOnly(req.url),
            ip: req.remoteAddress,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
        customLogLevel: (req: IncomingMessage, res: ServerResponse, err?: Error) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          // Health check dipanggil terus-menerus oleh platform; hanya dicatat bila gagal.
          if (pathOnly(req.url) === '/health') return 'silent';
          return 'info';
        },
        customSuccessMessage: (req: IncomingMessage, res: ServerResponse) =>
          `${req.method} ${pathOnly(req.url)} ${res.statusCode}`,
        customErrorMessage: (req: IncomingMessage, res: ServerResponse) =>
          `${req.method} ${pathOnly(req.url)} ${res.statusCode}`,
        // `req`/`res` dipertahankan (reqId, status); nama key waktu respons dibuat jelas.
        customAttributeKeys: { responseTime: 'durationMs' },
        base: { service: 'monitoring-obat-api' },
        timestamp: () => `,"time":"${new Date().toISOString()}"`,
        formatters: { level: (label: string) => ({ level: label }) },
        ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname,service' } } } : {}),
      },
      stream as never,
    ],
  };
}
