import path from 'path';
import pool from './db.js';
import { readdir, readFile } from 'fs/promises';
import type { PoolClient } from 'pg';

const migrationFilePath = path.resolve(import.meta.dirname, '../../migrations');

interface MigrationSchema {
  version: string;
  applied_at: Date;
}

interface MigrationFile {
  version: string;
  filepath: string;
}

async function createMigrationSchema(client: PoolClient) {
  const query = `CREATE TABLE IF NOT EXISTS schema_migrations (
                    version     TEXT PRIMARY KEY,
                    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
                );`;

  await client.query(query);
}

async function getMigrationsFile(): Promise<MigrationFile[]> {
  const files = (await readdir(migrationFilePath))
    .filter((f) => f.endsWith('sql'))
    .sort();

  const migrations: MigrationFile[] = files.map((f) => ({
    version: f.replace(/\.sql$/, ''),
    filepath: path.resolve(migrationFilePath, f)
  }));

  return migrations;
}

async function migrate() {
  const client = await pool.connect();

  await createMigrationSchema(client);

  const appliedRaw = await client.query<MigrationSchema>(
    'SELECT version FROM schema_migrations;'
  );

  const applied = new Set(appliedRaw.rows.map((a) => a.version));

  const migrationsFiles = await getMigrationsFile();

  for (const file of migrationsFiles) {
    if (applied.has(file.version)) continue;

    const sql = await readFile(file.filepath, 'utf8');

    await client.query('BEGIN');

    try {
      await client.query(sql);

      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [file.version]
      );

      await client.query('COMMIT');
      console.log(`Applied ${file.filepath}`);
    } catch (e) {
      await client.query('ROLLBACK');
      client.release();
      throw e;
    }
  }

  client.release();
}

migrate()
  .catch((e: unknown) => {
    const error = e instanceof Error ? e.message : 'Unknown error';

    console.error('Migration failed: ' + error);

    process.exitCode = 1;
  })
  .finally(() => {
    pool.end().catch(() => {
      console.error('Error ending pool');
    });
  });
