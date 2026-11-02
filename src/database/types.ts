import type { EmailAddress } from 'src/mailarchive/types.js';

export interface ListOverview {
  list: string;
  buckets: { bucket: string; count: number }[];
}

export interface MessageOverview {
  id: number;
  hash: string | null;
  messageId: string | null;
  from: EmailAddress;
  date: Date | null;
  subject: string;
}

export interface MessageContent extends MessageOverview {
  content: string;
}
