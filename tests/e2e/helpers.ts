import { expect, type Page } from '@playwright/test';

export const ADMIN = { username: 'admin', password: 'admin-parity' };
export const COLLEAGUE = { username: 'colega', password: 'colega-parity' };

export async function login(page: Page, user = ADMIN): Promise<void> {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.fill('#username', user.username);
  await page.fill('#password', user.password);
  await page.click('#submit-btn');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Waits until the first chapter of the reading flow has content. */
export async function waitForFirstChapter(page: Page): Promise<void> {
  await expect(page.locator('#chapters-container [data-loaded="true"]').first()).toBeVisible();
}
