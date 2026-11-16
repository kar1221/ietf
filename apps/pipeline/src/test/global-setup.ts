import { execFileSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
dotenv.config({ path: path.join(ROOT, '.env') });

export default function setup() {
  const testUrl = process.env.TEST_DATABASE_URL;

  if (!testUrl)
    throw new Error('TEST_DATABASE_URL not set. Refusing to run tests');
  if (!testUrl.includes('ietf_test'))
    throw new Error(`refusing to run against ${testUrl}, must be 'ietf_test'`);

  execFileSync('pnpm', ['--filter', '@ietf/db', 'run', 'migrate'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit'
  });
}
