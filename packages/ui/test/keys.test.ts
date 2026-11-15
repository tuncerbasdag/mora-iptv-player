import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelStepOf, isDiagnosticsKey } from '../src/keys.ts';

const key = (init: { key?: string; keyCode?: number }) => ({ key: '', keyCode: 0, ...init }) as KeyboardEvent;

test('remote CH+ / CH- (Tizen key codes 427 / 428) map to next / previous channel', () => {
  assert.equal(channelStepOf(key({ keyCode: 427 })), 1);
  assert.equal(channelStepOf(key({ keyCode: 428 })), -1);
});

test('the ChannelUp / ChannelDown key names work too (browsers, other remotes)', () => {
  assert.equal(channelStepOf(key({ key: 'ChannelUp' })), 1);
  assert.equal(channelStepOf(key({ key: 'ChannelDown' })), -1);
});

test('other keys are not channel keys', () => {
  assert.equal(channelStepOf(key({ key: 'ArrowDown', keyCode: 40 })), null);
  assert.equal(channelStepOf(key({ key: 'PageUp', keyCode: 33 })), null);
  assert.equal(channelStepOf(key({ keyCode: 415 })), null, 'MediaPlay');
});

test('diagnostics panel keys: remote Info (457) and Green (404), keyboard "i"', () => {
  assert.equal(isDiagnosticsKey(key({ keyCode: 457 })), true);
  assert.equal(isDiagnosticsKey(key({ keyCode: 404 })), true);
  assert.equal(isDiagnosticsKey(key({ key: 'i' })), true);
  assert.equal(isDiagnosticsKey(key({ key: 'I' })), true);
  assert.equal(isDiagnosticsKey(key({ key: 'ArrowDown', keyCode: 40 })), false);
  assert.equal(isDiagnosticsKey(key({ keyCode: 406 })), false, 'Blue is the favorite key');
});
