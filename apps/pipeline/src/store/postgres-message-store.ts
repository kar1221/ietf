import type {
  EmailAddress,
  MailMessage
} from '@ietf/clients/mailarchive/types';
import type { IMessageStore, StoreStats, UpsertResult } from './interface.ts';
import type { Pool, PoolClient } from 'pg';
import { Logger } from '../logger.ts';

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
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await this.upsertWithClient(client, list, bucket, msg);

      await client.query('COMMIT');

      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  public async upsertMany(
    list: string,
    bucket: string,
    messages: MailMessage[]
  ): Promise<Map<string, UpsertResult>> {
    const client = await this.pool.connect();
    const result = new Map<string, UpsertResult>();

    try {
      await client.query('BEGIN');

      for (const msg of messages) {
        const res = await this.upsertWithClient(client, list, bucket, msg);
        const key = msg.hash ?? msg.messageId;

        if (key === null) {
          Logger.warn(
            'Message has no hash nor messageId, ignoring...',
            'PostgresMessageStore.upsertMany'
          );
          continue;
        }

        result.set(key, res);
      }

      await client.query('COMMIT');
      return result;
    } catch (e: unknown) {
      await client.query('ROLLBACK');

      const error = e instanceof Error ? e.message : 'unknown error';
      Logger.error(error, 'PostgresMessageStore.upsertMany');
      return result;
    } finally {
      client.release();
    }
  }

  public async getByBucket(
    list: string,
    bucket: string
  ): Promise<readonly MailMessage[]> {
    const query = `SELECT 
                    hash, subject, from_name, from_address, to_addrs, cc_addrs, content, sent_at, message_id, in_reply_to, reference 
                    FROM messages 
                    WHERE (list = $1 AND bucket = $2)`;

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

  public async hashesInBucket(
    list: string,
    bucket: string
  ): Promise<Set<string>> {
    const query = `SELECT hash FROM messages
                    WHERE (list = $1 AND bucket = $2 AND hash IS NOT NULL)`;

    const { rows } = await this.pool.query<{ hash: string }>(query, [
      list,
      bucket
    ]);

    return new Set(rows.map((r) => r.hash));
  }

  messageIdsInBucket(list: string, bucket: string): Promise<Set<string>> {
    throw new Error('Method not implemented.');
  }

  stats(list: string): Promise<StoreStats> {
    throw new Error('Method not implemented.');
  }

  private async upsertWithClient(
    client: PoolClient,
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

    // NOTE: Race condition will happen if this is called multi-threaded.
    // NOTE: Consider adding FOR UPDATE clause when multi-threaded is needed.
    const { rows: found } = await client.query<{
      id: string;
      hash: string | null;
      message_id: string | null;
    }>(
      `SELECT id, hash, message_id FROM messages
          WHERE (list = $1 AND hash IS NOT NULL AND hash = $2)
          OR (list = $1 AND message_id IS NOT NULL AND message_id = $3)`,
      [list, msg.hash, msg.messageId]
    );

    if (found.length === 0) {
      await this.insertWithClient(client, list, bucket, msg);
      return 'inserted';
    }

    if (found.length === 1) {
      const row = found[0];

      if (row.hash && msg.hash && row.hash !== msg.hash) {
        Logger.warn(
          `Identity conflict: stored hash: ${row.hash} vs incoming ${msg.hash} for ${list}|${bucket}|${msg.subject} (${msg.messageId ?? ''})`
        );
      }

      if (row.message_id && msg.messageId && row.message_id !== msg.messageId) {
        Logger.warn(
          `Identity conflict: stored messageId: ${row.message_id} vs incoming ${msg.messageId} for ${list}|${bucket}|${msg.subject} (${msg.hash ?? ''})`
        );
      }

      await this.updateWithClient(client, row.id, bucket, msg);
      return 'merged';
    }

    // found.length === 2, theoretically can only be at most 2

    Logger.warn(
      `Collapse needed: msg matched rows ${found.map((f) => f.id).join(', ')} ` +
        `(hash=${msg.hash ?? 'null'}, messageId=${msg.messageId ?? 'null'}) — leaving duplicate for manual merge`,
      'PostgresMessageStore.upsert'
    );
    return 'ignored';
  }

  private async insertWithClient(
    client: PoolClient,
    list: string,
    bucket: string,
    msg: MailMessage
  ) {
    const query = `INSERT INTO messages 
          (list, bucket, hash, message_id, subject, from_name, from_address, content, sent_at, in_reply_to, reference, to_addrs, cc_addrs) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;

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

  private async updateWithClient(
    client: PoolClient,
    id: string,
    bucket: string,
    msg: MailMessage
  ) {
    await client.query(
      `UPDATE messages SET
              bucket      = $2, -- Prefer bucket from date index page.
              hash        = COALESCE(hash, $3),
              message_id  = COALESCE(message_id, $4),
              subject     = COALESCE(NULLIF(subject, ''), $5),
              from_name   = COALESCE(NULLIF(from_name, ''), $6),
              from_address= COALESCE(NULLIF(from_address, ''), $7),
              content     = COALESCE(NULLIF(content, ''), $8),
              sent_at     = COALESCE(sent_at, $9),
              in_reply_to = COALESCE(in_reply_to, $10),
              reference   = COALESCE(NULLIF(reference, '{}'), $11),
              to_addrs    = COALESCE(NULLIF(to_addrs, '{}'), $12),
              cc_addrs    = COALESCE(NULLIF(cc_addrs, '{}'), $13)
            WHERE id = $1`,
      [
        id,
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
        msg.to.map((a) => a.address),
        msg.cc.map((a) => a.address)
      ]
    );
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
  in_reply_to: string | null;
  reference: string[];
}
