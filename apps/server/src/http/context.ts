import type { HttpBindings } from '@hono/node-server';
import type { Context } from 'hono';
import type { RequestOrigin } from '../logs/activity-log';
import type { PublicUser } from '../users/user-repository';

export interface AppEnv {
  Bindings: HttpBindings;
  Variables: {
    user: PublicUser | null;
    sessionId: string | null;
  };
}

export type AppContext = Context<AppEnv>;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Client address and user agent. `X-Forwarded-For` is only trusted when the direct peer is the
 * local reverse proxy; otherwise any client could spoof its address (and dodge rate limits).
 */
export function requestOrigin(c: AppContext): RequestOrigin {
  const peer = c.env?.incoming?.socket?.remoteAddress ?? null;
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ip = peer && LOOPBACK.has(peer) && forwarded ? forwarded : peer;
  return { ip, userAgent: c.req.header('user-agent') ?? null };
}

/** The authenticated user; only call behind `requireUser`. */
export function currentUser(c: AppContext): PublicUser {
  const user = c.get('user');
  if (!user) throw new Error('currentUser() used on an unauthenticated route');
  return user;
}

export function jsonError(c: AppContext, status: 400 | 401 | 403 | 404 | 413 | 429 | 500, error: string) {
  return c.json({ error }, status);
}

export function parsePositiveInt(value: string | undefined | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
