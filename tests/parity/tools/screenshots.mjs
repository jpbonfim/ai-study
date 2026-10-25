#!/usr/bin/env node
/**
 * Logs in and screenshots pages of a running site, printing console errors.
 * Usage: node tests/parity/tools/screenshots.mjs <baseUrl> <outDir> <width> <path...>
 */
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const [, , base, out, width, ...paths] = process.argv;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(width) || 1400, height: 900 } });
const page = await context.newPage();
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error') logs.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(`${base}/login`);
await page.fill('#username', process.env.SHOT_USER || 'admin');
await page.fill('#password', process.env.SHOT_PASSWORD || 'admin-parity');
await page.click('#submit-btn');
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
for (const p of paths) {
  await page.goto(`${base}${p}`);
  await page.waitForTimeout(Number(process.env.SHOT_WAIT || 2500));
  const name = p.replace(/[^a-z0-9]+/gi, '_') || 'root';
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.env.SHOT_FULL === '1' });
}
console.log(logs.join('\n') || 'no console errors');
await browser.close();
