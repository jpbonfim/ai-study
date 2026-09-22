import type { APIRoute } from 'astro';
import { createArchiveZipBuffer } from '../../lib/upload';
import { hasPermissionToSubject } from '../../lib/permissions';
import { logActivity } from '../../lib/log';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, clientAddress }) => {
  const user = locals.user;
  if (!user) {
    return new Response('Não autorizado', { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'archive';
  const materiaSlug = url.searchParams.get('materia') || undefined;
  const targetUserIdParam = url.searchParams.get('user');

  let targetUserId = user.id;

  if (targetUserIdParam) {
    const parsedTarget = parseInt(targetUserIdParam, 10);
    if (parsedTarget !== user.id) {
      // Se não for o próprio usuário, verifica se é admin ou se tem permissão na matéria
      if (user.role !== 'admin') {
        if (!materiaSlug || !hasPermissionToSubject(user.id, parsedTarget, materiaSlug)) {
          return new Response('Acesso negado para download do conteúdo solicitado.', { status: 403 });
        }
      }
      targetUserId = parsedTarget;
    }
  }

  const ip = clientAddress || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = request.headers.get('user-agent') || null;

  try {
    const zipBuffer = createArchiveZipBuffer(targetUserId, materiaSlug);
    const filename = materiaSlug
      ? `${materiaSlug}-archive.zip`
      : `archive-user-${targetUserId}.zip`;

    logActivity(
      user.id,
      materiaSlug ? 'download_materia' : 'download_archive',
      { targetUserId, materiaSlug, sizeBytes: zipBuffer.length },
      ip,
      ua
    );

    return new Response(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (err: any) {
    return new Response(`Erro ao gerar download: ${err.message}`, { status: 404 });
  }
};
