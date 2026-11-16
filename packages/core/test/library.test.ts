import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLibrary, genresOf } from '../src/library.ts';
import { parseM3U } from '../src/m3u.ts';

const SAMPLE = `#EXTM3U
#EXTINF:-1 tvg-id="h1" group-title="Haber",Haber Kanalı
http://example.test/live/h1.m3u8
#EXTINF:-1 group-title="Filmler",Örnek Film
http://example.test/movie/film1.mkv
#EXTINF:-1 group-title="Diziler",Örnek Dizi S01E01
http://example.test/series/dizi/1/1.mp4
#EXTINF:-1 group-title="Diziler",Örnek Dizi S01E02
http://example.test/series/dizi/1/2.mp4
#EXTINF:-1 group-title="Diziler",Örnek Dizi S02E01
http://example.test/series/dizi/2/1.mp4
`;

test('live/movie/series counts are computed correctly', () => {
  const lib = buildLibrary(parseM3U(SAMPLE));
  assert.equal(lib.counts.live, 1);
  assert.equal(lib.counts.movies, 1);
  assert.equal(lib.counts.episodes, 3);
});

test('series are grouped in the order category -> series -> season -> episode', () => {
  const lib = buildLibrary(parseM3U(SAMPLE));
  const cat = lib.series.find((c) => c.name === 'Diziler')!;
  const show = cat.items.find((s) => s.title === 'Örnek Dizi')!;
  assert.equal(show.seasons.length, 2);
  assert.equal(show.seasons[0].number, 1);
  assert.equal(show.seasons[0].episodes.length, 2);
  assert.equal(show.seasons[1].number, 2);
});

test('a semicolon-separated group-title adds the channel to each category separately', () => {
  const multi =
    '#EXTM3U\n#EXTINF:-1 group-title="Entertainment;Family;General",Çoklu Kategori Kanalı\nhttp://example.test/live/multi.m3u8\n';
  const lib = buildLibrary(parseM3U(multi));
  const names = lib.live.map((c) => c.name);
  assert.deepEqual(names, ['Entertainment', 'Family', 'General']);
  for (const cat of lib.live) {
    assert.equal(cat.items.length, 1);
    assert.equal(cat.items[0].name, 'Çoklu Kategori Kanalı');
  }
});

test('if the same identifier (name+group+tvg-id) repeats, a -1, -2 suffix is added', () => {
  const dup = '#EXTM3U\n#EXTINF:-1 group-title="Haber",Aynı Kanal\nhttp://example.test/live/a.m3u8\n#EXTINF:-1 group-title="Haber",Aynı Kanal\nhttp://example.test/live/b.m3u8\n';
  const lib = buildLibrary(parseM3U(dup));
  const items = lib.live.find((c) => c.name === 'Haber')!.items;
  assert.notEqual(items[0].id, items[1].id);
  assert.ok(items[1].id.endsWith('-1'));
});

test('the same series in several genres (group-title "A;B") has a single identifier and the genres go to separate categories', () => {
  const entries = [
    { name: 'Cosmo Kids S01E01', url: 'http://example.test/series/u/p/1.mkv', attrs: { 'group-title': 'Animation;Kids' }, duration: -1 },
    { name: 'Cosmo Kids S01E02', url: 'http://example.test/series/u/p/2.mkv', attrs: { 'group-title': 'Animation;Kids' }, duration: -1 },
  ];
  const lib = buildLibrary(entries);
  assert.deepEqual(lib.series.map((c) => c.name), ['Animation', 'Kids']);
  assert.equal(lib.series[0].items[0].id, lib.series[1].items[0].id);
  assert.deepEqual(genresOf('Animation;Kids;Sci-Fi'), ['Animation', 'Kids', 'Sci-Fi']);
});
