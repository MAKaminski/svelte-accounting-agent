import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const local = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5174',
    launchOptions: existsSync(local) ? { executablePath: local } : {}
  },
  webServer: {
    command: 'rm -f data/e2e.db* && pnpm db:migrate && pnpm db:seed && pnpm dev --port 5174 --strictPort',
    url: 'http://localhost:5174/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DB_PATH: 'data/e2e.db', UNDO_WINDOW_MS: '1500', APP_PASSCODE: '' }
  }
});
