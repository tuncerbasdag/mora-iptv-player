import { BasePlayerAdapter } from '../src/basePlayerAdapter.ts';
import type { PlayerAdapter, PlayerAdapterEvent } from '../src/playerAdapter.ts';

export class MockPlayerAdapter extends BasePlayerAdapter implements PlayerAdapter {
  calls = {
    loadLive: [] as string[],
    loadVod: [] as Array<{ url: string; resumeSeconds: number }>,
    stop: 0,
    seek: [] as number[],
  };
  private paused = true;
  private currentTime = 0;
  private duration = 0;

  async loadLive(url: string): Promise<void> {
    this.calls.loadLive.push(url);
  }
  async loadVod(url: string, resumeSeconds: number): Promise<void> {
    this.calls.loadVod.push({ url, resumeSeconds });
  }
  play(): void {
    this.paused = false;
  }
  pause(): void {
    this.paused = true;
  }
  stop(): void {
    this.calls.stop++;
  }
  seek(seconds: number): void {
    this.calls.seek.push(seconds);
    this.currentTime = seconds;
  }
  getCurrentTime(): number {
    return this.currentTime;
  }
  getDuration(): number {
    return this.duration;
  }
  isPaused(): boolean {
    return this.paused;
  }
  moveTo(): void {
    /* no DOM move needed in the test environment */
  }

  /** Test helper: simulates an event coming from the real player. */
  override emit(event: PlayerAdapterEvent, ...args: unknown[]): void {
    super.emit(event, ...args);
  }

  setDuration(d: number): void {
    this.duration = d;
  }
  setCurrentTime(t: number): void {
    this.currentTime = t;
  }
}
