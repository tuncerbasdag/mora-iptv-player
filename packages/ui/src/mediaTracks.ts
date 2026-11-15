/** Audio / subtitle track: `id` is a player-specific selection key (track index in AVPlay, array order on web). */
export interface MediaTrack {
  id: number;
  /** "Turkish", "English", or "Track 2" if the language is unknown. */
  label: string;
  /** Extra info like "Stereo", "5.1"; empty if none. */
  detail?: string;
}

const LANGUAGES: Record<string, string> = {
  tr: 'Türkçe', tur: 'Türkçe',
  en: 'İngilizce', eng: 'İngilizce',
  de: 'Almanca', ger: 'Almanca', deu: 'Almanca',
  fr: 'Fransızca', fre: 'Fransızca', fra: 'Fransızca',
  es: 'İspanyolca', spa: 'İspanyolca',
  it: 'İtalyanca', ita: 'İtalyanca',
  ru: 'Rusça', rus: 'Rusça',
  ar: 'Arapça', ara: 'Arapça',
  fa: 'Farsça', per: 'Farsça', fas: 'Farsça',
  nl: 'Felemenkçe', dut: 'Felemenkçe', nld: 'Felemenkçe',
  pt: 'Portekizce', por: 'Portekizce',
  pl: 'Lehçe', pol: 'Lehçe',
  ja: 'Japonca', jpn: 'Japonca',
  ko: 'Korece', kor: 'Korece',
  zh: 'Çince', chi: 'Çince', zho: 'Çince',
  hi: 'Hintçe', hin: 'Hintçe',
  el: 'Yunanca', gre: 'Yunanca', ell: 'Yunanca',
  bg: 'Bulgarca', bul: 'Bulgarca',
  ro: 'Rumence', rum: 'Rumence', ron: 'Rumence',
  sv: 'İsveççe', swe: 'İsveççe',
  uk: 'Ukraynaca', ukr: 'Ukraynaca',
  sq: 'Arnavutça', alb: 'Arnavutça', sqi: 'Arnavutça',
  ku: 'Kürtçe', kur: 'Kürtçe',
};

/** Converts an ISO 639-1/2 language code to its Turkish name; returns the code itself (uppercased) if unknown, or null if empty. */
export function languageName(code: string | null | undefined): string | null {
  const c = (code ?? '').trim().toLowerCase();
  if (!c || c === 'und' || c === 'unk' || c === 'zxx') return null;
  return LANGUAGES[c] ?? LANGUAGES[c.split(/[-_]/)[0]] ?? c.toUpperCase();
}

/** Converts the channel count to a display name: 1 Mono, 2 Stereo, 6 5.1, 8 7.1. */
export function channelLabel(channels: number | string | null | undefined): string {
  const n = Number(channels);
  if (!n) return '';
  return n === 1 ? 'Mono' : n === 2 ? 'Stereo' : n === 6 ? '5.1' : n === 8 ? '7.1' : `${n} kanal`;
}

/** AVPlay `getTotalTrackInfo()` item (field names per Samsung docs; not verified on a real TV). */
export interface AvplayTrackInfo {
  index: number;
  type: string;
  extra_info?: string;
}

function parseExtra(extra: string | undefined): Record<string, unknown> {
  if (!extra) return {};
  try {
    const v = JSON.parse(extra);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Splits the AVPlay track list into audio and text; labels come from the language name, and multiple tracks of the same language are numbered. */
export function parseAvplayTracks(info: AvplayTrackInfo[] | null | undefined): { audio: MediaTrack[]; text: MediaTrack[] } {
  const build = (type: 'AUDIO' | 'TEXT'): MediaTrack[] => {
    const tracks = (info ?? []).filter((t) => t.type === type);
    const labels = tracks.map((t, i) => {
      const x = parseExtra(t.extra_info);
      const lang = languageName((x.language ?? x.track_lang) as string | undefined);
      return { t, x, name: lang ?? `Parça ${i + 1}` };
    });
    const total = new Map<string, number>();
    for (const l of labels) total.set(l.name, (total.get(l.name) ?? 0) + 1);
    const seen = new Map<string, number>();
    return labels.map(({ t, x, name }) => {
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      const channels = type === 'AUDIO' ? channelLabel(x.channels as string | number | undefined) : '';
      return { id: t.index, label: (total.get(name) ?? 1) > 1 ? `${name} ${n}` : name, detail: channels || undefined };
    });
  };
  return { audio: build('AUDIO'), text: build('TEXT') };
}
