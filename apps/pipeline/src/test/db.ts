import path from 'node:path';
import pg, { type Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../../../.env') });

export const LIST = 'quic';

export function testPool(): Pool {
  return new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
}

export async function truncate(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE TABLE messages, manifest_entries');
}
