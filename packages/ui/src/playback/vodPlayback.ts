import type { MediaItem } from '../../../core/src/types.ts';
import { isPendingTrackCapable, tracksOf } from '../playerAdapter.ts';
import { StreamBlockedError } from '../singleStream.ts';
import { PlaybackSession } from './playbackSession.ts';
import { VOD_MAX_RETRIES, WATCHED_RATIO, type PlaybackHost } from './playbackTypes.ts';

const PROGRESS_SAVE_EVERY_MS = 5000;

/**
 * Movie/show session: resume position + "Continue watching", scrubbing, automatic retry from the
 * current position if it fails to open/drops, and a manual retry if all of those fail too.
 */
export class VodPlayback extends PlaybackSession {
  private attempt = 0;
  private resumeSeconds = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastProgressSaveAt = 0;
  private playStartRegistered = false;

  constructor(host: PlaybackHost, item: MediaItem) {
    super(host, item);
    // If the buffer doesn't fill back up for too long while playing, the stream is considered dropped and retried.
    this.buffering.onStall = () => this.onFailure();
  }

  override get seekable(): boolean {
    return true;
  }

  async start(): Promise<void> {
    const { host, item } = this;
    const { adapter, storage } = host;
    host.setState({ status: 'loading' });
    // Content that's nearly finished or already watched (>= 95%) starts over from the beginning.
    const progress = storage.getProgress(item.id);
    const finished = !!progress && progress.duration > 0 && progress.seconds / progress.duration >= WATCHED_RATIO;
    this.resumeSeconds = finished ? 0 : storage.getResume(item.id);

    this.unsubs.push(
      adapter.on('playing', () => {
        this.clearLoadTimeout();
        this.attempt = 0; // playing successfully: the next drop starts with a fresh set of retries
        this.registerPlayStart();
        host.setState({ status: 'playing' });
      }),
      adapter.on('timeupdate', () => this.saveProgress(false)),
      adapter.on('ended', () => {
        // Finished: mark as "watched" (duration = position); starts over from the beginning next time.
        const d = adapter.getDuration();
        storage.setResume(item.id, d > 0 ? d : 0, d);
        host.setState({ status: 'ended' });
      }),
      adapter.on('error', () => this.onFailure()),
      ...this.buffering.listen(),
    );
    this.startLoadTimeout(() => this.onFailure());

    try {
      await adapter.loadVod(item.url, this.resumeSeconds);
    } catch (err) {
      this.handleLoadError(err);
    }
  }

  /**
   * When the audio/subtitle track changes: playback is paused first, reloaded from the current position
   * with the selected tracks (a live mid-stream switch — setAudioTrack/setSubtitleTrack — caused audio/video
   * glitches or spurious "error" events on some devices), and resumes seamlessly once the reload finishes.
   * The status stays out of 'reconnecting' (see onFailure/'reconnecting') — this is a deliberate reload, not a network drop.
   */
  override changeTrack(kind: 'audio' | 'subtitle', id: number): boolean {
    void this.doChangeTrack(kind, id);
    return true;
  }

