import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, normalizeMac, SESSION_TTL_MS, MAX_PIN_FAILURES } from '../store.mjs';

const URL_OK = 'http://example.com/list.m3u';

test('normalizeMac: with/without separators/lowercase → AA:BB:CC:DD:EE:FF, invalid → null', () => {
  assert.equal(normalizeMac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMac('aabbccddeeff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMac('AA:BB:CC'), null);
  assert.equal(normalizeMac(undefined), null);
});

test('flow: register → push → poll delivers the data once', () => {
  const s = createStore();
  const r = s.register('aa:bb:cc:dd:ee:ff');
  assert.match(r.pin, /^\d{6}$/);
  assert.equal(s.poll(r.mac, r.secret).status, 'waiting');
  assert.deepEqual(s.push({ mac: 'AABBCCDDEEFF', pin: r.pin, url: URL_OK, name: ' Evim ' }), { ok: true });
  const got = s.poll(r.mac, r.secret);
  assert.equal(got.status, 'delivered');
  assert.deepEqual(got.payload, { url: URL_OK, name: 'Evim' });
  assert.equal(s.poll(r.mac, r.secret).status, 'waiting'); // can't be retrieved again
});

test('polling with a wrong secret key does not return the data', () => {
  const s = createStore();
  const r = s.register('aa:bb:cc:dd:ee:ff');
  s.push({ mac: r.mac, pin: r.pin, url: URL_OK });
  assert.equal(s.poll(r.mac, 'x'.repeat(32)).status, 'expired');
  assert.equal(s.poll(r.mac, r.secret).status, 'delivered');
});

test('wrong PIN: bad_pin, locked when the limit is reached; even the correct PIN is not accepted', () => {
  const s = createStore();
  const r = s.register('aa:bb:cc:dd:ee:ff');
  const wrong = r.pin === '000000' ? '111111' : '000000';
  for (let i = 1; i < MAX_PIN_FAILURES; i++) assert.equal(s.push({ mac: r.mac, pin: wrong, url: URL_OK }).error, 'bad_pin');
  assert.equal(s.push({ mac: r.mac, pin: wrong, url: URL_OK }).error, 'locked');
  assert.equal(s.push({ mac: r.mac, pin: r.pin, url: URL_OK }).error, 'locked');
});

test('an invalid address is rejected (not http/https, empty, corrupt)', () => {
  const s = createStore();
  const r = s.register('aa:bb:cc:dd:ee:ff');
  for (const bad of ['', 'ftp://x/y.m3u', 'javascript:alert(1)', 'not a url']) {
    assert.equal(s.push({ mac: r.mac, pin: r.pin, url: bad }).error, 'invalid_url');
  }
});

test('no session gives not_found; the session is deleted when time runs out, polling keeps it alive', () => {
  let t = 1000;
  const s = createStore({ now: () => t });
  assert.equal(s.push({ mac: 'aa:bb:cc:dd:ee:ff', pin: '123456', url: URL_OK }).error, 'not_found');
  const r = s.register('aa:bb:cc:dd:ee:ff');
  t += SESSION_TTL_MS - 1000;
  assert.equal(s.poll(r.mac, r.secret).status, 'waiting'); // renews the lifetime
  t += SESSION_TTL_MS - 1000;
  assert.equal(s.poll(r.mac, r.secret).status, 'waiting');
  t += SESSION_TTL_MS + 1;
  assert.equal(s.poll(r.mac, r.secret).status, 'expired');
});

test('register again invalidates the old PIN and secret key', () => {
  const s = createStore();
  const a = s.register('aa:bb:cc:dd:ee:ff');
  const b = s.register('aa:bb:cc:dd:ee:ff');
  assert.equal(s.poll(a.mac, a.secret).status, 'expired');
  assert.equal(s.poll(b.mac, b.secret).status, 'waiting');
});
