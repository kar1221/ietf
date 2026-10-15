import PostalMime from 'postal-mime';
import type { Mail } from 'src/types.js';

export async function parseMessage(emailRaw: string): Promise<Mail> {
  const parsed = await new PostalMime().parse(emailRaw);

  // TODO: Clean up this a bit
  // Whether should we return null if some tests failed
  // or any other appropriate way
  const subject = parsed.subject ?? '';
  const from = parsed.from?.name ?? '';
  const fromAddress = parsed.from?.address ?? '';
  const date = parsed.date ? new Date(parsed.date) : undefined;
  const content = parsed.text ?? '';

  return {
    subject,
    from,
    fromAddress,
    date,
    content
  };
}
