import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTvgUrl, parseM3U } from '../src/m3u.ts';

const SAMPLE = `﻿#EXTM3U
#EXTINF:-1 tvg-id="haber1" tvg-logo="http://x/logo.png" group-title="Haber",Haber Kanalı
http://example.com/live/haber1.m3u8
#EXTINF:-1,Spor Kanalı
#EXTGRP:Spor
http://example.com/live/spor
#EXTINF:-1 group-title="Filmler",Örnek Film
http://example.com/movie/film1.mkv
#EXTINF:-1 group-title="Diziler",Örnek Dizi S01E02
http://example.com/series/dizi/1/2.mp4
`.replace(/\n/g, '\r\n');

test("BOM, CRLF and basic attributes are parsed correctly", () => {
  const entries = parseM3U(SAMPLE);
  assert.equal(entries.length, 4);
  assert.equal(entries[0].name, 'Haber Kanalı');
  assert.equal(entries[0].attrs['tvg-id'], 'haber1');
  assert.equal(entries[0].attrs['group-title'], 'Haber');
  assert.equal(entries[0].url, 'http://example.com/live/haber1.m3u8');
});

test('#EXTGRP applies to an entry without group-title', () => {
  const entries = parseM3U(SAMPLE);
  assert.equal(entries[1].name, 'Spor Kanalı');
  assert.equal(entries[1].attrs['group-title'], 'Spor');
});

test("blank lines and unknown directives starting with # are skipped", () => {
  const text = '#EXTM3U\n#EXTVLCOPT:x\n\n#EXTINF:-1,Tek\nhttp://x/y\n';
  const entries = parseM3U(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'Tek');
});

test('extractTvgUrl: returns the url-tvg attribute if present', () => {
  const text = '#EXTM3U url-tvg="http://x/epg.xml.gz"\n#EXTINF:-1,Tek\nhttp://x/y\n';
  assert.equal(extractTvgUrl(text), 'http://x/epg.xml.gz');
});

test('extractTvgUrl: the x-tvg-url attribute is supported too', () => {
  const text = '#EXTM3U x-tvg-url="http://x/epg2.xml"\n#EXTINF:-1,Tek\nhttp://x/y\n';
  assert.equal(extractTvgUrl(text), 'http://x/epg2.xml');
});

test('extractTvgUrl: returns undefined if there is none', () => {
  assert.equal(extractTvgUrl(SAMPLE), undefined);
});
