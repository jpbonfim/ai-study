import { expect, test } from '@playwright/test';
import { login, waitForFirstChapter } from './helpers';

test.beforeEach(async ({ page }) => login(page));

test('without a tag the prompt lists tags; choosing one opens the notebook', async ({ page }) => {
  await page.goto('/pds');
  await expect(page.locator('#tag-select-prompt')).toBeVisible();
  await expect(page.locator('#sidebar-toc-empty')).toBeVisible();
  await page.locator('#tag-select-prompt button', { hasText: 'teste-1' }).click();
  await expect(page).toHaveURL(/[?&]tag=teste-1/);
  await expect(page.locator('#notebook-content')).toBeVisible();
  await expect(page.locator('#active-tag-display-name')).toHaveText('teste-1');
  await waitForFirstChapter(page);
  await expect(page.locator('#header-chapters-count')).toHaveText(/Capítulos? em Fluxo Contínuo/);
});

test('the tag dropdown filters, selects and is remembered', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  await expect(page.locator('#header-chapters-count')).toHaveText('3 Capítulos');
  await page.click('#sidebar-tag-trigger');
  await expect(page.locator('#sidebar-tag-menu')).toBeVisible();
  await page.fill('#sidebar-tag-search-filter', 'p1');
  await expect(page.locator('#sidebar-tag-menu .tag-opt-btn:visible')).toHaveCount(2);
  await page.locator('#sidebar-tag-menu .tag-opt-btn:visible', { hasText: 'p1' }).click();
  await expect(page.locator('#sidebar-tag-menu')).toBeHidden();
  await expect(page).toHaveURL(/[?&]tag=p1/);
  await expect(page.locator('#sidebar-active-tag-hint')).toHaveText('(ativo: p1)');
  await page.goto('/pds');
  await expect(page.locator('#sidebar-active-tag-hint')).toHaveText('(ativo: p1)');
  await expect(page.locator('#notebook-content')).toBeVisible();
});

test('"Outras tags" returns to the prompt', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  await page.click('#btn-switch-tag');
  await expect(page.locator('#tag-select-prompt')).toBeVisible();
  await expect(page).not.toHaveURL(/tag=/);
});

test('table of contents navigates to sections and the scroll spy follows', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  const item = page.locator('#sidebar-toc-nav a.toc-sub-link[data-toc-id="sec-1-3-cadeia-processamento"]');
  await item.click();
  await expect(page).toHaveURL(/#sec-1-3-cadeia-processamento$/);
  await expect(item).toHaveClass(/is-active/);
  const top = await page.locator('#sec-1-3-cadeia-processamento').evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(120);
});

test('switching to "Estudo por questões" renders that section', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  await page.locator('.toc-collapsible-btn[data-target-group="questoes"]').click();
  await expect(page).toHaveURL(/[?&]type=questoes/);
  await expect(page.locator('#chapters-container')).toHaveAttribute('data-rendered-section', 'questoes');
  await waitForFirstChapter(page);
  await expect(page.locator('.toc-collapsible-btn[data-target-group="questoes"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('later chapters load when the reader gets close', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  const lazy = page.locator('#chapters-container .chapter-lazy-content[data-loaded="false"]');
  await expect(lazy).toHaveCount(2);
  for (let i = 0; i < 60 && (await lazy.count()) > 0; i++) {
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(150);
  }
  await expect(lazy).toHaveCount(0);
  await expect(page.locator('#chapters-container [data-loaded="true"]')).toHaveCount(3);
});

test('the URL anchor is restored on load (lazy chapter included)', async ({ page }) => {
  await page.goto('/pds?tag=teste-1&type=materia#cap-materia-3');
  await expect
    .poll(async () => page.locator('#cap-materia-3').evaluate((el) => Math.round(el.getBoundingClientRect().top)))
    .toBeLessThan(120);
  await expect(page.locator('#cap-materia-3 [data-loaded="true"]')).toHaveCount(1);
});

test("other users' tags appear behind the toggle on the own subject", async ({ page }, testInfo) => {
  await page.goto('/redes?tag=p1');
  await waitForFirstChapter(page);
  const toggle = page.locator('#other-users-tags-toggle');
  await expect(toggle).toHaveText('Desativado');
  await page.click('#sidebar-tag-trigger');
  await expect(page.locator('#sidebar-tag-menu .tag-opt-btn:visible', { hasText: 'Colega' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await toggle.click();
  await expect(toggle).toHaveText('Ativado');
  await page.click('#sidebar-tag-trigger');
  await page.locator('#sidebar-tag-menu .tag-opt-btn:visible', { hasText: 'Colega' }).first().click();
  await expect(page).toHaveURL(/tag=user_2%3A%3A/);
  // The previous version could not load chapters of another user's subject with a different slug.
  if (testInfo.project.name === 'old') return;
  await waitForFirstChapter(page);
  await expect(page.locator('#chapters-container section').first()).toHaveAttribute('id', /^other-2-cap-/);
});

test('shared subject shows its owner', async ({ page }) => {
  await page.goto('/redes-colega?owner=2');
  await expect(page.locator('#academic-sidebar h2')).toContainText('De: Colega de Turma');
});

test('sidebar lists at most five questions and links to the bank', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  await expect(page.locator('#sidebar-questions-list .sidebar-question-item:visible')).toHaveCount(5);
  await expect(page.locator('#sidebar-questions-bank-link')).toHaveText('Ver banco (33)');
  await expect(page.locator('#sidebar-questions-bank-link')).toHaveAttribute('href', '/pds/questoes?tag=teste-1');
});
