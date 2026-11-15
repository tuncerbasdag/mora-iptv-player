import { activeConnection } from './connections.ts';
import type { EpgService } from './epgService.ts';
import type { PlaylistPort } from './playlistService.ts';
import type { SettingsStore } from './storage.ts';
import type { Settings } from './types.ts';
import { xtreamEpgUrl } from './xtream.ts';

/**
 * Decides when and from which URL the program guide should be loaded: if EPG is enabled in
 * settings, prefer the user's URL, then the one the playlist reports (`url-tvg`), and otherwise,
 * if the active connection is Xtream, the server's `xmltv.php` URL. Kept in one place so
 * platforms don't each reimplement this logic.
 */
export class EpgCoordinator {
  private detectedUrl: string | undefined;
  /** The last loaded/in-progress URL: the guide (which can be large) isn't re-downloaded for the same URL. */
  private requestedUrl: string | null = null;

  private readonly storage: Pick<SettingsStore, 'getSettings'>;
  private readonly epg: Pick<EpgService, 'load'>;

  constructor(storage: Pick<SettingsStore, 'getSettings'>, epg: Pick<EpgService, 'load'>) {
    this.storage = storage;
    this.epg = epg;
  }

  /** Listens for the EPG URL coming from the playlist and for active-connection changes. The returned function stops listening. */
  attach(playlist: Pick<PlaylistPort, 'on'>): () => void {
    return playlist.on((e) => {
      if (e.type === 'epg-url-detected') {
        this.detectedUrl = e.url;
        this.reload();
      } else if (e.type === 'library-loaded') {
        this.reload(); // the active connection may have changed (the Xtream URL depends on the connection)
      }
    });
  }

  /** (Re)loads the guide according to settings; does nothing if it's disabled or there's no URL. */
  reload(): void {
    const settings = this.storage.getSettings();
    if (!settings.epgEnabled) return;
    const url = this.resolveUrl(settings);
    if (!url || url === this.requestedUrl) return;
    this.requestedUrl = url;
    this.epg.load(url).catch((err) => {
      this.requestedUrl = null; // failed: retry on the next attempt
      console.warn('[epg] rehber yüklenemedi', err);
    });
  }

  private resolveUrl(settings: Settings): string | null {
    if (settings.epgUrl) return settings.epgUrl;
    if (this.detectedUrl) return this.detectedUrl;
    const source = activeConnection(settings)?.source;
    return source?.kind === 'xtream' ? xtreamEpgUrl(source) : null;
  }
}
