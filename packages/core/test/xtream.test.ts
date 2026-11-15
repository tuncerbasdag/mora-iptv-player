import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXtreamUrl } from '../src/xtream.ts';

test('http:// is added to a server address without a protocol', () => {
  const url = buildXtreamUrl({ server: 'example.com:8080', username: 'u', password: 'p' });
  assert.equal(url, 'http://example.com:8080/get.php?username=u&password=p&type=m3u_plus&output=ts');
});

test('a server address with a protocol is kept as is', () => {
  const url = buildXtreamUrl({ server: 'https://example.com:8080', username: 'u', password: 'p' });
  assert.equal(url, 'https://example.com:8080/get.php?username=u&password=p&type=m3u_plus&output=ts');
});

test('the trailing slash is removed', () => {
  const url = buildXtreamUrl({ server: 'http://example.com/', username: 'u', password: 'p' });
  assert.ok(url.startsWith('http://example.com/get.php?'));
});

test('mac is added as a query parameter if provided', () => {
  const url = buildXtreamUrl({ server: 'example.com', username: 'u', password: 'p', mac: '00:1A:79:AA:BB:CC' });
  assert.ok(url.includes(`mac=${encodeURIComponent('00:1A:79:AA:BB:CC')}`));
});

test('the mac parameter is not added if mac is not provided', () => {
  const url = buildXtreamUrl({ server: 'example.com', username: 'u', password: 'p' });
  assert.ok(!url.includes('mac='));
});

test('special characters in the username/password are URL-encoded', () => {
  const url = buildXtreamUrl({ server: 'example.com', username: 'a b', password: 'p@ss&1' });
  assert.ok(url.includes('username=a+b'));
  assert.ok(url.includes('password=p%40ss%261'));
});

test('xtreamEpgUrl: the xmltv.php address, the server is normalized and credentials are encoded', async () => {
  const { xtreamEpgUrl } = await import('../src/xtream.ts');
  assert.equal(xtreamEpgUrl({ server: 'panel.example:8080/', username: 'u s', password: 'p&1' }), 'http://panel.example:8080/xmltv.php?username=u+s&password=p%261');
});
