/** Tizen remote key codes (in the browser the `e.key` name is enough; on the TV only `keyCode` is provided). */
const TIZEN_BACK = 10009;
const TIZEN_BLUE = 406; // ColorF3Blue
const TIZEN_MEDIA_PLAY = 415;
const TIZEN_GREEN = 404; // ColorF1Green
const TIZEN_INFO = 457; // Info
const TIZEN_CHANNEL_UP = 427;
const TIZEN_CHANNEL_DOWN = 428;
const TIZEN_MEDIA_PAUSE = 19;
const TIZEN_MEDIA_PLAY_PAUSE = 10252;

/** Back: Esc / Backspace / Tizen Back. */
export function isBackKey(e: KeyboardEvent): boolean {
  return e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === TIZEN_BACK;
}

/** Favorite: F on the keyboard, Blue key on the remote. */
export function isFavoriteKey(e: KeyboardEvent): boolean {
  return e.key.toLowerCase() === 'f' || e.keyCode === TIZEN_BLUE;
}

/** CH+ / CH- on the remote: next (+1) / previous (-1) channel; null otherwise. */
export function channelStepOf(e: KeyboardEvent): 1 | -1 | null {
  if (e.keyCode === TIZEN_CHANNEL_UP || e.key === 'ChannelUp') return 1;
  if (e.keyCode === TIZEN_CHANNEL_DOWN || e.key === 'ChannelDown') return -1;
  return null;
}

/** Diagnostics panel (buffer, dropped frames, engine): Info or Green key on the remote, "I" on the keyboard. */
export function isDiagnosticsKey(e: KeyboardEvent): boolean {
  return e.keyCode === TIZEN_INFO || e.keyCode === TIZEN_GREEN || e.key === 'Info' || e.key === 'ColorF1Green' || e.key.toLowerCase() === 'i';
}

export type MediaKey = 'play' | 'pause' | 'toggle';

/** Media key (Play / Pause / Play-Pause); null otherwise. */
export function mediaKeyOf(e: KeyboardEvent): MediaKey | null {
  if (e.keyCode === TIZEN_MEDIA_PLAY || e.key === 'MediaPlay') return 'play';
  if (e.keyCode === TIZEN_MEDIA_PAUSE || e.key === 'MediaPause') return 'pause';
  if (e.keyCode === TIZEN_MEDIA_PLAY_PAUSE || e.key === 'MediaPlayPause') return 'toggle';
  return null;
}
