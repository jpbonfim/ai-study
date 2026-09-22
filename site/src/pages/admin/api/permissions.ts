import type { APIRoute } from 'astro';
import {
  getAllPermissions,
  grantSubjectPermission,
  revokeSubjectPermission,
} from '../../../lib/permissions';
import { getAllUsers } from '../../../lib/auth';
import { loadUserMaterias } from '../../../data/materias';

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

  const permissions = getAllPermissions();
  const users = getAllUsers();

  // Mapeia as matérias de cada usuário para facilitar a seleção na UI
  const usersWithMaterias = users.map((u) => ({
    ...u,
    materias: loadUserMaterias(u.id).map((m) => ({
      slug: m.slug,
      name: m.name,
      code: m.code,
    })),
  }));

  return new Response(
    JSON.stringify({
      success: true,
      permissions,
      users: usersWithMaterias,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = checkAdmin(locals);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { ownerUserId, grantedUserId, subjectCode, materiaSlug } = body;

    if (!ownerUserId || !grantedUserId || !subjectCode || !materiaSlug) {
      return new Response(JSON.stringify({ error: 'Todos os campos são obrigatórios.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    grantSubjectPermission(
      Number(ownerUserId),
      Number(grantedUserId),
      String(subjectCode),
      String(materiaSlug),
      locals.user!.id
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erro ao conceder permissão.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const denied = checkAdmin(locals);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get('id') || '0', 10);

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID de permissão inválido.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    revokeSubjectPermission(id, locals.user!.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erro ao revogar permissão.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
