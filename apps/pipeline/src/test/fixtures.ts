import type { IndexEntry, MailMessage } from '@ietf/clients/mailarchive/types';

let n = 0;

export function makeMessage(over: Partial<MailMessage> = {}): MailMessage {
  n += 1;
  return {
    hash: `h-${n.toString()}`,
    messageId: `<mid-${n.toString()}@example.com>`,
    subject: `Subject ${n.toString()}`,
    from: {
      name: `Name ${n.toString()}`,
      address: `user${n.toString()}@example.com`
    },
    to: [{ name: '', address: 'quic@ietf.org' }],
    cc: [],
    content: `Body of message ${n.toString()}`,
    date: new Date('2024-08-05T10:00:00Z'),
    inReplyTo: null,
    references: [],
    ...over
  };
}

export function makeEntry(hash: string, date: string): IndexEntry {
  return { hash, date, subject: `Subject of ${hash}`, fromName: 'Some Sender' };
}
