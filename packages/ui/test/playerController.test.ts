import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerController, type PlayerControllerState } from '../src/playerController.ts';
import { MockPlayerAdapter } from './mockPlayerAdapter.ts';
import { DEFAULT_SETTINGS, type Library, type Settings } from '../../core/src/types.ts';
import type { StorageAdapter } from '../../core/src/storage.ts';

function makeStorage(): StorageAdapter & { resumes: Map<string, number> } {
  const resumes = new Map<string, number>();
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let library: Library | null = null;
  let lastLive: string | null = null;
  return {
    resumes,
    getSettings: () => settings,
    setSettings: (s) => {
      settings = s;
    },
    loadLibrary: async () => library,
    saveLibrary: async (_id, lib) => {
      library = lib;
    },
    deleteLibrary: async () => {
      library = null;
    },
    getResume: (id) => resumes.get(id) ?? 0,
    setResume: (id, seconds) => {
      if (seconds <= 0) resumes.delete(id);
      else resumes.set(id, seconds);
    },
    getLastLive: () => lastLive,
    getProgress: (id) => (resumes.has(id) ? { id, seconds: resumes.get(id)!, duration: 0, at: 0 } : null),
    getRecents: () => [],
    setLastLive: (id) => {
      lastLive = id;
    },
    getFavorites: () => [],
    isFavorite: () => false,
    setFavorite: () => {},
  };
}

function liveItem(id = 'live1') {
  return { id, name: 'Kanal', url: 'http://example.test/live.m3u8', group: 'Haber', kind: 'live' as const };
}
function vodItem(id = 'vod1') {
  return { id, name: 'Film', url: 'http://example.test/film.mp4', group: 'Filmler', kind: 'movie' as const };
}

test('playLive(): adapter.loadLive is called, the resume live id is saved', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  const ctrl = new PlayerController(adapter, storage);
  await ctrl.playLive(liveItem());
  assert.deepEqual(adapter.calls.loadLive, ['http://example.test/live.m3u8']);
  assert.equal(storage.getLastLive(), 'live1');
  ctrl.stop();
});

test('playVod(): adapter.loadVod is called with the saved resume seconds', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  storage.setResume('vod1', 42);
  const ctrl = new PlayerController(adapter, storage);
  await ctrl.playVod(vodItem());
  assert.deepEqual(adapter.calls.loadVod, [{ url: 'http://example.test/film.mp4', resumeSeconds: 42 }]);
});

test('vod timeupdate: seconds are saved as the resume position', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  const ctrl = new PlayerController(adapter, storage);
  await ctrl.playVod(vodItem());
  adapter.setCurrentTime(77);
  adapter.emit('timeupdate');
  assert.equal(storage.getResume('vod1'), 77);
});

test('error on live: the state becomes reconnecting, with reconnect the adapter calls loadLive again', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  const ctrl = new PlayerController(adapter, storage);
  const states: PlayerControllerState[] = [];
  ctrl.on((s) => states.push(s));
  await ctrl.playLive(liveItem());
  adapter.emit('error');
  await new Promise((r) => setTimeout(r, 1500)); // first backoff step (1000ms, jitter ±30% -> up to 1300ms) + margin
  assert.ok(states.some((s) => s.status === 'reconnecting'));
  assert.equal(adapter.calls.loadLive.length, 2);
  ctrl.stop();
});

test('stop(): adapter.stop() is called and the state becomes idle', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  const ctrl = new PlayerController(adapter, storage);
  await ctrl.playLive(liveItem());
  ctrl.stop();
  assert.equal(adapter.calls.stop, 1);
  assert.equal(ctrl.getState().status, 'idle');
});

test('seekBy(): while playing VOD adapter.seek is called relative to the current time', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  const ctrl = new PlayerController(adapter, storage);
  await ctrl.playVod(vodItem());
  adapter.emit('playing');
  adapter.setCurrentTime(100);
  assert.equal(ctrl.seekBy(10), true);
  assert.deepEqual(adapter.calls.seek, [110]);
});

test('seekBy(): no seeking if the video has not loaded yet or there is an error (position unchanged)', async () => {
  const adapter = new MockPlayerAdapter();
  const ctrl = new PlayerController(adapter, makeStorage());
  ctrl.vodRetryBaseMs = 1000;
  await ctrl.playVod(vodItem()); // status 'loading': not playing yet
  adapter.setCurrentTime(50);
  assert.equal(ctrl.seekBy(10), false);
  assert.deepEqual(adapter.calls.seek, []);
  adapter.emit('error'); // waiting on a retry (loading)
  assert.equal(ctrl.seekBy(-10), false);
  assert.deepEqual(adapter.calls.seek, []);
  ctrl.stop();
});

test('seekBy(): seeking is ignored on live (adapter.seek is not called)', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  const ctrl = new PlayerController(adapter, storage);
  await ctrl.playLive(liveItem());
  ctrl.seekBy(10);
  assert.deepEqual(adapter.calls.seek, []);
  ctrl.stop();
});

