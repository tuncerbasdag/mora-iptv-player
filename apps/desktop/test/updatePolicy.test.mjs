import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMode, updatePolicy } from '../updatePolicy.mjs';

test('unpackaged (development) runs never check for updates', () => {
  assert.equal(updatePolicy({ platform: 'win32', packaged: false, macSigned: false }), 'disabled');
  assert.equal(updatePolicy({ platform: 'darwin', packaged: false, macSigned: true }), 'disabled');
});

test('Windows installs updates automatically', () => {
  assert.equal(updatePolicy({ platform: 'win32', packaged: true, macSigned: false }), 'auto');
});

test('macOS installs automatically; unsigned builds use our own installer instead of Squirrel.Mac', () => {
  assert.equal(updatePolicy({ platform: 'darwin', packaged: true, macSigned: true }), 'auto');
  assert.equal(updatePolicy({ platform: 'darwin', packaged: true, macSigned: false }), 'auto');
  assert.equal(installMode({ platform: 'darwin', macSigned: false }), 'self');
  assert.equal(installMode({ platform: 'darwin', macSigned: true }), 'native');
  assert.equal(installMode({ platform: 'win32', macSigned: false }), 'native');
});
