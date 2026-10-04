// Environment untuk e2e. Memakai database TERPISAH (obat_test) agar tidak menyentuh data dev.
const base = process.env.TEST_DATABASE_URL ?? 'postgresql://obat:obat@localhost:5433/obat_test?schema=public';

export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: base,
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret-0123456789',
  CORS_ORIGINS: 'http://localhost:5173',
};
