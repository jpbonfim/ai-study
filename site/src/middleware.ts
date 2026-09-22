import { defineMiddleware } from 'astro:middleware';
import { getSessionUser } from './lib/auth';
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

  // 2. Validação da Sessão
  const sessionId = context.cookies.get('session_id')?.value;

  if (!sessionId) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Não autorizado. Faça login primeiro.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const redirectUrl = pathname !== '/' ? `/login?redirect=${encodeURIComponent(pathname + search)}` : '/login';
    return context.redirect(redirectUrl);
  }

  const user = getSessionUser(sessionId);
  if (!user) {
    context.cookies.delete('session_id', { path: '/' });
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Sessão expirada. Faça login novamente.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect('/login');
  }

  // Injeta usuário no contexto do Astro
  context.locals.user = user;
  context.locals.sessionId = sessionId;

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
      const ip = context.clientAddress || context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
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
