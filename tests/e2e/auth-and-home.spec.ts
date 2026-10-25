import { expect, test } from '@playwright/test';
import { COLLEAGUE, login } from './helpers';

test.describe('authentication', () => {
  test('anonymous pages redirect to login keeping the destination', async ({ page }) => {
    await page.goto('/pds?tag=teste-1');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fpds%3Ftag%3Dteste-1$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('opening the site signed out never triggers the browser login dialog', async ({ page }) => {
    // A 401 with `WWW-Authenticate` makes real browsers show their native login dialog (headless
    // Chromium does not), covering the site's own login page.
    const challenges: string[] = [];
    page.on('response', (res) => {
      if (res.headers()['www-authenticate']) challenges.push(res.url());
    });
    for (const path of ['/', '/pds?tag=teste-1', '/admin', '/conta']) {
      await page.goto(path);
      await expect(page.locator('#login-form')).toBeVisible();
    }
    expect(challenges).toEqual([]);
  });

  test('wrong credentials show the server message', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'errada');
    await page.click('#submit-btn');
    await expect(page.locator('#error-banner')).toHaveText(/Credenciais inválidas/);
  });

  test('login follows the redirect parameter, and /login redirects when signed in', async ({ page }) => {
    await page.goto('/login?redirect=%2Fconta');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin-parity');
    await page.click('#submit-btn');
    await expect(page).toHaveURL(/\/conta$/);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
  });

  test('logout ends the session', async ({ page }) => {
    await login(page);
    await page.goto('/conta');
    await page.getByText('Sair da Sessão').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('admin area is forbidden for normal users', async ({ page }) => {
    await login(page, COLLEAGUE);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/\?error=forbidden$/);
  });

  test('/upload goes to the account page', async ({ page }) => {
    await login(page);
    await page.goto('/upload');
    await expect(page).toHaveURL(/\/conta$/);
  });
});

test.describe('home', () => {
  test.beforeEach(async ({ page }) => login(page));

  test('subject search filters the sidebar', async ({ page }) => {
    await page.goto('/');
    await page.fill('#sidebar-materia-search', 'redes');
    const visible = page.locator('#sidebar-materias-nav .sidebar-materia-item:visible');
    await expect(visible).toHaveCount(3);
    await expect(page.locator('#sidebar-materias-count')).toHaveText('3 encontradas');
    await page.fill('#sidebar-materia-search', 'xyz-nada');
    await expect(page.locator('#sidebar-materias-empty')).toBeVisible();
    await page.press('#sidebar-materia-search', 'Escape');
    await expect(page.locator('#sidebar-materias-count')).toHaveText('12 cadastradas');
  });

  test('recently opened subject comes first and feeds "Continuar estudo"', async ({ page }) => {
    await page.goto('/pds?tag=teste-1');
    await expect(page.locator('#chapters-container [data-loaded="true"]').first()).toBeVisible();
    await page.goto('/');
    await expect(page.locator('#sidebar-materias-nav .sidebar-materia-item').first()).toHaveAttribute(
      'data-materia-slug',
      'pds',
    );
    await expect(page.locator('#recent-title')).toHaveText('Processamento Digital de Sinais');
    await expect(page.locator('#recent-continue-btn')).toHaveAttribute('href', /\/pds\?tag=teste-1/);
    await expect(page.locator('#recent-time-badge')).toHaveText(/Último acesso:/);
  });

  test('theme menu switches and persists the theme', async ({ page }) => {
    await page.goto('/');
    await page.locator('.theme-dropdown-trigger').click();
    await page.locator('.theme-opt-btn[data-theme-val="oled"]').click();
    await expect(page.locator('html')).toHaveClass(/theme-oled/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/theme-oled/);
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('desktop sidebar collapses and re-opens', async ({ page }) => {
    await page.goto('/');
    await page.locator('.sidebar-close-btn').click();
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);
    await expect(page.locator('#desktop-sidebar-open-btn')).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);
    await page.locator('#desktop-sidebar-open-btn').click();
    await expect(page.locator('html')).not.toHaveClass(/sidebar-collapsed/);
  });

  test('mobile drawer opens and closes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#home-sidebar')).toHaveClass(/-translate-x-full/);
    await page.click('#mobile-sidebar-toggle');
    await expect(page.locator('#home-sidebar')).not.toHaveClass(/-translate-x-full/);
    await page.locator('#home-sidebar-backdrop').click({ position: { x: 380, y: 400 } });
    await expect(page.locator('#home-sidebar')).toHaveClass(/-translate-x-full/);
  });
});
