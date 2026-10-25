import type {
  DateIndexFetchResult,
  MailMessage
} from 'src/mailarchive/types.js';
import { getRedirectUrl, parseDateIndex } from './date-index.js';
import { parseMessage } from './message.js';
import { TaskPool } from 'src/network/task-pool.js';
import { BadParametersError, HttpError } from 'src/mailarchive/errors.js';
import { Logger } from 'src/logger.js';
import { UserAgent } from 'src/network/constants.js';
import { msgCountSchema } from './schema.js';
import { ApiResponseError } from 'src/network/errors.js';

const pool = new TaskPool({ maxConcurrent: 2, minIntervalMs: 2000 });

export class MailArchiveClient {
  public static readonly BASE = 'https://mailarchive.ietf.org';

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
  public async fetchMailMessageByHash(hash: string): Promise<MailMessage> {
    const endPoint = `${MailArchiveClient.BASE}/arch/msg/${this.list}/${hash}/download`;

    const res = await this.fetchScheduled(endPoint);
    const raw = await res.text();

    return parseMessage(raw, hash);
  }

  /**
   * Fetch all the mails under a certain bucket in this working group.
   * @param bucket {string}
   * @returns {Promise<MailMessage[]>}
   */
  public async fetchMailMessagesByBucket(
    bucket: string
  ): Promise<MailMessage[]> {
    const hashes = await this.fetchHashesByBucket(bucket);

    return await this.fetchMessagesByHashes(hashes);
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

    let endPoint = `${MailArchiveClient.BASE}/api/v1/stats/msg_counts/?list=${this.list}`;

    if (start) {
      endPoint += `&start=${start}`;
    }

    if (end) {
      endPoint += `&end=${end}`;
    }

    const res = await this.fetchScheduled(endPoint);
    const parsed = msgCountSchema.safeParse(await res.json());

    if (!parsed.success) {
      throw new ApiResponseError(endPoint, parsed.error.issues);
    }

    return parsed.data.msg_counts[this.list] ?? 0;
  }

  /**
   * Fetch entire year of document in this working group.
   * @param year
   * @returns {Promise<MailMessage[]}
   */
  public async fetchMailMessagesByYear(year: string): Promise<MailMessage[]> {
    const dateIndexEntry = await this.fetchDateIndexByYear(year);
    const hashes = dateIndexEntry.flatMap((d) => d.entry.map((dd) => dd.hash));

    return await this.fetchMessagesByHashes(hashes);
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
    const endPoint = `${MailArchiveClient.BASE}/arch/browse/static/${this.list}/${bucket}`;

    let res = await this.fetchScheduled(endPoint);
    let html = await res.text();

    const redirectUrl = getRedirectUrl(html);

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
      buckets.slice(1).map((b) => this.fetchDateIndexByBucket(b))
    );

    return [
      first,
      ...rest.filter((r) => r.status === 'fulfilled').map((r) => r.value)
    ];
  }

  private async fetchMessagesByHashes(
    hashes: string[]
  ): Promise<MailMessage[]> {
    const results = await Promise.allSettled(
      hashes.map((h) => this.fetchMailMessageByHash(h))
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        Logger.error(
          `${hashes[index]} failed: ${
            result.reason instanceof Error
              ? result.reason.message
              : 'Unknown reason'
          }`,
          'MailArchiveClient'
        );
      }
    });

    return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
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
}
