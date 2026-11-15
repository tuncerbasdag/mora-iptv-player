import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, LEGACY_CONNECTION_ID, migrateSettings } from '../src/connections.ts';
import { PlaylistService, type PlaylistEvent } from '../src/playlistService.ts';
import { DEFAULT_SETTINGS, type Connection, type Library, type Settings } from '../src/types.ts';
import type { StorageAdapter } from '../src/storage.ts';

const SAMPLE_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="haber1" group-title="Haber",Haber Kanalı
http://example.com/live/haber1.m3u8
`;
const OTHER_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="a" group-title="Film",Bir Film (2020)
http://example.com/movie/u/p/1.mp4
#EXTINF:-1 tvg-id="b" group-title="Film",Başka Film (2021)
http://example.com/movie/u/p/2.mp4
`;

function conn(name: string, url: string): Connection {
  return createConnection(name, { kind: 'm3u', url });
}

function makeStorage(initial?: Partial<Settings>): StorageAdapter & { libs: Map<string, Library> } {
  let settings: Settings = { ...DEFAULT_SETTINGS, ...initial };
  const libs = new Map<string, Library>();
  return {
    libs,
    getSettings: () => settings,
    setSettings: (s) => {
      settings = s;
    },
    loadLibrary: async (id) => libs.get(id) ?? null,
    saveLibrary: async (id, lib) => {
      libs.set(id, lib);
    },
    deleteLibrary: async (id) => {
      libs.delete(id);
    },
    getResume: () => 0,
    setResume: () => {},
    getLastLive: () => null,
    getProgress: () => null,
    getRecents: () => [],
    setLastLive: () => {},
    getFavorites: () => [],
    isFavorite: () => false,
    setFavorite: () => {},
  };
}

/** Sets up storage with one active connection. */
function withOne(url = 'http://list.example/x.m3u', extra?: Partial<Settings>) {
  const c = conn('Ana Liste', url);
  return { c, storage: makeStorage({ connections: [c], activeConnectionId: c.id, ...extra }) };
}

const byUrl = (map: Record<string, string>) => async (url: string) => {
  if (!(url in map)) throw new Error('ağ hatası');
  return map[url];
};

test('init(): a background refresh is triggered if there is an active connection and autoRefresh is on', async () => {
  const { storage } = withOne('http://list.example/x.m3u', { autoRefreshOnStart: true });
  const svc = new PlaylistService(storage, async () => SAMPLE_M3U);
  const events: PlaylistEvent[] = [];
  svc.on((e) => events.push(e));
  await svc.init();
  await new Promise((r) => setTimeout(r, 0)); // wait for the background refresh to clear the queue
  assert.equal(events[0].type, 'library-loaded');
  assert.ok(events.some((e) => e.type === 'refresh-success'));
  assert.equal(svc.getLibrary()?.counts.live, 1);
});

test('refresh(): concurrent calls share the same work (a single download)', async () => {
  let fetchCount = 0;
  const { storage } = withOne();
  const svc = new PlaylistService(storage, async () => {
    fetchCount++;
    await new Promise((r) => setTimeout(r, 10));
    return SAMPLE_M3U;
  });
  const p1 = svc.refresh();
  const p2 = svc.refresh();
  assert.equal(p1, p2);
  await p1;
  assert.equal(fetchCount, 1);
});

test('refresh(): if the download fails the old list is kept, refresh-error is emitted, the status becomes "error"', async () => {
  const { storage } = withOne();
  await new PlaylistService(storage, async () => SAMPLE_M3U).refresh();
  const failing = new PlaylistService(storage, async () => {
    throw new Error('ağ hatası');
  });
  const events: PlaylistEvent[] = [];
  failing.on((e) => events.push(e));
  await failing.init();
  const before = failing.getLibrary();
  await failing.refresh();
  assert.ok(before);
  assert.deepEqual(failing.getLibrary(), before);
  assert.ok(events.some((e) => e.type === 'refresh-error'));
  assert.equal(failing.getActiveConnection()?.status, 'error');
});

test('refresh(): if the hash did not change, changed=false and the library is not rebuilt', async () => {
  const { storage } = withOne();
  const svc = new PlaylistService(storage, async () => SAMPLE_M3U);
  await svc.refresh();
  const firstLib = svc.getLibrary();
  const events: PlaylistEvent[] = [];
  svc.on((e) => events.push(e));
  await svc.refresh();
  const success = events.find((e) => e.type === 'refresh-success') as Extract<PlaylistEvent, { type: 'refresh-success' }>;
  assert.equal(success.changed, false);
  assert.equal(svc.getLibrary(), firstLib);
});

