import { BaseConnectivityProbe, reachable, SOURCE_TIMEOUT_MS } from '../../../packages/core/src/connectivity.ts';

/**
 * Web app: the stream server is probed through the local proxy (a single request when healthy).
 * Any HTTP response (including 404) indicates the server is up; 502/504 does not.
 */
export class WebConnectivityProbe extends BaseConnectivityProbe {
  protected deviceOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  protected sourceReachable(rootUrl: string): Promise<boolean> {
    const proxied = `/proxy?url=${encodeURIComponent(rootUrl)}`;
    return reachable(proxied, SOURCE_TIMEOUT_MS, { accept: (status) => status !== 502 && status !== 504 });
  }
}
