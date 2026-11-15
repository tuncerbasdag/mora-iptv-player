import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anyTrue, BaseConnectivityProbe, providerRoot } from '../src/connectivity.ts';

class StubProbe extends BaseConnectivityProbe {
  roots: string[] = [];
  offline: boolean;
  source: boolean;
  internet: boolean;
  constructor(offline: boolean, source: boolean, internet: boolean) {
    super();
    this.offline = offline;
    this.source = source;
    this.internet = internet;
  }
  protected deviceOffline(): boolean {
    return this.offline;
  }
  protected async sourceReachable(root: string): Promise<boolean> {
    this.roots.push(root);
    return this.source;
  }
  protected override async internetReachable(): Promise<boolean> {
    return this.internet;
  }
}

test('providerRoot: path and query are dropped; a malformed address is returned as is', () => {
  assert.equal(providerRoot('http://host:8080/live/u/p/1.ts?x=1'), 'http://host:8080/');
  assert.equal(providerRoot('not a url'), 'not a url');
});

test('anyTrue: true if any is true; false if all are false or the list is empty', async () => {
  assert.equal(await anyTrue([Promise.resolve(false), Promise.resolve(true)]), true);
  assert.equal(await anyTrue([Promise.resolve(false), Promise.resolve(false)]), false);
  assert.equal(await anyTrue([]), false);
});

test('check: if the device is offline the source is never checked', async () => {
  const p = new StubProbe(true, true, true);
  assert.equal(await p.check('http://h/x'), 'offline');
  assert.deepEqual(p.roots, []);
});

test('check: ok if the source responds (only the root address is probed)', async () => {
  const p = new StubProbe(false, true, false);
  assert.equal(await p.check('http://h:1/live/1.ts'), 'ok');
  assert.deepEqual(p.roots, ['http://h:1/']);
});

test('check: source down but internet up → source-down; neither → offline', async () => {
  assert.equal(await new StubProbe(false, false, true).check('http://h/x'), 'source-down');
  assert.equal(await new StubProbe(false, false, false).check('http://h/x'), 'offline');
});
