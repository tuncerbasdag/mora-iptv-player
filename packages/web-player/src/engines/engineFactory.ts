import { HlsEngine } from './hlsEngine.ts';
import { MpegtsEngine } from './mpegtsEngine.ts';
import { NativeEngine } from './nativeEngine.ts';
import type { EngineEmit, PlaybackEngine } from './playbackEngine.ts';

/**
 * Xtream/M3U providers commonly serve live channels as `http://host/user/pass/12345` (no extension) and answer with a raw
 * MPEG-TS stream. hls.js cannot parse that (it expects a playlist) and loops reconnecting, so an extensionless path is treated as TS.
 */
const hasExtension = (url: string): boolean => /\.[a-z0-9]{2,5}$/i.test(url.split(/[?#]/)[0]!.split('/').pop() ?? '');
const isTs = (url: string): boolean => /\.ts(\?|#|$)/i.test(url) || !hasExtension(url);
const isM3u8 = (url: string): boolean => /\.m3u8(\?|#|$)/i.test(url);

/**
 * Engine selection for live streams (Factory): .ts -> mpegts.js; hls.js on browsers with MSE support;
 * otherwise native HLS (Safari). `originalUrl` determines the type, `playUrl` (which may be proxied) gets loaded.
 */
export function createLiveEngine(video: HTMLVideoElement, emit: EngineEmit, originalUrl: string, playUrl: string): PlaybackEngine {
  if (isTs(originalUrl)) return new MpegtsEngine(video, emit, playUrl);
  if (HlsEngine.isSupported()) return new HlsEngine(video, emit, playUrl, { kind: 'live' });
  if (video.canPlayType('application/vnd.apple.mpegurl')) return new NativeEngine(video, emit, playUrl);
  throw new Error('Bu tarayıcı canlı yayın oynatmayı desteklemiyor.');
}

/** Engine selection for movies/series: HLS -> hls.js (for audio/subtitle tracks); MP4/MKV etc. -> plain `<video>`. */
export function createVodEngine(video: HTMLVideoElement, emit: EngineEmit, originalUrl: string, playUrl: string, resumeSeconds: number): PlaybackEngine {
  if (isM3u8(originalUrl) && HlsEngine.isSupported()) return new HlsEngine(video, emit, playUrl, { kind: 'vod', resumeSeconds });
  return new NativeEngine(video, emit, playUrl, resumeSeconds);
}
