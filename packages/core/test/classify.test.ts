import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseEpisode } from '../src/classify.ts';
import type { M3UEntry } from '../src/types.ts';

function entry(name: string, url: string, group = ''): M3UEntry {
  return { name, url, attrs: group ? { 'group-title': group } : {}, duration: -1 };
}

test('an Xtream /series/ path is classified as series', () => {
  const r = classify(entry('Dizi Bölüm', 'http://x/series/1/2/3.mp4'));
  assert.equal(r.kind, 'series');
});

test('an Xtream /movie/ path is classified as a movie', () => {
  const r = classify(entry('Film', 'http://x/movie/1/2.mp4'));
  assert.equal(r.kind, 'movie');
});

test('a .m3u8 extension is classified as live', () => {
  const r = classify(entry('Kanal', 'http://x/stream.m3u8'));
  assert.equal(r.kind, 'live');
});

test('the S01E05 pattern produces correct episode info', () => {
  const ep = parseEpisode('Dizi Adı S01E05');
  assert.deepEqual(ep, { show: 'Dizi Adı', season: 1, episode: 5 });
});

test('the "2. Sezon 10. Bölüm" pattern is parsed correctly', () => {
  const ep = parseEpisode('Dizi Adı 2. Sezon 10. Bölüm');
  assert.deepEqual(ep, { show: 'Dizi Adı', season: 2, episode: 10 });
});

test('a fallback episode is produced if group-title contains the word series and the name does not match the pattern', () => {
  const r = classify(entry('Rastgele Bölüm Adı', 'http://x/video.mp4', 'Diziler'));
  assert.equal(r.kind, 'series');
  assert.ok(r.episode);
  assert.equal(r.episode!.season, 1);
});

test('series: if the name does not match the pattern and group-title is a genre list (;), the entry name is used as the series name', () => {
  const r = classify({
    name: 'Plats brut',
    url: 'http://x.test/series/u/p/1.mkv',
    attrs: { 'group-title': 'Classic;Comedy;Public Service' },
    duration: -1,
  });
  assert.equal(r.kind, 'series');
  assert.equal(r.episode?.show, 'Plats brut');
});

test('series: if the name does not match the pattern and group-title is a plain name (not a genre list), that stays the series name', () => {
  const r = classify({ name: 'Bölüm', url: 'http://x.test/series/u/p/2.mkv', attrs: { 'group-title': 'Sessiz Liman' }, duration: -1 });
  assert.equal(r.episode?.show, 'Sessiz Liman');
});
