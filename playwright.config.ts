import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const local = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1, // one shared dev server + DB: specs that flip components must not race the queue specs
  use: {
    baseURL: 'http://localhost:5174',
    launchOptions: existsSync(local) ? { executablePath: local } : {}
  },
  webServer: {
    command: 'pnpm db:reset && pnpm db:seed && pnpm dev --port 5174 --strictPort',
    url: 'http://localhost:5174/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: 'pglite:data/e2e-pglite', APP_DB_ROLE: 'books_app', UNDO_WINDOW_MS: '1500', APP_PASSCODE: '' }
  }
});
