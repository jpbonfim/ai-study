import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { AppConfig } from '../config';
import { type AppEnv, currentUser, jsonError, requestOrigin } from '../http/context';
import type { ActivityLog, PageViewThrottle } from '../logs/activity-log';
import type { UserService } from '../users/user-service';
import { requireUser, SESSION_COOKIE } from './middleware';
import type { LoginRateLimiter } from './rate-limiter';
import type { SessionStore } from './session-store';

interface AuthRouteDeps {
  config: AppConfig;
  users: UserService;
  sessions: SessionStore;
  rateLimiter: LoginRateLimiter;
  activity: ActivityLog;
  pageViews: PageViewThrottle;
}

async function readCredentials(req: Request): Promise<{ username: string; password: string } | null> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = (await req.json()) as { username?: unknown; password?: unknown };
      return { username: String(body.username ?? ''), password: String(body.password ?? '') };
    } catch {
      return null;
    }
  }
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    return { username: String(form.get('username') ?? ''), password: String(form.get('password') ?? '') };
  }
  return { username: '', password: '' };
}

export function authRoutes(deps: AuthRouteDeps) {
  const app = new Hono<AppEnv>();

  app.post('/api/login', async (c) => {
    const origin = requestOrigin(c);
    const limiterKey = origin.ip ?? 'unknown';
    const decision = deps.rateLimiter.check(limiterKey);
    if (!decision.allowed) {
      return jsonError(
        c,
        429,
        `Muitas tentativas de login falhas. Tente novamente em ${decision.retryAfterSeconds || 60} segundos.`,
      );
    }

    const credentials = await readCredentials(c.req.raw);
    if (!credentials) return jsonError(c, 400, 'Formato de requisição inválido.');
    const username = credentials.username.trim();
    if (!username || !credentials.password) return jsonError(c, 400, 'Usuário e senha são obrigatórios.');

    const user = await deps.users.authenticate(username, credentials.password);
    if (!user) {
      deps.rateLimiter.recordFailure(limiterKey);
      deps.activity.record(
        deps.users.idOf(username),
        'login_failed',
        { username, reason: 'invalid_credentials' },
        origin,
      );
      return c.json(
        { error: 'Credenciais inválidas.', remainingAttempts: deps.rateLimiter.check(limiterKey).remainingAttempts },
        401,
      );
    }

    deps.rateLimiter.recordSuccess(limiterKey);
    const { sessionId } = deps.sessions.create(user.id, origin.ip, origin.userAgent);
    const isHttps = c.req.url.startsWith('https:') || c.req.header('x-forwarded-proto') === 'https';
    setCookie(c, SESSION_COOKIE, sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: isHttps,
      maxAge: deps.sessions.maxAgeSeconds,
    });
    deps.activity.record(user.id, 'login', { username: user.username }, origin);

    return c.json({
      success: true,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    });
  });

  app.all('/api/logout', (c) => {
    const user = c.get('user');
    const sessionId = c.get('sessionId');
    if (sessionId) {
      if (user) deps.activity.record(user.id, 'logout', null, { ip: null, userAgent: requestOrigin(c).userAgent });
      deps.sessions.delete(sessionId);
      deleteCookie(c, SESSION_COOKIE, { path: '/' });
    }
    if ((c.req.header('accept') || '').includes('application/json')) return c.json({ success: true });
    return c.redirect('/login');
  });

  /** Who is signed in, plus the per-user settings the SPA needs. */
  app.get('/api/session', requireUser, (c) => {
    const user = currentUser(c);
    const limitBytes = user.role === 'admin' ? deps.config.maxUploadBytes.admin : deps.config.maxUploadBytes.normal;
    return c.json({
      user,
      uploadLimitMb: Math.round(limitBytes / (1024 * 1024)),
      clientCache: deps.config.clientCache,
    });
  });

  /** Page views of the SPA (throttled per session and path). */
  app.post('/api/activity/page-view', requireUser, async (c) => {
    const user = currentUser(c);
    const body = (await c.req.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof body.path === 'string' ? body.path.slice(0, 512) : '';
    if (path && deps.pageViews.shouldLog(c.get('sessionId') ?? `user-${user.id}`, path)) {
      deps.activity.record(user.id, 'page_view', { path }, requestOrigin(c));
    }
    return c.body(null, 204);
  });

  return app;
}