test('vod ended: the resume position is cleared and the state becomes ended', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  storage.setResume('vod1', 50);
  const ctrl = new PlayerController(adapter, storage);
  await ctrl.playVod(vodItem());
  adapter.emit('ended');
  assert.equal(storage.getResume('vod1'), 0);
  assert.equal(ctrl.getState().status, 'ended');
});

test('togglePause(): pause/play updates the adapter and the state', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  const ctrl = new PlayerController(adapter, storage);
  await ctrl.playVod(vodItem());
  ctrl.togglePause();
  assert.equal(adapter.isPaused(), false);
  assert.equal(ctrl.getState().status, 'playing');
  ctrl.togglePause();
  assert.equal(adapter.isPaused(), true);
  assert.equal(ctrl.getState().status, 'paused');
});

test('buffering: if the buffer runs out while playing, after a short delay status becomes buffering, the percentage updates, playing once it resumes', async () => {
  const adapter = new MockPlayerAdapter();
  const ctrl = new PlayerController(adapter, makeStorage());
  await ctrl.playLive(liveItem());
  adapter.emit('playing');
  adapter.emit('buffering');
  assert.equal(ctrl.getState().status, 'playing'); // too short a stall: not shown yet
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(ctrl.getState().status, 'buffering');
  adapter.emit('bufferprogress', 40);
  assert.equal(ctrl.getState().bufferPercent, 40);
  adapter.emit('playing');
  assert.equal(ctrl.getState().status, 'playing');
  ctrl.stop();
});

test('buffering: a short stall (resumes before the delay) never enters the buffering state', async () => {
  const adapter = new MockPlayerAdapter();
  const ctrl = new PlayerController(adapter, makeStorage());
  const states: string[] = [];
  ctrl.on((s) => states.push(s.status));
  await ctrl.playLive(liveItem());
  adapter.emit('playing');
  adapter.emit('buffering');
  adapter.emit('playing');
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(!states.includes('buffering'));
  ctrl.stop();
});

test('buffering: a buffer event during the initial load does not break the loading status', async () => {
  const adapter = new MockPlayerAdapter();
  const ctrl = new PlayerController(adapter, makeStorage());
  await ctrl.playLive(liveItem());
  adapter.emit('buffering'); // no 'playing' event has arrived yet
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(ctrl.getState().status, 'loading');
  ctrl.stop();
});

test('vod: when playback starts (before 1 s elapses) the content enters "recents"; an existing resume position is not overwritten', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  const ctrl = new PlayerController(adapter, storage);
  await ctrl.playVod(vodItem('yeni'));
  assert.equal(storage.getResume('yeni'), 0);
  adapter.emit('playing');
  assert.ok(storage.getResume('yeni') > 0);
  ctrl.stop();

  storage.setResume('eski', 600);
  const adapter2 = new MockPlayerAdapter();
  const ctrl2 = new PlayerController(adapter2, storage);
  await ctrl2.playVod(vodItem('eski'));
  adapter2.emit('playing');
  assert.equal(storage.getResume('eski'), 600); // not overwritten by the 1s tick
  ctrl2.stop();
});

test('vod error: does not wait silently; shows "reconnecting (2/3)" and retries by itself from where it left off', async () => {
  const adapter = new MockPlayerAdapter();
  const storage = makeStorage();
  storage.setResume('vod1', 120);
  const ctrl = new PlayerController(adapter, storage);
  ctrl.vodRetryBaseMs = 10;
  await ctrl.playVod(vodItem());
  assert.equal(adapter.calls.loadVod.length, 1);
  adapter.emit('error');
  assert.equal(ctrl.getState().status, 'loading');
  assert.match(ctrl.getState().message ?? '', /yeniden deneniyor \(2\/3\)/);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(adapter.calls.loadVod.length, 2);
  assert.equal(adapter.calls.loadVod[1].resumeSeconds, 120); // resume position is preserved
  ctrl.stop();
});

test('vod error: if all attempts fail it gives a clear error; OK (togglePause) retries manually', async () => {
  const adapter = new MockPlayerAdapter();
  const ctrl = new PlayerController(adapter, makeStorage());
  ctrl.vodRetryBaseMs = 5;
  await ctrl.playVod(vodItem());
  for (let i = 0; i < 3; i++) {
    adapter.emit('error');
    await new Promise((r) => setTimeout(r, 40));
  }
  assert.equal(ctrl.getState().status, 'error');
  assert.match(ctrl.getState().message ?? '', /Video oynatılamadı/);
  assert.equal(adapter.calls.loadVod.length, 3); // initial + 2 automatic retries

  ctrl.togglePause();
  assert.equal(ctrl.getState().status, 'loading');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(adapter.calls.loadVod.length, 4);
  ctrl.stop();
});

test('vod error: when it plays successfully the retry counter resets (a later drop starts again with the full allowance)', async () => {
  const adapter = new MockPlayerAdapter();
  const ctrl = new PlayerController(adapter, makeStorage());
  ctrl.vodRetryBaseMs = 5;
  await ctrl.playVod(vodItem());
  adapter.emit('error');
  await new Promise((r) => setTimeout(r, 30));
  adapter.emit('playing');
  adapter.emit('error');
  assert.match(ctrl.getState().message ?? '', /\(2\/3\)/); // counter was reset: back to "2/3"
  ctrl.stop();
});
