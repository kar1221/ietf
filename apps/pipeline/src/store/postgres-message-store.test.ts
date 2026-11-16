import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import type { Pool } from 'pg';
import { LIST, testPool, truncate } from '../test/db.ts';
import { makeMessage } from '../test/fixtures.ts';
import { Logger } from '../logger.ts';
import { PostgresMessageStore } from './postgres-message-store.ts';

const BUCKET = '2024-08';

describe('PostgresMessageStore (contract)', () => {
  let pool: Pool;
  let store: PostgresMessageStore;

  beforeAll(() => {
    pool = testPool();
    store = new PostgresMessageStore(pool);
  });
  afterAll(() => pool.end());
  beforeEach(() => truncate(pool));

  it('inserts a brand-new message', async () => {
    expect(await store.upsert(LIST, BUCKET, makeMessage())).toBe('inserted');
  });

  it('BACKFILLS hash onto a hashless row matched by messageId — the convergence mechanism', async () => {
    const mboxRow = makeMessage({ hash: null });
    await store.upsert(LIST, BUCKET, mboxRow);

    const fetched = makeMessage({
      hash: 'H-real',
      messageId: mboxRow.messageId
    });
    expect(await store.upsert(LIST, BUCKET, fetched)).toBe('merged');

    const { rows } = await pool.query<{ hash: string | null }>(
      'SELECT hash FROM messages WHERE list = $1',
      [LIST]
    );
    expect(rows[0].hash).toBe('H-real'); // without this, reconcile refetches forever
  });

  it('merge never clobbers existing values', async () => {
    const first = makeMessage({ subject: 'Original' });
    await store.upsert(LIST, BUCKET, first);
    await store.upsert(
      LIST,
      BUCKET,
      makeMessage({
        hash: first.hash,
        messageId: first.messageId,
        subject: 'Later'
      })
    );

    const { rows } = await pool.query<{ subject: string }>(
      'SELECT subject FROM messages'
    );
    expect(rows[0].subject).toBe('Original');
  });

  it('merge MOVES bucket to the manifest-authoritative value', async () => {
    const msg = makeMessage();
    await store.upsert(LIST, '2024-07', msg); // mbox said July
    await store.upsert(LIST, '2024-08', msg); // manifest says August

    const { rows } = await pool.query<{ bucket: string }>(
      'SELECT bucket FROM messages'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].bucket).toBe('2024-08');
  });

  it('logs identity conflict and keeps the stored hash (first writer wins)', async () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const stored = makeMessage({ hash: 'H-old' });
    await store.upsert(LIST, BUCKET, stored);
    await store.upsert(
      LIST,
      BUCKET,
      makeMessage({ hash: 'H-new', messageId: stored.messageId })
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Identity conflict')
    );

    const { rows } = await pool.query<{ hash: string }>(
      'SELECT hash FROM messages'
    );

    expect(rows[0].hash).toBe('H-old');
    warn.mockRestore();
  });

  it('ignores a message with no identity at all', async () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const result = await store.upsert(
      LIST,
      BUCKET,
      makeMessage({ hash: null, messageId: null })
    );
    expect(result).toBe('ignored');
    expect((await pool.query('SELECT 1 FROM messages')).rowCount).toBe(0);
    warn.mockRestore();
  });

  it('collapse: two partial-identity rows → ignored, NOTHING mutated', async () => {
    await pool.query(
      `INSERT INTO messages (list, bucket, hash, subject, from_name, from_address, content, sent_at)
       VALUES ($1,$2,'HA','s','n','a@x','c',now())`,
      [LIST, BUCKET]
    );
    await pool.query(
      `INSERT INTO messages (list, bucket, message_id, subject, from_name, from_address, content, sent_at)
       VALUES ($1,$2,'MB','s','n','a@x','c',now())`,
      [LIST, BUCKET]
    );

    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    expect(
      await store.upsert(
        LIST,
        BUCKET,
        makeMessage({ hash: 'HA', messageId: 'MB' })
      )
    ).toBe('ignored');
    expect((await pool.query('SELECT 1 FROM messages')).rowCount).toBe(2); // untouched, flagged
    warn.mockRestore();
  });

  it('upsertMany persists the batch and keys results by identity', async () => {
    const msgs = [makeMessage(), makeMessage()];
    const map = await store.upsertMany(LIST, BUCKET, msgs);
    expect(map.size).toBe(2);
    expect([...map.values()].every((r) => r === 'inserted')).toBe(true);
    expect((await pool.query('SELECT 1 FROM messages')).rowCount).toBe(2);
  });

  it('upsertMany is fail-fast: one poison message rolls the batch back', async () => {
    const good = makeMessage();
    const poison = makeMessage({ date: new Date('bogus') }); // Invalid Date → pg throws

    await expect(
      store.upsertMany(LIST, BUCKET, [good, poison])
    ).rejects.toThrow();
    expect((await pool.query('SELECT 1 FROM messages')).rowCount).toBe(0); // not partial!
  });

  it('hashesInBucket lists only non-null hashes', async () => {
    await store.upsert(LIST, BUCKET, makeMessage({ hash: 'H1' }));
    await store.upsert(LIST, BUCKET, makeMessage({ hash: null })); // messageId-keyed row
    const hashes = await store.hashesInBucket(LIST, BUCKET);
    expect(hashes.has('H1')).toBe(true);
    expect(hashes.size).toBe(1);
  });
});