test('refresh(): gives refresh-error and does not try to download if there is no active connection', async () => {
  const storage = makeStorage();
  let called = false;
  const svc = new PlaylistService(storage, async () => {
    called = true;
    return SAMPLE_M3U;
  });
  const events: PlaylistEvent[] = [];
  svc.on((e) => events.push(e));
  await svc.refresh();
  assert.equal(called, false);
  assert.ok(events.some((e) => e.type === 'refresh-error'));
});

test('addConnection(): the first connection becomes active automatically, later ones are added inactive', async () => {
  const storage = makeStorage();
  const svc = new PlaylistService(storage, byUrl({ 'http://a/x.m3u': SAMPLE_M3U, 'http://b/y.m3u': OTHER_M3U }));
  const a = svc.addConnection('Ana', { kind: 'm3u', url: 'http://a/x.m3u' });
  const b = svc.addConnection('Yedek', { kind: 'm3u', url: 'http://b/y.m3u' });
  assert.equal(svc.getActiveConnection()?.id, a.id);
  assert.equal(svc.getConnections().length, 2);
  assert.notEqual(svc.getActiveConnection()?.id, b.id);
  await svc.refreshAll();
  assert.equal(svc.getLibrary()?.counts.live, 1); // only the active connection's data
});

test('activate(): only one connection is active and the app shows only its data', async () => {
  const storage = makeStorage();
  const svc = new PlaylistService(storage, byUrl({ 'http://a/x.m3u': SAMPLE_M3U, 'http://b/y.m3u': OTHER_M3U }));
  const a = svc.addConnection('Ana', { kind: 'm3u', url: 'http://a/x.m3u' });
  const b = svc.addConnection('Film', { kind: 'm3u', url: 'http://b/y.m3u' });
  await svc.refreshAll();
  assert.equal(svc.getLibrary()?.counts.live, 1);
  assert.equal(svc.getLibrary()?.counts.movies, 0);

  await svc.activate(b.id);
  assert.equal(svc.getActiveConnection()?.id, b.id);
  assert.equal(svc.getLibrary()?.counts.movies, 2); // instantly from the cache
  assert.equal(svc.getLibrary()?.counts.live, 0);
  assert.equal(svc.getConnections().filter((c) => c.id === storage.getSettings().activeConnectionId).length, 1);

  await svc.activate(a.id);
  assert.equal(svc.getLibrary()?.counts.live, 1);
});

test('refreshAll(): inactive connections\' status and counts are updated too; if one fails the others are unaffected', async () => {
  const storage = makeStorage();
  const svc = new PlaylistService(storage, byUrl({ 'http://a/x.m3u': SAMPLE_M3U, 'http://b/y.m3u': OTHER_M3U }));
  svc.addConnection('Ana', { kind: 'm3u', url: 'http://a/x.m3u' });
  svc.addConnection('Film', { kind: 'm3u', url: 'http://b/y.m3u' });
  svc.addConnection('Bozuk', { kind: 'm3u', url: 'http://yok/z.m3u' });
  await svc.refreshAll();
  const [a, b, bad] = svc.getConnections();
  assert.equal(a.status, 'ok');
  assert.equal(b.status, 'ok');
  assert.equal(b.counts?.movies, 2);
  assert.equal(bad.status, 'error');
});

test('updateConnection(): the cache is discarded if the address changes; kept if only the name changes', async () => {
  const { c, storage } = withOne('http://a/x.m3u');
  const svc = new PlaylistService(storage, byUrl({ 'http://a/x.m3u': SAMPLE_M3U, 'http://b/y.m3u': OTHER_M3U }));
  await svc.refresh();
  assert.ok(storage.libs.has(c.id));

  await svc.updateConnection(c.id, { name: 'Yeni Ad' });
  assert.equal(svc.getActiveConnection()?.name, 'Yeni Ad');
  assert.ok(storage.libs.has(c.id)); // same address: cache stays

  await svc.updateConnection(c.id, { source: { kind: 'm3u', url: 'http://b/y.m3u' } });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(svc.getActiveConnection()?.url, 'http://b/y.m3u');
  assert.equal(svc.getLibrary()?.counts.movies, 2); // re-downloaded from the new address
});

