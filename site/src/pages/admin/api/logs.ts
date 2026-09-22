import type { APIRoute } from 'astro';
import { queryLogs } from '../../../lib/log';

export const prerender = false;

function checkAdmin(locals: App.Locals): Response | null {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Acesso negado. Apenas administradores.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const denied = checkAdmin(locals);
  if (denied) return denied;

  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id') ? parseInt(url.searchParams.get('user_id')!, 10) : undefined;
  const action = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const fromDate = url.searchParams.get('from') || undefined;
  const toDate = url.searchParams.get('to') || undefined;
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = (Math.max(1, page) - 1) * limit;

  const result = queryLogs({
    userId,
    action,
    search,
    fromDate,
    toDate,
    limit,
    offset,
  });

  return new Response(JSON.stringify({ success: true, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
