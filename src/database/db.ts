import env from 'src/env.js';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL
});

export default pool;
