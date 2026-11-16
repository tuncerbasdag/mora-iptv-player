import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EpisodeNavigator } from '../src/app/episodeNavigation.ts';
import type { MediaItem, Show } from '../../core/src/types.ts';

const ep = (s: number, e: number): MediaItem => ({ id: `s${s}e${e}`, name: `S${s}E${e}`, group: 'D', kind: 'series', url: `http://example.test/${s}${e}` });
const show: Show = {
  id: 'x',
  title: 'X',
  seasons: [
    { number: 1, episodes: [ep(1, 1), ep(1, 2)] },
    { number: 2, episodes: [] },
    { number: 3, episodes: [ep(3, 1)] },
  ],
};
const nav = new EpisodeNavigator(show);

test('next: in the same season; at the end of a season the first episode of the next NON-EMPTY season, null if there is none (an empty season is not skipped)', () => {
  assert.equal(nav.next({ seasonIndex: 0, episodeIndex: 0 })?.episode.id, 's1e2');
  assert.equal(nav.next({ seasonIndex: 0, episodeIndex: 1 }), null); // next season is empty
  assert.equal(nav.next({ seasonIndex: 2, episodeIndex: 0 }), null);
});

test('previous: in the same season; at the start of a season the LAST episode of the previous season; null on the first episode', () => {
  assert.equal(nav.previous({ seasonIndex: 0, episodeIndex: 1 })?.episode.id, 's1e1');
  assert.equal(nav.previous({ seasonIndex: 0, episodeIndex: 0 }), null);
  const two = new EpisodeNavigator({ id: 'y', title: 'Y', seasons: [{ number: 1, episodes: [ep(1, 1), ep(1, 2)] }, { number: 2, episodes: [ep(2, 1)] }] });
  const prev = two.previous({ seasonIndex: 1, episodeIndex: 0 });
  assert.equal(prev?.episode.id, 's1e2');
  assert.deepEqual(prev?.pos, { seasonIndex: 0, episodeIndex: 1 });
  assert.deepEqual(two.next({ seasonIndex: 0, episodeIndex: 1 })?.pos, { seasonIndex: 1, episodeIndex: 0 });
});
