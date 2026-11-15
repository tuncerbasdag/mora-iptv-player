import { Emitter } from '../../core/src/emitter.ts';
import type { PlayerAdapterEvent } from './playerAdapter.ts';

/**
 * Common event infrastructure for all PlayerAdapter implementations (`on` / `emit` / listener cleanup).
 * Concrete classes still use `implements PlayerAdapter` to have the compiler verify interface compliance.
 */
export abstract class BasePlayerAdapter {
  protected readonly events = new Emitter<PlayerAdapterEvent>();

  on(event: PlayerAdapterEvent, handler: (...args: unknown[]) => void): () => void {
    return this.events.on(event, handler);
  }

  protected emit(event: PlayerAdapterEvent, ...args: unknown[]): void {
    this.events.emit(event, ...args);
  }

  /** Subclasses should call `super.destroy()` after releasing their own resources. */
  destroy(): void {
    this.events.clear();
  }
}
