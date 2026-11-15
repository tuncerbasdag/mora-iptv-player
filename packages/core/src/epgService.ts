import { parseXmltv, type EpgProgram } from './epg.ts';
import type { FetchText } from './playlistService.ts';

/**
 * Downloads XMLTV and indexes it by channelId. Kept in memory (for the session's lifetime) —
 * since EPG data is both large and time-dependent, persisting it in IndexedDB was deemed
 * unnecessary for now; it's re-downloaded on every startup (if epgEnabled + epgUrl are set).
 */
export class EpgService {
  private byChannel = new Map<string, EpgProgram[]>();
  private loaded = false;
  private readonly fetchText: FetchText;

  constructor(fetchText: FetchText) {
    this.fetchText = fetchText;
  }

  async load(url: string): Promise<void> {
    const xml = await this.fetchText(url);
    const programs = parseXmltv(xml);
    this.byChannel.clear();
    for (const p of programs) {
      let arr = this.byChannel.get(p.channelId);
      if (!arr) this.byChannel.set(p.channelId, (arr = []));
      arr.push(p);
    }
    for (const arr of this.byChannel.values()) arr.sort((a, b) => a.start - b.start);
    this.loaded = true;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getPrograms(channelId: string): EpgProgram[] {
    return this.byChannel.get(channelId) ?? [];
  }

  getCurrentProgram(channelId: string, now = Date.now()): EpgProgram | undefined {
    return this.getPrograms(channelId).find((p) => p.start <= now && now < p.stop);
  }
}
