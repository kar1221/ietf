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
import { LIST, testPool, truncate } from './test/db.ts';
import { makeEntry } from './test/fixtures.ts';

// vi.hoisted: values created before the hoisted vi.mock factory runs
const stubs = vi.hoisted(() => ({
  page: null as null | {
    entry: Array<{
      hash: string;
      date: string;
      subject: string;
      fromName: string;
    }>;
    didRedirect: boolean;
  },
  pageCalls: 0
}));

vi.mock('@ietf/clients/mailarchive', () => ({
  MailArchiveClient: class {
    public async fetchDateIndexByBucket() {
      stubs.pageCalls += 1;
      if (stubs.page === null) throw new Error('test forgot to set stubs.page');
      return stubs.page;
    }
  }
}));

// manifest.ts constructs its client at module scope — import AFTER the mock registers
const { Manifest } = await import('./manifest.ts');

let pool: Pool;
let manifest: InstanceType<typeof Manifest>;

// the current month, computed from real now — "open bucket" without faking time
const openBucket = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
})();

beforeAll(() => {
  pool = testPool();
  manifest = new Manifest(pool);
});
afterAll(() => {
  truncate(pool);
  pool.end();
});
beforeEach(() => {
  stubs.page = null;
  stubs.pageCalls = 0;
  return truncate(pool);
});

async function seedManifest(
  bucket: string,
  hashes: string[],
  entryDate: string
): Promise<void> {
  for (const h of hashes) {
    await pool.query(
      `INSERT INTO manifest_entries (list, bucket, hash, fetched_at, entry_date)
       VALUES ($1, $2, $3, now(), $4)`,
      [LIST, bucket, h, entryDate]
    );
  }
}

const rowCount = async (bucket: string): Promise<number> => {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM manifest_entries WHERE list = $1 AND bucket = $2`,
    [LIST, bucket]
  );
  return rows[0].n;
};

describe('refreshManifestBucket', () => {
  it('slices the month out of a year page and stamps the ENTRY year/month, not now', async () => {
    stubs.page = {
      didRedirect: true,
      entry: [
        makeEntry('A', 'Aug 01 2024'),
        makeEntry('B', 'Sep 15 2024'), // next month — the off-by-one trap
        makeEntry('C', 'Aug 20 2024')
      ]
    };

    expect(await manifest.refreshManifestBucket(LIST, '2024-08')).toBe(2);

    const { rows } = await pool.query<{ h: string; d: string }>(
      `SELECT hash AS h, to_char(entry_date, 'YYYY-MM') AS d FROM manifest_entries ORDER BY hash`
    );
    expect(rows.map((r) => r.h)).toEqual(['A', 'C']);
    for (const r of rows) expect(r.d).toBe('2024-08'); // kills the 2026-stamp bug class
  });

  it('legitimately empty month CLEARS stale rows — no crash, no lie', async () => {
    await seedManifest('2024-12', ['old', 'stale'], '2024-12-05');
    stubs.page = { didRedirect: true, entry: [makeEntry('X', 'Nov 30 2024')] }; // nothing in Dec

    expect(await manifest.refreshManifestBucket(LIST, '2024-12', true)).toBe(0);
    expect(await rowCount('2024-12')).toBe(0); // DELETE ran — reconcile stays honest
  });

  it('closed bucket with existing rows does NOT touch the network', async () => {
    await seedManifest('2020-03', ['x'], '2020-03-10');
    expect(await manifest.refreshManifestBucket(LIST, '2020-03')).toBe(0);
    expect(stubs.pageCalls).toBe(0);
  });

  it('current month refreshes even when rows already exist', async () => {
    await seedManifest(openBucket, ['y'], '2026-01-01');
    stubs.page = { didRedirect: false, entry: [makeEntry('y', 'Nov 13 2026')] };

    await manifest.refreshManifestBucket(LIST, openBucket);
    expect(stubs.pageCalls).toBe(1);
  });

  it('force overrides the closed skip', async () => {
    await seedManifest('2019-05', ['z'], '2019-05-05');
    stubs.page = { didRedirect: false, entry: [] };
    await manifest.refreshManifestBucket(LIST, '2019-05', true);
    expect(stubs.pageCalls).toBe(1);
  });

  it('bucket move across pages relocates the row (PK list,hash + ON CONFLICT)', async () => {
    await seedManifest('2024-07', ['M'], '2024-07-31');
    stubs.page = { didRedirect: true, entry: [makeEntry('M', 'Aug 02 2024')] };

    await manifest.refreshManifestBucket(LIST, '2024-08');
    const { rows } = await pool.query<{ bucket: string }>(
      'SELECT bucket FROM manifest_entries WHERE hash = $1',
      ['M']
    );
    expect(rows[0].bucket).toBe('2024-08');
  });

  it('truly empty year page (parser returned [] from present container) is legal', async () => {
    await seedManifest('2018-06', ['ghost'], '2018-06-10');
    stubs.page = { didRedirect: true, entry: [] };
    expect(await manifest.refreshManifestBucket(LIST, '2018-06', true)).toBe(0);
    expect(await rowCount('2018-06')).toBe(0);
  });
});
