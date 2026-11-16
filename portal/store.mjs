import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** How long a device session (the TV's "Remote Setup" screen) stays open; renewed on every poll. */
export const SESSION_TTL_MS = 15 * 60 * 1000;
/** When wrong PIN attempts reach this number the session is locked (the TV must get a new PIN). */
export const MAX_PIN_FAILURES = 5;
const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 60;

/** "aa-bb-cc-dd-ee-ff" / "AABBCCDDEEFF" → "AA:BB:CC:DD:EE:FF"; null if invalid. */
export function normalizeMac(input) {
  const hex = String(input ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g).join(':');
}

function validateUrl(input) {
  const url = String(input ?? '').trim();
  if (!url || url.length > MAX_URL_LENGTH) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * In-memory session store. Flow: the TV gets a PIN + secret key with register() and waits with poll();
 * the user push()es the MAC + PIN + list address on the site; the TV receives the data once on the next poll()
 * (it is deleted once received). The MAC alone is not an authorization: reading requires the secret key, writing requires the PIN.
 */
export function createStore({ now = Date.now } = {}) {
  const sessions = new Map();

  function live(mac) {
    const s = sessions.get(mac);
    if (!s) return null;
    if (s.expiresAt <= now()) {
      sessions.delete(mac);
      return null;
    }
    return s;
  }

  return {
    register(rawMac) {
      const mac = normalizeMac(rawMac);
      if (!mac) return { ok: false, error: 'invalid_mac' };
      const s = {
        pin: String(randomInt(0, 1_000_000)).padStart(6, '0'),
        secret: randomBytes(16).toString('hex'),
        failures: 0,
        payload: null,
        expiresAt: now() + SESSION_TTL_MS,
      };
      sessions.set(mac, s);
      return { ok: true, mac, pin: s.pin, secret: s.secret, expiresAt: s.expiresAt };
    },

    push({ mac: rawMac, pin, url, name }) {
      const mac = normalizeMac(rawMac);
      if (!mac) return { ok: false, error: 'invalid_mac' };
      const cleanUrl = validateUrl(url);
      if (!cleanUrl) return { ok: false, error: 'invalid_url' };
      const s = live(mac);
      if (!s) return { ok: false, error: 'not_found' };
      if (s.failures >= MAX_PIN_FAILURES) return { ok: false, error: 'locked' };
      if (!safeEqual(String(pin ?? '').trim(), s.pin)) {
        s.failures++;
        return { ok: false, error: s.failures >= MAX_PIN_FAILURES ? 'locked' : 'bad_pin' };
      }
      s.payload = { url: cleanUrl, name: String(name ?? '').trim().slice(0, MAX_NAME_LENGTH) || undefined };
      return { ok: true };
    },

    poll(rawMac, secret) {
      const mac = normalizeMac(rawMac);
      const s = mac ? live(mac) : null;
      if (!s || !safeEqual(String(secret ?? ''), s.secret)) return { status: 'expired' };
      s.expiresAt = now() + SESSION_TTL_MS;
      if (!s.payload) return { status: 'waiting' };
      const payload = s.payload;
      s.payload = null; // one-time: the address (may contain credentials) doesn't stay on the server
      return { status: 'delivered', payload };
    },

    sweep() {
      for (const mac of sessions.keys()) live(mac);
    },
  };
}
