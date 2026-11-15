import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduceUpdate } from '../updateState.mjs';

const start = (policy = 'auto') => initialState({ currentVersion: '0.0.1', policy });
const run = (state, ...events) => events.reduce(reduceUpdate, state);

test('unpackaged runs stay disabled whatever happens', () => {
  const s = start('disabled');
  assert.equal(s.status, 'disabled');
  assert.equal(run(s, { type: 'checking' }, { type: 'available', version: '0.0.2' }).status, 'disabled');
});

test('check → no update', () => {
  assert.equal(run(start(), { type: 'checking' }).status, 'checking');
  assert.equal(run(start(), { type: 'checking' }, { type: 'not-available' }).status, 'up-to-date');
});

test('check → available → download → progress → ready keeps the version and clamps the percent', () => {
  let s = run(start(), { type: 'checking' }, { type: 'available', version: '0.0.2' });
  assert.deepEqual([s.status, s.version], ['available', '0.0.2']);
  s = run(s, { type: 'download-started' }, { type: 'progress', percent: 41.6 });
  assert.deepEqual([s.status, s.percent, s.version], ['downloading', 42, '0.0.2']);
  assert.equal(run(s, { type: 'progress', percent: 250 }).percent, 100);
  s = run(s, { type: 'downloaded', version: '0.0.2' });
  assert.deepEqual([s.status, s.version], ['ready', '0.0.2']);
});

test('download cannot start unless a version is available', () => {
  assert.equal(run(start(), { type: 'download-started' }).status, 'idle');
});

test('a background check does not disturb a download or a ready update', () => {
  const downloading = run(start(), { type: 'checking' }, { type: 'available', version: '0.0.2' }, { type: 'download-started' });
  assert.equal(run(downloading, { type: 'checking' }).status, 'downloading');
  const ready = run(downloading, { type: 'downloaded', version: '0.0.2' });
  assert.equal(run(ready, { type: 'checking' }, { type: 'available', version: '0.0.3' }).status, 'ready');
});

test('a silent (background) check failure returns to idle; a user-requested one shows the error', () => {
  assert.equal(run(start(), { type: 'checking' }, { type: 'error', message: 'offline', silent: true }).status, 'idle');
  const e = run(start(), { type: 'checking' }, { type: 'error', message: 'offline', silent: false });
  assert.deepEqual([e.status, e.message], ['error', 'offline']);
});

test('a download failure is always shown, even when the check was a background one', () => {
  const s = run(start(), { type: 'checking' }, { type: 'available', version: '0.0.2' }, { type: 'download-started' }, { type: 'error', message: 'boom', silent: true });
  assert.equal(s.status, 'error');
});
