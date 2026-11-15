export interface EpgProgram {
  /** The <programme channel="..."> in XMLTV — matches MediaItem.tvgId. */
  channelId: string;
  start: number; // epoch ms
  stop: number; // epoch ms
  title: string;
  description?: string;
}

const PROGRAMME_RE = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
const ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/;
const DESC_RE = /<desc\b[^>]*>([\s\S]*?)<\/desc>/;

/**
 * A tolerant, dependency-free XMLTV parser (not a full XML parser — it just extracts
 * <programme> blocks with regex). Works without the DOM (doesn't use DOMParser) so it runs
 * cleanly both in Node tests and on Tizen — the same approach as `m3u.ts`.
 */
export function parseXmltv(xml: string): EpgProgram[] {
  const out: EpgProgram[] = [];
  PROGRAMME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROGRAMME_RE.exec(xml))) {
    const [, attrsRaw, body] = m;
    const attrs: Record<string, string> = {};
    ATTR_RE.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = ATTR_RE.exec(attrsRaw))) attrs[a[1].toLowerCase()] = a[2];

    const channelId = attrs['channel'];
    const start = parseXmltvDate(attrs['start']);
    const stop = parseXmltvDate(attrs['stop']);
    if (!channelId || start === null || stop === null) continue;

    const titleMatch = TITLE_RE.exec(body);
    const descMatch = DESC_RE.exec(body);
    out.push({
      channelId,
      start,
      stop,
      title: titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : 'Bilinmeyen program',
      description: descMatch ? decodeXmlEntities(descMatch[1].trim()) : undefined,
    });
  }
  return out;
}

const DATE_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/;

/** "20261103180000 +0300" -> epoch ms. If no timezone is given, UTC is assumed per the XMLTV spec. */
export function parseXmltvDate(s: string | undefined): number | null {
  if (!s) return null;
  const m = DATE_RE.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se, tz] = m;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  if (!tz) return utcMs;
  const sign = tz[0] === '-' ? -1 : 1;
  const tzHours = Number(tz.slice(1, 3));
  const tzMinutes = Number(tz.slice(3, 5));
  const offsetMs = sign * (tzHours * 60 + tzMinutes) * 60000;
  return utcMs - offsetMs;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
