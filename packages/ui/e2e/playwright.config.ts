import { defineConfig } from '@playwright/test';

const PORT = 8911;

/** Gerçek Chrome ile (channel: 'chrome') çalışır: ayrıca tarayıcı indirmeye gerek yok. */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'chrome',
    viewport: { width: 1920, height: 1080 },
  },
  webServer: {
    command: 'node packages/ui/e2e/serve.mjs',
    cwd: '../../..',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    env: { E2E_PORT: String(PORT) },
  },
});
