import type { APIRoute } from 'astro';
import {
  getUserByUsername,
  verifyPassword,
  createSession,
  checkRateLimit,
  recordLoginAttempt,
  getSessionMaxAgeMs,
} from '../../lib/auth';
import { logActivity } from '../../lib/log';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const ip = clientAddress || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  const userAgent = request.headers.get('user-agent') || null;

  // Rate Limiting
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: `Muitas tentativas de login falhas. Tente novamente em ${rateLimit.retryAfterSeconds || 60} segundos.`,
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  let username = '';
  let password = '';

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = await request.json();
      username = body.username || '';
      password = body.password || '';
    } catch {
      return new Response(JSON.stringify({ error: 'Formato de requisição inválido.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    username = String(formData.get('username') || '');
    password = String(formData.get('password') || '');
  }

  username = username.trim();

  if (!username || !password) {
    return new Response(JSON.stringify({ error: 'Usuário e senha são obrigatórios.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginAttempt(ip, false);
    logActivity(user ? user.id : null, 'login_failed', { username, reason: 'invalid_credentials' }, ip, userAgent);

    const remaining = checkRateLimit(ip).remainingAttempts;
    return new Response(
      JSON.stringify({
        error: 'Credenciais inválidas.',
        remainingAttempts: remaining,
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Sucesso no login
  recordLoginAttempt(ip, true);

  const { sessionId } = createSession(user.id, ip, userAgent);
  const maxAgeSeconds = Math.floor(getSessionMaxAgeMs() / 1000);
  const isHttps = request.url.startsWith('https:') || request.headers.get('x-forwarded-proto') === 'https';

  cookies.set('session_id', sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    maxAge: maxAgeSeconds,
  });

  logActivity(user.id, 'login', { username: user.username }, ip, userAgent);

  return new Response(
    JSON.stringify({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
