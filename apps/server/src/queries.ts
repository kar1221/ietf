import pool from '@ietf/db';
import type {
  ListOverview,
  MessageOverview,
  MessageContent
} from '@ietf/api-schema';
import type {
  MessageContentRow,
  MessageOverviewRow,
  OverviewRow
} from '@ietf/db/types';

export async function getOverview(): Promise<ListOverview> {
  const { rows } = await pool.query<OverviewRow>(
    `SELECT list, bucket, count(*)::int AS count
      FROM messages
      GROUP BY list, bucket
      ORDER BY list, bucket`
  );

  const byList = new Map<string, ListOverview[number]>();
  for (const row of rows) {
    let group = byList.get(row.list);

    if (!group) {
      group = { list: row.list, buckets: [] };
      byList.set(row.list, group);
    }

    group.buckets.push({ bucket: row.bucket, count: row.count });
  }

  return [...byList.values()];
}

export async function getMessageOverviews(
  list: string,
  limit: number,
  offset: number,
  bucket?: string
): Promise<MessageOverview> {
  const query = `SELECT id, hash, message_id, from_name, from_address, subject, sent_at 
                  FROM messages 
                  WHERE list = $1 AND ($2::text IS NULL OR bucket = $2) 
                  ORDER BY bucket, sent_at
                  LIMIT $3 OFFSET $4`;

  const { rows } = await pool.query<MessageOverviewRow>(query, [
    list,
    bucket,
    limit,
    offset
  ]);

  const result = rows.map((r) => ({
    id: Number(r.id),
    date: r.sent_at?.toISOString() ?? null,
    hash: r.hash,
    messageId: r.message_id,
    subject: r.subject,
    from: {
      address: r.from_address,
      name: r.from_name
    }
  }));

  return result;
}

export async function getMessage(id: number): Promise<MessageContent | null> {
  const query = `SELECT id, hash, message_id, from_name, from_address, subject, sent_at, content
                  FROM messages 
                  WHERE id = $1`;

  const { rows } = await pool.query<MessageContentRow>(query, [id]);

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
  };
}
