import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EpgCoordinator } from '../src/epgCoordinator.ts';
import { getOrCreateDeviceMac } from '../src/remoteSetup.ts';
import type { PlaylistEvent } from '../src/playlistService.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/types.ts';

function setup(settings: Partial<Settings>) {
  const loaded: string[] = [];
  let handler: ((e: PlaylistEvent) => void) | null = null;
  const coordinator = new EpgCoordinator(
    { getSettings: () => ({ ...DEFAULT_SETTINGS, ...settings }) },
    { load: async (url: string) => void loaded.push(url) },
  );
  coordinator.attach({
    on: (fn) => {
      handler = fn;
      return () => {};
    },
  });
  return { loaded, coordinator, detect: (url: string) => handler!({ type: 'epg-url-detected', url }) };
}

test('nothing is loaded if EPG is off', () => {
  const t = setup({ epgEnabled: false, epgUrl: 'http://u' });
  t.coordinator.reload();
  t.detect('http://detected');
  assert.deepEqual(t.loaded, []);
});

test('the user\'s address is preferred over the address declared by the list', () => {
  const t = setup({ epgEnabled: true, epgUrl: 'http://mine' });
  t.detect('http://detected');
  assert.deepEqual(t.loaded, ['http://mine']);
});

test('the list\'s declared address is used if the user has none; nothing is loaded if there is no address at all', () => {
  const t = setup({ epgEnabled: true, epgUrl: '' });
  t.coordinator.reload();
  assert.deepEqual(t.loaded, []);
  t.detect('http://detected');
  assert.deepEqual(t.loaded, ['http://detected']);
});

test('getOrCreateDeviceMac: generates once, then returns the same identifier', () => {
  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  const first = getOrCreateDeviceMac(store);
  assert.match(first, /^02(:[0-9A-F]{2}){5}$/);
  assert.equal(getOrCreateDeviceMac(store), first);
});

const XTREAM_CONNECTION = {
  id: 'x1',
  name: 'Xtream',
  source: { kind: 'xtream' as const, server: 'panel.example:8080', username: 'u', password: 'p' },
  url: 'http://panel.example:8080/get.php?username=u&password=p&type=m3u_plus&output=ts',
  addedAt: 0,
  lastUpdated: null,
  lastHash: null,
  status: 'none' as const,
  counts: null,
};

test('the xmltv.php address is used for an Xtream connection if there is no address', () => {
  const t = setup({ epgEnabled: true, epgUrl: '', connections: [XTREAM_CONNECTION], activeConnectionId: 'x1' });
  t.coordinator.reload();
  assert.deepEqual(t.loaded, ['http://panel.example:8080/xmltv.php?username=u&password=p']);
});

test('the Xtream fallback comes after the user\'s and the list\'s declared addresses', () => {
  const t = setup({ epgEnabled: true, epgUrl: '', connections: [XTREAM_CONNECTION], activeConnectionId: 'x1' });
  t.detect('http://detected');
  assert.deepEqual(t.loaded, ['http://detected']);
});

test('the same address is not downloaded repeatedly; it is retried after a failed load', async () => {
  let calls = 0;
  let fail = true;
  const coordinator = new EpgCoordinator(
    { getSettings: () => ({ ...DEFAULT_SETTINGS, epgEnabled: true, epgUrl: 'http://u' }) },
    {
      load: async () => {
        calls++;
        if (fail) throw new Error('ağ hatası');
      },
    },
  );
  const warn = console.warn;
  console.warn = () => {};
  try {
    coordinator.reload();
    await new Promise((r) => setTimeout(r, 0));
    fail = false;
    coordinator.reload(); // the first attempt failed -> retried
    coordinator.reload(); // the same address is already loading -> skipped
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    console.warn = warn;
  }
  assert.equal(calls, 2);
});
