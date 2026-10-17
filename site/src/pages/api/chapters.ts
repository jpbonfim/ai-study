import type { APIRoute } from 'astro';
import { loadUserChaptersByTag, type ChapterItem } from '../../lib/mdx-runtime';
import { hasPermissionToSubject } from '../../lib/permissions';
import { getMateria } from '../../data/materias';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const materiaSlug = url.searchParams.get('materia') || '';
  const tagParam = url.searchParams.get('tag') || null;
  const ownerParam = url.searchParams.get('owner');

  if (!materiaSlug) {
    return new Response(JSON.stringify({ error: 'Matéria não especificada' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let ownerId = user.id;
  if (ownerParam) {
    const parsed = parseInt(ownerParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      ownerId = parsed;
    }
  }

  // Validação de Permissão
  const hasAccess =
    user.id === ownerId ||
    user.role === 'admin' ||
    hasPermissionToSubject(user.id, ownerId, materiaSlug);

  if (!hasAccess) {
    return new Response(JSON.stringify({ error: 'Acesso negado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const chapters = loadUserChaptersByTag(ownerId, materiaSlug, tagParam);

    return new Response(JSON.stringify({ chapters, tag: tagParam }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err: any) {
    console.error(`[API /api/chapters] Erro ao carregar capítulos de ${materiaSlug}:`, err);
    return new Response(JSON.stringify({ error: 'Erro interno ao processar capítulos' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
