import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIVE_BUFFER, LiveBufferController, LiveBufferPolicy, type BufferedVideo } from '../src/liveBuffer.ts';

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

/** Fake <video>: buffer and position are set manually. */
class FakeVideo implements BufferedVideo {
  paused = false;
  ahead = 0;
  end = 100;
  plays = 0;
  rate = 1;
  rates: number[] = [];
  aheadSeconds(): number {
    return this.ahead;
  }
  bufferedEnd(): number {
    return this.end;
  }
  pause(): void {
    this.paused = true;
  }
  play(): void {
    this.paused = false;
    this.plays++;
  }
  setPlaybackRate(rate: number): void {
    this.rate = rate;
    this.rates.push(rate);
  }
}

test('policy starts in low-latency mode (2 s resume threshold)', () => {
  const p = new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, clock().now);
  assert.equal(p.mode, 'low');
  assert.equal(p.resumeSeconds(), 2);
});

test('a single stall immediately switches to stable (5 s) — stallsToStabilize: 1, least extra latency on the common path', () => {
  const p = new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, clock().now);
  p.recordStall();
  assert.equal(p.mode, 'stable');
  assert.equal(p.resumeSeconds(), 5);
});

test('latency never stacks: the threshold stays 5 s no matter how many stalls happen', () => {
  const c = clock();
  const p = new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, c.now);
  for (let i = 0; i < 20; i++) {
    p.recordStall();
    c.advance(1000);
  }
  assert.equal(p.mode, 'stable');
  assert.equal(p.resumeSeconds(), 5, "5 stalls must not mean 5 x 5 s");
});

test('after 3 calm minutes it returns to low latency, and a stall inside that time keeps stable', () => {
  const c = clock();
  const p = new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, c.now);
  p.recordStall();
  c.advance(1000);
  p.recordStall();
  assert.equal(p.mode, 'stable');
  c.advance(179_000);
  p.update();
  assert.equal(p.mode, 'stable', 'not calm long enough yet');
  p.recordStall();
  c.advance(179_000);
  p.update();
  assert.equal(p.mode, 'stable', 'a new stall restarts the calm period');
  c.advance(2_000);
  p.update();
  assert.equal(p.mode, 'low');
  assert.equal(p.resumeSeconds(), 2);
});

test('controller holds playback on a stall and resumes once the threshold is buffered (a single stall already means 5 s)', () => {
  const v = new FakeVideo();
  const ctl = new LiveBufferController(v, new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, clock().now));
  v.ahead = 0.3;
  assert.equal(ctl.onWaiting(), true);
  assert.equal(ctl.holding, true);
  assert.equal(v.paused, true);
  v.ahead = 4;
  ctl.tick();
  assert.equal(v.paused, true, 'still below 5 s');
  v.ahead = 5;
  ctl.tick();
  assert.equal(v.paused, false);
  assert.equal(ctl.holding, false);
  assert.equal(v.plays, 1);
});

test('in stable mode the controller waits for 5 s', () => {
  const v = new FakeVideo();
  const ctl = new LiveBufferController(v, new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, clock().now));
  v.ahead = 0.1;
  ctl.onWaiting(); // a single stall -> stable (stallsToStabilize: 1)
  v.ahead = 4.9;
  ctl.tick();
  assert.equal(v.paused, true);
  v.ahead = 5;
  ctl.tick();
  assert.equal(v.paused, false);
});

test('no hold when enough is already buffered or when the user had paused', () => {
  const v = new FakeVideo();
  const ctl = new LiveBufferController(v, new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, clock().now));
  v.ahead = 6; // already past the stable threshold (5 s) that a single stall now switches to
  assert.equal(ctl.onWaiting(), false);
  assert.equal(v.paused, false);

  const paused = new FakeVideo();
  paused.paused = true;
  const ctl2 = new LiveBufferController(paused, new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, clock().now));
  assert.equal(ctl2.onWaiting(), false, "the user's pause is not touched");
  assert.equal(ctl2.holding, false);
});

