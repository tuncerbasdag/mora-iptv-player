import { buildXtreamUrl } from './xtream.ts';
import { DEFAULT_SETTINGS, LANGUAGE_IDS, SUBTITLE_BACKGROUNDS, SUBTITLE_COLORS, SUBTITLE_POSITIONS, SUBTITLE_SIZES, THEME_IDS, type Connection, type LanguageId, type PlaylistSource, type Settings, type ThemeId } from './types.ts';

/** Id of the connection migrated from the old single-connection version (the old library cache used the 'current' key). */
export const LEGACY_CONNECTION_ID = 'legacy';

export function activeConnection(settings: Settings): Connection | null {
  return settings.connections.find((c) => c.id === settings.activeConnectionId) ?? null;
}

/** The playlist URL to download for a connection source. */
export function connectionUrl(source: PlaylistSource): string {
  return source.kind === 'm3u' ? source.url : buildXtreamUrl(source);
}

export function newConnectionId(): string {
  return `c${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36)}`;
}

export function createConnection(name: string, source: PlaylistSource, now = Date.now()): Connection {
  return {
    id: newConnectionId(),
    name: name.trim(),
    source,
    url: connectionUrl(source),
    addedAt: now,
    lastUpdated: null,
    lastHash: null,
    status: 'none',
    counts: null,
  };
}

/** Short type label: "M3U listesi" / "Xtream kodu" (Turkish, shown in the UI). */
export function sourceLabel(source: PlaylistSource): string {
  return source.kind === 'm3u' ? 'M3U listesi' : 'Xtream kodu';
}

/**
 * Brings stored settings into the current shape. In the old single-connection version,
 * `playlistUrl` (plus `source`, `connectionName`, `lastHash`, ...) lived directly on settings:
 * those fields are converted into a single "active" connection and the legacy fields are dropped.
 */
export function migrateSettings(raw: Record<string, unknown>): Settings {
  const legacyKeys = ['playlistUrl', 'source', 'connectionName', 'addedAt', 'lastUpdated', 'lastHash'];
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS, ...raw };
  if (!Array.isArray(raw.connections)) {
    const url = typeof raw.playlistUrl === 'string' ? raw.playlistUrl : '';
    const connections: Connection[] = [];
    if (url) {
      const source = (raw.source as PlaylistSource | undefined) ?? { kind: 'm3u', url };
      const lastUpdated = typeof raw.lastUpdated === 'number' ? raw.lastUpdated : null;
      connections.push({
        id: LEGACY_CONNECTION_ID,
        name: typeof raw.connectionName === 'string' && raw.connectionName ? raw.connectionName : 'Ana Liste',
        source,
        url,
        addedAt: typeof raw.addedAt === 'number' ? raw.addedAt : Date.now(),
        lastUpdated,
        lastHash: typeof raw.lastHash === 'string' ? raw.lastHash : null,
        status: lastUpdated ? 'ok' : 'none',
        counts: null,
      });
    }
    merged.connections = connections;
    merged.activeConnectionId = connections[0]?.id ?? null;
  }
  // An unrecognized theme (old 'theme1' placeholder, etc.) falls back to the default.
  if (!THEME_IDS.includes(merged.theme as ThemeId)) merged.theme = DEFAULT_SETTINGS.theme;
  // An unrecognized language falls back to the default.
  if (!LANGUAGE_IDS.includes(merged.language as LanguageId)) merged.language = DEFAULT_SETTINGS.language;
  merged.parental = { ...DEFAULT_SETTINGS.parental, ...(raw.parental as object | undefined) };
  merged.subtitleStyle = { ...DEFAULT_SETTINGS.subtitleStyle, ...(raw.subtitleStyle as object | undefined) };
  // Unrecognized subtitle style values (corrupted/old record) fall back to the default per field — so subtitleStyleCss() doesn't break.
  const sub = merged.subtitleStyle as Settings['subtitleStyle'];
  if (!SUBTITLE_SIZES.includes(sub.size)) sub.size = DEFAULT_SETTINGS.subtitleStyle.size;
  if (!SUBTITLE_COLORS.includes(sub.color)) sub.color = DEFAULT_SETTINGS.subtitleStyle.color;
  if (!SUBTITLE_BACKGROUNDS.includes(sub.background)) sub.background = DEFAULT_SETTINGS.subtitleStyle.background;
  if (!SUBTITLE_POSITIONS.includes(sub.position)) sub.position = DEFAULT_SETTINGS.subtitleStyle.position;
  for (const k of legacyKeys) delete merged[k];
  return merged as unknown as Settings;
}
