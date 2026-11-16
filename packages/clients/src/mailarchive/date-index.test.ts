import { describe, expect, it } from 'vitest';
import { getRedirectUrl, parseDateIndex } from './date-index.ts';
import { ParseError } from './errors.ts';

const YEAR_PAGE = `
<ul class="static-index" data-static-off-url="/arch/browse/quic/">
  <strong>Aug 29 2024</strong>
  <li><a id="h1" href="/arch/msg/quic/h1/">Re: Zero-length CID</a>, <em>Martin Duke</em></li>
  <strong>Aug 28 2024</strong>
  <li><a id="h2" href="/arch/msg/quic/h2/">volunteers to draft</a>, <em>Neal Cardwell</em></li>
  <li><a id="h3" href="/arch/msg/quic/h3/">Happy Eyeballs v3</a>, <em>Tommy Pauly</em></li>
</ul>`;

describe('parseDateIndex', () => {
  it('extracts hash/subject/fromName', () => {
    const entries = parseDateIndex(YEAR_PAGE);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      hash: 'h1',
      subject: 'Re: Zero-length CID',
      fromName: 'Martin Duke'
    });
  });

  it('carries the previous date onto <li> without <strong>', () => {
    const entries = parseDateIndex(YEAR_PAGE);
    expect(entries[1].date).toBe('Aug 28 2024');
    expect(entries[2].date).toBe('Aug 28 2024'); // ← the carry-over
  });

  it('returns [] for an empty-but-present container (legitimate empty year)', () => {
    expect(parseDateIndex('<ul class="static-index"></ul>')).toEqual([]);
  });

  it('THROWS when the container is missing (page-format change = loud failure)', () => {
    expect(() =>
      parseDateIndex('<html><body><p>oops</p></body></html>')
    ).toThrow(ParseError);
  });
});

describe('getRedirectUrl', () => {
  it('reads the meta-refresh target', () => {
    const html = `<meta http-equiv="refresh" content="0;URL='/arch/browse/static/quic/2024/'">`;
    expect(getRedirectUrl(html)).toBe(
      'https://mailarchive.ietf.org/arch/browse/static/quic/2024/'
    );
  });

  it('returns null with no meta refresh', () => {
    expect(getRedirectUrl('<html></html>')).toBeNull();
  });
});
