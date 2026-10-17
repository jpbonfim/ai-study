import { defineMiddleware } from 'astro:middleware';
import { getSessionUser, authenticateUser } from './lib/auth';
import type { SafeUser } from './lib/db';
import { logActivity } from './lib/log';

// Rotas públicas que não exigem autenticação
const PUBLIC_PREFIXES = [
  '/_astro/',
  '/_image',
  '/favicon.svg',
  '/api/login',
];

const PUBLIC_EXACT = [
  '/login',
  '/favicon.svg',
];

// Cache em memória para limitar logs de page_view frequentes (1 por rota a cada 5 minutos por sessão)
const pageViewThrottle = new Map<string, number>();

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;

  // 1. Recursos estáticos e rotas públicas
  if (
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_EXACT.includes(pathname)
  ) {
    // Se o usuário já estiver logado e tentar acessar /login, redireciona para a home
    if (pathname === '/login') {
      const sessionId = context.cookies.get('session_id')?.value;
      if (sessionId) {
        const user = getSessionUser(sessionId);
        if (user) {
          context.locals.user = user;
          return context.redirect('/');
        }
      }
    }
    return next();
  }

  // 2. Validação da Sessão / Credenciais
  let sessionId = context.cookies.get('session_id')?.value;
  let user: SafeUser | null = null;

  // Se houver cabeçalho Authorization (Bearer ou Basic), processa para chamadas de API
  const authHeader = context.request.headers.get('authorization');
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) {
        user = getSessionUser(token);
        if (user) {
          sessionId = token;
        }
      }
    } else if (authHeader.startsWith('Basic ')) {
      try {
        const credentials = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf-8');
        const colonIdx = credentials.indexOf(':');
        if (colonIdx !== -1) {
          const username = credentials.slice(0, colonIdx);
          const password = credentials.slice(colonIdx + 1);
          user = authenticateUser(username, password);
        }
      } catch {}
    }
  }

  // Fallback para cookie de sessão
  if (!user && sessionId) {
    user = getSessionUser(sessionId);
    if (!user) {
      context.cookies.delete('session_id', { path: '/' });
    }
  }

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Não autorizado. Credenciais inválidas ou ausentes.' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Basic realm="Academic Study Platform"',
        },
      });
    }
    const redirectUrl = pathname !== '/' ? `/login?redirect=${encodeURIComponent(pathname + search)}` : '/login';
    return context.redirect(redirectUrl);
  }

  // Injeta usuário no contexto do Astro
  context.locals.user = user;
  if (sessionId) {
    context.locals.sessionId = sessionId;
  }

  // 3. Controle de Acesso para Rotas de Administrador
  if (pathname.startsWith('/admin') && user.role !== 'admin') {
    if (pathname.startsWith('/admin/api/')) {
      return new Response(JSON.stringify({ error: 'Acesso negado. Requer privilégios de administrador.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect('/?error=forbidden');
  }

  // 4. Registro Throttled de Page View
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/_')) {
    const throttleKey = `${sessionId}:${pathname}`;
    const now = Date.now();
    const lastLogged = pageViewThrottle.get(throttleKey) || 0;

    if (now - lastLogged > 5 * 60 * 1000) {
      pageViewThrottle.set(throttleKey, now);
      let ip: string | null = null;
      try {
        ip = context.clientAddress || null;
      } catch {
        // Ignora erro se o adapter não suportar clientAddress
      }
      if (!ip) {
        ip = context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      }
      const ua = context.request.headers.get('user-agent') || null;

      // Limpeza periódica do mapa de throttle se crescer muito
      if (pageViewThrottle.size > 2000) {
        pageViewThrottle.clear();
      }

      logActivity(user.id, 'page_view', { path: pathname }, ip, ua);
    }
  }

  return next();
});
