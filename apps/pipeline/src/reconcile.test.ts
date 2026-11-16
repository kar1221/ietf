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
import type { MailMessage } from '@ietf/clients/mailarchive/types';
import { LIST, testPool, truncate } from './test/db.ts';
import { makeMessage } from './test/fixtures.ts';
import { Logger } from './logger.ts';
import { PostgresMessageStore } from './store/postgres-message-store.ts';

const stubs = vi.hoisted(() => ({
  msg: null as null | ((list: string, hash: string) => Promise<MailMessage>),
  msgCalls: 0
}));

vi.mock('@ietf/clients/mailarchive', () => ({
  MailArchiveClient: class {
    public async fetchMailMessageByHash(list: string, hash: string) {
      stubs.msgCalls += 1;
      if (stubs.msg === null) throw new Error('test forgot to set stubs.msg');
      return stubs.msg(list, hash);
    }
  }
}));

const { Reconciler } = await import('./reconcile.ts');

let pool: Pool;
let store: PostgresMessageStore;
let reconciler: InstanceType<typeof Reconciler>;

beforeAll(() => {
  pool = testPool();
  store = new PostgresMessageStore(pool);
  reconciler = new Reconciler(store, pool);
});
afterAll(() => {
  truncate(pool);
  pool.end();
});
beforeEach(() => {
  stubs.msg = null;
  stubs.msgCalls = 0;
  return truncate(pool);
});

async function seedManifest(bucket: string, hashes: string[]): Promise<void> {
  for (const h of hashes) {
    await pool.query(
      `INSERT INTO manifest_entries (list, bucket, hash, fetched_at, entry_date)
       VALUES ($1,$2,$3,now(),'2024-08-05')`,
      [LIST, bucket, h]
    );
  }
}

const echoMsg = async (_l: string, h: string): Promise<MailMessage> =>
  makeMessage({ hash: h, messageId: `<${h}@x.example>` });

describe('getMissingHash', () => {
  it('is a pure local diff: manifest − messages, zero network', async () => {
    await seedManifest('2024-08', ['A', 'B', 'C']);
    await store.upsert(
      LIST,
      '2024-08',
      makeMessage({ hash: 'B', messageId: '<b@x.example>' })
    );

    const missing = await reconciler.getMissingHash(LIST, '2024-08');
    expect(missing).toEqual(['A', 'C']); // order: manifest insertion
  });

  it('scopes by bucket — a hash present in another bucket is still missing here', async () => {
    await seedManifest('2024-08', ['A']);
    await store.upsert(
      LIST,
      '2024-09',
      makeMessage({ hash: 'A', messageId: '<a@x.example>' })
    );

    expect(await reconciler.getMissingHash(LIST, '2024-08')).toEqual(['A']);
  });
});

describe('reconcileBucket', () => {
  it('fetches exactly the missing hashes and upserts them', async () => {
    await seedManifest('2024-08', ['A', 'B']);
    stubs.msg = echoMsg;

    const report = await reconciler.reconcileBucket(LIST, '2024-08');
    expect(report).toEqual({ bucket: '2024-08', missing: 0, fetched: 2 });
    expect((await store.hashesInBucket(LIST, '2024-08')).size).toBe(2);
  });

  it('THE convergence test: second run does zero fetching', async () => {
    await seedManifest('2024-08', ['A', 'B', 'C']);
    stubs.msg = echoMsg;

    await reconciler.reconcileBucket(LIST, '2024-08');
    stubs.msgCalls = 0;

    const second = await reconciler.reconcileBucket(LIST, '2024-08');
    expect(second).toEqual({ bucket: '2024-08', missing: 0, fetched: 0 });
    expect(stubs.msgCalls).toBe(0); // ← the entire November architecture, one assertion
  });

  it('logs each failed fetch by hash; failures stay missing for next run', async () => {
    await seedManifest('2024-08', ['OK', 'BAD']);
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    stubs.msg = async (_l, h) => {
      if (h === 'BAD') throw new Error('404');
      return makeMessage({ hash: h, messageId: `<${h}@x.example>` });
    };

    const report = await reconciler.reconcileBucket(LIST, '2024-08');
    expect(report).toEqual({ bucket: '2024-08', missing: 1, fetched: 1 });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('BAD'),
      'Reconciler'
    );
    expect((await store.hashesInBucket(LIST, '2024-08')).has('OK')).toBe(true);
    warn.mockRestore();
  });

  it('upserts in chunks — 30 messages → two upsertMany calls', async () => {
    const hashes = Array.from({ length: 30 }, (_, i) => `H${i}`);
    await seedManifest('2024-08', hashes);
    stubs.msg = echoMsg;
    const spy = vi.spyOn(store, 'upsertMany'); // spies through the original by default

    await reconciler.reconcileBucket(LIST, '2024-08');
    expect(spy).toHaveBeenCalledTimes(2); // 25 + 5
    const { rows } = await pool.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM messages'
    );
    expect(rows[0].n).toBe(30);
    spy.mockRestore();
  });
});
