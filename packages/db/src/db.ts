import env from './env.ts';
import pg, { type Pool, type PoolClient } from 'pg';

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL
});

type TransactionFunc<T> = (client: PoolClient) => Promise<T>;

export async function withTransaction<T>(
  dbPool: Pool,
  func: TransactionFunc<T>
) {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const result: T = await func(client);
    await client.query('COMMIT');

    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export default pool;
