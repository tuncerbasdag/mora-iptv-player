import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveContinueTarget } from '../src/screens/detail/continueTarget.ts';
import { episodeNumber, episodeTitle } from '../src/screens/detail/episodeInfo.ts';
import { UrlFailureCache } from '../src/imageFailures.ts';
import type { MediaItem, Show } from '../../core/src/types.ts';
import type { WatchProgress } from '../../core/src/storage.ts';

const ep = (id: string, name: string, s = 0, e = 0, show = 'Dizi'): MediaItem => ({
  id,
  name,
  group: 'G',
  kind: 'series',
  url: `http://x/${id}`,
  ...(e > 0 ? { episode: { show, season: s, episode: e } } : {}),
});
const show: Show = {
  id: 'x',
  title: 'Dizi',
  seasons: [
    { number: 1, episodes: [ep('a1', 'Dizi S01E01 Pilot', 1, 1), ep('a2', 'Dizi S01E02 İkinci', 1, 2)] },
    { number: 2, episodes: [ep('b1', 'Dizi S02E01 Dönüş', 2, 1)] },
  ],
};
const prog = (id: string, seconds: number, duration = 100, at = 1): WatchProgress => ({ id, seconds, duration, at });

test('continue target: first episode "Oynat" if nothing was watched', () => {
  assert.deepEqual(resolveContinueTarget(show, []), { s: 0, i: 0, resume: false });
  assert.deepEqual(resolveContinueTarget(show, [prog('baska', 50)]), { s: 0, i: 0, resume: false }); // record belongs to a different series
});

test('continue target: a half-watched episode "Devam et"; an episode finished at ≥95% goes to the next, the end of a season to the next season, the end of the series stays on the same episode', () => {
  assert.deepEqual(resolveContinueTarget(show, [prog('a2', 40)]), { s: 0, i: 1, resume: true });
  assert.deepEqual(resolveContinueTarget(show, [prog('a1', 95)]), { s: 0, i: 1, resume: false });
  assert.deepEqual(resolveContinueTarget(show, [prog('a2', 99)]), { s: 1, i: 0, resume: false });
  assert.deepEqual(resolveContinueTarget(show, [prog('b1', 100)]), { s: 1, i: 0, resume: false });
});

test('continue target: the newest (first in the list) record belonging to this series is used', () => {
  assert.deepEqual(resolveContinueTarget(show, [prog('baska', 1, 100, 9), prog('a1', 10, 100, 8), prog('b1', 10, 100, 1)]), { s: 0, i: 0, resume: true });
});

test('episode name: the series name and the SxxExx pattern are dropped; "Bölüm N" if no name remains; the real name for an unnumbered episode', () => {
  assert.equal(episodeTitle(ep('1', 'Dizi S01E04 Dönüş Yolu', 1, 4), 3), 'Dönüş Yolu');
  assert.equal(episodeTitle(ep('1', 'Dizi - S02E10', 2, 10), 9), 'Bölüm 10');
  assert.equal(episodeTitle(ep('1', 'Kayıt 7'), 6), 'Kayıt 7');
  assert.equal(episodeNumber(ep('1', 'x', 1, 4), 0), 4);
  assert.equal(episodeNumber(ep('1', 'x'), 6), 7);
});

test('UrlFailureCache: an added address is remembered; instances are isolated from each other', () => {
  const a = new UrlFailureCache();
  const b = new UrlFailureCache();
  assert.equal(a.has('http://x/1.png'), false);
  a.add('http://x/1.png');
  assert.equal(a.has('http://x/1.png'), true);
  assert.equal(b.has('http://x/1.png'), false);
});
