/** Minimal shape we need of `TextTrack.activeCues` (DOM `TextTrackCueList`, not testable). */
export interface SimpleCue {
  text: string;
  startTime: number;
  endTime: number;
}

/**
 * Converts active cues into the same shape (`text`, `durationMs`) as AVPlay's `'subtitle'` event. If there are
 * multiple simultaneous cues (rare: overlapping dialogue), lines are joined with `\n`. If there are no active cues, returns empty text (clear).
 */
export function activeCuesToSubtitleEvent(cues: SimpleCue[] | null | undefined): { text: string; durationMs: number } {
  if (!cues || cues.length === 0) return { text: '', durationMs: 0 };
  const text = cues.map((c) => c.text).join('\n');
  const durationMs = Math.max(...cues.map((c) => (c.endTime - c.startTime) * 1000));
  return { text, durationMs: Math.max(500, durationMs) };
}
