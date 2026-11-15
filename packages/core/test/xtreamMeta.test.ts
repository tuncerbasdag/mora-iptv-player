import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLibrary, parseAdded } from '../src/library.ts';
import { parseM3U } from '../src/m3u.ts';
import { applyXtreamAdded, parseXtreamSeriesAdded, parseXtreamVodAdded, xtreamMovieId } from '../src/xtreamMeta.ts';
import { xtreamApiUrl } from '../src/xtream.ts';

test('buildLibrary: the #EXTINF duration (>0) is applied to movies and series episodes, stays undefined for -1 and live', () => {
  const lib = buildLibrary(
    parseM3U(`#EXTM3U
#EXTINF:6240 group-title="Film",Film A (2020)
http://h/movie/u/p/1.mp4
#EXTINF:-1 group-title="Film",Film B (2021)
http://h/movie/u/p/2.mp4
#EXTINF:3600 group-title="Haber",Haber
http://h/live/u/p/3.m3u8
`),
  );
  assert.equal(lib.movies[0].items[0].durationSec, 6240);
  assert.equal(lib.movies[0].items[1].durationSec, undefined);
  assert.equal(lib.live[0].items[0].durationSec, undefined);
});

test('parseAdded: seconds, milliseconds and date text are accepted; invalid/out-of-range values are ignored', () => {
  assert.equal(parseAdded({ added: '1700000000' }), 1_700_000_000_000);
  assert.equal(parseAdded({ 'tvg-added': '1700000000000' }), 1_700_000_000_000);
  assert.equal(parseAdded({ added: '2024-03-01T10:00:00Z' }), Date.parse('2024-03-01T10:00:00Z'));
  assert.equal(parseAdded({ added: '12' }), undefined);
  assert.equal(parseAdded({ added: 'dün' }), undefined);
  assert.equal(parseAdded({}), undefined);
});

test('buildLibrary: the M3U added attribute is applied to the movie; a series\' time is its newest episode\'s', () => {
  const lib = buildLibrary(
    parseM3U(`#EXTM3U
#EXTINF:-1 added="1700000000" group-title="Dizi",Dizi X S01E01
http://h/series/u/p/1.mp4
#EXTINF:-1 added="1710000000" group-title="Dizi",Dizi X S01E02
http://h/series/u/p/2.mp4
#EXTINF:-1 group-title="Film",Film A (2020)
http://h/movie/u/p/3.mp4
`),
  );
  assert.equal(lib.series[0].items[0].addedAt, 1_710_000_000_000);
  assert.equal(lib.movies[0].items[0].addedAt, undefined);
});

test('xtream: added times are extracted from API responses; a corrupt response gives an empty map', () => {
  const vod = parseXtreamVodAdded([{ stream_id: 11, added: '1700000000' }, { stream_id: 12, added: '' }, { stream_id: 13 }]);
  assert.deepEqual([...vod], [['11', 1_700_000_000_000]]);
  const series = parseXtreamSeriesAdded([{ name: 'Dizi X ', last_modified: '1710000000' }]);
  assert.equal(series.get('dizi x'), 1_710_000_000_000);
  assert.equal(parseXtreamVodAdded({ user_info: {} }).size, 0);
  assert.equal(parseXtreamSeriesAdded(null).size, 0);
});

test('xtreamMovieId and applyXtreamAdded: movies match by stream number, series by name; unmatched ones are left alone', () => {
  assert.equal(xtreamMovieId('http://s:8080/movie/user/pass/123.mkv'), '123');
  assert.equal(xtreamMovieId('http://s/live/user/pass/123.ts'), null);
  const lib = buildLibrary(
    parseM3U(`#EXTM3U
#EXTINF:-1 group-title="Film",Film A (2020)
http://s/movie/u/p/11.mp4
#EXTINF:-1 group-title="Film",Film B (2021)
http://s/movie/u/p/99.mp4
#EXTINF:-1 group-title="Dizi",Dizi X S01E01
http://s/series/u/p/5.mp4
`),
  );
  applyXtreamAdded(lib, new Map([['11', 1_700_000_000_000]]), new Map([['dizi x', 1_710_000_000_000]]));
  assert.equal(lib.movies[0].items[0].addedAt, 1_700_000_000_000);
  assert.equal(lib.movies[0].items[1].addedAt, undefined);
  assert.equal(lib.series[0].items[0].addedAt, 1_710_000_000_000);
});

test('xtreamApiUrl: http:// is added to a server without a protocol and the action is written to the query', () => {
  assert.equal(xtreamApiUrl({ server: 'host:8080/', username: 'u', password: 'p' }, 'get_vod_streams'), 'http://host:8080/player_api.php?username=u&password=p&action=get_vod_streams');
});
