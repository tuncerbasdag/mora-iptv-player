import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Bir cihaz oturumunun (TV'deki "Uzaktan Yükle" ekranı) açık kalma süresi; her yoklamada yenilenir. */
export const SESSION_TTL_MS = 15 * 60 * 1000;
/** Yanlış PIN denemesi bu sayıya ulaşınca oturum kilitlenir (TV'nin yeni PIN alması gerekir). */
export const MAX_PIN_FAILURES = 5;
const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 60;

/** "aa-bb-cc-dd-ee-ff" / "AABBCCDDEEFF" → "AA:BB:CC:DD:EE:FF"; geçersizse null. */
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
 * Bellek içi oturum deposu. Akış: TV register() ile PIN + gizli anahtar alır ve poll() ile bekler;
 * kullanıcı sitede MAC + PIN + liste adresini push() eder; TV bir sonraki poll()'da veriyi bir kez
 * alır (alınca silinir). MAC tek başına bir yetki değildir: okumak gizli anahtar, yazmak PIN ister.
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
      s.payload = null; // tek seferlik: adres (içinde kimlik bilgisi olabilir) sunucuda kalmaz
      return { status: 'delivered', payload };
    },

    sweep() {
      for (const mac of sessions.keys()) live(mac);
    },
  };
}
