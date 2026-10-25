import { expect, test } from '@playwright/test';
import { login, waitForFirstChapter } from './helpers';

// Smaller behaviors of the feature inventory (docs/FEATURES.md) not covered by the other specs.

test.beforeEach(async ({ page }) => login(page));

test('page titles (G11)', async ({ page }) => {
  const titles: Record<string, string> = {
    '/': 'Cadernos de Estudo Acadêmico | Biblioteca',
    '/pds?tag=teste-1': 'Processamento Digital de Sinais (PTC3214) | Caderno de Estudos',
    '/pds/questoes': 'Banco de Questões | Processamento Digital de Sinais | Caderno de Estudos',
    '/pds/questoes/teste-1-2023-q1':
      'Efeito do Amostrador-Segurador na Fase e Amplitude | Processamento Digital de Sinais | Caderno de Estudos',
    '/conta': 'Minha Conta & Gerenciamento de Arquivos | Biblioteca Acadêmica',
    '/configuracoes': 'Configurações de Leitura | Cadernos de Estudo',
    '/admin': 'Painel de Administração | Biblioteca Acadêmica',
    '/nao-existe/x/y': '404: Not Found',
  };
  for (const [path, title] of Object.entries(titles)) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
  }
});

test('unknown pages also require a session (G1)', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();
  await page.goto('/nao-existe/x/y');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fnao-existe%2Fx%2Fy$/);
  await context.close();
});

test('favicon and the fonts of each page (G12)', async ({ page }) => {
  const fontsOf = async (path: string) => {
    await page.goto(path);
    await expect(page.locator('link[rel~="icon"]')).toHaveCount(1);
    const links = page.locator('link[rel="stylesheet"][href*="fonts.googleapis.com"]');
    await expect(links).toHaveCount(1);
    return decodeURIComponent((await links.getAttribute('href')) ?? '');
  };
  const interfaceFonts =
    'family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=JetBrains+Mono:wght@400;500&display=swap';
  expect(await fontsOf('/')).toContain(interfaceFonts);
  expect(await fontsOf('/conta')).toContain(interfaceFonts);
  expect(await fontsOf('/pds?tag=teste-1')).toContain(
    'JetBrains+Mono:wght@400;500&family=Lora:ital,wght@0,400..700;1,400..700',
  );
  expect(await fontsOf('/pds/questoes')).toContain('&family=Lora:');
  expect(await fontsOf('/configuracoes')).toContain('JetBrains+Mono:ital,wght@0,400..700;1,400..700&family=Lora:');
});

test('tag dropdown: keyboard navigation and closing the theme menu (M3)', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  await page.locator('.theme-dropdown-trigger').first().click();
  await expect(page.locator('.theme-dropdown-menu').first()).toBeVisible();
  await page.click('#sidebar-tag-trigger');
  await expect(page.locator('#sidebar-tag-menu')).toBeVisible();
  await expect(page.locator('.theme-dropdown-menu').first()).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(page.locator('#sidebar-tag-menu')).toBeHidden();

  await page.focus('#sidebar-tag-trigger');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#sidebar-tag-menu')).toBeVisible();
  const options = page.locator('#sidebar-tag-menu .tag-opt-btn:visible');
  await options.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(options.first()).toBeFocused();
  await options.nth(2).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sidebar-tag-menu')).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]tag=teste-1(&|$)/);
  await expect(page.locator('#sidebar-active-tag-hint')).not.toHaveText('(ativo: teste-1)');
});

