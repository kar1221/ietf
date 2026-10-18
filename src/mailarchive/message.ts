import PostalMime, { type Address } from 'postal-mime';
import { ParseError } from 'src/errors.js';
import type { EmailAddress, IETFDocument } from 'src/mailarchive/types.js';

function toAddressList(list?: Address[]): EmailAddress[] {
  const addresses = list ?? [];

  return addresses
    .filter((a) => a.address !== undefined)
    .map((a) => ({ name: a.name, address: a.address.toLowerCase() }));
}

function parseReferences(raw?: string): string[] {
  return raw?.match(/<[^>]*>/g) ?? [];
}

function safeDate(raw?: string): Date | null {
  if (!raw) return null;

  const d = new Date(raw);

  return Number.isNaN(d.getTime()) ? null : d;
}

export async function parseMessage(
  emailRaw: string,
  hash?: string
): Promise<IETFDocument> {
  const parsed = await new PostalMime().parse(emailRaw);

  if (!parsed.from?.address) {
    throw new ParseError('missing From address', hash);
  }

  const subject = parsed.subject ?? '';
  const content = parsed.text ?? parsed.html ?? '';

  const from: EmailAddress = {
    name: parsed.from.name,
    address: parsed.from.address
  };
  const to = toAddressList(parsed.to);
  const cc = toAddressList(parsed.cc);

  const date = safeDate(parsed.date);
  const messageId = parsed.messageId ?? '';

  const inReplyTo = parsed.inReplyTo ?? null;
  const references = parseReferences(parsed.references);

  return {
    subject,
    from,
    to,
    cc,
    content,
    date,
    messageId,
    inReplyTo,
    references
  };
}
