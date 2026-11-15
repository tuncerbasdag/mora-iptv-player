import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeUpdate, type AppUpdateState } from '../src/appUpdater.ts';

const st = (over: Partial<AppUpdateState>): AppUpdateState => ({ status: 'idle', currentVersion: '0.0.1', policy: 'auto', ...over });

test('idle and up-to-date offer a check; checking and disabled have no action', () => {
  assert.equal(describeUpdate(st({ status: 'idle' })).action, 'check');
  assert.equal(describeUpdate(st({ status: 'up-to-date' })).action, 'check');
  assert.equal(describeUpdate(st({ status: 'checking' })).action, null);
  assert.equal(describeUpdate(st({ status: 'disabled', policy: 'disabled' })).action, null);
});

test('available: auto downloads in the app, manual (unsigned macOS) opens the releases page', () => {
  assert.equal(describeUpdate(st({ status: 'available', version: '0.0.2' })).action, 'download');
  assert.equal(describeUpdate(st({ status: 'available', version: '0.0.2', policy: 'manual' })).action, 'open-releases');
});

test('downloading shows progress and no action; ready installs', () => {
  const d = describeUpdate(st({ status: 'downloading', percent: 40 }));
  assert.deepEqual([d.action, d.progress], [null, 40]);
  assert.equal(describeUpdate(st({ status: 'ready', version: '0.0.2' })).action, 'install');
});

test('error shows the message and offers a retry', () => {
  const d = describeUpdate(st({ status: 'error', message: 'ağ yok' }));
  assert.deepEqual([d.detail, d.action], ['ağ yok', 'check']);
});
