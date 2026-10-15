import type { IndexEntry } from 'src/types.js';
import { JSDOM } from 'jsdom';

export function parseDateIndex(html: string): IndexEntry[] {
  let date = '';
  const result: IndexEntry[] = [];

  const { document } = new JSDOM(html).window;

  const mailContainer = document.querySelector('ul.static-index');
  if (mailContainer == null) return [];

  for (const child of mailContainer.children) {
    if (child.tagName === 'STRONG') {
      date = child.textContent;
      continue;
    }

    const anchor = child.querySelector('a');
    const emphasize = child.querySelector('em');

    if (!anchor || !emphasize) continue;

    const hash = anchor.getAttribute('id') ?? '';
    const subject = anchor.textContent;
    const fromName = emphasize.textContent;

    result.push({
      date,
      fromName,
      hash,
      subject
    });
  }

  return result;
}
