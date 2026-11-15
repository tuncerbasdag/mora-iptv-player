import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenHost } from '../src/app/screenHost.ts';
import { VodRestoreStore } from '../src/app/vodRestoreStore.ts';
import type { PlayerOverlayHandle } from '../src/screens/playerOverlay.ts';

const container = {} as HTMLElement;
const player = (log: string[], name: string): PlayerOverlayHandle => ({ controller: {} as never, destroy: () => void log.push(`destroy:${name}`) });

test('replaceScreen: the old one is closed BEFORE the new one is built (player hand-over order)', () => {
  const log: string[] = [];
  const host = new ScreenHost(container);
  host.replaceScreen(() => (log.push('create:a'), { destroy: () => void log.push('destroy:a') }));
  host.replaceScreen(() => (log.push('create:b'), { destroy: () => void log.push('destroy:b') }));
  assert.deepEqual(log, ['create:a', 'destroy:a', 'create:b']);
  host.clearScreen();
  host.clearScreen(); // harmless the second time
  assert.deepEqual(log, ['create:a', 'destroy:a', 'create:b', 'destroy:b']);
});

test('player: clearPlayer closes; releasePlayer releases without closing; destroy closes the player first then the screen', () => {
  const log: string[] = [];
  const host = new ScreenHost(container);
  const p1 = player(log, 'p1');
  host.setPlayer(p1);
  assert.equal(host.getPlayer(), p1);
  assert.equal(host.releasePlayer(), p1);
  assert.equal(host.getPlayer(), null);
  assert.equal(log.length, 0); // handed off: not closed
  host.setPlayer(player(log, 'p2'));
  host.clearPlayer();
  host.setPlayer(player(log, 'p3'));
  host.replaceScreen(() => ({ destroy: () => void log.push('destroy:screen') }));
  host.destroy();
  assert.deepEqual(log, ['destroy:p2', 'destroy:p3', 'destroy:screen']);
});

test('VodRestoreStore: stores per key; clear(key) deletes one, clear() deletes both', () => {
  const s = new VodRestoreStore();
  const st = { view: 'all', query: '', sort: 'list' as const, entryId: 'x', from: 'grid' as const };
  s.set('movies', st);
  s.set('series', { ...st, entryId: 'y' });
  assert.equal(s.get('movies')?.entryId, 'x');
  s.clear('movies');
  assert.equal(s.get('movies'), undefined);
  assert.equal(s.get('series')?.entryId, 'y');
  s.clear();
  assert.equal(s.get('series'), undefined);
});
