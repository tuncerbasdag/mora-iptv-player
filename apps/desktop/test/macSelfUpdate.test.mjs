import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentBundlePath, pickZip, releaseAssetUrl } from '../macSelfUpdate.mjs';

const info = { files: [{ url: 'Mora-IPTV-Player-0.0.2-mac-arm64.zip', sha512: 'a' }, { url: 'Mora-IPTV-Player-0.0.2-mac-x64.zip', sha512: 'b' }, { url: 'x.dmg', sha512: 'c' }] };

test('pickZip selects the zip for this architecture', () => {
  assert.equal(pickZip(info, 'arm64').sha512, 'a');
  assert.equal(pickZip(info, 'x64').sha512, 'b');
  assert.equal(pickZip({ files: [] }, 'arm64'), null);
});

test('releaseAssetUrl only builds URLs on our release and rejects odd names', () => {
  assert.equal(
    releaseAssetUrl({ owner: 'o', repo: 'r', version: '0.0.2', fileName: 'A-0.0.2-mac-arm64.zip' }),
    'https://github.com/o/r/releases/download/v0.0.2/A-0.0.2-mac-arm64.zip',
  );
  assert.throws(() => releaseAssetUrl({ owner: 'o', repo: 'r', version: '0.0.2', fileName: '../evil.zip' }));
  assert.throws(() => releaseAssetUrl({ owner: 'o', repo: 'r', version: '0.0.2', fileName: 'https://evil/x.zip' }));
});

test('currentBundlePath returns the .app of the running executable', () => {
  assert.equal(currentBundlePath('/Applications/Mora IPTV Player.app/Contents/MacOS/Mora IPTV Player'), '/Applications/Mora IPTV Player.app');
});
