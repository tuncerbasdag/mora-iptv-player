import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDiagnostics } from '../src/screens/overlay/overlayDiagnostics.ts';
import { EMPTY_DIAGNOSTICS } from '../src/playerAdapter.ts';

test('web player: engine, buffer, mode with stall count, dropped frames', () => {
  const lines = formatDiagnostics({ engine: 'mpegts.js', bufferSeconds: 3.2, bufferMode: 'stable', holding: false, stalls: 4, droppedFrames: 12, totalFrames: 1450, events: [] });
  assert.deepEqual(lines, ['Oynatıcı: mpegts.js', 'Tampon: 3.2 sn', 'Mod: kararlı (~5 sn) · Kesinti: 4', 'Düşen kare: 12 / 1450']);
});

test('low-latency mode and a hold in progress are shown', () => {
  const lines = formatDiagnostics({ engine: 'hls.js', bufferSeconds: 0.4, bufferMode: 'low', holding: true, stalls: 1, droppedFrames: null, totalFrames: null, events: [] });
  assert.deepEqual(lines, ['Oynatıcı: hls.js', 'Tampon: 0.4 sn (dolması bekleniyor)', 'Mod: düşük gecikme · Kesinti: 1']);
});

test('AVPlay gives no buffer/frame data: the panel says so instead of showing empty rows', () => {
  const lines = formatDiagnostics({ ...EMPTY_DIAGNOSTICS, engine: 'avplay' });
  assert.deepEqual(lines, ['Oynatıcı: avplay', 'AVPlay tampon/kare bilgisini vermiyor']);
});

test('a player without diagnostics support', () => {
  assert.deepEqual(formatDiagnostics(null), ['Tanı bilgisi yok (oynatıcı desteklemiyor)']);
});

test('the latest events are listed (at most 6, oldest first) so a freeze can be traced on the TV', () => {
  const events = ['1 a', '2 b', '3 c', '4 d', '5 e', '6 f', '7 g'];
  const lines = formatDiagnostics({ ...EMPTY_DIAGNOSTICS, engine: 'hls.js', bufferSeconds: 1, events });
  assert.deepEqual(lines.slice(-7), ['Son olaylar:', '  2 b', '  3 c', '  4 d', '  5 e', '  6 f', '  7 g']);
});
