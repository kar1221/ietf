import env from './env.ts';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL
});

export default pool;
