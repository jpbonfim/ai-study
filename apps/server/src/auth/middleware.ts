import { deleteCookie, getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { type AppEnv, jsonError, requestOrigin } from '../http/context';
import type { UserService } from '../users/user-service';
import type { LoginRateLimiter } from './rate-limiter';
import type { SessionStore } from './session-store';

export const SESSION_COOKIE = 'session_id';

/**
 * Resolves who is calling: `Authorization: Bearer <session>`, `Authorization: Basic` (used by the
 * sync CLI) or the `session_id` cookie. Never rejects; see `requireUser` / `requireAdmin`.
 */
export function identify(deps: { sessions: SessionStore; users: UserService; rateLimiter: LoginRateLimiter }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    c.set('user', null);
    c.set('sessionId', null);

    const auth = c.req.header('authorization');
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7).trim();
      const user = token ? deps.sessions.findUser(token) : null;
      if (user) {
        c.set('user', user);
        c.set('sessionId', token);
      }
    } else if (auth?.startsWith('Basic ')) {
      const key = requestOrigin(c).ip ?? 'unknown';
      if (deps.rateLimiter.check(key).allowed) {
        const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
        const colon = decoded.indexOf(':');
        if (colon !== -1) {
          const user = await deps.users.authenticate(decoded.slice(0, colon), decoded.slice(colon + 1));
          if (user) {
            deps.rateLimiter.recordSuccess(key);
            c.set('user', user);
          } else {
            deps.rateLimiter.recordFailure(key);
          }
        }
      }
    }

    const cookieSession = getCookie(c, SESSION_COOKIE);
    if (cookieSession) {
      if (!c.get('user')) {
        const user = deps.sessions.findUser(cookieSession);
        if (user) c.set('user', user);
        else deleteCookie(c, SESSION_COOKIE, { path: '/' });
      }
      if (!c.get('sessionId') && c.get('user')) c.set('sessionId', cookieSession);
    }

    await next();
  });
}

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) {
    c.header('WWW-Authenticate', 'Basic realm="Academic Study Platform"');
    return jsonError(c, 401, 'Não autorizado. Credenciais inválidas ou ausentes.');
  }
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) {
    c.header('WWW-Authenticate', 'Basic realm="Academic Study Platform"');
    return jsonError(c, 401, 'Não autorizado. Credenciais inválidas ou ausentes.');
  }
  if (user.role !== 'admin') return jsonError(c, 403, 'Acesso negado. Requer privilégios de administrador.');
  await next();
});