  private async doChangeTrack(kind: 'audio' | 'subtitle', id: number): Promise<void> {
    const { host, item } = this;
    const { adapter } = host;
    const current = tracksOf(adapter);
    const audioId = kind === 'audio' ? id : current.getAudioTrack();
    const subtitleId = kind === 'subtitle' ? id : current.getSubtitleTrack();

    adapter.pause();
    // 'buffering', NOT 'loading': 'loading' behaved as if new content was opening for the first time and
    // hid position/duration (a 00:00 flash) — but here we're already resuming from a known position.
    // 'buffering' is covered by isVodPlayable() (position/duration keep showing) and uses the same ring/percent mechanism.
    host.setState({ status: 'buffering', message: undefined });
    const t = adapter.getCurrentTime();
    if (t > 0) this.resumeSeconds = t;
    this.startLoadTimeout(() => this.onFailure());

    // On adapters that support it (AVPlay), the selection is left BEFORE loadVod: the engine applies it
    // directly right before calling play(), so the stream is never heard playing the default track and then
    // switched a second time (this caused the "choppy" audio — the reload already starts on the default
    // track, and we'd trigger a second pause/apply/resume cycle on top of that).
    const appliedBeforeLoad = isPendingTrackCapable(adapter);
    if (appliedBeforeLoad) adapter.setPendingTracks(audioId, subtitleId);

    try {
      await adapter.loadVod(item.url, this.resumeSeconds);
    } catch (err) {
      this.handleLoadError(err);
      return;
    }

    if (appliedBeforeLoad) return; // AVPlay: already applied before play(), nothing more to do here.

    // Web engines (hls.js/native <video>) don't support setPendingTracks, so it's applied AFTER the load
    // finishes — there's no second pause/resume cycle for these, so the choppiness issue doesn't apply.
    // Note: the old engine shutting down could also fire a 'tracks' event (with an empty/stale list); if the
    // listener were set up BEFORE loadVod it would consume that early, wrong data — so it's set up AFTER instead.
    const applyPending = (): void => {
      const fresh = tracksOf(adapter);
      if (audioId >= 0) fresh.setAudioTrack(audioId);
      if (subtitleId >= 0) fresh.setSubtitleTrack(subtitleId);
    };
    const ready = tracksOf(adapter);
    if (ready.getAudioTracks().length > 0 || ready.getSubtitleTracks().length > 0) {
      applyPending();
    } else {
      const off = adapter.on('tracks', () => {
        off();
        applyPending();
      });
    }
  }

  override retry(): boolean {
    this.attempt = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.host.setState({ status: 'loading', message: 'Bağlantı yeniden deneniyor...' });
    void this.reload();
    return true;
  }

  /** Saves the watch position (and duration); normally throttled to once every 5s max. */
  override saveProgress(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastProgressSaveAt < PROGRESS_SAVE_EVERY_MS) return;
    this.lastProgressSaveAt = now;
    // Don't save if playback hasn't really started yet (position ~0): otherwise an existing resume position gets overwritten with 0.
    const t = this.host.adapter.getCurrentTime();
    if (t < 1) return;
    this.host.storage.setResume(this.item.id, t, this.host.adapter.getDuration());
  }

  override teardown(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    super.teardown();
  }

  /**
   * The movie/show failed to open or dropped: the user shouldn't be left waiting silently. "Reconnecting
   * (2/3)..." is shown first and it retries automatically from the current position; if all attempts fail
   * an explicit error is shown with a manual retry via OK.
   */
  private onFailure(): void {
    if (this.retryTimer) return;
    this.clearLoadTimeout();
    this.buffering.clear();
    if (this.attempt >= VOD_MAX_RETRIES) {
      this.host.setState({ status: 'error', message: 'Video oynatılamadı. Bağlantıyı kontrol edip tekrar dene.' });
      return;
    }
    this.attempt++;
    this.host.setState({ status: 'loading', message: `Bağlantı yeniden deneniyor (${this.attempt + 1}/${VOD_MAX_RETRIES + 1})...` });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.reload();
    }, this.host.vodRetryBaseMs * this.attempt);
  }

  private async reload(): Promise<void> {
    if (this.disposed) return;
    const t = this.host.adapter.getCurrentTime();
    if (t > 1) this.resumeSeconds = t; // resume from where it dropped
    this.startLoadTimeout(() => this.onFailure());
    try {
      await this.host.adapter.loadVod(this.item.url, this.resumeSeconds);
    } catch (err) {
      this.handleLoadError(err);
    }
  }

  private handleLoadError(err: unknown): void {
    if (err instanceof StreamBlockedError) this.failIfBlocked(err);
    else this.onFailure();
  }

  /**
   * Content only enters "Continue watching" once playback actually starts: if the record were only written
   * after 1s of progress, content opened and immediately closed wouldn't show up in the list. An existing
   * resume position is preserved (only its timestamp is updated); otherwise a 1s record is created.
   */
  private registerPlayStart(): void {
    if (this.playStartRegistered) return;
    this.playStartRegistered = true;
    const p = this.host.storage.getProgress(this.item.id);
    this.host.storage.setResume(this.item.id, p ? p.seconds : 1, p?.duration || this.host.adapter.getDuration());
  }
}
