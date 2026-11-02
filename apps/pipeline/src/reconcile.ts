import { Logger } from './logger.ts';
import type { MailArchiveClient } from '@ietf/clients/mailarchive';
import type { IMessageStore } from './store/interface.ts';

export class Reconciler {
  private readonly messageStore: IMessageStore;
  private readonly mailarchive: MailArchiveClient;

  public constructor(store: IMessageStore, mailarchive: MailArchiveClient) {
    this.messageStore = store;
    this.mailarchive = mailarchive;
  }

  public async checkBucket(list: string, bucket: string) {
    const storeMessageCounts = await this.messageStore.countByBucket(
      list,
      bucket
    );

    const [start, end] = this.getDateRange(bucket);
    const actualMessageCounts = await this.mailarchive.fetchMsgCounts(
      start,
      end
    );

    if (storeMessageCounts === actualMessageCounts) return;

    if (storeMessageCounts > actualMessageCounts) {
      Logger.warn(
        `[${list}] Bucket ${bucket} has ${storeMessageCounts.toString()} entries, but the actual messages count is ${actualMessageCounts.toString()}`
      );
      return;
    }

    const messages = await this.mailarchive.fetchMailMessagesByBucket(bucket);

    await this.messageStore.upsertMany(list, bucket, messages);

    const messageCountsAfter = await this.messageStore.countByBucket(
      list,
      bucket
    );

    if (messageCountsAfter !== actualMessageCounts) {
      Logger.error(
        `[${list}] Bucket ${bucket} still has mismatched message counts after reconilation!`
      );
      Logger.error(
        `Expected: ${actualMessageCounts.toString()}, got: ${messageCountsAfter.toString()}`
      );
    }
  }

  private getDateRange(bucket: string): [start: string, end: string] {
    const start = `${bucket}-01`;

    const splitted = bucket.split('-');

    const year = Number(splitted[0]);
    const month = Number(splitted[1]);

    if (month === 12) {
      return [start, `${(year + 1).toString()}-01-01`];
    }

    return [
      start,
      `${year.toString()}-${(month + 1).toString().padStart(2, '0')}-01`
    ];
  }
}
