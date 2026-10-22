import { JSDOM } from 'jsdom';
import type {
  DateIndexFetchResult,
  MailMessage,
  MsgCount
} from 'src/mailarchive/types.js';
import { parseDateIndex } from './date-index.js';
import { parseMessage } from './message.js';
import { TaskPool } from 'src/network/task-pool.js';
import { BadParametersError, HttpError } from 'src/mailarchive/errors.js';
import { Logger } from 'src/logger.js';
import { UserAgent } from 'src/network/constants.js';

const pool = new TaskPool({ maxConcurrent: 2, minIntervalMs: 2000 });

export class MailArchiveClient {
  private readonly BASE = 'https://mailarchive.ietf.org';

  private readonly list: string;

  public constructor(list: string) {
    this.list = list;
  }

  /**
   * Fetch the correspond document with the given hash in this working group.
   * Will throw if no document with this hash can be found in this working group.
   * @param hash Hash of the document
   * @returns {Promise<MailMessage>}
   */
  public async fetchDocumentByHash(hash: string): Promise<MailMessage> {
    const endPoint = `${this.BASE}/arch/msg/${this.list}/${hash}/download`;

    const res = await this.fetchScheduled(endPoint);
    const raw = await res.text();

    return parseMessage(raw, hash);
  }

  /**
   * Fetch the total message count in this working group
   *
   * If `start` and `end` is not provided, it will returns the message count
   * of the current month.
   *
   * If `start` is provided but `end` is not, it will returns the message count
   * since `start` to the current date
   *
   * If `end` is provided but `start` is missing, the promise will be rejected.
   *
   * @param start {string} Follows yyyy-mm-dd format. Example: 2024-07-01
   * @param end {string} Follows yyyy-mm-dd format. Example: 2024-07-01
   */

  public async fetchMsgCounts(
    ...args: [] | [start: string, end?: string]
  ): Promise<number> {
    const [start, end] = args;

    if (end !== undefined && start === undefined) {
      throw new BadParametersError(
        '`start` must be provided while `end` is presence.'
      );
    }

    let endPoint = `${this.BASE}/api/v1/stats/msg_counts/?list=${this.list}`;

    if (start) {
      endPoint += `&start=${start}`;
    }

    if (end) {
      endPoint += `&end=${end}`;
    }

    const res = await this.fetchScheduled(endPoint);
    const data = (await res.json()) as MsgCount;

    if (!data.msg_counts[this.list]) {
      throw new BadParametersError(
        `${this.list} doesn't exists on the mailarchive server. Did you make a typo?`
      );
    }

    return data.msg_counts[this.list];
  }

  /**
   * Fetch entire year of document in this working group.
   * @param year
   * @returns {Promise<MailMessage[]}
   */
  public async fetchDocumentByYear(year: string): Promise<MailMessage[]> {
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

  /**
   * Fetch all the hashes within this bucket in this working group.
   * @param bucket {string} For example: "2024-01"
   * @returns {Promise<string[]}
   */
  public async fetchHashesByBucket(bucket: string): Promise<string[]> {
    const dateIndex = await this.fetchDateIndexByBucket(bucket);

    const hashes = dateIndex.entry.map((e) => e.hash);

    return hashes;
  }

  /**
   * Fetch all the indexes to the actual documents within this bucket in this working group
   * @param bucket {string} For example: "2024-01"
   * @returns {Promise<DateIndexFetchResult>}
   */
  public async fetchDateIndexByBucket(
    bucket: string
  ): Promise<DateIndexFetchResult> {
    const endPoint = `${this.BASE}/arch/browse/static/${this.list}/${bucket}`;

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

  /**
   * Fetch all the indexes to the actual documents of the entire year in this working group.
   * @param year {string} For example: "2024"
   * @returns {Promise<DateIndexFetchResult[]>}
   */
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
      const res = await fetch(endPoint, {
        headers: { 'user-agent': UserAgent }
      });

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
