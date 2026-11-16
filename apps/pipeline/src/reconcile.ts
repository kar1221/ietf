import { MailArchiveClient } from '@ietf/clients/mailarchive';
import type { IMessageStore } from './store/interface.ts';
import type { Pool } from 'pg';
import type { MailMessage } from '@ietf/clients/mailarchive/types';
import { Logger } from './logger.ts';

export class Reconciler {
  private readonly messageStore: IMessageStore;
  private pool: Pool;
  private client: MailArchiveClient;

  public constructor(store: IMessageStore, pool: Pool) {
    this.messageStore = store;
    this.pool = pool;
    this.client = new MailArchiveClient();
  }

  public async reconcileBucket(
    list: string,
    bucket: string
  ): Promise<ReconcileReport> {
    const missingHash = await this.getMissingHash(list, bucket);

    if (missingHash.length === 0) {
      return { bucket, missing: 0, fetched: 0 };
    }

    const results = await Promise.allSettled(
      missingHash.map((h) => this.client.fetchMailMessageByHash(list, h))
    );

    const messages: MailMessage[] = [];

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        messages.push(r.value);
        return;
      }

      Logger.warn(
        // oxlint-disable-next-line typescript/restrict-template-expressions
        `gap fetch ${missingHash[i]} failed: ${r.reason}`,
        'Reconciler'
      );
    });

    const fetched = messages.length;
    const missing = missingHash.length - fetched;

    for (const chunk of chunked(messages, 25)) {
      await this.messageStore.upsertMany(list, bucket, chunk);
    }

    return {
      bucket,
      missing,
      fetched
    };
  }

  public async getMissingHash(list: string, bucket: string): Promise<string[]> {
    const query = `SELECT m.hash FROM manifest_entries m
                    WHERE m.list = $1 AND m.bucket = $2
                    AND NOT EXISTS (SELECT 1 FROM messages s
                                    WHERE s.list = $1 AND s.bucket = $2 AND s.hash = m.hash)`;

    const { rows } = await this.pool.query<{ hash: string }>(query, [
      list,
      bucket
    ]);

    const missingHash = rows.map((r) => r.hash);

    return missingHash;
  }
}

export interface ReconcileReport {
  bucket: string;
  missing: number;
  fetched: number;
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];

  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }

  return out;
}