test('cancel (user pressed play/pause or channel changed) drops the hold without resuming', () => {
  const v = new FakeVideo();
  const ctl = new LiveBufferController(v, new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, clock().now));
  v.ahead = 0;
  ctl.onWaiting();
  ctl.cancel();
  assert.equal(ctl.holding, false);
  v.ahead = 10;
  ctl.tick();
  assert.equal(v.plays, 0, "tick must not resume a playback the user took over");
});

test('if something else resumed playback during the hold, the hold is dropped', () => {
  const v = new FakeVideo();
  const ctl = new LiveBufferController(v, new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, clock().now));
  v.ahead = 0;
  ctl.onWaiting();
  v.paused = false;
  ctl.tick();
  assert.equal(ctl.holding, false);
});

test('when the buffer grows past the maximum the player speeds up (no hard seek) until it catches up to the threshold', () => {
  const v = new FakeVideo();
  const ctl = new LiveBufferController(v, new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, clock().now));
  v.end = 200;
  v.ahead = 7.9;
  ctl.tick();
  assert.deepEqual(v.rates, [], '7.9 s is within the 8 s limit');
  v.ahead = 12;
  ctl.tick();
  assert.deepEqual(v.rates, [1.15], 'buffer overflow: speed up instead of a hard seek');
  // Still above the threshold: stays sped up, no repeated rate change.
  v.ahead = 6;
  ctl.tick();
  assert.deepEqual(v.rates, [1.15]);
  // Caught up to the threshold: speed returns to normal.
  v.ahead = 2;
  ctl.tick();
  assert.deepEqual(v.rates, [1.15, 1]);
});

test('if the network is slower than the stream the hold ends after the maximum time instead of waiting forever', () => {
  const c = clock();
  const v = new FakeVideo();
  const ctl = new LiveBufferController(v, new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, c.now), c.now);
  v.ahead = 0.2;
  ctl.onWaiting();
  c.advance(5_900);
  v.ahead = 1.4; // buffer grows too slowly to ever reach the threshold
  ctl.tick();
  assert.equal(v.paused, true, 'still within the hold limit');
  c.advance(200);
  ctl.tick();
  assert.equal(v.paused, false, 'resumed with what is buffered');
  assert.equal(ctl.holding, false);
});

test('first frame with too little buffer: playback is held (no stall recorded) and resumes at the threshold', () => {
  const c = clock();
  const policy = new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, c.now);
  const v = new FakeVideo();
  const ctl = new LiveBufferController(v, policy, c.now);
  v.ahead = 0.3;
  assert.equal(ctl.onFirstFrame(), true);
  assert.equal(v.paused, true);
  assert.equal(policy.totalStalls, 0, 'opening a channel is not a network stall');
  assert.equal(policy.mode, 'low');
  v.ahead = 1.9;
  ctl.tick();
  assert.equal(v.paused, true);
  v.ahead = 2;
  ctl.tick();
  assert.equal(v.paused, false);
});

test('first frame with enough buffer: no hold, playback goes on immediately', () => {
  const v = new FakeVideo();
  const ctl = new LiveBufferController(v, new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, clock().now));
  v.ahead = 2.5;
  assert.equal(ctl.onFirstFrame(), false);
  assert.equal(v.paused, false);
});

test('the opening hold also ends after the maximum time', () => {
  const c = clock();
  const v = new FakeVideo();
  const ctl = new LiveBufferController(v, new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, c.now), c.now);
  v.ahead = 0.2;
  ctl.onFirstFrame();
  c.advance(6_000);
  v.ahead = 0.9;
  ctl.tick();
  assert.equal(v.paused, false, 'a slow network must not keep the channel closed');
});

test('totalStalls counts every stall, for the diagnostics panel', () => {
  const c = clock();
  const p = new LiveBufferPolicy(DEFAULT_LIVE_BUFFER, c.now);
  for (let i = 0; i < 3; i++) {
    p.recordStall();
    c.advance(100_000);
  }
  assert.equal(p.totalStalls, 3);
});
