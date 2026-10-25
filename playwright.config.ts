import { defineConfig } from '@playwright/test';

/**
 * Behavioral parity: every spec runs against the current site ("old") and the rewrite ("new"),
 * both serving ../data-dev (see tests/parity/README.md for how to start them).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' },
  projects: [
    { name: 'old', use: { baseURL: process.env.OLD_URL || 'http://127.0.0.1:4100' } },
    { name: 'new', use: { baseURL: process.env.NEW_URL || 'http://127.0.0.1:5174' } },
  ],
});
