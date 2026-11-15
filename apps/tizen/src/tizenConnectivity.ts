import { BaseConnectivityProbe, reachable, SOURCE_TIMEOUT_MS } from '../../../packages/core/src/connectivity.ts';

/** Minimal global provided by the Tizen runtime (no official @types package exists). */
declare const webapis: {
  network?: { isConnectedToGateway?: () => boolean };
};

/**
 * Tizen: first checks the TV's own network status (is it connected to the gateway), then
 * probes the stream server directly (no proxy, no-cors). The APIs haven't been verified on
 * a real device yet.
 */
export class TizenConnectivityProbe extends BaseConnectivityProbe {
  protected deviceOffline(): boolean {
    try {
      return webapis?.network?.isConnectedToGateway?.() === false;
    } catch {
      return false; // webapis is unavailable or threw — fall back to the fetch-based probe.
    }
  }

  protected sourceReachable(rootUrl: string): Promise<boolean> {
    return reachable(rootUrl, SOURCE_TIMEOUT_MS, { mode: 'no-cors' });
  }
}
