import { expect, test } from '@playwright/test';
import { login, waitForFirstChapter } from './helpers';

test.beforeEach(async ({ page }) => login(page));

test('resolution reveals the answer key and highlights the correct option', async ({ page }) => {
  await page.goto('/pds/questoes/teste-1-2023-q1');
  const header = page.locator('.resolution-card-header');
  await expect(page.locator('.resolution-card-status')).toHaveText('Exibir Resolução');
  await header.click();
  await expect(page.locator('.resolution-card-status')).toHaveText('Ocultar Resolução');
  await expect(page.locator('.resolution-card-panel #resolution-gabarito-box')).toBeVisible();
  const correct = await page.locator('.question-container').getAttribute('data-correct');
  await expect(page.locator(`.option-item[data-option-label="${correct}"]`)).toHaveClass(/border-\[var\(--accent\)\]/);
  await header.click();
  await expect(page.locator(`.option-item[data-option-label="${correct}"]`)).not.toHaveClass(
    /bg-\[var\(--accent-subtle\)\]/,
  );

  await page.locator('.theory-card-header').click();
  await expect(page.locator('.theory-card-status')).toHaveText('Ocultar Teoria');
  await expect(page.locator('.theory-card-panel')).toBeVisible();
});

test('question navigation keeps the tag and question images open in the zoom viewer', async ({ page }) => {
  await page.goto('/pds/questoes/p1-2024-q1');
  const next = page.locator('nav a', { hasText: 'Próxima:' });
  await expect(next).toHaveAttribute('href', /tag=/);
  await page.locator('img.zoomable-question-image').first().click();
  await expect(page.locator('#diagram-zoom-modal')).toBeVisible();
  await expect(page.locator('#diagram-zoom-modal .modal-title-text')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(page.locator('#diagram-zoom-modal')).toBeHidden();
});

test('visiting a question moves it to the top of the sidebar list', async ({ page }) => {
  await page.goto('/pds/questoes/teste-1-2023-q3');
  await expect(page.locator('#sidebar-questions-list .sidebar-question-item:visible').first()).toHaveAttribute(
    'data-question-id',
    'teste-1-2023-q3',
  );
});

test('question bank filters by text, topic and tag', async ({ page }) => {
  await page.goto('/pds/questoes');
  const count = page.locator('#results-count span');
  await expect(count).toHaveText(/^Exibindo \d+ de \d+ questões\.$/);
  const total = Number((await count.textContent())?.match(/de (\d+)/)?.[1]);
  await page.fill('#search-input', 'amostragem');
  await expect(page.locator('#clear-filters-btn')).toBeVisible();
  const filtered = Number((await count.textContent())?.match(/Exibindo (\d+)/)?.[1]);
  expect(filtered).toBeLessThan(total);
  await page.selectOption('#tag-filter', 'p1');
  await expect(page).toHaveURL(/tag=p1/);
  await expect(page.locator('#sidebar-active-tag-hint')).toHaveText('(ativo: p1)');
  await page.click('#clear-filters-btn');
  await expect(count).toHaveText(`Exibindo ${total} de ${total} questões.`);
  await expect(page.locator('#tag-filter')).toHaveValue('');
});

test('code blocks get a language header and a working copy button', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/deep-learning-specialization?tag=neural-networks');
  await waitForFirstChapter(page);
  const card = page.locator('.code-block-card').first();
  await expect(card.locator('.code-block-lang')).toContainText('PYTHON');
  await card.locator('.code-copy-btn').click();
  await expect(card.locator('.copy-text')).toHaveText('Copiado!');
});

test('Mermaid diagrams render as cards with a viewer', async ({ page }) => {
  await page.goto('/deep-learning-specialization?tag=neural-networks');
  await waitForFirstChapter(page);
  const card = page.locator('.diagram-card[data-mermaid-code]').first();
  await expect(card.locator('.diagram-viewport svg')).toBeVisible({ timeout: 15_000 });
  await card.locator('.diagram-eye-btn').click();
  await expect(page.locator('#diagram-zoom-modal')).toBeVisible();
  await page.locator('#diagram-zoom-modal .modal-zoom-in').click();
  await page.locator('#diagram-zoom-modal .modal-close-btn').click();
  await expect(page.locator('#diagram-zoom-modal')).toBeHidden();
});

test('block diagrams render and open in the viewer', async ({ page }) => {
  await page.goto('/controle?tag=p1');
  await waitForFirstChapter(page);
  const card = page.locator('.system-block-card').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('foreignObject .katex').first()).toBeVisible();
  await card.locator('.diagram-eye-btn').click();
  await expect(page.locator('#diagram-zoom-modal')).toBeVisible();
});

test('long runs of question cards collapse behind a button', async ({ page }) => {
  await page.goto('/pds?tag=teste-1&type=questoes#cap-2');
  await expect(page.locator('#cap-2 [data-loaded="true"]')).toHaveCount(1);
  const toggle = page.locator('#cap-2 .question-sequence-toggle-btn').first();
  await expect(toggle).toContainText(/Ver mais \d+ quest/);
  await toggle.click();
  await expect(toggle).toContainText('Recolher questões do bloco');
});

test('tables are wrapped for horizontal scrolling', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  await expect(page.locator('.academic-prose .academic-table-wrapper > table.academic-table').first()).toBeAttached();
});
