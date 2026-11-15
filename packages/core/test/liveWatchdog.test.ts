import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveWatchdog } from '../src/liveWatchdog.ts';

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

test('stall is not triggered during heartbeat', async () => {
  let reconnects = 0;
  const w = new LiveWatchdog({
    reconnect: () => reconnects++,
    onGiveUp: () => {},
    stallTimeoutMs: 30,
    checkIntervalMs: 10,
  });
  w.start();
  for (let i = 0; i < 5; i++) {
    await wait(15);
    w.heartbeat();
  }
  w.stop();
  assert.equal(reconnects, 0);
});

test('reconnect is called after a stall when the heartbeat stops', async () => {
  let reconnects = 0;
  const w = new LiveWatchdog({
    // We stop as soon as reconnect fires; otherwise, since the stream never actually recovers,
    // the watchdog would keep starting new stall cycles and calling reconnect over and over
    // (that is expected behavior, but this test only verifies the "first trigger" moment).
    reconnect: () => {
      reconnects++;
      w.stop();
    },
    onGiveUp: () => {},
    stallTimeoutMs: 30,
    checkIntervalMs: 10,
    backoffMs: [20],
  });
  w.start();
  await wait(100);
  assert.equal(reconnects, 1);
});

test('reportError triggers reconnect immediately (after the backoff)', async () => {
  let reconnects = 0;
  const w = new LiveWatchdog({
    reconnect: () => reconnects++,
    onGiveUp: () => {},
    stallTimeoutMs: 10000,
    checkIntervalMs: 1000,
    backoffMs: [10],
  });
  w.start();
  w.heartbeat();
  w.reportError();
  await wait(50);
  w.stop();
  assert.equal(reconnects, 1);
});

test('onGiveUp is called and it stops when maxAttempts is exceeded', async () => {
  let reconnects = 0;
  let gaveUp = false;
  const w = new LiveWatchdog({
    reconnect: () => {
      reconnects++;
      w.reportError(); // every reconnect also fails immediately
    },
    onGiveUp: () => {
      gaveUp = true;
    },
    maxAttempts: 3,
    backoffMs: [5, 5, 5],
    stallTimeoutMs: 10000,
    checkIntervalMs: 1000,
  });
  w.start();
  w.heartbeat();
  w.reportError();
  await wait(200);
  assert.equal(gaveUp, true);
  assert.equal(reconnects, 3);
});

test('the attempt counter resets after 30 s of stable playback', async () => {
  let reconnects = 0;
  const w = new LiveWatchdog({
    reconnect: () => reconnects++,
    onGiveUp: () => {},
    stallTimeoutMs: 10000,
    checkIntervalMs: 1000,
    backoffMs: [5],
    stableAfterMs: 30,
  });
  w.start();
  w.heartbeat();
  w.reportError(); // attempts -> 1
  await wait(20); // the first reconnect fires (backoff=5ms)
  w.heartbeat(); // the stable counter starts
  await wait(50); // stableAfterMs (30ms) elapses, attempts resets
  w.reportError(); // should start again from the 1st backoff (5ms)
  await wait(20);
  w.stop();
  assert.equal(reconnects, 2);
});

// --- Connectivity-aware reconnection (checkConnectivity) ---

test('while offline the attempt allowance is not spent and it does not give up; it reconnects immediately when the internet returns', async () => {
  let reconnects = 0;
  let gaveUp = false;
  const statuses: string[] = [];
  let online = false;
  const w = new LiveWatchdog({
    reconnect: () => {
      reconnects++;
      w.stop();
    },
    onGiveUp: () => {
      gaveUp = true;
    },
    checkConnectivity: async () => (online ? 'ok' : 'offline'),
    onStatus: (s) => statuses.push(s),
    offlinePollMs: [5],
    maxAttempts: 2,
    backoffMs: [5],
    stallTimeoutMs: 10000,
    checkIntervalMs: 1000,
  });
  w.start();
  w.heartbeat();
  w.reportError();
  await wait(60); // maxAttempts (2) is well exceeded but still offline
  assert.equal(reconnects, 0);
  assert.equal(gaveUp, false);
  assert.ok(statuses.every((s) => s === 'offline'));
  online = true;
  await wait(40);
  assert.equal(reconnects, 1);
  assert.equal(gaveUp, false);
});

test('when the source does not respond and the allowance runs out, it does not give up; it keeps trying at a slow interval', async () => {
  let reconnects = 0;
  let gaveUp = false;
  const w = new LiveWatchdog({
    reconnect: () => {
      reconnects++;
      w.reportError(); // every attempt fails immediately
    },
    onGiveUp: () => {
      gaveUp = true;
    },
    checkConnectivity: async () => 'source-down',
    maxAttempts: 2,
    backoffMs: [5],
    slowRetryMs: 10,
    stallTimeoutMs: 10000,
    checkIntervalMs: 1000,
  });
  w.start();
  w.heartbeat();
  w.reportError();
  await wait(150);
  w.stop();
  assert.equal(gaveUp, false);
  assert.ok(reconnects > 2, `reconnects=${reconnects}`);
});

test('if playback resumes by itself while offline (heartbeat), the probe is cancelled', async () => {
  let reconnects = 0;
  const w = new LiveWatchdog({
    reconnect: () => reconnects++,
    onGiveUp: () => {},
    checkConnectivity: async () => 'offline',
    offlinePollMs: [5],
    stallTimeoutMs: 10000,
    checkIntervalMs: 1000,
  });
  w.start();
  w.heartbeat();
  w.reportError();
  await wait(20);
  w.heartbeat(); // the buffer held, playback is flowing
  await wait(30);
  w.stop();
  assert.equal(reconnects, 0);
});

test('the attempt counter resets when the internet returns (the allowance is not exhausted on a flaky connection)', async () => {
  let reconnects = 0;
  const states: Array<'offline' | 'source-down'> = ['source-down', 'source-down', 'offline', 'source-down'];
  let i = 0;
  const w = new LiveWatchdog({
    reconnect: () => {
      reconnects++;
      w.reportError();
    },
    onGiveUp: () => {},
    checkConnectivity: async () => states[Math.min(i++, states.length - 1)],
    offlinePollMs: [5],
    maxAttempts: 2,
    backoffMs: [5],
    slowRetryMs: 500,
    stallTimeoutMs: 10000,
    checkIntervalMs: 1000,
  });
  w.start();
  w.heartbeat();
  w.reportError();
  await wait(120);
  w.stop();
  // 1st and 2nd attempt (allowance used up) -> offline -> once it returns, the counter resets and the 3rd attempt happens without delay
  assert.ok(reconnects >= 3, `reconnects=${reconnects}`);
});

test('jitter: the wait time is deviated within ±ratio, unchanged if 0', async () => {
  // random=0 -> -50%: backoff 200ms -> 100ms; random=1 -> +50%: 300ms
  for (const [rand, minMs, maxMs] of [[0, 90, 180], [1, 280, 600]] as const) {
    let at = 0;
    const t0 = Date.now();
    const w = new LiveWatchdog({
      reconnect: () => {
        at = Date.now() - t0;
      },
      onGiveUp: () => {},
      backoffMs: [200],
      jitter: 0.5,
      random: () => rand,
      stallTimeoutMs: 10000,
      checkIntervalMs: 1000,
    });
    w.start();
    w.reportError();
    await wait(700);
    w.stop();
    assert.ok(at >= minMs && at <= maxMs, `rand=${rand} at=${at}`);
  }
});
