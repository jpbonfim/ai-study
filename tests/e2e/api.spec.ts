import { type APIRequestContext, expect, request, test } from '@playwright/test';
import { ADMIN, COLLEAGUE } from './helpers';

// HTTP contract used by the pages and by scripts/sync_archive.py (G1, G3, L5, D2, Y1-Y3, Y5, Y6; the manifest comes as `{ success, manifest }`), checked
// with the same requests on both versions (the rewrite is reached through the Vite proxy).

async function api(baseURL: string | undefined): Promise<APIRequestContext> {
  return request.newContext({ baseURL });
}

async function sessionToken(ctx: APIRequestContext, user = ADMIN): Promise<string> {
  const res = await ctx.post('/api/login', { data: user });
  expect(res.status()).toBe(200);
  return /session_id=([^;]+)/.exec(res.headers()['set-cookie'] ?? '')?.[1] ?? '';
}

test('anonymous API calls get 401 JSON with a Basic challenge (G1)', async ({ baseURL }) => {
  const ctx = await api(baseURL);
  const res = await ctx.get('/api/sync/status');
  expect(res.status()).toBe(401);
  expect(res.headers()['content-type']).toContain('application/json');
  expect(res.headers()['www-authenticate']).toMatch(/^Basic/);
  expect(await res.json()).toHaveProperty('error');
  await ctx.dispose();
});

test('admin API is forbidden for normal users with 403 JSON (G3)', async ({ baseURL }) => {
  const ctx = await api(baseURL);
  await sessionToken(ctx, COLLEAGUE);
  const res = await ctx.get('/admin/api/users');
  expect(res.status()).toBe(403);
  expect(await res.json()).toHaveProperty('error');
  await ctx.dispose();
});

test('login cookie and form login (L5, Y1)', async ({ baseURL }) => {
  const ctx = await api(baseURL);
  const res = await ctx.post('/api/login', { data: ADMIN });
  const cookie = res.headers()['set-cookie'] ?? '';
  expect(cookie).toMatch(/session_id=[^;]+/);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Lax/i);
  expect(cookie).not.toMatch(/Secure/i); // plain HTTP here; Secure only behind HTTPS
  const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);
  expect(maxAge).toBe(7 * 24 * 60 * 60);

  const form = await ctx.post('/api/login', { form: ADMIN });
  expect(form.status()).toBe(200);
  expect(form.headers()['set-cookie']).toMatch(/session_id=/);
  await ctx.dispose();
});

test('login and failed login are logged (L5)', async ({ baseURL }) => {
  const ctx = await api(baseURL);
  const failed = await ctx.post('/api/login', { data: { username: COLLEAGUE.username, password: 'errada' } });
  expect(failed.status()).toBe(401);
  await sessionToken(ctx);
  const logs = await (await ctx.get('/admin/api/logs?action=login_failed')).json();
  expect(JSON.stringify(logs)).toContain('login_failed');
  await ctx.dispose();
});

test('Basic and Bearer authentication (Y2) and the sync manifest (Y3)', async ({ baseURL }) => {
  const ctx = await api(baseURL);
  const token = await sessionToken(ctx);
  const anonymous = await api(baseURL);
  const basic = `Basic ${Buffer.from(`${ADMIN.username}:${ADMIN.password}`).toString('base64')}`;
  const viaBasic = await anonymous.get('/api/sync/status', { headers: { authorization: basic } });
  expect(viaBasic.status()).toBe(200);
  const viaBearer = await anonymous.get('/api/sync/status', { headers: { authorization: `Bearer ${token}` } });
  expect(viaBearer.status()).toBe(200);

  const { success, manifest } = await viaBasic.json();
  expect(success).toBe(true);
  expect(manifest).toMatchObject({ userId: 1, username: 'admin' });
  expect(typeof manifest.generatedAt).toBe('string');
  const [path, entry] = Object.entries(manifest.files as Record<string, unknown>)[0] ?? [];
  expect(path).toBeTruthy();
  expect(entry).toEqual({ size: expect.any(Number), mtime: expect.any(Number), hash: expect.any(String) });
  await anonymous.dispose();
  await ctx.dispose();
});

test('sync pull returns a ZIP with the requested files (Y5)', async ({ baseURL }) => {
  const ctx = await api(baseURL);
  await sessionToken(ctx);
  const { manifest } = await (await ctx.get('/api/sync/status')).json();
  const files = Object.keys(manifest.files).slice(0, 2);
  const res = await ctx.post('/api/sync/pull', { data: { files } });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('zip');
  const body = await res.body();
  expect(body.subarray(0, 2).toString()).toBe('PK');
  for (const file of files) expect(body.includes(Buffer.from(file))).toBe(true);
  await ctx.dispose();
});

test('logout in JSON and redirect forms (Y6)', async ({ baseURL }) => {
  const ctx = await api(baseURL);
  await sessionToken(ctx);
  const json = await ctx.post('/api/logout', { headers: { accept: 'application/json' } });
  expect(await json.json()).toEqual({ success: true });
  expect((await ctx.get('/api/sync/status')).status()).toBe(401);

  await sessionToken(ctx);
  const redirect = await ctx.get('/api/logout', { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers().location).toBe('/login');
  expect((await ctx.get('/api/sync/status')).status()).toBe(401);
  await ctx.dispose();
});

test('an admin cannot delete their own account (D2)', async ({ baseURL }) => {
  const ctx = await api(baseURL);
  await sessionToken(ctx);
  const res = await ctx.delete('/admin/api/users?id=1');
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: 'Você não pode remover sua própria conta de administrador.' });
  await ctx.dispose();
});
