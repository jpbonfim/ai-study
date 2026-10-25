import { expect, request, test } from '@playwright/test';

// L4. The limit is per client IP, so this run blocks the test machine for LOGIN_WINDOW_MINUTES:
// it only runs when asked (RUN_RATE_LIMIT=1), last, and the servers must be restarted afterwards.
test.skip(!process.env.RUN_RATE_LIMIT, 'Set RUN_RATE_LIMIT=1 to run (blocks logins from this machine).');

test('repeated failures are rate limited (L4)', async ({ baseURL }) => {
  const ctx = await request.newContext({ baseURL });
  for (let i = 0; i < 5; i++) {
    const res = await ctx.post('/api/login', { data: { username: 'admin', password: `errada-${i}` } });
    expect(res.status()).toBe(401);
  }
  for (const password of ['errada-5', 'admin-parity']) {
    const blocked = await ctx.post('/api/login', { data: { username: 'admin', password } });
    expect(blocked.status()).toBe(429);
    expect((await blocked.json()).error).toMatch(/Tente novamente em \d+ segundos/);
  }
  await ctx.dispose();
});
