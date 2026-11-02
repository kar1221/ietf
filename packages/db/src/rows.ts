export interface MessageRow {
  id: string;
  list: string;
  bucket: string;
  hash: string | null;
  message_id: string | null;
  subject: string;
  from_name: string;
  from_address: string;
  content: string;
  sent_at: Date | null;
  in_reply_to: string | null;
  reference: string[] | null;
  to_addrs: string[] | null;
  cc_addrs: string[] | null;
}

export interface OverviewRow {
  list: string;
  bucket: string;
  count: number;
}

export type MessageOverviewRow = Pick<
  MessageRow,
  | 'id'
  | 'hash'
  | 'message_id'
  | 'from_name'
  | 'from_address'
  | 'subject'
  | 'sent_at'
>;

export type MessageContentRow = Pick<
  MessageRow,
  keyof MessageOverviewRow | 'content'
>;
