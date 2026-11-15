import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EpgService } from '../src/epgService.ts';

const SAMPLE_XMLTV = `<tv>
  <programme start="20261103180000 +0000" stop="20261103190000 +0000" channel="ch1"><title>A</title></programme>
  <programme start="20261103190000 +0000" stop="20261103200000 +0000" channel="ch1"><title>B</title></programme>
</tv>`;

test('load(): downloads the XML and indexes it by channelId', async () => {
  const svc = new EpgService(async () => SAMPLE_XMLTV);
  assert.equal(svc.isLoaded(), false);
  await svc.load('http://x/epg.xml');
  assert.equal(svc.isLoaded(), true);
  assert.equal(svc.getPrograms('ch1').length, 2);
  assert.equal(svc.getPrograms('bilinmeyen').length, 0);
});

test('getCurrentProgram(): returns the programme that matches the given moment', async () => {
  const svc = new EpgService(async () => SAMPLE_XMLTV);
  await svc.load('http://x/epg.xml');
  const now = Date.UTC(2026, 10, 3, 18, 30, 0);
  const current = svc.getCurrentProgram('ch1', now);
  assert.equal(current?.title, 'A');
});

test('getCurrentProgram(): returns undefined if no programme matches the moment', async () => {
  const svc = new EpgService(async () => SAMPLE_XMLTV);
  await svc.load('http://x/epg.xml');
  const now = Date.UTC(2026, 10, 3, 10, 0, 0);
  assert.equal(svc.getCurrentProgram('ch1', now), undefined);
});
