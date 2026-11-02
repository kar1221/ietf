import { MBox } from '@ietf/clients/mailarchive/mbox';
import { parseMessage } from '@ietf/clients/mailarchive/message';
import { PostgresMessageStore } from './store/postgres-message-store.ts';
import pool from '@ietf/db';

const mbox = new MBox('quic');
const buckets = (await mbox.getAvailableBuckets()).filter((b) =>
  b.startsWith('2026')
);
const store = new PostgresMessageStore(pool);

for (const bucket of buckets) {
  for await (const raw of mbox.read(bucket)) {
    const message = await parseMessage(raw);
    await store.upsert('quic', bucket, message);
  }
}
