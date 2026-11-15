import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeCuesToSubtitleEvent } from '../src/engines/subtitleCues.ts';

test('no active cues: empty text, 0 ms (clears the caption)', () => {
  assert.deepEqual(activeCuesToSubtitleEvent(null), { text: '', durationMs: 0 });
  assert.deepEqual(activeCuesToSubtitleEvent([]), { text: '', durationMs: 0 });
});

test('a single cue: its text and (endTime - startTime) in ms', () => {
  const r = activeCuesToSubtitleEvent([{ text: 'Merhaba', startTime: 10, endTime: 12.5 }]);
  assert.deepEqual(r, { text: 'Merhaba', durationMs: 2500 });
});

test('a very short cue is floored to 500 ms so it is not invisible', () => {
  const r = activeCuesToSubtitleEvent([{ text: 'Hop', startTime: 1, endTime: 1.1 }]);
  assert.equal(r.durationMs, 500);
});

test('overlapping cues are joined with a newline; duration is the longest of them', () => {
  const r = activeCuesToSubtitleEvent([
    { text: 'Satır 1', startTime: 0, endTime: 2 },
    { text: 'Satır 2', startTime: 0, endTime: 3 },
  ]);
  assert.equal(r.text, 'Satır 1\nSatır 2');
  assert.equal(r.durationMs, 3000);
});