test('table of contents: the chevron only expands/collapses and the state is remembered (M8)', async ({ page }) => {
  await page.goto('/pds?tag=teste-1&type=materia');
  await waitForFirstChapter(page);
  const materia = page.locator('[data-group-content="materia"]');
  const questoes = page.locator('[data-group-content="questoes"]');
  await expect(materia).toBeVisible();
  await expect(questoes).toBeHidden();
  await page.locator('.toc-collapsible-btn[data-target-group="materia"] .toc-collapsible-chevron').click();
  await expect(materia).toBeHidden();
  await page.locator('.toc-collapsible-btn[data-target-group="questoes"] .toc-collapsible-chevron').click();
  await expect(questoes).toBeVisible();
  // Neither click changed the section being read.
  await expect(page).toHaveURL(/type=materia/);
  await expect(page.locator('#chapters-container')).toHaveAttribute('data-rendered-section', 'materia');
  // After a reload the inactive group stays expanded (the active one always opens).
  await page.reload();
  await waitForFirstChapter(page);
  await expect(page.locator('[data-group-content="questoes"]')).toBeVisible();
});

test('mobile: choosing a section in the menu closes it (M12)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pds?tag=teste-1&type=materia');
  await waitForFirstChapter(page);
  const sidebar = page.locator('#academic-sidebar');
  await page.click('#mobile-sidebar-toggle');
  await expect(sidebar).not.toHaveClass(/-translate-x-full/);
  await page.locator('#sidebar-toc-nav a.toc-sub-link[data-toc-id="sec-1-3-cadeia-processamento"]').click();
  await expect(sidebar).toHaveClass(/-translate-x-full/);
  await expect(page).toHaveURL(/#sec-1-3-cadeia-processamento$/);
});

test('question bank: the tag filter and the sidebar selector stay in sync (B3)', async ({ page }) => {
  await page.goto('/pds/questoes?tag=teste-1');
  await expect(page.locator('#tag-filter')).toHaveValue('teste-1');
  await page.selectOption('#tag-filter', 'p1');
  await expect(page.locator('#sidebar-active-tag-hint')).toHaveText('(ativo: p1)');
  await page.click('#sidebar-tag-trigger');
  await page.locator('#sidebar-tag-menu .tag-opt-btn:visible', { hasText: 'teste-1' }).first().click();
  await expect(page.locator('#tag-filter')).toHaveValue('teste-1');
});

test('question page: previous/next navigation keeps the tag (Q5)', async ({ page }) => {
  await page.goto('/pds/questoes/teste-1-2023-q1?tag=teste-1');
  const next = page.locator('a', { hasText: 'Próxima:' });
  await expect(next).toBeVisible();
  await next.click();
  await expect(page).not.toHaveURL(/teste-1-2023-q1/);
  await expect(page).toHaveURL(/[?&]tag=teste-1/);
  await page.locator('a', { hasText: 'Anterior:' }).click();
  await expect(page).toHaveURL(/\/pds\/questoes\/teste-1-2023-q1\?(.*&)?tag=teste-1/);
});

