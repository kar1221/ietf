import { MailArchiveClient } from '@ietf/clients/mailarchive';
import { withTransaction } from '@ietf/db';
import { ReconcileError } from './errors.ts';
import type { Pool } from 'pg';

const mailarchive = new MailArchiveClient();

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
} as const;

function monthOf(dateStr: string): number {
  return MONTHS[dateStr.slice(0, 3).toLowerCase()];
}

export class Manifest {
  private pool: Pool;

  public constructor(pool: Pool) {
    this.pool = pool;
  }

  public async refreshManifestBucket(
    list: string,
    bucket: string,
    force = false
  ): Promise<number> {
    const isManifestExists = await this.manifestHasBucket(list, bucket);

    const shouldRefresh = force || !this.isClosed(bucket) || !isManifestExists;
    if (!shouldRefresh) return 0;

    const page = await mailarchive.fetchDateIndexByBucket(list, bucket);

    let entries = page.entry;

    if (page.didRedirect) {
      entries = entries.filter((e) => {
        const year = e.date.slice(-4);
        const month = monthOf(e.date).toString().padStart(2, '0');

        return `${year}-${month}` === bucket;
      });

      if (entries.length === 0)
        throw new ReconcileError(`Manifest parse failed for ${list}/${bucket}`);
    }

    const year = new Date().getFullYear();

    const rows = entries
      .map((e) => ({
        list,
        bucket,
        hash: e.hash,
        entryDate: new Date(
          `${year.toString()}-${monthOf(e.date).toString().padStart(2, '0')}`
        ),
        fetchedAt: new Date()
      }))
      .filter((r) => r.hash !== '');

    await withTransaction(this.pool, async (c) => {
      await c.query(
        `DELETE FROM manifest_entries
          WHERE list = $1 AND bucket = $2`,
        [list, bucket]
      );

      for (const r of rows)
        await c.query(
          `INSERT INTO manifest_entries (list, bucket, hash, fetched_at, entry_date)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (list, hash) DO UPDATE SET
              bucket = EXCLUDED.bucket,
              entry_date = EXCLUDED.entry_date,
              fetched_at = EXCLUDED.fetched_at`,
          [r.list, r.bucket, r.hash, r.fetchedAt, r.entryDate]
        );
    });

    return rows.length;
  }

  private isClosed(bucket: string) {
    const [year, month] = bucket.split('-').map(Number);
    const now = new Date();

    return (
      year < now.getFullYear() ||
      (year === now.getFullYear() && month < now.getMonth() + 1)
    );
  }

  private async manifestHasBucket(
    list: string,
    bucket: string
  ): Promise<boolean> {
    const query = `SELECT COUNT(*)::int as count FROM manifest_entries
                    WHERE list = $1 AND bucket = $2`;
    const { rows } = await this.pool.query<{ count: number }>(query, [
      list,
      bucket
    ]);

    const count = rows[0].count;

    return count > 0;
  }
}
