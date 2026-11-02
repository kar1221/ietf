import PostalMime, { type Address } from 'postal-mime';
import { ParseError } from 'src/mailarchive/errors.js';
import type { EmailAddress, MailMessage } from 'src/mailarchive/types.js';

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
): Promise<MailMessage> {
  const parsed = await new PostalMime().parse(emailRaw);

  if (!parsed.from?.address) {
    throw new ParseError('missing From address', hash);
  }

  const subject = parsed.subject ?? '';
  const content = parsed.text ?? parsed.html ?? '';

  const archivedAt =
    parsed.headers.find((h) => h.key === 'archived-at')?.value ?? '';
  const hashFromHeader =
    /\/([^/]+)\/?>\s*$/.exec(archivedAt.trim())?.[1] ?? null;

  const from: EmailAddress = {
    name: parsed.from.name,
    address: parsed.from.address.toLowerCase()
  };
  const to = toAddressList(parsed.to);
  const cc = toAddressList(parsed.cc);

  const date = safeDate(parsed.date);
  const messageId = parsed.messageId?.trim() ?? null;

  const inReplyTo = parsed.inReplyTo ?? null;
  const references = parseReferences(parsed.references);

  return {
    hash: hash ?? hashFromHeader,
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

export function isMessageEqual(first: MailMessage, second: MailMessage) {
  return (
    first.hash === second.hash &&
    first.subject === second.subject &&
    emailAddressEqual(first.from, second.from) &&
    emailAddressesEqual(first.to, second.to) &&
    emailAddressesEqual(first.cc, second.cc) &&
    first.content === second.content &&
    datesEqual(first.date, second.date) &&
    first.messageId === second.messageId &&
    first.inReplyTo === second.inReplyTo &&
    arraysEqual(first.references, second.references)
  );
}

function emailAddressEqual(first: EmailAddress, second: EmailAddress): boolean {
  return first.name === second.name && first.address === second.address;
}

function emailAddressesEqual(
  first: EmailAddress[],
  second: EmailAddress[]
): boolean {
  if (first.length !== second.length) return false;

  const sortEmails = (emails: EmailAddress[]) =>
    [...emails].sort((x, y) =>
      x.address < y.address
        ? -1
        : x.address > y.address
          ? 1
          : x.name < y.name
            ? -1
            : x.name > y.name
              ? 1
              : 0
    );

  const sortedA = sortEmails(first);
  const sortedB = sortEmails(second);

  return sortedA.every((email, i) => emailAddressEqual(email, sortedB[i]));
}

function arraysEqual<T>(first: T[], second: T[]): boolean {
  return (
    first.length === second.length &&
    first.every((value, i) => value === second[i])
  );
}

function datesEqual(first: Date | null, second: Date | null): boolean {
  return (
    first === second ||
    (first !== null && second !== null && first.getTime() === second.getTime())
  );
}
