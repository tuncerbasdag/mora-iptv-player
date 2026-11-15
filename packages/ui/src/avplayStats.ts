import { codecLabel, type PlayerStats } from './playerAdapter.ts';

/** An AVPlay `getCurrentStreamInfo()` entry; `extra_info` is a JSON string. */
export interface AvplayStreamInfo {
  index?: number;
  type?: string;
  extra_info?: string;
}

function parseExtra(info: AvplayStreamInfo | undefined): Record<string, string> {
  if (!info?.extra_info) return {};
  try {
    const raw = JSON.parse(info.extra_info) as Record<string, unknown>;
    // Lowercased because key casing (Width/width, Bit_rate/bit_rate) can vary by device.
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) out[k.toLowerCase()] = String(v).trim();
    return out;
  } catch {
    return {};
  }
}

function positive(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Converts AVPlay stream info (per the sample format in the Samsung docs: fourCC/Width/Height/Bit_rate for
 * video, fourCC/bit_rate for audio, etc.) into PlayerStats. If `bandwidthBps` (CURRENT_BANDWIDTH) is given,
 * it's preferred for the bit rate. Returns null if there's no resolution. Since the field names haven't been
 * verified on the TV, any missing/malformed value falls back to null and this never throws.
 */
export function parseAvplayStats(infos: AvplayStreamInfo[] | null | undefined, bandwidthBps?: number | null): PlayerStats | null {
  const list = Array.isArray(infos) ? infos : [];
  const video = parseExtra(list.find((i) => String(i?.type).toUpperCase() === 'VIDEO'));
  const audio = parseExtra(list.find((i) => String(i?.type).toUpperCase() === 'AUDIO'));
  const width = positive(video.width);
  const height = positive(video.height);
  if (!width || !height) return null;
  const bps = bandwidthBps && bandwidthBps > 0 ? bandwidthBps : positive(video.bit_rate ?? video.bitrate);
  const fps = positive(video.framerate ?? video.frame_rate ?? video.fps);
  return {
    width,
    height,
    kbps: bps ? Math.round(bps / 1000) : null,
    fps: fps && fps <= 240 ? Math.round(fps) : null,
    codec: codecLabel(video.fourcc ?? video.codec, audio.fourcc ?? audio.codec),
  };
}
