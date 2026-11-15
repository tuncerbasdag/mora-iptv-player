/** Event handler: loosely typed since arguments vary by event. */
export type EventHandler = (...args: unknown[]) => void;

/**
 * Small, dependency-free Observer infrastructure: registers handlers by event name, emits, clears.
 * A shared building block so the player adapters don't each repeat the same `on/emit` pattern.
 */
export class Emitter<K extends string = string> {
  private readonly handlers = new Map<K, Set<EventHandler>>();

  /** Registers the handler; the returned function removes it. */
  on(event: K, handler: EventHandler): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    const registered = set;
    registered.add(handler);
    return () => registered.delete(handler);
  }

  emit(event: K, ...args: unknown[]): void {
    for (const fn of this.handlers.get(event) ?? []) fn(...args);
  }

  clear(): void {
    this.handlers.clear();
  }
}
