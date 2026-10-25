import { expect, test } from '@playwright/test';
import { login, waitForFirstChapter } from './helpers';

test.beforeEach(async ({ page }) => login(page));

test('settings cache section clears the browser cache and reloads', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  await page.goto('/configuracoes');
  await expect(page.locator('#browser-cache-stats')).toHaveText(/ite(m|ns) em cache/);
  await page.evaluate(() => localStorage.setItem('study_recent_questions_pds', '["x"]'));
  const reload = page.waitForEvent('load');
  await page.click('#clear-site-cache-btn');
  await expect(page.locator('#cache-feedback-message')).toBeVisible();
  await expect(page.locator('#status-message')).toContainText('Cache do navegador limpo com sucesso');
  await reload;
  expect(await page.evaluate(() => localStorage.getItem('study_recent_questions_pds'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('study_last_cache_bust'))).not.toBeNull();
});

test('Alt+C clears the cache and reloads; ?nocache is removed from the URL', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#sidebar-materias-nav .sidebar-materia-item').first()).toBeVisible();
  await page.evaluate(() => localStorage.setItem('study_cache_v2:legacy', 'x'));
  const reload = page.waitForEvent('load');
  await page.keyboard.press('Alt+c');
  await reload;
  expect(await page.evaluate(() => localStorage.getItem('study_cache_v2:legacy'))).toBeNull();
  await page.goto('/pds?tag=teste-1&nocache=1');
  await expect(page).not.toHaveURL(/nocache/);
  await expect(page).toHaveURL(/tag=teste-1/);
});

test('mobile header shows the section being read', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pds?tag=teste-1&type=materia#sec-1-3-cadeia-processamento');
  await expect(page.locator('#mobile-current-section')).toHaveText(/1\.3 Cadeia Geral/, { timeout: 10_000 });
});

test('edge swipe opens the mobile menu and a left swipe closes it', async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await login(page);
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  const swipe = (fromX: number, toX: number) =>
    page.evaluate(
      ([a, b]) => {
        const touch = (x: number) => new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 });
        window.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(a)], changedTouches: [touch(a)] }));
        window.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch(b)] }));
      },
      [fromX, toX],
    );
  await swipe(10, 120);
  await expect(page.locator('#academic-sidebar')).not.toHaveClass(/-translate-x-full/);
  await swipe(300, 150);
  await expect(page.locator('#academic-sidebar')).toHaveClass(/-translate-x-full/);
  await context.close();
});

test('Mermaid diagrams re-render when the theme changes', async ({ page }) => {
  await page.goto('/deep-learning-specialization?tag=neural-networks');
  await waitForFirstChapter(page);
  const svg = page.locator('.diagram-card[data-mermaid-code] .diagram-viewport svg').first();
  await expect(svg).toBeVisible({ timeout: 15_000 });
  const before = await svg.evaluate((el) => el.outerHTML.length + el.id);
  await page.locator('.theme-dropdown-trigger').click();
  await page.locator('.theme-opt-btn[data-theme-val="dark"]').click();
  await expect
    .poll(async () => svg.evaluate((el) => el.outerHTML.length + el.id), { timeout: 15_000 })
    .not.toBe(before);
});

test('"Ir para a Teoria do Capítulo" opens the subject on the chapter anchor', async ({ page }) => {
  await page.goto('/pds/questoes/teste-1-2023-q1');
  await page.getByText('Ir para a Teoria do Capítulo').click();
  // The anchor belongs to the "Estudo por questões" section, which becomes the active one.
  await expect(page).toHaveURL(/\/pds\?tag=teste-1&type=questoes#cap-2-amostragem$/);
  await expect(page.locator('#notebook-content')).toBeVisible();
});
