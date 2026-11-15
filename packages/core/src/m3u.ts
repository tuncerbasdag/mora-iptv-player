import type { M3UEntry } from './types.ts';

const ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

/**
 * A simple, tolerant M3U / M3U8 (extended) parser.
 * Supported: #EXTINF (attrs + name), #EXTGRP, BOM, CRLF, blank lines.
 */
export function parseM3U(text: string): M3UEntry[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const out: M3UEntry[] = [];

  let pending: Omit<M3UEntry, 'url'> | null = null;
  let extGroup: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      pending = parseExtInf(line);
      extGroup = null;
      continue;
    }
    if (line.startsWith('#EXTGRP:')) {
      extGroup = line.slice(8).trim();
      continue;
    }
    if (line.startsWith('#')) continue; // #EXTM3U, #EXTVLCOPT, etc.

    // URL line
    const entry: M3UEntry = pending
      ? { ...pending, url: line }
      : { name: line, url: line, attrs: {}, duration: -1 };
    if (extGroup && !entry.attrs['group-title']) entry.attrs['group-title'] = extGroup;
    out.push(entry);
    pending = null;
    extGroup = null;
  }
  return out;
}

/**
 * Returns the `url-tvg` or `x-tvg-url` attribute from the M3U's #EXTM3U header line, if present —
 * some providers embed the EPG (XMLTV) URL in the playlist this way.
 */
export function extractTvgUrl(text: string): string | undefined {
  const headerLine = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim().startsWith('#EXTM3U'));
  if (!headerLine) return undefined;
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(headerLine))) {
    const key = m[1].toLowerCase();
    if (key === 'url-tvg' || key === 'x-tvg-url') return m[2].trim();
  }
  return undefined;
}

function parseExtInf(line: string): Omit<M3UEntry, 'url'> {
  // #EXTINF:-1 tvg-id="x" group-title="News",Channel Name
  const body = line.slice(line.indexOf(':') + 1);
  // The name comes after the first comma outside of quotes.
  let inQuote = false;
  let commaAt = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ',' && !inQuote) {
      commaAt = i;
      break;
    }
  }
  const head = commaAt >= 0 ? body.slice(0, commaAt) : body;
  const name = commaAt >= 0 ? body.slice(commaAt + 1).trim() : '';

  const attrs: Record<string, string> = {};
  // matchAll doesn't exist on old TV browsers (Tizen 4/5); we use an exec loop instead.
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(head))) attrs[m[1].toLowerCase()] = m[2].trim();

  const duration = parseFloat(head);
  return {
    name: name || attrs['tvg-name'] || 'Adsız',
    attrs,
    duration: Number.isFinite(duration) ? duration : -1,
  };
}
