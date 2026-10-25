import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { COLLEAGUE, login, waitForFirstChapter } from './helpers';

// Remaining items of docs/FEATURES.md, one test per item (or group of items), on both versions.

/** Records, at DOMContentLoaded (before any app script runs), the state of <html>. */
async function recordFirstPaintState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.documentElement;
      (window as unknown as { __firstPaint: unknown }).__firstPaint = {
        classes: root.className,
        fontSize: root.style.getPropertyValue('--reader-font-size'),
        codeTheme: root.getAttribute('data-code-theme'),
      };
    });
  });
}

const firstPaint = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __firstPaint: { classes: string; fontSize: string; codeTheme: string | null } })
        .__firstPaint,
  );

test.describe('signed in as admin', () => {
  test.beforeEach(async ({ page }) => login(page));

  test('theme and reading preferences are applied before the first paint (G4, G5)', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('study_theme', 'dark');
      localStorage.setItem('study_font_size', '21px');
      localStorage.setItem('study_code_theme', 'dracula');
    });
    await recordFirstPaintState(page);
    await page.goto('/pds?tag=teste-1');
    await expect.poll(() => firstPaint(page)).toBeTruthy();
    const reading = await firstPaint(page);
    expect(reading.classes).toMatch(/\btheme-dark\b/);
    expect(reading.classes).toMatch(/\bdark\b/);
    expect(reading.fontSize).toBe('21px');
    expect(reading.codeTheme).toBe('dracula');
    await page.goto('/conta');
    await expect.poll(() => firstPaint(page)).toBeTruthy();
    expect((await firstPaint(page)).classes).toMatch(/\btheme-dark\b/);
  });

  test('desktop sidebar state is stored in study_sidebar_collapsed (G6)', async ({ page }) => {
    await page.goto('/pds?tag=teste-1');
    await waitForFirstChapter(page);
    await page.locator('.sidebar-close-btn').first().click();
    expect(await page.evaluate(() => localStorage.getItem('study_sidebar_collapsed'))).toBe('true');
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);
    await page.locator('#desktop-sidebar-open-btn').click();
    expect(await page.evaluate(() => localStorage.getItem('study_sidebar_collapsed'))).toBe('false');
  });

  test('theme menu: check mark, closing outside, settings shortcut (G8)', async ({ page }) => {
    await page.goto('/');
    const menu = page.locator('.theme-dropdown-menu').first();
    await page.locator('.theme-dropdown-trigger').first().click();
    await expect(menu).toBeVisible();
    await expect(menu.locator('.theme-opt-btn[data-theme-val="paper"] .theme-check')).toBeVisible();
    await expect(menu.locator('.theme-opt-btn[data-theme-val="dark"] .theme-check')).toBeHidden();
    await page.mouse.click(700, 600);
    await expect(menu).toBeHidden();
    await page.locator('a[href="/configuracoes"]').first().click();
    await expect(page).toHaveURL(/\/configuracoes$/);
  });

  test('?clear_cache and ?bust also clear the chapter cache and leave the URL (G10)', async ({ page }) => {
    for (const param of ['clear_cache=1', 'bust']) {
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('study_cache_v2:legacy', 'x'));
      await page.goto(`/pds?tag=teste-1&${param}`);
      await expect(page).not.toHaveURL(/clear_cache|bust/);
      await expect(page).toHaveURL(/tag=teste-1/);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('study_cache_v2:legacy'))).toBeNull();
    }
  });

  test('home: subject list items, accent-insensitive search and clear button (H1, H3)', async ({ page }) => {
    await page.goto('/');
    const pds = page.locator('#sidebar-materias-nav .sidebar-materia-item[data-materia-slug="pds"]');
    await expect(pds).toContainText('PTC3214');
    await expect(pds).toContainText('Processamento Digital de Sinais');
    await page.fill('#sidebar-materia-search', 'ELETRONICA');
    await expect(page.locator('#sidebar-materias-nav .sidebar-materia-item:visible')).toHaveCount(1);
    await expect(page.locator('#sidebar-materias-count')).toHaveText('1 encontrada');
    await page.click('#sidebar-materia-search-clear');
    await expect(page.locator('#sidebar-materia-search')).toHaveValue('');
    await expect(page.locator('#sidebar-materias-count')).toHaveText('12 cadastradas');
    await page.fill('#sidebar-materia-search', 'xyz-nada');
    await expect(page.locator('#sidebar-materias-empty')).toHaveText('Nenhuma disciplina encontrada.');
  });

  test('home: account card, shared subjects with owner links (H4, H6, H7)', async ({ page }) => {
    await page.goto('/');
    const shared = page.locator('#sidebar-materias-nav .sidebar-materia-item[data-materia-slug="redes-colega"]');
    await expect(shared).toContainText('De: Colega de Turma');
    await expect(shared).toHaveAttribute('href', '/redes-colega?owner=2');
    await expect(page.locator('main a[href="/redes-colega?owner=2"]').first()).toBeAttached();
    await page.locator('#home-sidebar a[href="/conta"]').click();
    await expect(page).toHaveURL(/\/conta$/);
  });

  test('home: "Continuar estudo" for a question (H5)', async ({ page }) => {
    await page.goto('/pds/questoes/teste-1-2023-q1');
    await expect(page.locator('.question-container')).toBeVisible();
    await page.goto('/');
    await expect(page.locator('#recent-continue-btn-text')).toHaveText('Continuar Questão');
    await expect(page.locator('#recent-continue-btn')).toHaveAttribute('href', '/pds/questoes/teste-1-2023-q1');
    await expect(page.locator('#recent-desc')).not.toBeEmpty();
  });

  test('subject resolution: shared without owner param, and unknown subject (M1)', async ({ page }) => {
    await page.goto('/redes-colega');
    await expect(page.locator('#academic-sidebar h2')).toContainText('De: Colega de Turma');
    await page.goto('/nao-existe-materia');
    await expect(page).toHaveURL(/\/\?error=materia_nao_encontrada$/);
  });

  test('subject sidebar: library link and offline download (M2)', async ({ page }) => {
    await page.goto('/pds?tag=teste-1');
    await expect(page.locator('#academic-sidebar')).toContainText('Escola Politécnica da USP');
    await expect(page.locator('#academic-sidebar a[aria-label^="Baixar"]')).toBeVisible();
    await page.locator('#academic-sidebar a', { hasText: 'Todas as Matérias' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("other users' tags toggle is remembered (M4)", async ({ page }) => {
    await page.goto('/redes?tag=p1');
    await waitForFirstChapter(page);
    await page.click('#other-users-tags-toggle');
    await expect(page.locator('#other-users-tags-toggle')).toHaveText('Ativado');
    expect(await page.evaluate(() => localStorage.getItem('study_show_other_tags'))).toBe('true');
    await page.reload();
    await expect(page.locator('#other-users-tags-toggle')).toHaveText('Ativado');
  });

  test('notebook header, footer link and a tag without chapters (M7)', async ({ page }) => {
    await page.goto('/pds?tag=teste-1');
    await waitForFirstChapter(page);
    await expect(page.locator('#header-questions-count')).not.toBeEmpty();
    await expect(page.locator('#footer-banco-link')).toHaveAttribute('href', /\/pds\/questoes\?tag=teste-1/);
    await page.goto('/pds?tag=tag-sem-capitulos');
    await expect(page.locator('#no-chapters-for-tag')).toBeVisible();
  });

  test('table of contents follows the tag; a section without chapters switches (M9)', async ({ page }) => {
    await page.goto('/pds?tag=p1&type=materia');
    await waitForFirstChapter(page);
    await expect(page.locator('#chapters-container')).toHaveAttribute('data-rendered-section', 'questoes');
    await expect(page.locator('.toc-collapsible-group[data-group-type="materia"]')).toBeHidden();
    const links = await page
      .locator('#sidebar-toc-nav a:visible')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    expect(links.length).toBeGreaterThan(0);
    await page.goto('/pds?tag=teste-1&type=materia');
    await waitForFirstChapter(page);
    await expect(page.locator('.toc-collapsible-group[data-group-type="materia"]')).toBeVisible();
  });

  test('scroll spy marks the parent chapter of the active subsection (M13)', async ({ page }) => {
    await page.goto('/pds?tag=teste-1&type=materia');
    await waitForFirstChapter(page);
    await page.locator('#sidebar-toc-nav a.toc-sub-link[data-toc-id="sec-1-3-cadeia-processamento"]').click();
    await expect(page.locator('#sidebar-toc-nav .is-parent-active').first()).toBeAttached();
  });

  test('unknown question goes back to the bank (Q1)', async ({ page }) => {
    await page.goto('/pds/questoes/nao-existe-q');
    await expect(page).toHaveURL(/\/pds\/questoes\?error=questao_nao_encontrada$/);
  });

  test('settings: close falls back to the last study position, cancel goes home (S2, S6)', async ({ page }) => {
    await page.goto('/pds?tag=teste-1');
    await waitForFirstChapter(page);
    await page.goto('/configuracoes'); // typed URL: no in-app previous page
    await page.locator('main .close-settings-action').click();
    await expect(page).toHaveURL(/\/pds\?tag=teste-1/);
    await page.goto('/configuracoes');
    await page
      .getByRole('link', { name: 'Cancelar' })
      .or(page.getByRole('button', { name: 'Cancelar' }))
      .first()
      .click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('settings: custom inputs keep their limits (S4)', async ({ page }) => {
    await page.goto('/configuracoes');
    for (const [input, min, max] of [
      ['#custom-size-input', '12', '36'],
      ['#custom-width-input', '450', '2200'],
      ['#custom-code-size-input', '8', '32'],
      ['#custom-math-scale-input', '40', '95'],
      ['#custom-math-min-input', '0', '20'],
    ] as const) {
      await expect(page.locator(input)).toHaveAttribute('min', min);
      await expect(page.locator(input)).toHaveAttribute('max', max);
    }
  });

  test('account: profile details (A1) and the full archive download (A2)', async ({ page }) => {
    await page.goto('/conta');
    const body = page.locator('body');
    await expect(body).toContainText('@admin • ID #1');
    await expect(body).toContainText('Disciplinas cadastradas no seu archive: 11');
    await expect(body).toContainText('Limite de upload: 100 MB');
    const download = page.waitForEvent('download');
    await page.locator('a[href="/api/download?type=archive"]').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.zip$/);
    const zip = fs.readFileSync((await file.path()) as string);
    expect(zip.subarray(0, 2).toString()).toBe('PK');
  });

  test('admin: tab counts, own row without delete, server validation (D1, D2)', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('.tab-btn', { hasText: 'Usuários' })).toContainText('(2)');
    await expect(page.locator('.tab-btn', { hasText: 'Permissões' })).toContainText('(2)');
    await expect(page.locator('#users-table-body tr', { hasText: '@admin' }).getByText('Excluir')).toHaveCount(0);
    await page.click('#open-create-user-modal');
    await page.fill('#form-create-user input[name="username"]', 'x');
    await page.fill('#form-create-user input[name="displayName"]', 'X');
    await page.fill('#form-create-user input[name="password"]', '123');
    await page.locator('#form-create-user button[type="submit"]').click();
    // The form's own rules stop it before the server (password needs 6 characters).
    expect(
      await page
        .locator('#form-create-user input[name="password"]')
        .evaluate((i: HTMLInputElement) => i.validity.tooShort),
    ).toBe(true);
    await expect(page.locator('#users-table-body tr')).toHaveCount(2);
  });

  test('admin: logs page size and total (D4)', async ({ page }) => {
    await page.goto('/admin');
    await page.locator('.tab-btn', { hasText: 'Logs' }).click();
    await expect(page.locator('#logs-total-indicator')).toHaveText(/\d+/);
    const rows = await page.locator('#logs-table-body tr').count();
    expect(rows).toBeLessThanOrEqual(30);
    const total = Number((await page.locator('#logs-total-indicator').textContent())?.match(/\d+/)?.[0]);
    if (total > 30) {
      expect(rows).toBe(30);
      await page.click('#logs-next-btn');
      await expect(page.locator('#logs-page-indicator')).toHaveText(/Página 2 de/);
    }
  });
});

test('mobile: swipes starting on code or formulas do not open the menu (G7)', async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await login(page);
  await page.goto('/deep-learning-specialization?tag=neural-networks');
  await waitForFirstChapter(page);
  const code = page.locator('pre.shiki').first();
  await code.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const target = document.querySelector('pre.shiki') as HTMLElement;
    const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 400 });
    target.dispatchEvent(
      new TouchEvent('touchstart', { touches: [touch(10)], changedTouches: [touch(10)], bubbles: true }),
    );
    target.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch(150)], bubbles: true }));
  });
  await page.waitForTimeout(300);
  await expect(page.locator('#academic-sidebar')).toHaveClass(/-translate-x-full/);
  await context.close();
});

