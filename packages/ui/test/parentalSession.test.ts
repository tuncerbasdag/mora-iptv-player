import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParentalSession } from '../src/app/parentalSession.ts';
import { PinAttempts, LOCKOUT_MS, MAX_ATTEMPTS } from '../../core/src/parental.ts';
import type { Library, ParentalSettings } from '../../core/src/types.ts';

const base: ParentalSettings = { enabled: true, pinSalt: '', pinHash: null, lockAdult: true, lockSettings: false, lockedCategories: [] };

function lib(): Library {
  const item = (id: string, group: string) => ({ id, name: id, group, kind: 'live' as const, url: `http://x/${id}` });
  return {
    live: [
      { name: 'ULUSAL', items: [item('a', 'ULUSAL')] },
      { name: 'XXX ADULT', items: [item('b', 'XXX ADULT')] },
    ],
    movies: [],
    series: [],
    counts: { live: 2, movies: 0, series: 0, episodes: 0 },
  };
}

test('state: off when the lock is off; locked when on, open once the PIN is entered, locked again manually', () => {
  let p = { ...base, enabled: false };
  const s = new ParentalSession(() => p);
  assert.equal(s.state(), 'off');
  p = { ...base };
  assert.equal(s.state(), 'locked');
  s.unlock();
  assert.equal(s.state(), 'open');
  assert.equal(s.isUnlocked(), true);
  s.relock();
  assert.equal(s.state(), 'locked');
});

test('filter: while locked an adult category is emptied and marked locked; full content once opened; null if there is no library', () => {
  const s = new ParentalSession(() => base);
  assert.equal(s.filter(null), null);
  const locked = s.filter(lib())!;
  assert.deepEqual(locked.live.map((c) => [c.name, c.items.length, !!c.locked]), [['ULUSAL', 1, false], ['XXX ADULT', 0, true]]);
  s.unlock();
  assert.equal(s.filter(lib())!.live[1].items.length, 1);
});

test('verifyPinMessage: correct PIN null; wrong PIN message; timed lockout message on consecutive wrong attempts (even the correct PIN is rejected)', () => {
  let now = 0;
  const s = new ParentalSession(() => base, new PinAttempts(() => now));
  assert.equal(s.verifyPinMessage('0000'), null);
  assert.equal(s.verifyPinMessage('1111'), 'Yanlış PIN. Tekrar dene.');
  for (let i = 0; i < MAX_ATTEMPTS - 2; i++) s.verifyPinMessage('1111');
  const locked = s.verifyPinMessage('1111');
  assert.match(locked!, /^Çok fazla yanlış deneme\. \d+ sn sonra tekrar dene\.$/);
  assert.match(s.verifyPinMessage('0000')!, /sn sonra/);
  now += LOCKOUT_MS + 1;
  assert.equal(s.verifyPinMessage('0000'), null);
});

test('Settings PIN gate: none if the lock is off; Parental pages always, others only with lockSettings; once per visit; Home resets', () => {
  let p = { ...base, enabled: false, lockSettings: true };
  const s = new ParentalSession(() => p);
  assert.equal(s.requiresSettingsPin(true), false);
  p = { ...base, lockSettings: false };
  assert.equal(s.requiresSettingsPin(false), false);
  assert.equal(s.requiresSettingsPin(true), true);
  p = { ...base, lockSettings: true };
  assert.equal(s.requiresSettingsPin(false), true);
  s.grantSettingsAccess();
  assert.equal(s.requiresSettingsPin(true), false);
  assert.equal(s.requiresSettingsPin(false), false);
  s.resetSettingsAccess();
  assert.equal(s.requiresSettingsPin(false), true);
});

test('settings change: enabled/rules lock the session; disabled does not lock; enabled avoids asking for the PIN in the same visit', () => {
  const s = new ParentalSession(() => ({ ...base, lockSettings: true }));
  s.unlock();
  s.onSettingsChanged('disabled');
  assert.equal(s.isUnlocked(), true);
  s.onSettingsChanged('rules');
  assert.equal(s.isUnlocked(), false);
  assert.equal(s.requiresSettingsPin(false), true);
  s.unlock();
  s.onSettingsChanged('enabled');
  assert.equal(s.isUnlocked(), false);
  assert.equal(s.requiresSettingsPin(false), false);
});
