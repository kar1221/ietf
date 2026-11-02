import { MBox } from 'src/mailarchive/mbox.js';
import { PostgresMessageStore } from 'src/store/postgres-memory-store.js';
import pool from './db.js';
import { parseMessage } from 'src/mailarchive/message.js';

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
