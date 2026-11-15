import type { VodRestore } from '../screens/vodBrowser.ts';

export type VodKey = 'movies' | 'series';

/**
 * The last state of the Movies / Series browser (category, search, sort order, opened card). Returning via Back
 * from the player or the show detail screen reopens from this state; it is reset when entering from Home.
 */
export class VodRestoreStore {
  private readonly states: Partial<Record<VodKey, VodRestore>> = {};

  get(key: VodKey): VodRestore | undefined {
    return this.states[key];
  }

  set(key: VodKey, state: VodRestore | undefined): void {
    this.states[key] = state;
  }

  clear(key?: VodKey): void {
    if (key) this.states[key] = undefined;
    else {
      this.states.movies = undefined;
      this.states.series = undefined;
    }
  }
}
