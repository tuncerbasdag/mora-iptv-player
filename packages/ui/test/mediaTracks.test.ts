import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelLabel, languageName, parseAvplayTracks } from '../src/mediaTracks.ts';

test('languageName: two- and three-letter codes are converted to Turkish names, unknown/empty codes are handled', () => {
  assert.equal(languageName('tur'), 'Türkçe');
  assert.equal(languageName('eng'), 'İngilizce');
  assert.equal(languageName('de'), 'Almanca');
  assert.equal(languageName('en-US'), 'İngilizce');
  assert.equal(languageName('xyz'), 'XYZ');
  assert.equal(languageName('und'), null);
  assert.equal(languageName(''), null);
  assert.equal(languageName(undefined), null);
});

test('channelLabel', () => {
  assert.equal(channelLabel(2), 'Stereo');
  assert.equal(channelLabel('6'), '5.1');
  assert.equal(channelLabel(undefined), '');
});

test('parseAvplayTracks: audio and subtitles are separated, language name and channel info extracted, video ignored', () => {
  const { audio, text } = parseAvplayTracks([
    { index: 0, type: 'VIDEO', extra_info: '{}' },
    { index: 1, type: 'AUDIO', extra_info: '{"language":"tur","channels":"2"}' },
    { index: 2, type: 'AUDIO', extra_info: '{"language":"eng","channels":"6"}' },
    { index: 3, type: 'TEXT', extra_info: '{"track_lang":"tur"}' },
    { index: 4, type: 'TEXT', extra_info: '{"track_lang":"eng"}' },
  ]);
  assert.deepEqual(audio, [
    { id: 1, label: 'Türkçe', detail: 'Stereo' },
    { id: 2, label: 'İngilizce', detail: '5.1' },
  ]);
  assert.deepEqual(text.map((t) => [t.id, t.label]), [[3, 'Türkçe'], [4, 'İngilizce']]);
});

test('parseAvplayTracks: tracks with an unknown language are numbered, several tracks of the same language are told apart, corrupt info does not crash', () => {
  const { audio } = parseAvplayTracks([
    { index: 0, type: 'AUDIO', extra_info: 'bozuk' },
    { index: 1, type: 'AUDIO' },
    { index: 2, type: 'AUDIO', extra_info: '{"language":"eng"}' },
    { index: 3, type: 'AUDIO', extra_info: '{"language":"eng"}' },
  ]);
  assert.deepEqual(audio.map((t) => t.label), ['Parça 1', 'Parça 2', 'İngilizce 1', 'İngilizce 2']);
  assert.deepEqual(parseAvplayTracks(null), { audio: [], text: [] });
});
