import { activeConnection, connectionUrl, createConnection } from './connections.ts';
import { hash } from './hash.ts';
import { buildLibrary } from './library.ts';
import { extractTvgUrl, parseM3U } from './m3u.ts';
import { xtreamApiUrl } from './xtream.ts';
import { applyXtreamAdded, parseXtreamSeriesAdded, parseXtreamVodAdded } from './xtreamMeta.ts';
import type { SettingsStore, LibraryStore } from './storage.ts';
import type { Connection, Library, PlaylistSource, Settings } from './types.ts';

/** Incremented whenever classification/parsing rules change; invalidates the cached library. */
const PARSER_VERSION = 5;

export type PlaylistEvent =
  /** The active connection's library was loaded/changed (also fires when the active connection changes; null = no data). */
  | { type: 'library-loaded'; library: Library | null }
  /** The following three events are only for refreshing the ACTIVE connection. */
  | { type: 'refresh-start' }
  | { type: 'refresh-success'; library: Library; changed: boolean }
  | { type: 'refresh-error'; message: string }
  /** The connection list, active status, or a connection's status/counts changed (for the Settings list). */
  | { type: 'connections-changed' }
  /** Fired when url-tvg/x-tvg-url is found in the M3U's #EXTM3U header — the decision (whether to use it) is left to the caller. */
  | { type: 'epg-url-detected'; url: string };

export type FetchText = (url: string) => Promise<string>;

/**
 * Manages connections (M3U URL / Xtream account), downloading, parsing, and the library cache.
 * Only ONE connection is active at a time, and `getLibrary()` returns only its data; inactive
 * connections' libraries stay in their own cache (opened instantly once activated).
 * Storage (SettingsStore & LibraryStore) and network access (fetchText) are injected from outside, so
 * web (fetch via proxy) and Tizen can each supply their own transport layer.
 */
/**
 * The playlist service's public contract: the UI layer (screens, app shell) depends on this
 * interface rather than the concrete class (Dependency Inversion); a fake implementation can be supplied in tests.
 */
export interface PlaylistPort {
  on(fn: (e: PlaylistEvent) => void): () => void;
  /** The active connection's library (null if there is no active connection or it hasn't loaded yet). */
  getLibrary(): Library | null;
  getSettings(): Settings;
  getConnections(): Connection[];
  getActiveConnection(): Connection | null;
  isRefreshing(id: string): boolean;
  init(): Promise<void>;
  /** Refreshes the active connection. */
  refresh(): Promise<void>;
  /** Refreshes a connection (active or inactive); concurrent calls share the same work. */
  refreshConnection(id: string): Promise<void>;
  refreshAll(): Promise<void>;
  /** Activates the connection: the previously active one becomes inactive. */
  activate(id: string): Promise<void>;
  addConnection(name: string, source: PlaylistSource): Connection;
  updateConnection(id: string, patch: { name?: string; source?: PlaylistSource }): Promise<void>;
  removeConnection(id: string): Promise<void>;
}

export class PlaylistService implements PlaylistPort {
  private library: Library | null = null;
  private readonly refreshing = new Map<string, Promise<void>>();
  private readonly listeners = new Set<(e: PlaylistEvent) => void>();
  private readonly storage: SettingsStore & LibraryStore;
  private readonly fetchText: FetchText;

  constructor(storage: SettingsStore & LibraryStore, fetchText: FetchText) {
    this.storage = storage;
    this.fetchText = fetchText;
  }

