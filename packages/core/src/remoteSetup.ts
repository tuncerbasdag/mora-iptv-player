/** Client side of the remote playlist-setup portal (see portal/). */

export interface RemoteSetupSession {
  mac: string;
  pin: string;
  secret: string;
  expiresAt: number;
}

export interface RemotePayload {
  url: string;
  name?: string;
}

export type RemotePoll =
  | { status: 'waiting' }
  | { status: 'expired' }
  | { status: 'delivered'; payload: RemotePayload };

/** Config the platform's main.ts hands to the app: portal URL + this device's MAC address. */
export interface RemoteSetupConfig {
  portalUrl: string;
  /** The real MAC on Tizen; a persistently generated identifier on web. */
  getDeviceMac: () => Promise<string> | string;
}

/** Random, locally-administered (first byte 02) MAC-like device identifier: "02:3F:A1:...". */
export function generateDeviceMac(random: () => number = Math.random): string {
  const bytes = [0x02];
  for (let i = 0; i < 5; i++) bytes.push(Math.floor(random() * 256));
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

type FetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export class RemoteSetupClient {
  private readonly base: string;
  private readonly fetchFn: FetchFn;

  constructor(portalUrl: string, fetchFn: FetchFn = (url, init) => fetch(url, init)) {
    this.base = portalUrl.replace(/\/+$/, '');
    this.fetchFn = fetchFn;
  }

  async register(mac: string): Promise<RemoteSetupSession> {
    const res = await this.fetchFn(`${this.base}/api/device/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mac }),
    });
    if (!res.ok) throw new Error('Portal oturumu açılamadı');
    return (await res.json()) as RemoteSetupSession;
  }

  async poll(mac: string, secret: string): Promise<RemotePoll> {
    const res = await this.fetchFn(`${this.base}/api/device/poll?mac=${encodeURIComponent(mac)}`, {
      headers: { 'x-device-secret': secret },
    });
    if (!res.ok) throw new Error('Portal yanıt vermedi');
    return (await res.json()) as RemotePoll;
  }
}

/** The small surface of a key-value store needed for the device identifier (localStorage-compatible). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DEVICE_MAC_KEY = 'iptv.deviceMac';

/** Persistent device identifier: returns the stored one if present; otherwise generates and stores it (shared between web and the Tizen fallback). */
export function getOrCreateDeviceMac(store: KeyValueStore, random?: () => number): string {
  let mac = store.getItem(DEVICE_MAC_KEY);
  if (!mac) {
    mac = generateDeviceMac(random);
    store.setItem(DEVICE_MAC_KEY, mac);
  }
  return mac;
}
