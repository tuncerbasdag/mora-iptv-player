const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "1s 07dk" — hours+minutes from a total number of minutes. */
function hoursMinutes(totalMinutes: number): string {
  return `${Math.floor(totalMinutes / 60)}s ${pad2(totalMinutes % 60)}dk`;
}

/** Player clock: "04:07" / "1:04:07". */
export function clock(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(t % 60)}` : `${pad2(m)}:${pad2(t % 60)}`;
}

/** Duration formatted as "1s 44dk" / "52dk"; empty if there's no duration. */
export function runtimeLabel(sec: number | undefined): string {
  if (!sec || sec <= 0) return '';
  const min = Math.round(sec / 60);
  return min < 60 ? `${Math.max(1, min)}dk` : hoursMinutes(min);
}

/** "1s 07dk kaldı" / "14 dk kaldı" (remaining time). */
export function formatRemaining(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins >= 60 ? `${hoursMinutes(mins)} kaldı` : `${mins} dk kaldı`;
}
