/**
 * Image URLs that failed to load (403/404/CORS): they are not requested again in the same session — this avoids
 * both unnecessary network traffic and repeated error lines in the console. The cache is an object (not module-level
 * hidden state): components can pass their own instance to the constructor (for isolation in tests); if they don't,
 * a shared app-wide instance is used.
 */
export class UrlFailureCache {
  private readonly failed = new Set<string>();

  has(url: string): boolean {
    return this.failed.has(url);
  }

  add(url: string): void {
    this.failed.add(url);
  }
}

/** Shared (default) instance used app-wide: channel logos and poster images share the same set. */
export const sharedImageFailures = new UrlFailureCache();