test('removeConnection(): if the active one is deleted the first remaining connection becomes active and its data is shown; if the last connection is deleted none is active; if an inactive one is deleted the active one is unaffected', async () => {
  const storage = makeStorage();
  const svc = new PlaylistService(storage, byUrl({ 'http://a/x.m3u': SAMPLE_M3U, 'http://b/y.m3u': OTHER_M3U }));
  const a = svc.addConnection('Ana', { kind: 'm3u', url: 'http://a/x.m3u' });
  const b = svc.addConnection('Film', { kind: 'm3u', url: 'http://b/y.m3u' });
  await svc.refreshAll();

  await svc.removeConnection(b.id);
  assert.equal(svc.getActiveConnection()?.id, a.id);
  assert.equal(svc.getLibrary()?.counts.live, 1);
  assert.ok(!storage.libs.has(b.id));

  await svc.removeConnection(a.id);
  assert.equal(svc.getActiveConnection(), null);
  assert.equal(svc.getLibrary(), null);
});

test('removeConnection(): when the active connection is deleted and another record exists in the list, that one becomes active', async () => {
  const storage = makeStorage();
  const svc = new PlaylistService(storage, byUrl({ 'http://a/x.m3u': SAMPLE_M3U, 'http://b/y.m3u': OTHER_M3U }));
  const a = svc.addConnection('Ana', { kind: 'm3u', url: 'http://a/x.m3u' });
  const b = svc.addConnection('Film', { kind: 'm3u', url: 'http://b/y.m3u' });
  await svc.refreshAll();
  await svc.removeConnection(a.id);
  assert.equal(svc.getActiveConnection()?.id, b.id);
  assert.equal(storage.getSettings().activeConnectionId, b.id);
  assert.equal(svc.getLibrary()?.counts.movies, 2);
});

test('migrateSettings(): old single-connection settings become a single active connection, old fields are dropped', () => {
  const s = migrateSettings({
    playlistUrl: 'http://old/list.m3u',
    connectionName: 'Evim',
    source: { kind: 'm3u', url: 'http://old/list.m3u' },
    lastHash: 'abc',
    lastUpdated: 123,
    addedAt: 99,
    epgEnabled: true,
  });
  assert.equal(s.connections.length, 1);
  assert.equal(s.connections[0].id, LEGACY_CONNECTION_ID);
  assert.equal(s.connections[0].name, 'Evim');
  assert.equal(s.activeConnectionId, LEGACY_CONNECTION_ID);
  assert.equal(s.epgEnabled, true);
  assert.ok(!('playlistUrl' in s) && !('lastHash' in s));
  // empty old setting: no connection
  const empty = migrateSettings({ playlistUrl: '' });
  assert.deepEqual(empty.connections, []);
  assert.equal(empty.activeConnectionId, null);
  // left untouched if already in the new format
  assert.deepEqual(migrateSettings({ connections: s.connections, activeConnectionId: null }).connections, s.connections);
});

test('refresh(): for an Xtream connection, applies the API\'s added times to the library; the list still loads if the API does not respond', async () => {
  const XTREAM_M3U = `#EXTM3U
#EXTINF:-1 group-title="Film",Film A (2020)
http://s:80/movie/u/p/11.mp4
`;
  const storage = makeStorage();
  const svc = new PlaylistService(storage, async (url) => {
    if (url.includes('action=get_vod_streams')) return JSON.stringify([{ stream_id: 11, added: '1700000000' }]);
    if (url.includes('action=get_series')) throw new Error('yok');
    return XTREAM_M3U;
  });
  svc.addConnection('X', { kind: 'xtream', server: 's:80', username: 'u', password: 'p' });
  await svc.refreshAll();
  assert.equal(svc.getLibrary()?.movies[0].items[0].addedAt, 1_700_000_000_000);

  const broken = new PlaylistService(makeStorage(), async (url) => {
    if (url.includes('player_api.php')) throw new Error('API kapalı');
    return XTREAM_M3U;
  });
  broken.addConnection('X', { kind: 'xtream', server: 's:80', username: 'u', password: 'p' });
  await broken.refreshAll();
  assert.equal(broken.getLibrary()?.counts.movies, 1);
  assert.equal(broken.getLibrary()?.movies[0].items[0].addedAt, undefined);
});
