export interface XtreamCredentials {
  server: string;
  username: string;
  password: string;
  mac?: string;
}

/**
 * Builds the standard M3U endpoint for the Xtream Codes API. If the server address is entered
 * without a protocol, `http://` is assumed, and a trailing `/` is stripped. If `mac` is given,
 * it is added as an extra query parameter so some panels can lock the device to that MAC address.
 */
export function buildXtreamUrl(creds: XtreamCredentials): string {
  const server = normalizeServer(creds.server);
  const params = new URLSearchParams({
    username: creds.username,
    password: creds.password,
    type: 'm3u_plus',
    output: 'ts',
  });
  if (creds.mac) params.set('mac', creds.mac);
  return `${server}/get.php?${params.toString()}`;
}

/** Xtream `player_api.php` URL (e.g. action=get_vod_streams). */
export function xtreamApiUrl(creds: XtreamCredentials, action: string): string {
  const params = new URLSearchParams({ username: creds.username, password: creds.password, action });
  return `${normalizeServer(creds.server)}/player_api.php?${params.toString()}`;
}

/** Xtream XMLTV (program guide) URL: `xmltv.php`. The provider's channel ids are matched against the `tvg-id` in the playlist. */
export function xtreamEpgUrl(creds: XtreamCredentials): string {
  const params = new URLSearchParams({ username: creds.username, password: creds.password });
  return `${normalizeServer(creds.server)}/xmltv.php?${params.toString()}`;
}

function normalizeServer(server: string): string {
  const trimmed = server.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}
