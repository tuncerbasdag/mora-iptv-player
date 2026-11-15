import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAvplayStats } from '../src/avplayStats.ts';

const infos = [
  { index: 0, type: 'VIDEO', extra_info: '{"fourCC":"H264","Width":"1920","Height":"1080","Bit_rate":" 477000"}' },
  { index: 1, type: 'AUDIO', extra_info: '{"language":"en","channels":"2","sample_rate":"44100","bit_rate":"96000","fourCC":"AACL"}' },
];

test('Samsung sample format: resolution, bitrate and codec are extracted', () => {
  assert.deepEqual(parseAvplayStats(infos), { width: 1920, height: 1080, kbps: 477, fps: null, codec: 'H.264 · AAC' });
});

test('if CURRENT_BANDWIDTH is given it is used for the bitrate', () => {
  assert.equal(parseAvplayStats(infos, 3_200_000)?.kbps, 3200);
});

test('the fps key is read if present, a meaningless value is ignored', () => {
  const v = (extra: string) => [{ type: 'VIDEO', extra_info: extra }];
  assert.equal(parseAvplayStats(v('{"Width":"1280","Height":"720","framerate":"25"}'))?.fps, 25);
  assert.equal(parseAvplayStats(v('{"Width":"1280","Height":"720","framerate":"90000"}'))?.fps, null);
});

test('corrupt/missing data does not throw, returns null', () => {
  assert.equal(parseAvplayStats(undefined), null);
  assert.equal(parseAvplayStats([]), null);
  assert.equal(parseAvplayStats([{ type: 'VIDEO', extra_info: 'not json' }]), null);
  assert.equal(parseAvplayStats([{ type: 'VIDEO', extra_info: '{"Width":"0","Height":"0"}' }]), null);
});