  on(fn: (e: PlaylistEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The active connection's library (null if there is no active connection or it hasn't loaded yet). */
  getLibrary(): Library | null {
    return this.library;
  }

  getSettings(): Settings {
    return this.storage.getSettings();
  }

  getConnections(): Connection[] {
    return this.storage.getSettings().connections;
  }

  getActiveConnection(): Connection | null {
    return activeConnection(this.storage.getSettings());
  }

  isRefreshing(id: string): boolean {
    return this.refreshing.has(id);
  }

  async init(): Promise<void> {
    const active = this.getActiveConnection();
    this.library = active ? await this.storage.loadLibrary(active.id) : null;
    this.emit({ type: 'library-loaded', library: this.library });
    if (active && this.storage.getSettings().autoRefreshOnStart) void this.refreshConnection(active.id);
  }

  /** Refreshes the active connection. */
  refresh(): Promise<void> {
    const active = this.getActiveConnection();
    if (!active) {
      this.emit({ type: 'refresh-error', message: 'Aktif bağlantı yok.' });
      return Promise.resolve();
    }
    return this.refreshConnection(active.id);
  }

  /** Refreshes a connection (active or inactive); concurrent calls share the same work. */
  refreshConnection(id: string): Promise<void> {
    let p = this.refreshing.get(id);
    if (!p) {
      p = this.doRefresh(id).finally(() => {
        this.refreshing.delete(id);
        this.emit({ type: 'connections-changed' });
      });
      this.refreshing.set(id, p);
      this.emit({ type: 'connections-changed' });
    }
    return p;
  }

  /** Refreshes all connections in sequence (the active one first). */
  async refreshAll(): Promise<void> {
    const { connections, activeConnectionId } = this.storage.getSettings();
    const ordered = [...connections].sort((a, b) => Number(b.id === activeConnectionId) - Number(a.id === activeConnectionId));
    for (const c of ordered) await this.refreshConnection(c.id);
  }

  /** Activates the connection: the previously active one becomes inactive, and the app shows only this connection's data. */
  async activate(id: string): Promise<void> {
    const settings = this.storage.getSettings();
    if (!settings.connections.some((c) => c.id === id)) return;
    this.storage.setSettings({ ...settings, activeConnectionId: id });
    this.library = await this.storage.loadLibrary(id);
    this.emit({ type: 'library-loaded', library: this.library });
    this.emit({ type: 'connections-changed' });
    void this.refreshConnection(id); // shown immediately if cached, updated in the background
  }

  /** Adds a new connection; if there is no active connection, this one becomes active. The list is downloaded in the background. */
  addConnection(name: string, source: PlaylistSource): Connection {
    const settings = this.storage.getSettings();
    const connection = createConnection(name, source);
    const becomesActive = !activeConnection(settings);
    this.storage.setSettings({
      ...settings,
      connections: [...settings.connections, connection],
      activeConnectionId: becomesActive ? connection.id : settings.activeConnectionId,
    });
    if (becomesActive) {
      this.library = null;
      this.emit({ type: 'library-loaded', library: null });
    }
    this.emit({ type: 'connections-changed' });
    void this.refreshConnection(connection.id);
    return connection;
  }

  /** Updates the name and/or source; if the URL changes, the cache is discarded and the list is re-downloaded. */
  async updateConnection(id: string, patch: { name?: string; source?: PlaylistSource }): Promise<void> {
    const settings = this.storage.getSettings();
    const current = settings.connections.find((c) => c.id === id);
    if (!current) return;
    const source = patch.source ?? current.source;
    const url = connectionUrl(source);
    const urlChanged = url !== current.url;
    const next: Connection = {
      ...current,
      name: patch.name?.trim() || current.name,
      source,
      url,
      ...(urlChanged ? { lastHash: null, lastUpdated: null, status: 'none' as const, counts: null } : {}),
    };
    this.storage.setSettings({ ...settings, connections: settings.connections.map((c) => (c.id === id ? next : c)) });
    if (urlChanged) {
      await this.storage.deleteLibrary(id);
      if (settings.activeConnectionId === id) {
        this.library = null;
        this.emit({ type: 'library-loaded', library: null });
      }
      void this.refreshConnection(id);
    }
    this.emit({ type: 'connections-changed' });
  }

  /**
   * Deletes the connection and its cache. If the active one is deleted, the first remaining connection in
   * the list becomes active (if none remain, none becomes active and no data is shown).
   */
  async removeConnection(id: string): Promise<void> {
    const settings = this.storage.getSettings();
    const wasActive = settings.activeConnectionId === id;
    const remaining = settings.connections.filter((c) => c.id !== id);
    this.storage.setSettings({
      ...settings,
      connections: remaining,
      activeConnectionId: wasActive ? null : settings.activeConnectionId,
    });
    await this.storage.deleteLibrary(id);
    if (wasActive) {
      this.library = null;
      this.emit({ type: 'library-loaded', library: null });
    }
    this.emit({ type: 'connections-changed' });
    if (wasActive && remaining.length > 0) await this.activate(remaining[0].id);
  }

  /**
   * For an Xtream account, the provider's API returns movie/series added timestamps (not present in M3U): these
   * get recorded into the library for the "Recently added" sort. If the API doesn't respond or lacks the expected
   * field, this is silently skipped; the list is still usable.
   */
  private async enrichXtream(library: Library, source: Extract<PlaylistSource, { kind: 'xtream' }>): Promise<void> {
    const get = async (action: string): Promise<unknown> => {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('zaman aşımı')), 20_000));
      return JSON.parse(await Promise.race([this.fetchText(xtreamApiUrl(source, action)), timeout]));
    };
    try {
      const [vod, series] = await Promise.all([get('get_vod_streams').catch(() => null), get('get_series').catch(() => null)]);
      applyXtreamAdded(library, parseXtreamVodAdded(vod), parseXtreamSeriesAdded(series));
    } catch {
      /* if the info is unavailable, the sort option simply doesn't appear */
    }
  }

  /** Updates the connection record against the current settings (re-reads each time to avoid overwriting concurrent edits). */
  private patchConnection(id: string, patch: Partial<Connection>): void {
    const settings = this.storage.getSettings();
    if (!settings.connections.some((c) => c.id === id)) return;
    this.storage.setSettings({ ...settings, connections: settings.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  private async doRefresh(id: string): Promise<void> {
    const start = this.storage.getSettings().connections.find((c) => c.id === id);
    if (!start) return;
    const isActive = (): boolean => this.storage.getSettings().activeConnectionId === id;
    if (isActive()) this.emit({ type: 'refresh-start' });

    const fail = (message: string): void => {
      this.patchConnection(id, { status: 'error' });
      if (isActive()) this.emit({ type: 'refresh-error', message });
    };

    let text: string;
    try {
      text = await this.fetchText(start.url);
    } catch {
      fail('Liste indirilemedi.');
      return;
    }

    if (isActive()) {
      const tvgUrl = extractTvgUrl(text);
      if (tvgUrl) this.emit({ type: 'epg-url-detected', url: tvgUrl });
    }

    // When the parsing rules change (PARSER_VERSION), the list is re-parsed even if the content is unchanged.
    const newHash = `${hash(text)}:p${PARSER_VERSION}`;
    const cached = isActive() && this.library ? this.library : await this.storage.loadLibrary(id);
    const current = this.storage.getSettings().connections.find((c) => c.id === id);
    if (!current) return; // connection was deleted while the refresh was in progress
    if (newHash === current.lastHash && cached) {
      this.patchConnection(id, { lastUpdated: Date.now(), status: 'ok', counts: cached.counts });
      if (isActive()) this.emit({ type: 'refresh-success', library: cached, changed: false });
      return;
    }

    let library: Library;
    try {
      library = buildLibrary(parseM3U(text));
    } catch {
      fail('Liste ayrıştırılamadı.');
      return;
    }
    if (start.source.kind === 'xtream') await this.enrichXtream(library, start.source);

    // The connection may have been deleted while the refresh was in progress: in that case, don't write to the cache.
    if (!this.storage.getSettings().connections.some((c) => c.id === id)) return;
    await this.storage.saveLibrary(id, library);
    this.patchConnection(id, { lastHash: newHash, lastUpdated: Date.now(), status: 'ok', counts: library.counts });
    if (isActive()) {
      this.library = library;
      this.emit({ type: 'refresh-success', library, changed: true });
    }
  }

  private emit(e: PlaylistEvent): void {
    for (const fn of this.listeners) fn(e);
  }
}
