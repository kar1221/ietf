import { JSDOM } from 'jsdom';
import type {
  DateIndexFetchResult,
  IETFDocument
} from 'src/mailarchive/types.js';
import { parseDateIndex } from './date-index.js';
import { parseMessage } from './message.js';
import { TaskPool } from 'src/network/task-pool.js';
import { HttpError } from 'src/mailarchive/errors.js';
import { Logger } from 'src/logger.js';

const pool = new TaskPool({ maxConcurrent: 2, minIntervalMs: 2000 });

const UA =
  'ietf-doc-analyzer/0.1 (+https://github.com/kar1221/ietf; khyeong191@gmail.com)';

export class MailArchiveClient {
  private readonly BASE = 'https://mailarchive.ietf.org';

  private workingGroup: string;

  public constructor(workingGroup: string) {
    this.workingGroup = workingGroup;
  }

  public async fetchDocumentByHash(hash: string): Promise<IETFDocument> {
    const endPoint = `${this.BASE}/arch/msg/${this.workingGroup}/${hash}/download`;

    const res = await this.fetchScheduled(endPoint);
    const raw = await res.text();

    return parseMessage(raw, hash);
  }

  public async fetchDocumentByYear(year: string): Promise<IETFDocument[]> {
    const dateIndexEntry = await this.fetchDateIndexByYear(year);

    const hashes = dateIndexEntry.flatMap((d) => d.entry.map((d) => d.hash));

    const res = await Promise.allSettled(
      hashes.map((h) => this.fetchDocumentByHash(h))
    );

    res.forEach((r, i) => {
      if (r.status === 'rejected') {
        Logger.error(
          `${hashes[i]} failed: ${r.reason instanceof Error ? r.reason.message : 'Unknown reason'}`,
          'MailArchiveClient'
        );
      }
    });

    return res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  }

  public async fetchHashesByBucket(bucket: string): Promise<string[]> {
    const dateIndex = await this.fetchDateIndexByBucket(bucket);

    const hashes = dateIndex.entry.map((e) => e.hash);

    return hashes;
  }

  public async fetchDateIndexByBucket(
    bucket: string
  ): Promise<DateIndexFetchResult> {
    const endPoint = `${this.BASE}/arch/browse/static/${this.workingGroup}/${bucket}`;

    let res = await this.fetchScheduled(endPoint);
    let html = await res.text();

    const redirectUrl = this.getRedirectUrl(html);

    if (redirectUrl) {
      res = await this.fetchScheduled(redirectUrl);
      html = await res.text();
    }

    const entry = parseDateIndex(html);

    return {
      entry,
      didRedirect: redirectUrl !== null
    };
  }

  public async fetchDateIndexByYear(
    year: string
  ): Promise<DateIndexFetchResult[]> {
    const buckets = this.getBucketsOfYear(year);

    const first = await this.fetchDateIndexByBucket(buckets[0]);

    if (first.didRedirect) {
      return [first];
    }

    const rest = await Promise.allSettled(
      buckets.map((b) => this.fetchDateIndexByBucket(b))
    );

    return [
      first,
      ...rest.filter((r) => r.status === 'fulfilled').map((r) => r.value)
    ];
  }

  private getBucketsOfYear(year: string) {
    const today = new Date();

    const currentYear = today.getFullYear();
    // Why on earth is getMonth() zero based???
    const currentMonth = today.getMonth() + 1;

    const bucketRange = currentYear.toString() === year ? currentMonth : 12;

    return Array.from(
      { length: bucketRange },
      (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`
    );
  }

  private getRedirectUrl(rawHtml: string): string | null {
    const { document } = new JSDOM(rawHtml).window;

    const meta = document.querySelector('meta[http-equiv="refresh" i]');
    if (meta === null) return null;

    const content = meta.getAttribute('content');
    if (content === null) return null;

    const match = /^\s*(\d+)\s*(?:;\s*url\s*=\s*(.*?))?\s*$/i.exec(content);
    if (match === null) return null;

    const target = this.unquote(match[2]);

    if (target === '') return null;

    return new URL(target, document.baseURI).href;
  }

  private async fetchScheduled(endPoint: string): Promise<Response> {
    return pool.schedule(async () => {
      const res = await fetch(endPoint, { headers: { 'user-agent': UA } });

      Logger.debug(`Fetching ${endPoint}`, 'MailArchiveClient');

      if (!res.ok) throw new HttpError(res.status, endPoint);

      return res;
    });
  }

  private unquote(value: string): string {
    const t = value.trim();

    if (
      t.length >= 2 &&
      (t.startsWith("'") || t.startsWith('"')) &&
      t.at(-1) === t[0]
    ) {
      return t.slice(1, -1);
    }

    return t;
  }
}
