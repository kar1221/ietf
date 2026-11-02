import type { MailMessage } from 'src/mailarchive/types.js';

export interface StoreStats {
  attempted: number;
  stored: number;
}

export type UpsertResult = 'inserted' | 'ignored' | 'merged';

export interface IMessageStore {
  upsert(list: string, bucket: string, msg: MailMessage): Promise<UpsertResult>;
  upsertMany(
    list: string,
    bucket: string,
    msg: MailMessage[]
  ): Promise<Map<string, UpsertResult>>;
  getByBucket(list: string, bucket: string): Promise<readonly MailMessage[]>;
  countByBucket(list: string, bucket: string): Promise<number>;
  hashesInBucket(list: string, bucket: string): Promise<Set<string>>;
  messageIdsInBucket(list: string, bucket: string): Promise<Set<string>>;
  stats(list: string): Promise<StoreStats>;
}
