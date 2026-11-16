import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXmltv, parseXmltvDate } from '../src/epg.ts';

const SAMPLE_XMLTV = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="ALPHA1.tr"><display-name>ALPHA 1</display-name></channel>
  <programme start="20261103180000 +0300" stop="20261103190000 +0300" channel="ALPHA1.tr">
    <title lang="tr">Ana Haber</title>
    <desc lang="tr">G&amp;uuml;n&amp;uuml;n haberleri</desc>
  </programme>
  <programme start="20261103190000 +0300" stop="20261103200000 +0300" channel="ALPHA1.tr">
    <title lang="tr">Spor Bülteni</title>
  </programme>
  <programme start="20261103180000 +0300" stop="20261103190000 +0300" channel="Other.tr">
    <title>Başka Kanal</title>
  </programme>
</tv>
`;

test('parseXmltv: extracts the right number of programme blocks', () => {
  const programs = parseXmltv(SAMPLE_XMLTV);
  assert.equal(programs.length, 3);
});

test('parseXmltv: channel/title/desc are read correctly', () => {
  const programs = parseXmltv(SAMPLE_XMLTV);
  const first = programs.find((p) => p.title === 'Ana Haber')!;
  assert.equal(first.channelId, 'ALPHA1.tr');
  assert.ok(first.description?.includes('haberleri'));
});

test('parseXmltv: description is undefined for a programme without desc', () => {
  const programs = parseXmltv(SAMPLE_XMLTV);
  const second = programs.find((p) => p.title === 'Spor Bülteni')!;
  assert.equal(second.description, undefined);
});

test('parseXmltvDate: a date with a time zone is converted to the correct epoch', () => {
  // 18:00 +03:00 == 15:00 UTC
  const ms = parseXmltvDate('20261103180000 +0300');
  assert.equal(ms, Date.UTC(2026, 10, 3, 15, 0, 0));
});

test('parseXmltvDate: UTC is assumed if no time zone is given', () => {
  const ms = parseXmltvDate('20261103180000');
  assert.equal(ms, Date.UTC(2026, 10, 3, 18, 0, 0));
});

test('parseXmltvDate: returns null for invalid/empty input', () => {
  assert.equal(parseXmltvDate(undefined), null);
  assert.equal(parseXmltvDate('bozuk'), null);
});
