import type { IMessageStore, StoreStats, UpsertResult } from './interface.js';
import type { EmailAddress, MailMessage } from 'src/mailarchive/types.js';
import type { Pool, PoolClient } from 'pg';
import { Logger } from 'src/logger.js';

export class PostgresMessageStore implements IMessageStore {
  private pool: Pool;

  public constructor(pool: Pool) {
    this.pool = pool;
  }

  public async upsert(
    list: string,
    bucket: string,
    msg: MailMessage
  ): Promise<UpsertResult> {
    if (msg.hash === null && msg.messageId === null) {
      // WARN: Might want to redo this part
      Logger.warn(
        'Message has no hash nor messageId, ignoring...',
        'PostgresMessageStore'
      );
      return 'ignored';
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const { rows: found } = await client.query<{ id: string }>(
        `SELECT id FROM messages
WHERE (list = $1 AND hash IS NOT NULL AND hash = $2)
OR (list = $1 AND message_id IS NOT NULL AND message_id = $3)`,
        [list, msg.hash, msg.messageId]
      );

      if (found.length === 0) {
        await this.insertWithClient(client, list, bucket, msg);
        await client.query('COMMIT');
        return 'inserted';
      }

      await client.query('ROLLBACK');
      Logger.warn(
        'Update and merge case not implemented',
        'PostgresMessageStore.upsert'
      );
      return 'ignored';
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  private async insertWithClient(
    client: PoolClient,
    list: string,
    bucket: string,
    msg: MailMessage
  ) {
    if (msg.hash === null && msg.messageId === null) return;

    const query =
      'INSERT INTO messages (list, bucket, hash, message_id, subject, from_name, from_address, content, sent_at, in_reply_to, reference, to_addrs, cc_addrs) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)';

    await client.query(query, [
      list,
      bucket,
      msg.hash,
      msg.messageId,
      msg.subject,
      msg.from.name,
      msg.from.address,
      msg.content,
      msg.date,
      msg.inReplyTo,
      msg.references,
      msg.to.map((t) => t.address),
      msg.cc.map((c) => c.address)
    ]);
  }

  upsertMany(
    list: string,
    bucket: string,
    msg: MailMessage[]
  ): Promise<Map<string, UpsertResult>> {
    throw new Error('Method not implemented.');
  }

  public async getByBucket(
    list: string,
    bucket: string
  ): Promise<readonly MailMessage[]> {
    const query = `SELECT hash, subject, from_name, from_address, to_addrs, cc_addrs, content, sent_at, message_id, in_reply_to, reference FROM messages (WHERE list = $1 AND bucket = $2)`;

    const { rows } = await this.pool.query<Messages>(query, [list, bucket]);

    const mailMessages: MailMessage[] = rows.map((m) => ({
      content: m.content,
      date: m.sent_at,
      from: { address: m.from_address, name: m.from_name },
      cc: m.cc_addrs.map(
        (c) => ({ address: c, name: '' }) satisfies EmailAddress
      ),
      hash: m.hash,
      inReplyTo: m.in_reply_to,
      messageId: m.message_id,
      references: m.reference,
      subject: m.subject,
      to: m.to_addrs.map(
        (t) => ({ address: t, name: '' }) satisfies EmailAddress
      )
    }));

    return mailMessages;
  }

  countByBucket(list: string, bucket: string): Promise<number> {
    throw new Error('Method not implemented.');
  }
  hashesInBucket(list: string, bucket: string): Promise<Set<string>> {
    throw new Error('Method not implemented.');
  }
  messageIdsInBucket(list: string, bucket: string): Promise<Set<string>> {
    throw new Error('Method not implemented.');
  }
  stats(list: string): Promise<StoreStats> {
    throw new Error('Method not implemented.');
  }
}

interface Messages {
  hash: string | null;
  subject: string;
  from_name: string;
  from_address: string;
  to_addrs: string[];
  cc_addrs: string[];
  content: string;
  sent_at: Date | null;
  message_id: string | null;
  in_reply_to: string;
  reference: string[];
}
