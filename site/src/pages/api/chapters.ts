import type { APIRoute } from 'astro';
import {
  loadUserChaptersByTag,
  loadUserChaptersMetadata,
  loadChapterById,
  type ChapterItem,
} from '../../lib/mdx-runtime';
import { hasPermissionToSubject } from '../../lib/permissions';

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
  const chapterId = url.searchParams.get('chapter_id');
  const mode = url.searchParams.get('mode') || 'progressive';
  const metadataOnly =
    url.searchParams.get('metadata_only') === '1' ||
    url.searchParams.get('metadata_only') === 'true';

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

  const ttlMinutes = parseInt(process.env.CLIENT_CACHE_TTL_MINUTES || '1440', 10);
  const cacheSeconds = ttlMinutes * 60;
  const cacheHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': `private, max-age=${cacheSeconds}, stale-while-revalidate=86400`,
  };

  try {
    // 1. Carregamento sob demanda de UM capítulo específico pelo ID
    if (chapterId) {
      const chapter = loadChapterById(chapterId, ownerId, materiaSlug);
      if (!chapter) {
        return new Response(JSON.stringify({ error: 'Capítulo não encontrado' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ chapter }), {
        status: 200,
        headers: cacheHeaders,
      });
    }

    // 2. Apenas metadados da tag (ultra rápido, ~1ms)
    if (metadataOnly) {
      const allMeta = loadUserChaptersMetadata(ownerId, materiaSlug);
      const filtered = tagParam
        ? allMeta
            .filter((c) => (c.tags || []).includes(tagParam))
            .sort((a, b) => a.order - b.order || a.chapter - b.chapter)
        : allMeta;
      return new Response(JSON.stringify({ chapters: filtered, tag: tagParam }), {
        status: 200,
        headers: cacheHeaders,
      });
    }

    // 3. Modo progressivo: compila apenas o 1º capítulo e entrega metadados dos seguintes
    if (mode === 'progressive') {
      const allMeta = loadUserChaptersMetadata(ownerId, materiaSlug);
      const tagMeta = tagParam
        ? allMeta
            .filter((c) => (c.tags || []).includes(tagParam))
            .sort((a, b) => a.order - b.order || a.chapter - b.chapter)
        : allMeta;

      if (tagMeta.length === 0) {
        return new Response(JSON.stringify({ chapters: [], tag: tagParam }), {
          status: 200,
          headers: cacheHeaders,
        });
      }

      const firstChapter = loadChapterById(tagMeta[0].id, ownerId, materiaSlug);
      const chapters = [
        firstChapter || { ...tagMeta[0], htmlContent: '' },
        ...tagMeta.slice(1).map((m) => ({ ...m, htmlContent: null })),
      ];

      return new Response(JSON.stringify({ chapters, tag: tagParam }), {
        status: 200,
        headers: cacheHeaders,
      });
    }

    // 4. Modo legado (compila todos os capítulos da tag)
    const chapters = loadUserChaptersByTag(ownerId, materiaSlug, tagParam);
    return new Response(JSON.stringify({ chapters, tag: tagParam }), {
      status: 200,
      headers: cacheHeaders,
    });
  } catch (err: any) {
    console.error(`[API /api/chapters] Erro ao processar requisição de ${materiaSlug}:`, err);
    return new Response(JSON.stringify({ error: 'Erro interno ao processar capítulos' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
