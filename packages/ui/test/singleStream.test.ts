import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SingleStreamGate, StreamBlockedError } from '../src/singleStream.ts';
import { MockPlayerAdapter } from './mockPlayerAdapter.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wraps the mock to track how many streams are "open" at any given moment. */
function tracked(open: { n: number; max: number }) {
  const a = new MockPlayerAdapter();
  const loadLive = a.loadLive.bind(a);
  const stop = a.stop.bind(a);
  let live = false;
  a.loadLive = async (url: string) => {
    if (!live) open.n++;
    live = true;
    open.max = Math.max(open.max, open.n);
    await loadLive(url);
  };
  a.stop = () => {
    if (live) open.n--;
    live = false;
    stop();
  };
  return a;
}

test('when the channel changes the new stream does not open before the old one closes (at most 1 at a time)', async () => {
  const open = { n: 0, max: 0 };
  const gate = new SingleStreamGate({ cooldownMs: 20 });
  const a = gate.wrap(tracked(open));
  await a.loadLive('http://p/1');
  await a.loadLive('http://p/2');
  await a.loadLive('http://p/3');
  assert.equal(open.max, 1);
});

test('two different players: the first is stopped while the second opens', async () => {
  const open = { n: 0, max: 0 };
  const gate = new SingleStreamGate({ cooldownMs: 20 });
  const a = gate.wrap(tracked(open));
  const b = gate.wrap(tracked(open));
  await a.loadLive('http://p/1');
  await b.loadLive('http://p/2');
  assert.equal(open.max, 1);
  assert.equal(open.n, 1);
});

test('wait after closing: the next stream does not open before the cooldown elapses', async () => {
  const gate = new SingleStreamGate({ cooldownMs: 80 });
  const inner = new MockPlayerAdapter();
  const a = gate.wrap(inner);
  await a.loadLive('http://p/1');
  const t0 = Date.now();
  await a.loadLive('http://p/2');
  assert.ok(Date.now() - t0 >= 70, `bekleme ${Date.now() - t0}ms`);
  assert.equal(inner.calls.loadLive.length, 2);
});

test('with consecutive requests only the last one opens; the older pending request is cancelled', async () => {
  const gate = new SingleStreamGate({ cooldownMs: 60 });
  const inner = new MockPlayerAdapter();
  const a = gate.wrap(inner);
  await a.loadLive('http://p/0');
  void a.loadLive('http://p/1'); // while waiting on the cooldown
  await a.loadLive('http://p/2');
  await sleep(100);
  assert.deepEqual(inner.calls.loadLive, ['http://p/0', 'http://p/2']);
});

test('stop() while waiting: the pending stream never opens', async () => {
  const gate = new SingleStreamGate({ cooldownMs: 60 });
  const inner = new MockPlayerAdapter();
  const a = gate.wrap(inner);
  await a.loadLive('http://p/0');
  void a.loadLive('http://p/1');
  a.stop();
  await sleep(120);
  assert.deepEqual(inner.calls.loadLive, ['http://p/0']);
});

test('account check on a cold start: StreamBlockedError if blocked, the stream does not open', async () => {
  const gate = new SingleStreamGate({ cooldownMs: 0, preflight: async () => 'Hesap başka bir cihazda kullanılıyor' });
  const inner = new MockPlayerAdapter();
  const a = gate.wrap(inner);
  await assert.rejects(a.loadLive('http://p/1'), StreamBlockedError);
  assert.equal(inner.calls.loadLive.length, 0);
});

test('check only on a cold start: not asked again when the channel changes while a stream is running', async () => {
  let asked = 0;
  const gate = new SingleStreamGate({ cooldownMs: 0, preflight: async () => (asked++, null) });
  const a = gate.wrap(new MockPlayerAdapter());
  await a.loadLive('http://p/1');
  await a.loadLive('http://p/2');
  await a.loadLive('http://p/3');
  assert.equal(asked, 1);
});

test('the check is done again after a long time without a stream (cold)', async () => {
  let t = 1000;
  let asked = 0;
  const gate = new SingleStreamGate({ cooldownMs: 0, coldAfterMs: 5000, now: () => t, preflight: async () => (asked++, null) });
  const a = gate.wrap(new MockPlayerAdapter());
  await a.loadLive('http://p/1');
  a.stop();
  t += 2000;
  await a.loadLive('http://p/2');
  assert.equal(asked, 1); // 2s: still warm
  a.stop();
  t += 6000;
  await a.loadLive('http://p/3');
  assert.equal(asked, 2); // 6s: cold
});