test('zoom viewer: keyboard and buttons (C8)', async ({ page }) => {
  await page.goto('/controle?tag=p1');
  await waitForFirstChapter(page);
  const card = page.locator('.system-block-card').first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('.diagram-eye-btn').click();
  const modal = page.locator('#diagram-zoom-modal');
  const zoom = modal.locator('.modal-zoom-display');
  await expect(modal).toBeVisible();
  const initial = (await zoom.textContent())?.trim();
  await page.keyboard.press('+');
  await expect(zoom).not.toHaveText(initial ?? '');
  await page.keyboard.press('0');
  await expect(zoom).toHaveText(initial ?? '');
  await modal.locator('.modal-zoom-out').click();
  await expect(zoom).not.toHaveText(initial ?? '');
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

test('account: the full archive upload needs CONFIRMAR (A3)', async ({ page }) => {
  await page.goto('/conta');
  const submit = page.locator('#submit-full-btn');
  await expect(submit).toBeDisabled();
  await page.fill('#confirm-text-full', 'confirmar');
  await expect(submit).toBeDisabled();
  await page.fill('#confirm-text-full', 'CONFIRMAR');
  await expect(submit).toBeEnabled();
});

test('admin: owner and beneficiary must differ (D3); alerts go away (D5)', async ({ page }) => {
  await page.goto('/admin');
  await page.locator('.tab-btn', { hasText: 'Permissões' }).click();
  await page.selectOption('#perm-owner-select', '2');
  await page.selectOption('#perm-materia-select', { index: 1 });
  await page.selectOption('#perm-granted-select', '2');
  let alertMessage = '';
  page.once('dialog', async (dialog) => {
    alertMessage = dialog.message();
    await dialog.accept();
  });
  await page.click('#submit-perm-btn');
  await expect.poll(() => alertMessage).toBe('O dono e o beneficiado não podem ser a mesma pessoa.');
  await expect(page.locator('#permissions-table-body tr')).toHaveCount(2);

  const username = `alert${Date.now() % 100000}`;
  page.on('dialog', (d) => d.accept());
  await page.locator('.tab-btn', { hasText: 'Usuários' }).click();
  await page.click('#open-create-user-modal');
  await page.fill('#form-create-user input[name="username"]', username);
  await page.fill('#form-create-user input[name="displayName"]', 'Alerta');
  await page.fill('#form-create-user input[name="password"]', 'senha123');
  await page.locator('#form-create-user button[type="submit"]').click();
  await expect(page.locator('#admin-alert')).toBeVisible();
  await expect(page.locator('#admin-alert')).toBeHidden({ timeout: 7000 });
  await page.locator('#users-table-body tr', { hasText: username }).getByText('Excluir').click();
  await expect(page.locator('#users-table-body tr', { hasText: username })).toHaveCount(0, { timeout: 5000 });
});

test('a chapter that fails to load offers "Tentar Novamente" (M10)', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await waitForFirstChapter(page);
  // Chapter requests of the previous version (/api/chapters) and of the rewrite (/api/documents).
  const chapterRequests = /\/api\/(chapters\?|documents\/[^/]+\/[^/]+\/chapters\/)/;
  await page.route(chapterRequests, (route) => route.abort());
  const retry = page.locator('#chapters-container .btn-retry-chapter').first();
  for (let i = 0; i < 60 && (await retry.count()) === 0; i++) {
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(150);
  }
  await expect(retry).toBeVisible();
  await expect(page.getByText('Ocorreu uma falha ao carregar este capítulo.').first()).toBeVisible();
  const loaded = page.locator('#chapters-container [data-loaded="true"]');
  const failed = await page.locator('#chapters-container .btn-retry-chapter').count();
  const loadedBefore = await loaded.count();
  await page.unroute(chapterRequests);
  await retry.click();
  await expect(page.locator('#chapters-container .btn-retry-chapter')).toHaveCount(failed - 1, { timeout: 15_000 });
  await expect(loaded).toHaveCount(loadedBefore + 1);
});

test("question of another user selects that user's prefixed tag (Q6)", async ({ page }) => {
  await page.goto('/redes/questoes/ep1-2026-rtt-rto?q_owner=2');
  await expect(page.locator('#sidebar-active-tag-hint')).toHaveText('(ativo: user_2::p1)');
  expect(await page.evaluate(() => localStorage.getItem('study_selected_tag_redes'))).toBe('user_2::p1');
  await expect(page.locator('a[href="/redes/questoes?tag=user_2%3A%3Ap1"]').first()).toBeAttached();
});

test('hiding the tab records the reading position (M16)', async ({ page }) => {
  await page.goto('/pds?tag=teste-1#sec-1-3-cadeia-processamento');
  await waitForFirstChapter(page);
  await expect(page.locator('#mobile-current-section, a.toc-sub-link.is-active').first()).toBeAttached();
  await page.evaluate(() => localStorage.removeItem('last_visited_subject'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await expect
    .poll(async () => JSON.parse((await page.evaluate(() => localStorage.getItem('last_visited_subject'))) ?? '{}'))
    .toMatchObject({
      slug: 'pds',
      lastSectionTitle: '1.3 Cadeia Geral de Processamento Digital de Sinais Contínuos',
      lastUrl: '/pds?tag=teste-1#sec-1-3-cadeia-processamento',
    });
});
