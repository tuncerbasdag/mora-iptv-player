import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountApiUrl, checkAccountBlock, parseAccountStatus } from '../src/accountGuard.ts';

const LIST = 'http://prov.example:80/get.php?username=ali&password=p%40ss&type=m3u_plus&output=ts';
const reply = (info: Record<string, unknown>) => async () => JSON.stringify({ user_info: info });

test('accountApiUrl: derives player_api.php from a get.php address, null if there are no credentials', () => {
  assert.equal(accountApiUrl(LIST), 'http://prov.example/player_api.php?username=ali&password=p%40ss');
  assert.equal(accountApiUrl('http://x.test/list.m3u'), null);
  assert.equal(accountApiUrl('bozuk'), null);
});

test('parseAccountStatus: converts numbers that arrive as text, null if user_info is missing', () => {
  assert.deepEqual(parseAccountStatus({ user_info: { status: 'Active', max_connections: '1', active_cons: '0' } }), {
    status: 'Active',
    maxConnections: 1,
    activeConnections: 0,
  });
  assert.equal(parseAccountStatus({}), null);
});

test('allowed: no block when a connection slot is free', async () => {
  assert.equal(await checkAccountBlock(reply({ status: 'Active', max_connections: '2', active_cons: '1' }), LIST), null);
});

test('block: if the active connections reached the limit, gives the "used on another device" message', async () => {
  const msg = await checkAccountBlock(reply({ status: 'Active', max_connections: '1', active_cons: '1' }), LIST);
  assert.match(msg ?? '', /başka bir cihazda/);
});

test('block: gives a message if the account is not active', async () => {
  assert.match((await checkAccountBlock(reply({ status: 'Expired', max_connections: '1', active_cons: '0' }), LIST)) ?? '', /etkin değil/);
});

test('does not block when it cannot be verified (not Xtream, network error, corrupt response)', async () => {
  assert.equal(await checkAccountBlock(reply({}), 'http://x.test/list.m3u'), null);
  assert.equal(await checkAccountBlock(async () => { throw new Error('ağ'); }, LIST), null);
  assert.equal(await checkAccountBlock(async () => 'html', LIST), null);
});
