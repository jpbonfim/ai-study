#!/usr/bin/env node
/**
 * Time until the first chapter of a subject shows content, measured inside the page, on a cold
 * visit (empty browser caches) and a warm one (second visit).
 * Usage: node tests/parity/tools/perf.mjs <baseUrl> [path] [cpuSlowdown]
 */
import { chromium } from '@playwright/test';

const [, , base, path = '/pds?tag=teste-1', cpuSlowdown = '4'] = process.argv;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  new MutationObserver((_, observer) => {
    if (!document.querySelector('#chapters-container [data-loaded="true"]')) return;
    window.__firstChapterShownAt = performance.now();
    observer.disconnect();
  }).observe(document, { subtree: true, childList: true, attributes: true });
});
const page = await context.newPage();
await page.goto(`${base}/login`);
await page.fill('#username', 'admin');
await page.fill('#password', 'admin-parity');
await page.click('#submit-btn');
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
await page.evaluate(async () => {
  localStorage.clear();
  for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
});
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(cpuSlowdown) });

for (const visit of ['cold', 'warm']) {
  await page.goto(`${base}${path}`);
  await page.waitForFunction(() => window.__firstChapterShownAt, null, { timeout: 120_000 });
  const ms = await page.evaluate(() => Math.round(window.__firstChapterShownAt));
  console.log(`${visit}: ${ms} ms`);
}
await browser.close();