test.describe('login page', () => {
  test('busy state while authenticating (L2) and network errors (L3)', async ({ page }) => {
    await page.goto('/login');
    await page.route('**/api/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin-parity');
    await page.click('#submit-btn');
    await expect(page.locator('#submit-text')).toHaveText('Autenticando...');
    await expect(page.locator('#submit-spinner')).toBeVisible();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));

    await page.context().clearCookies();
    await page.goto('/login');
    await page.unroute('**/api/login');
    await page.route('**/api/login', (route) => route.abort());
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin-parity');
    await page.click('#submit-btn');
    await expect(page.locator('#error-banner')).toHaveText('Erro de rede ou servidor indisponível. Tente novamente.');
  });
});

test('subject upload as a student replaces only that subject (A4)', async ({ page }, testInfo) => {
  const slug = `e2e-upload-${testInfo.project.name}`;
  const subjectDir = path.resolve('..', 'data-dev', 'archives', '2', slug);
  // Minimal ZIP with one chapter, built with the same library the server uses for downloads.
  const { ZipFile } = await import('yazl');
  const zip = new ZipFile();
  // Two top-level entries: a single root folder would be stripped (A5).
  zip.addBuffer(Buffer.from('{"name":"Upload E2E","code":"E2E0001"}'), 'materia.json');
  zip.addBuffer(
    Buffer.from('---\ntitle: "Cap"\ntopic: "T"\nchapter: 1\ndescription: "D"\ntags: ["p1"]\n---\nTexto.\n'),
    'resumos/cap1.mdx',
  );
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
  try {
    await login(page, COLLEAGUE);
    await page.goto('/conta');
    await page.fill('#materia_slug_input', slug);
    await page.setInputFiles('#materia-form input[type="file"]', {
      name: `${slug}.zip`,
      mimeType: 'application/zip',
      buffer: Buffer.concat(chunks),
    });
    await page.click('#submit-materia-btn');
    await expect(page.locator('#feedback-alert')).toBeVisible();
    await expect(page.locator('#feedback-alert')).toHaveText(`Matéria "${slug}" atualizada com sucesso (2 arquivos).`);
    expect(fs.existsSync(path.join(subjectDir, 'resumos', 'cap1.mdx'))).toBe(true);
    expect(fs.existsSync(path.resolve('..', 'data-dev', 'archives', '2', 'redes-colega'))).toBe(true);
  } finally {
    fs.rmSync(subjectDir, { recursive: true, force: true });
  }
});
