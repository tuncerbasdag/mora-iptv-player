/**
 * Checks whether an account on an Xtream-based provider is already in use on another device.
 * Providers cap concurrent connections (max_connections) and block accounts that exceed it, so
 * before opening a stream we read active_cons / max_connections from the `player_api.php`
 * response. This request is not itself a stream connection.
 */

/** Derives the account-info URL from the playlist URL (e.g. get.php?username=..&password=..); null if it can't. */
export function accountApiUrl(playlistUrl: string): string | null {
  try {
    const u = new URL(playlistUrl);
    const username = u.searchParams.get('username');
    const password = u.searchParams.get('password');
    if (!username || !password) return null;
    const api = new URL('/player_api.php', u.origin);
    api.searchParams.set('username', username);
    api.searchParams.set('password', password);
    return api.toString();
  } catch {
    return null;
  }
}

export interface AccountStatus {
  status: string | null;
  maxConnections: number | null;
  activeConnections: number | null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return v !== null && v !== '' && v !== undefined && Number.isFinite(n) ? n : null;
}

/** Converts a `player_api.php` response (numbers often arrive as strings) into an AccountStatus. */
export function parseAccountStatus(json: unknown): AccountStatus | null {
  const info = (json as { user_info?: Record<string, unknown> } | null)?.user_info;
  if (!info || typeof info !== 'object') return null;
  return {
    status: typeof info.status === 'string' ? info.status : null,
    maxConnections: num(info.max_connections),
    activeConnections: num(info.active_cons),
  };
}

/**
 * Returns the message to show the user if the stream must not be opened, or null if it's clear.
 * If the info can't be obtained (non-Xtream playlist, network error, unexpected response) playback
 * is not blocked: it would be wrong to stop the viewer over a condition we can't verify.
 */
export async function checkAccountBlock(fetchText: (url: string) => Promise<string>, playlistUrl: string): Promise<string | null> {
  const api = accountApiUrl(playlistUrl);
  if (!api) return null;
  let status: AccountStatus | null;
  try {
    status = parseAccountStatus(JSON.parse(await fetchText(api)));
  } catch {
    return null;
  }
  if (!status) return null;
  if (status.status && status.status.toLowerCase() !== 'active') {
    return `Hesap etkin değil (${status.status}). Sağlayıcınla iletişime geç.`;
  }
  const { maxConnections: max, activeConnections: active } = status;
  if (max !== null && active !== null && max > 0 && active >= max) {
    return `Hesap başka bir cihazda kullanılıyor (${active}/${max} bağlantı). Yayın açmak hesabın engellenmesine yol açabilir; diğer cihazı kapatıp tekrar dene.`;
  }
  return null;
}
