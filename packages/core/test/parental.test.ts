import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLibrary } from '../src/library.ts';
import { parseM3U } from '../src/m3u.ts';
import { migrateSettings } from '../src/connections.ts';
import {
  applyParental,
  DEFAULT_PARENTAL,
  isAdultCategory,
  isCategoryLocked,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  PinAttempts,
  verifyPin,
  withNewPin,
} from '../src/parental.ts';
import type { ParentalSettings } from '../src/types.ts';

const on: ParentalSettings = { ...DEFAULT_PARENTAL, enabled: true };

const M3U = `#EXTM3U
#EXTINF:-1 group-title="Haber",Haber 1
http://h/live/u/p/1.m3u8
#EXTINF:-1 group-title="XXX Kanallar",Gece 1
http://h/live/u/p/2.m3u8
#EXTINF:-1 group-title="Aksiyon",Film A (2020)
http://h/movie/u/p/3.mp4
#EXTINF:-1 group-title="Çocuk",Film B (2021)
http://h/movie/u/p/4.mp4
#EXTINF:-1 group-title="Aksiyon;Çocuk",Film C (2022)
http://h/movie/u/p/5.mp4
#EXTINF:-1 group-title="Dizi +18",Gizli Dizi S01E01
http://h/series/u/p/6.mp4
#EXTINF:-1 group-title="Dizi",Normal Dizi S01E01
http://h/series/u/p/7.mp4
`;
const lib = () => buildLibrary(parseM3U(M3U));

test('PIN: the default 0000 is valid if no PIN is saved; once a new PIN is set only that one is valid', () => {
  assert.equal(verifyPin(on, '0000'), true);
  assert.equal(verifyPin(on, '1111'), false);
  const p = withNewPin(on, '4821', 'tuz');
  assert.equal(verifyPin(p, '4821'), true);
  assert.equal(verifyPin(p, '0000'), false);
  assert.ok(!JSON.stringify(p).includes('4821'), 'PIN düz metin saklanmaz');
});

test('isAdultCategory: adult markers are caught, ordinary names are not', () => {
  for (const n of ['XXX', 'Adult Movies', '+18', '18+ Filmler', 'Yetişkin', 'Erotik']) assert.equal(isAdultCategory(n), true, n);
  for (const n of ['Haber', 'Aksiyon', '2018 Filmleri', 'Sexton Ailesi']) assert.equal(isAdultCategory(n), false, n);
});

test('isCategoryLocked: nothing is locked when off; when on, adult and selected categories are locked', () => {
  assert.equal(isCategoryLocked({ ...on, enabled: false, lockedCategories: ['Çocuk'] }, 'Çocuk'), false);
  assert.equal(isCategoryLocked(on, 'XXX Kanallar'), true);
  assert.equal(isCategoryLocked({ ...on, lockAdult: false }, 'XXX Kanallar'), false);
  assert.equal(isCategoryLocked({ ...on, lockedCategories: ['Çocuk'] }, 'Çocuk'), true);
});

test('applyParental: locked categories stay empty and marked, content of that type disappears from every view, counts are recomputed', () => {
  const view = applyParental(lib(), { ...on, lockedCategories: ['Çocuk'] }, false);
  assert.deepEqual(view.live.map((c) => [c.name, !!c.locked, c.items.length]), [['Haber', false, 1], ['XXX Kanallar', true, 0]]);
  assert.deepEqual(view.movies.map((c) => [c.name, !!c.locked]), [['Aksiyon', false], ['Çocuk', true]]);
  // Film C, which has "Aksiyon;Çocuk" as its type, also appeared under Aksiyon but is dropped because Çocuk is locked.
  assert.deepEqual(view.movies[0].items.map((i) => i.name), ['Film A (2020)']);
  assert.equal(view.movies[1].items.length, 0);
  assert.deepEqual(view.series.map((c) => [c.name, !!c.locked]), [['Dizi +18', true], ['Dizi', false]]);
  assert.equal(view.counts.live, 1);
  assert.equal(view.counts.movies, 1);
  assert.equal(view.counts.series, 1);
});

test('applyParental: the library is returned as is when the lock is off or the PIN was entered in the session', () => {
  const l = lib();
  assert.equal(applyParental(l, DEFAULT_PARENTAL, false), l);
  assert.equal(applyParental(l, on, true), l);
});

test('PinAttempts: after 5 wrong attempts even the correct PIN is rejected, it can be retried when the time is up', () => {
  let t = 1000;
  const a = new PinAttempts(() => t);
  for (let i = 0; i < MAX_ATTEMPTS; i++) assert.equal(a.attempt(on, '9999'), false);
  assert.ok(a.remainingMs() > 0);
  assert.equal(a.attempt(on, '0000'), false);
  t += LOCKOUT_MS + 1;
  assert.equal(a.remainingMs(), 0);
  assert.equal(a.attempt(on, '0000'), true);
});

test('PinAttempts: the correct PIN resets the error counter', () => {
  const a = new PinAttempts(() => 0);
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) a.attempt(on, '1');
  assert.equal(a.attempt(on, '0000'), true);
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) a.attempt(on, '1');
  assert.equal(a.remainingMs(), 0);
});

test('migrateSettings: the default (off) parental lock is added to old settings; saved fields are kept', () => {
  assert.equal(migrateSettings({}).parental.enabled, false);
  const s = migrateSettings({ parental: { enabled: true, lockedCategories: ['Çocuk'] } });
  assert.equal(s.parental.enabled, true);
  assert.deepEqual(s.parental.lockedCategories, ['Çocuk']);
  assert.equal(s.parental.lockAdult, true);
});

test('migrateSettings: an unknown language falls back to the default (tr); a valid language is kept', () => {
  assert.equal(migrateSettings({}).language, 'tr');
  assert.equal(migrateSettings({ language: 'xx' }).language, 'tr');
  assert.equal(migrateSettings({ language: 'en' }).language, 'en');
});

test('migrateSettings: an unknown theme (the old "theme1" placeholder) falls back to the default; valid themes are kept', () => {
  assert.equal(migrateSettings({ theme: 'theme1' }).theme, 'default');
  assert.equal(migrateSettings({}).theme, 'default');
  for (const t of ['theme2', 'theme3', 'theme4', 'theme5', 'theme6']) assert.equal(migrateSettings({ theme: t }).theme, t);
});

test('migrateSettings: subtitleStyle defaults to medium/white/none/bottom (matches the hardcoded old .vod-caption look); partial old values are filled in', () => {
  const defaults = migrateSettings({}).subtitleStyle;
  assert.deepEqual(defaults, { size: 'medium', color: 'white', background: 'none', position: 'bottom' });
  const s = migrateSettings({ subtitleStyle: { size: 'large', color: 'yellow' } });
  assert.deepEqual(s.subtitleStyle, { size: 'large', color: 'yellow', background: 'none', position: 'bottom' });
});

test('migrateSettings: an invalid subtitleStyle field falls back to the default for that field only', () => {
  const s = migrateSettings({ subtitleStyle: { size: 'huge', color: 'yellow', background: 'none', position: 'bottom' } });
  assert.deepEqual(s.subtitleStyle, { size: 'medium', color: 'yellow', background: 'none', position: 'bottom' });
});
