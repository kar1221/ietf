import pool from './db.js';
import type { ListOverview, MessageOverview, MessageContent } from './types.js';

export async function getOverview(): Promise<ListOverview[]> {
  const { rows } = await pool.query<{
    list: string;
    bucket: string;
    count: number;
  }>(
    `SELECT list, bucket, count(*)::int AS count
      FROM messages
      GROUP BY list, bucket
      ORDER BY list, bucket`
  );

  if (rows.length === 0) {
    return [];
  }

  const result: ListOverview[] = [];

  let buckets: { bucket: string; count: number }[] = [];
  let currentList = rows[0].list;

  for (const row of rows) {
    if (row.list === currentList) {
      buckets.push({ bucket: row.bucket, count: row.count });
      continue;
    }

    result.push({ list: row.list, buckets: buckets.slice() });
    buckets = [{ bucket: row.bucket, count: row.count }];
    currentList = row.list;
  }

  result.push({ list: currentList, buckets: buckets.slice() });

  return result;
}

export async function getMessageOverviews(
  list: string,
  limit: number,
  offset: number,
  bucket?: string
): Promise<MessageOverview[]> {
  const query = `SELECT id, hash, message_id, from_name, from_address, subject, sent_at 
                  FROM messages 
                  WHERE list = $1 AND ($2::text IS NULL OR bucket = $2) 
                  ORDER BY bucket, sent_at
                  LIMIT $3 OFFSET $4`;

  const { rows } = await pool.query<{
    id: string;
    hash: string | null;
    message_id: string | null;
    from_name: string;
    from_address: string;
    subject: string;
    sent_at: Date | null;
  }>(query, [list, bucket, limit, offset]);

  const result = rows.map(
    (r) =>
      ({
        id: Number(r.id),
        date: r.sent_at?.toISOString() ?? null,
        hash: r.hash,
        messageId: r.message_id,
        subject: r.subject,
        from: {
          address: r.from_address,
          name: r.from_name
        }
      }) satisfies MessageOverview
  );

  return result;
}

export async function getMessage(id: number): Promise<MessageContent | null> {
  const query = `SELECT id, hash, message_id, from_name, from_address, subject, sent_at, content
                  FROM messages 
                  WHERE id = $1`;

  const { rows } = await pool.query<{
    id: string;
    content: string;
    hash: string | null;
    message_id: string | null;
    from_name: string;
    from_address: string;
    subject: string;
    sent_at: Date | null;
  }>(query, [id]);

  if (rows.length === 0) return null;

  const result = rows[0];

  return {
    content: result.content,
    date: result.sent_at?.toISOString() ?? null,
    id: Number(result.id),
    subject: result.subject,
    from: {
      address: result.from_address,
      name: result.from_name
    },
    messageId: result.message_id,
    hash: result.hash
  } satisfies MessageContent;
}
