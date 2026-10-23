import type { MailMessage } from 'src/mailarchive/types.js';
import type { IMessageStore, StoreStats } from './interface.js';
import { Logger } from 'src/logger.js';

export class MemoryMessageStore implements IMessageStore {
  private byId = new Map<string, MailMessage>();
  private byBucket = new Map<string, MailMessage[]>();

  private attempted = new Map<string, number>();
  private stored = new Map<string, number>();

  private static getBucketKey(list: string, bucket: string) {
    return `${list}/${bucket}`;
  }

  private static getMessageKey(list: string, bucket: string, msgId: string) {
    return `${list}/${bucket}/${msgId}`;
  }

  private increaseAttempted(list: string) {
    const previous = this.attempted.get(list) ?? 0;
    this.attempted.set(list, previous + 1);
  }

  private increaseStored(list: string) {
    const previous = this.stored.get(list) ?? 0;
    this.stored.set(list, previous + 1);
  }

  public upsert(list: string, bucket: string, msg: MailMessage): void {
    this.increaseAttempted(list);

    if (msg.messageId === null) {
      Logger.warn(
        `${msg.subject} of ${list} in bucket ${bucket} has no message id`
      );
      return;
    }

    const msgKey = MemoryMessageStore.getMessageKey(
      list,
      bucket,
      msg.messageId
    );

    if (this.byId.has(msgKey)) return;
    this.byId.set(msgKey, msg);

    const bucketKey = MemoryMessageStore.getBucketKey(list, bucket);

    const arr = this.byBucket.get(bucketKey) ?? [];
    arr.push(msg);

    this.byBucket.set(bucketKey, arr);

    this.increaseStored(list);
  }

  public getByBucket(list: string, bucket: string): readonly MailMessage[] {
    const bucketKey = MemoryMessageStore.getBucketKey(list, bucket);

    return this.byBucket.get(bucketKey) ?? [];
  }

  public countByBucket(list: string, bucket: string): number {
    const bucketKey = MemoryMessageStore.getBucketKey(list, bucket);

    const arr = this.byBucket.get(bucketKey) ?? [];

    return arr.length;
  }

  public messageIdsInBucket(list: string, bucket: string): Set<string> {
    const bucketKey = MemoryMessageStore.getBucketKey(list, bucket);

    const arr = this.byBucket.get(bucketKey) ?? [];

    const result = new Set<string>();

    arr.forEach((a) => {
      if (a.messageId === null) return;

      result.add(a.messageId);
    });

    return result;
  }

  public stats(list: string): StoreStats {
    const attempted = this.attempted.get(list) ?? 0;
    const stored = this.stored.get(list) ?? 0;

    return {
      attempted,
      stored
    };
  }
}
