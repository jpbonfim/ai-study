import type { APIRoute } from 'astro';
import {
  getAllUsers,
  createUser,
  updateUser,
  changeUserPassword,
  deleteUser,
} from '../../../lib/auth';
import { logActivity } from '../../../lib/log';

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

export const GET: APIRoute = async ({ locals }) => {
  const denied = checkAdmin(locals);
  if (denied) return denied;

  const users = getAllUsers();
  return new Response(JSON.stringify({ success: true, users }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const denied = checkAdmin(locals);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { username, displayName, password, role } = body;

    const newUser = createUser(
      username,
      displayName,
      password,
      role === 'admin' ? 'admin' : 'normal'
    );

    logActivity(
      locals.user!.id,
      'admin_create_user',
      { newUserId: newUser.id, username: newUser.username, role: newUser.role },
      clientAddress,
      request.headers.get('user-agent')
    );

    return new Response(JSON.stringify({ success: true, user: newUser }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erro ao criar usuário.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async ({ request, locals, clientAddress }) => {
  const denied = checkAdmin(locals);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { id, displayName, role, newPassword } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID do usuário é obrigatório.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = Number(id);

    if (newPassword) {
      changeUserPassword(userId, newPassword);
      logActivity(
        locals.user!.id,
        'admin_change_password',
        { targetUserId: userId },
        clientAddress,
        request.headers.get('user-agent')
      );
    }

    if (displayName !== undefined || role !== undefined) {
      updateUser(userId, { displayName, role });
      logActivity(
        locals.user!.id,
        'admin_update_user',
        { targetUserId: userId, displayName, role },
        clientAddress,
        request.headers.get('user-agent')
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erro ao atualizar usuário.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ request, locals, clientAddress }) => {
  const denied = checkAdmin(locals);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get('id') || '0', 10);

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID inválido para exclusão.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (id === locals.user!.id) {
      return new Response(JSON.stringify({ error: 'Você não pode remover sua própria conta de administrador.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    deleteUser(id);

    logActivity(
      locals.user!.id,
      'admin_delete_user',
      { deletedUserId: id },
      clientAddress,
      request.headers.get('user-agent')
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erro ao remover usuário.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
