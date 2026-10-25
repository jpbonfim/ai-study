#!/usr/bin/env node
/**
 * Visual parity: screenshots the same scenarios on the current site (OLD_URL) and on the rewrite
 * (NEW_URL), compares them pixel by pixel and reports the mismatch ratio of each scenario.
 *
 * Usage: node tests/parity/tools/visual-diff.mjs [filter]
 * Env: OLD_URL (default http://127.0.0.1:4100), NEW_URL (default http://127.0.0.1:5174),
 *      OUT (default .parity/visual), THRESHOLD (mismatch ratio reported as failure, default 0.002)
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const OLD_URL = process.env.OLD_URL || 'http://127.0.0.1:4100';
const NEW_URL = process.env.NEW_URL || 'http://127.0.0.1:5174';
const OUT = path.resolve(process.env.OUT || '.parity/visual');
const THRESHOLD = Number(process.env.THRESHOLD || 0.002);
const filter = process.argv[2] || '';

const DESKTOP = { width: 1400, height: 900 };
const MOBILE = { width: 390, height: 844 };

/** Each scenario: path, theme, viewport, optional user, full page, and actions before the shot. */
const SCENARIOS = [
  { name: 'home', path: '/' },
  { name: 'home-dark', path: '/', theme: 'dark' },
  { name: 'home-oled', path: '/', theme: 'oled' },
  { name: 'home-mobile', path: '/', viewport: MOBILE },
  { name: 'login', path: '/login', anonymous: true },
  { name: 'login-dark', path: '/login', anonymous: true, theme: 'dark' },
  { name: 'conta', path: '/conta' },
  { name: 'conta-full', path: '/conta', fullPage: true },
  { name: 'configuracoes', path: '/configuracoes', fullPage: true },
  { name: 'configuracoes-dark', path: '/configuracoes', theme: 'dark' },
  { name: 'admin', path: '/admin' },
  { name: 'admin-permissions', path: '/admin', actions: [{ click: '[class*="tab-btn"]:nth-child(2)' }] },
  { name: 'pds-prompt', path: '/pds' },
  { name: 'pds-tag', path: '/pds?tag=teste-1' },
  { name: 'pds-tag-full', path: '/pds?tag=teste-1', fullPage: true },
  { name: 'pds-tag-dark', path: '/pds?tag=teste-1', theme: 'dark' },
  { name: 'pds-tag-mobile', path: '/pds?tag=teste-1', viewport: MOBILE },
  { name: 'pds-questoes-section', path: '/pds?tag=teste-1&type=questoes', fullPage: true },
  { name: 'pds-bank', path: '/pds/questoes', fullPage: true },
  { name: 'pds-bank-tag', path: '/pds/questoes?tag=p1' },
  { name: 'pds-question', path: '/pds/questoes/p1-2023-q1' },
  {
    name: 'pds-question-open',
    path: '/pds/questoes/p1-2023-q1',
    actions: [{ click: '.resolution-card-header' }, { click: '.theory-card-header' }],
    fullPage: true,
  },
  { name: 'controle-diagrams', path: '/controle?tag=p1', fullPage: true },
  { name: 'dl-code-mermaid', path: '/deep-learning-specialization?tag=neural-networks', fullPage: true },
  { name: 'redes-other-tags', path: '/redes?tag=p1' },
  { name: 'redes-colega-shared', path: '/redes-colega?owner=2' },
  { name: 'colega-home', path: '/', user: 'colega' },
  { name: 'colega-pds', path: '/pds?tag=teste-1', user: 'colega' },
];

const CREDENTIALS = { admin: 'admin-parity', colega: 'colega-parity' };

async function loggedInState(browser, base, user) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.fill('#username', user);
  await page.fill('#password', CREDENTIALS[user]);
  await page.click('#submit-btn');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  const state = await context.storageState();
  await context.close();
  return { cookies: state.cookies, origins: [] };
}

async function shoot(browser, base, scenario, storageState, file) {
  const context = await browser.newContext({
    viewport: scenario.viewport || DESKTOP,
    storageState: scenario.anonymous ? undefined : storageState,
    reducedMotion: 'reduce',
  });
  await context.addInitScript((theme) => {
    // Same preferences on both sides, and no "continue studying" history.
    if (!sessionStorage.getItem('__parity_init')) {
      localStorage.clear();
      if (theme) localStorage.setItem('study_theme', theme);
      sessionStorage.setItem('__parity_init', '1');
    }
  }, scenario.theme || null);
  const page = await context.newPage();
  await page.goto(`${base}${scenario.path}`);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);
  for (const action of scenario.actions || []) {
    if (action.click) await page.click(action.click);
    await page.waitForTimeout(400);
  }
  await page.addStyleTag({
    content: '*{caret-color:transparent!important} .animate-spin,.animate-pulse{animation:none!important}',
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, fullPage: Boolean(scenario.fullPage) });
  await context.close();
}

function compare(oldFile, newFile, diffFile) {
  const a = PNG.sync.read(fs.readFileSync(oldFile));
  const b = PNG.sync.read(fs.readFileSync(newFile));
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const pad = (img) => {
    if (img.width === width && img.height === height) return img;
    const out = new PNG({ width, height });
    PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
    return out;
  };
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(pad(a).data, pad(b).data, diff.data, width, height, { threshold: 0.1 });
  const ratio = mismatched / (width * height);
  if (ratio > THRESHOLD) fs.writeFileSync(diffFile, PNG.sync.write(diff));
  return { ratio, sizes: `${a.width}x${a.height} vs ${b.width}x${b.height}` };
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const states = {};
for (const [side, base] of [
  ['old', OLD_URL],
  ['new', NEW_URL],
]) {
  states[side] = {};
  for (const user of Object.keys(CREDENTIALS)) states[side][user] = await loggedInState(browser, base, user);
}

let failures = 0;
for (const scenario of SCENARIOS.filter((s) => s.name.includes(filter))) {
  const user = scenario.user || 'admin';
  const files = Object.fromEntries(
    ['old', 'new'].map((side) => [side, path.join(OUT, `${scenario.name}.${side}.png`)]),
  );
  await shoot(browser, OLD_URL, scenario, states.old[user], files.old);
  await shoot(browser, NEW_URL, scenario, states.new[user], files.new);
  const { ratio, sizes } = compare(files.old, files.new, path.join(OUT, `${scenario.name}.diff.png`));
  const ok = ratio <= THRESHOLD;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'DIFF'} ${scenario.name.padEnd(24)} ${(ratio * 100).toFixed(3)}%  ${sizes}`);
}
await browser.close();
process.exitCode = failures ? 1 : 0;
