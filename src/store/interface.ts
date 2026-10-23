import type { MailMessage } from 'src/mailarchive/types.js';

export interface StoreStats {
  attempted: number;
  stored: number;
}

export interface IMessageStore {
  upsert(list: string, bucket: string, msg: MailMessage): void;
  getByBucket(list: string, bucket: string): readonly MailMessage[];
  countByBucket(list: string, bucket: string): number;
  messageIdsInBucket(list: string, bucket: string): Set<string>;
  stats(list: string): StoreStats;
}
