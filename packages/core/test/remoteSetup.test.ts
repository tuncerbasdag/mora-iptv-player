import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemoteSetupClient, generateDeviceMac } from '../src/remoteSetup.ts';

test('generateDeviceMac: locally administered, 6 bytes, uppercase', () => {
  const mac = generateDeviceMac(() => 0.999);
  assert.match(mac, /^02(:[0-9A-F]{2}){5}$/);
  assert.equal(generateDeviceMac(() => 0), '02:00:00:00:00:00');
});

test('register: POSTs a JSON body to the correct address even with a trailing /', async () => {
  const calls: Array<{ url: string; init?: { method?: string; body?: string } }> = [];
  const client = new RemoteSetupClient('http://p:8788/', async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ mac: 'M', pin: '123456', secret: 's', expiresAt: 1 }) };
  });
  const s = await client.register('AA:BB:CC:DD:EE:FF');
  assert.equal(s.pin, '123456');
  assert.equal(calls[0].url, 'http://p:8788/api/device/register');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init!.body!), { mac: 'AA:BB:CC:DD:EE:FF' });
});

test('poll: sends the secret key in a header, throws on error', async () => {
  let header = '';
  const ok = new RemoteSetupClient('http://p', async (_url, init) => {
    header = (init as { headers: Record<string, string> }).headers['x-device-secret'];
    return { ok: true, json: async () => ({ status: 'waiting' }) };
  });
  assert.deepEqual(await ok.poll('A:B', 'sec'), { status: 'waiting' });
  assert.equal(header, 'sec');
  const bad = new RemoteSetupClient('http://p', async () => ({ ok: false, json: async () => ({}) }));
  await assert.rejects(bad.poll('A:B', 's'));
});
