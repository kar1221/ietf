import { JSDOM } from 'jsdom';
import type { HtmlResult, IndexEntry, Mail, MetaRefresh } from 'src/types.js';
import { parseDateIndex } from './date-index.js';
import { parseMessage } from './message.js';
import { TaskPool } from 'src/network/task-pool.js';

const BASE = 'https://mailarchive.ietf.org';
const MAX_HOPS = 5;

export async function fetchDateIndex(
  workingGroup: string,
  bucket: string
): Promise<IndexEntry[]> {
  const endPoint = `${BASE}/arch/browse/static/${workingGroup}/${bucket}`;

  const result = await fetchHtml(endPoint, MAX_HOPS);

  return parseDateIndex(result.html);
}

export async function getMessage(workingGroup: string, hash: string) {
  const endPoint = `${BASE}/arch/msg/${workingGroup}/${hash}/download`;

  const res = await fetch(endPoint);
  const raw = await res.text();

  return parseMessage(raw);
}

export async function fetchDocumentByHashes(
  workingGroup: string,
  hashes: string[]
) {
  const taskPool = new TaskPool();

  const result = await Promise.allSettled(
    hashes.map((h) => taskPool.schedule(() => getMessage(workingGroup, h)))
  );

  const documents: Mail[] = [];

  for (const r of result) {
    if (r.status === 'fulfilled') {
      documents.push(r.value);
      continue;
    }
  }

  return documents;
}

export async function fetchDocumentHashesByYear(
  workingGroup: string,
  year: string
): Promise<string[]> {
  const hashes: string[] = [];

  for (let month = 1; month <= 12; month++) {
    const bucket = `${year}-${String(month).padStart(2, '0')}`;
    const endPoint = `${BASE}/arch/browse/static/${workingGroup}/${bucket}`;

    const { html, destinationUrl } = await fetchHtml(endPoint);
    const dateIndex = parseDateIndex(html);

    dateIndex.forEach((d) => hashes.push(d.hash));

    if (destinationUrl.endsWith(`${year}/`)) {
      break;
    }
  }

  return hashes;
}

async function fetchHtml(url: string, maxHops = 5): Promise<HtmlResult> {
  let current = url;

  for (let hops = 0; hops < maxHops; hops += 1) {
    const res = await fetch(current);

    if (!res.ok)
      throw new Error(`HTTP ${res.status.toString()} for ${current}`);

    const html = await res.text();
    const dom = new JSDOM(html, { url: res.url });
    const refresh = findMetaRefresh(dom.window.document);

    if (refresh === null) {
      return {
        html,
        destinationUrl: current
      };
    }

    current = refresh.url;
  }

  throw new Error(`Hops exceeds ${maxHops.toString()} for ${current}`);
}

function findMetaRefresh(document: Document): MetaRefresh | null {
  const meta = document.querySelector('meta[http-equiv="refresh" i]');
  if (meta === null) return null;

  const content = meta.getAttribute('content');
  if (content === null) return null;

  const match = /^\s*(\d+)\s*(?:;\s*url\s*=\s*(.*?))?\s*$/i.exec(content);
  if (match === null) return null;

  const delaySeconds = Number(match[1]);
  const target = unquote(match[2]);

  if (target === '') return null;

  return {
    delaySeconds,
    url: new URL(target, document.baseURI).href
  };
}

function unquote(value: string): string {
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
