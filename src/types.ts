export interface Mail {
  subject: string;
  from: string;
  fromAddress: string;
  content: string;
  date?: Date;
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

export interface HtmlResult {
  html: string;
  destinationUrl: string;
}
