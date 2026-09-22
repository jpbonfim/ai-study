import type { APIRoute } from 'astro';
import { deleteSession, getSessionUser } from '../../lib/auth';
import { logActivity } from '../../lib/log';

export const prerender = false;

export const ALL: APIRoute = async ({ request, cookies, redirect }) => {
  const sessionId = cookies.get('session_id')?.value;

  if (sessionId) {
    const user = getSessionUser(sessionId);
    if (user) {
      logActivity(user.id, 'logout', null, null, request.headers.get('user-agent'));
    }
    deleteSession(sessionId);
    cookies.delete('session_id', { path: '/' });
  }

  const accept = request.headers.get('accept') || '';
  if (accept.includes('application/json')) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return redirect('/login');
};
