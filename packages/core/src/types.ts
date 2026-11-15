export type ContentKind = 'live' | 'movie' | 'series';

/** The raw form of a single M3U entry. */
export interface M3UEntry {
  name: string;
  url: string;
  attrs: Record<string, string>; // tvg-id, tvg-logo, group-title ...
  duration: number;
}

export interface EpisodeInfo {
  show: string;
  season: number;
  episode: number;
}

export interface MediaItem {
  /** An identifier that stays stable even when the list is refreshed (for favorites / resume position). */
  id: string;
  name: string;
  url: string;
  logo?: string;
  group: string;
  tvgId?: string;
  kind: ContentKind;
  episode?: EpisodeInfo;
  /** Duration reported by the provider (seconds): the M3U `#EXTINF` duration (if >0). Undefined otherwise; the "By duration" sort appears only when this is present. */
  durationSec?: number;
  /** Added timestamp reported by the provider (epoch ms): the M3U `added`/`tvg-added` attribute, or the Xtream API's `added`. Undefined otherwise. */
  addedAt?: number;
}

export interface Category<T> {
  name: string;
  items: T[];
  /** Parental lock: the category appears in the list but its content stays empty until the PIN is entered (see parental.ts). */
  locked?: boolean;
}

export interface Season {
  number: number;
  episodes: MediaItem[];
}

export interface Show {
  id: string;
  title: string;
  logo?: string;
  seasons: Season[];
  /** The show's added/updated timestamp (epoch ms), from the newest episode or Xtream's `last_modified`; undefined if the provider doesn't report it. */
  addedAt?: number;
}

export interface Library {
  live: Category<MediaItem>[];
  movies: Category<MediaItem>[];
  series: Category<Show>[];
  counts: { live: number; movies: number; series: number; episodes: number };
}

/** How the user entered their playlistUrl — so the correct form can be shown again when the Settings screen is reopened. */
export type PlaylistSource =
  | { kind: 'm3u'; url: string }
  | { kind: 'xtream'; server: string; username: string; password: string; mac?: string };

/**
 * Theme options (in list order): `default` (Default, orange accent), `theme6` (Theme 1: red-white), `theme2` (Theme 2: maroon-blue,
 * white accent, gradient cards), `theme3` (Theme 3: black-white), `theme4` (Theme 4: navy-yellow), `theme5` (Theme 5: red-yellow).
 * The code identifiers stay fixed for stored settings; the names shown on screen are in `THEME_CARDS` in `settings.ts`.
 * The colors live in the `:root` and `:root[data-theme="…"]` variables in `styles.css`.
 */
export type ThemeId = 'default' | 'theme2' | 'theme3' | 'theme4' | 'theme5' | 'theme6';
export const THEME_IDS: ThemeId[] = ['default', 'theme2', 'theme3', 'theme4', 'theme5', 'theme6'];

/** UI language. Currently only Turkish can be selected; 'en' is shown as "Coming soon" in the UI (see ui/src/languages.ts). */
export type LanguageId = 'tr' | 'en';
export const LANGUAGE_IDS: LanguageId[] = ['tr', 'en'];

export type SubtitleSize = 'small' | 'medium' | 'large' | 'xlarge';
export const SUBTITLE_SIZES: SubtitleSize[] = ['small', 'medium', 'large', 'xlarge'];

export type SubtitleColor = 'white' | 'yellow' | 'cyan' | 'lightgreen';
export const SUBTITLE_COLORS: SubtitleColor[] = ['white', 'yellow', 'cyan', 'lightgreen'];

export type SubtitleBackground = 'none' | 'translucent' | 'opaque';
export const SUBTITLE_BACKGROUNDS: SubtitleBackground[] = ['none', 'translucent', 'opaque'];

export type SubtitlePosition = 'bottom' | 'middle-bottom' | 'top';
export const SUBTITLE_POSITIONS: SubtitlePosition[] = ['bottom', 'middle-bottom', 'top'];

/** Subtitle appearance: changed from the Settings > Subtitles page, applied the same way in both
 * Tizen (AVPlay) and web (hls.js) playback (see ui/src/subtitleStyle.ts). */
export interface SubtitleStyle {
  size: SubtitleSize;
  color: SubtitleColor;
  background: SubtitleBackground;
  position: SubtitlePosition;
}

/**
 * A channel-list connection the user has added (an M3U URL or an Xtream account).
 * Only one is active at a time (`Settings.activeConnectionId`); the app shows only the active
 * connection's data. Each connection's library is cached separately.
 */
export interface Connection {
  id: string;
  name: string;
  /** How it was entered (so the edit form can be shown correctly). */
  source: PlaylistSource;
  /** The actual URL that gets downloaded (the M3U URL, or the get.php generated from Xtream credentials). */
  url: string;
  addedAt: number; // epoch ms
  lastUpdated: number | null; // epoch ms
  lastHash: string | null;
  /** Result of the last refresh: 'ok' connected, 'error' connection error, 'none' not yet attempted. */
  status: 'ok' | 'error' | 'none';
  /** Content counts from the last successful refresh ("Connected · 128 channels"); also shown for inactive connections. */
  counts: Library['counts'] | null;
}

/**
 * Parental lock. The PIN is stored only on this device, as a salted hash; it is never sent to any server.
 * If `pinHash` is null, the default PIN (0000) applies.
 */
export interface ParentalSettings {
  enabled: boolean;
  pinSalt: string;
  pinHash: string | null;
  /** Categories whose name suggests adult content ("XXX", "+18"...) get locked. */
  lockAdult: boolean;
  /** Asks for the PIN when entering Settings. */
  lockSettings: boolean;
  /** Category names chosen by the user (regardless of Live/Movie/Series). */
  lockedCategories: string[];
}

export interface Settings {
  connections: Connection[];
  /** The active connection's id; null if none is active. */
  activeConnectionId: string | null;
  autoRefreshOnStart: boolean;
  /** Whether the program guide (EPG) is enabled. When disabled, epgUrl is never downloaded even if set. */
  epgEnabled: boolean;
  /** The XMLTV URL — if empty, the M3U's #EXTM3U url-tvg/x-tvg-url is tried instead (see playlistService.ts). */
  epgUrl: string;
  theme: ThemeId;
  language: LanguageId;
  parental: ParentalSettings;
  /** If this setting has never been changed, it must look exactly like today's fixed `.vod-caption` CSS (see DEFAULT_SETTINGS). */
  subtitleStyle: SubtitleStyle;
}

export const DEFAULT_SETTINGS: Settings = {
  connections: [],
  activeConnectionId: null,
  autoRefreshOnStart: true,
  epgEnabled: false,
  epgUrl: '',
  theme: 'default',
  language: 'tr',
  parental: { enabled: false, pinSalt: '', pinHash: null, lockAdult: true, lockSettings: false, lockedCategories: [] },
  subtitleStyle: { size: 'medium', color: 'white', background: 'none', position: 'bottom' },
};
