/**
 * Result of a connectivity probe: 'ok' = the stream source responds; 'source-down' = the internet
 * is up but the source doesn't respond; 'offline' = no internet. The platform-specific
 * implementation (web: fetch, Tizen: webapis.network + fetch) is supplied in main.ts; core/ui
 * only knows this interface.
 */
export type ConnectivityResult = 'ok' | 'source-down' | 'offline';

export interface ConnectivityProbe {
  /** Checks the source (stream URL) first; if there's no response, probes the internet itself. Never rejects. */
  check(sourceUrl: string): Promise<ConnectivityResult>;
}

/** Lightweight, no-CORS-required (no-cors) URLs for probing the internet itself; if any responds, the internet is up. */
export const INTERNET_PROBES = ['https://www.gstatic.com/generate_204', 'https://www.cloudflare.com/cdn-cgi/trace'];
export const SOURCE_TIMEOUT_MS = 5000;
export const INTERNET_TIMEOUT_MS = 4000;

export interface ReachableOptions {
  /** fetch mode; 'no-cors' for CORS-free probes. */
  mode?: RequestMode;
  /** If given, the HTTP status is passed to this function (default: any response at all is enough). */
  accept?: (status: number) => boolean;
}

/** fetch with a timeout: true once the response headers arrive (the body is never downloaded, the connection is aborted immediately), false on network error/timeout. */
export async function reachable(url: string, timeoutMs: number, opts: ReachableOptions = {}): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { mode: opts.mode, signal: ctrl.signal, cache: 'no-store' });
    return opts.accept ? opts.accept(res.status) : true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    ctrl.abort(); // close the connection without downloading the body
  }
}

/** "http://host:port/path?x" -> "http://host:port/" (not the stream, the provider's root page). */
export function providerRoot(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).origin + '/';
  } catch {
    return sourceUrl;
  }
}

/** In place of Promise.any (for older browsers): resolves true if any promise resolves true. */
export function anyTrue(promises: Promise<boolean>[]): Promise<boolean> {
  return new Promise((resolve) => {
    let pending = promises.length;
    if (pending === 0) resolve(false);
    for (const p of promises) {
      void p.then((ok) => {
        if (ok) resolve(true);
        else if (--pending === 0) resolve(false);
      });
    }
  });
}

/**
 * Probe order (Template Method): is the device offline -> does the provider root respond -> is
 * the internet up. Platforms only supply the `deviceOffline` and `sourceReachable` steps.
 *
 * NO REQUEST IS MADE to the stream URL itself: the provider would count it as a second stream
 * connection and could block the account for multiple connections; only the server's root URL
 * is checked.
 */
export abstract class BaseConnectivityProbe implements ConnectivityProbe {
  async check(sourceUrl: string): Promise<ConnectivityResult> {
    if (this.deviceOffline()) return 'offline';
    if (await this.sourceReachable(providerRoot(sourceUrl))) return 'ok';
    return (await this.internetReachable()) ? 'source-down' : 'offline';
  }

  /** True if we know the device itself is not on the network. */
  protected abstract deviceOffline(): boolean;
  /** Whether the provider's root URL is reachable (on web, through the local proxy). */
  protected abstract sourceReachable(rootUrl: string): Promise<boolean>;

  protected internetReachable(): Promise<boolean> {
    return anyTrue(INTERNET_PROBES.map((u) => reachable(u, INTERNET_TIMEOUT_MS, { mode: 'no-cors' })));
  }
}
