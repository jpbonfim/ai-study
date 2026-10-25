import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.beforeEach(async ({ page }) => login(page));

test('settings: draft, save and factory reset', async ({ page }) => {
  await page.goto('/configuracoes');
  await expect(page.locator('#active-size-badge')).toHaveText('18px (Salvo)');
  await page.locator('.size-opt-btn[data-size="20px"]').click();
  await expect(page.locator('#status-dot')).toHaveClass(/bg-amber-500/);
  await expect(page.locator('#preview-meta-info')).toHaveText('Garamond • 20px • 768px • Justificado');
  await page.click('#top-save-btn');
  await expect(page.locator('#active-size-badge')).toHaveText('20px (Salvo)');
  await expect(page.locator('#status-message')).toContainText('Alterações salvas com sucesso');
  expect(await page.evaluate(() => localStorage.getItem('study_font_size'))).toBe('20px');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--reader-font-size'))).toBe('20px');

  await page.locator('.code-theme-opt-btn[data-code-theme-opt="dracula"]').click();
  await page.click('#bottom-save-btn');
  await expect(page.locator('#active-code-badge')).toHaveText('Dracula • JetBrains Mono • 13px (Salvo)');

  await page.click('#reset-defaults-btn');
  await expect(page.locator('#active-size-badge')).toHaveText('18px (Salvo)');
  await expect(page.locator('#status-message')).toContainText('Padrões de fábrica restaurados');
});

test('settings: custom value and closing back to the previous page', async ({ page }) => {
  await page.goto('/pds?tag=teste-1');
  await page.locator('a[href="/configuracoes"]').click();
  await expect(page).toHaveURL(/\/configuracoes$/);
  await page.fill('#custom-width-input', '1000');
  await expect(page.locator('#preview-meta-info')).toHaveText('Garamond • 18px • 1000px • Justificado');
  await page.locator('main .close-settings-action').click();
  await expect(page).toHaveURL(/\/pds\?tag=teste-1/);
});

test('account page shows profile, limits and download links', async ({ page }) => {
  await page.goto('/conta');
  await expect(page.locator('main, body')).toContainText('Limite de upload: 100 MB');
  await expect(page.getByText('Painel Admin')).toBeVisible();
  await expect(page.locator('a[href="/api/download?type=archive"]')).toBeVisible();
  await expect(page.locator('#submit-full-btn')).toBeDisabled();
  await page.fill('#confirm-text-full', 'CONFIRMAR');
  await expect(page.locator('#submit-full-btn')).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.click('#download-materia-btn');
  expect((await download).suggestedFilename()).toMatch(/-archive\.zip$/);
});

test('subject upload rejects files with forbidden extensions', async ({ page }) => {
  await page.goto('/conta');
  await page.fill('#materia_slug_input', 'nao-existe-teste');
  await page.setInputFiles('#materia-form input[type="file"]', {
    name: 'x.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('nao e um zip'),
  });
  await page.click('#submit-materia-btn');
  await expect(page.locator('#feedback-alert')).toHaveText(/ZIP corrompido|formato inválido/);
});

test('admin: create, change password and delete a user', async ({ page }) => {
  const username = `e2e${Date.now() % 100000}`;
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/admin');
  await page.click('#open-create-user-modal');
  await page.fill('#form-create-user input[name="username"]', username);
  await page.fill('#form-create-user input[name="displayName"]', 'Usuário E2E');
  await page.fill('#form-create-user input[name="password"]', 'senha123');
  await page.locator('#form-create-user button[type="submit"]').click();
  await expect(page.locator('#admin-alert')).toContainText(`Usuário "${username}" criado com sucesso!`);
  const row = page.locator('#users-table-body tr', { hasText: username });
  await expect(row).toBeVisible({ timeout: 5000 });

  await row.getByText('Senha').click();
  await expect(page.locator('#password-modal-subtitle')).toHaveText(`Defina a nova senha para o usuário @${username}`);
  await page.fill('#new-password-input', 'outrasenha');
  await page.locator('#form-change-password button[type="submit"]').click();
  await expect(page.locator('#admin-alert')).toContainText('Senha atualizada com sucesso!');

  await row.getByText('Excluir').click();
  await expect(page.locator('#admin-alert')).toContainText(`Usuário @${username} excluído com sucesso.`);
  await expect(page.locator('#users-table-body tr', { hasText: username })).toHaveCount(0, { timeout: 5000 });
});

test('admin: edit opens a working form (it did nothing before)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'old', 'The previous version had no edit dialog.');
  await page.goto('/admin');
  await page.locator('#users-table-body tr', { hasText: 'colega' }).getByText('Editar').click();
  await expect(page.locator('#edit-display-name')).toHaveValue('Colega de Turma');
  await page.getByRole('button', { name: 'Cancelar' }).last().click();
});

test('admin: permissions list the owner subjects and logs filter', async ({ page }) => {
  await page.goto('/admin');
  await page.locator('.tab-btn', { hasText: 'Permissões' }).click();
  await expect(page.locator('#permissions-table-body tr')).toHaveCount(2);
  await page.selectOption('#perm-owner-select', '2');
  await expect(page.locator('#perm-materia-select')).toBeEnabled();
  await expect(page.locator('#perm-materia-select option')).toHaveCount(2);

  await page.locator('.tab-btn', { hasText: 'Logs' }).click();
  await page.selectOption('#filter-log-action', 'login');
  await page.locator('#logs-filter-form button[type="submit"]').click();
  await expect(page.locator('#logs-page-indicator')).toHaveText(/Página 1 de \d+/);
  const actions = await page.locator('#logs-table-body tr td:nth-child(3)').allTextContents();
  expect(actions.every((a) => a.trim() === 'login')).toBe(true);
});

test('offline export downloads the subject as a single HTML file', async ({ page }, testInfo) => {
  await page.goto('/pds?tag=teste-1');
  const download = page.waitForEvent('download');
  await page.locator('a[aria-label^="Baixar"]').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('processamento-digital-de-sinais.html');
  if (testInfo.project.name === 'old') return; // the previous export read an unrelated folder
  const html = await (await import('node:fs')).promises.readFile((await file.path()) as string, 'utf8');
  expect(html).toContain('Caderno de Estudos Offline');
  expect(html).toContain('Capítulo 2: Amostragem e Reconstrução de Sinais');
});
