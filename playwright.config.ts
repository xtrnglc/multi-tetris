import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:8090', viewport: { width: 1280, height: 800 } },
  webServer: {
    command:
      'npm run build && PORT=8090 STATIC_DIR=packages/client/dist node packages/server/dist/index.cjs',
    url: 'http://127.0.0.1:8090/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
