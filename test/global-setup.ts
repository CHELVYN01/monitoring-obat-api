import { execSync } from 'node:child_process';
import pg from 'pg';
import { TEST_ENV } from './test-env.js';

/** Pastikan database test ada dan migrasinya terbaru sebelum e2e berjalan. */
export default async function setup() {
  const url = new URL(TEST_ENV.DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/i.test(dbName) || !dbName.includes('test')) {
    throw new Error(`Nama database test tidak aman: ${dbName} (harus mengandung "test")`);
  }

  const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString().replace(/\?.*$/, '') });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  execSync('bunx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_ENV.DATABASE_URL },
  });
}
