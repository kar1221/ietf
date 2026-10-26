export interface EmailAddress {
  name: string;
  address: string;
}

export interface MailMessage {
  hash: string | null;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  content: string;
  date: Date | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
}

export interface IndexEntry {
  hash: string;
  date: string;
  subject: string;
  fromName: string;
}

export interface MetaRefresh {
  delaySeconds: number;
  url: string;
}

export interface DateIndexFetchResult {
  entry: IndexEntry[];
  didRedirect: boolean;
}
