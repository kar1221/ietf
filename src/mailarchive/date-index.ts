import type { IndexEntry } from 'src/mailarchive/types.js';
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

export function getRedirectUrl(rawHtml: string): string | null {
  const { document } = new JSDOM(rawHtml).window;

  const meta = document.querySelector('meta[http-equiv="refresh" i]');
  if (meta === null) return null;

  const content = meta.getAttribute('content');
  if (content === null) return null;

  const match = /^\s*(\d+)\s*(?:;\s*url\s*=\s*(.*?))?\s*$/i.exec(content);
  if (match === null) return null;

  const target = unquote(match[2]);

  if (target === '') return null;

  return new URL(target, document.baseURI).href;
}

export function unquote(value: string): string {
  const t = value.trim();

  if (
    t.length >= 2 &&
    (t.startsWith("'") || t.startsWith('"')) &&
    t.at(-1) === t[0]
  ) {
    return t.slice(1, -1);
  }

  return t;
}
