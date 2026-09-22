import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDirectory } from '../../lib/db';
import { hasPermissionToSubject } from '../../lib/permissions';

export const prerender = false;

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response('Não autorizado', { status: 401 });
  }

  const url = new URL(request.url);
  const ownerUserId = parseInt(url.searchParams.get('user') || '0', 10);
  const materiaSlug = url.searchParams.get('materia') || '';
  const subpath = url.searchParams.get('path') || '';

  if (!ownerUserId || !materiaSlug || !subpath) {
    return new Response('Parâmetros ausentes', { status: 400 });
  }

  // Validação de Permissão
  const hasAccess =
    user.id === ownerUserId ||
    user.role === 'admin' ||
    hasPermissionToSubject(user.id, ownerUserId, materiaSlug);

  if (!hasAccess) {
    return new Response('Acesso negado a este recurso de mídia', { status: 403 });
  }

  // Prevenção contra Path Traversal
  if (subpath.includes('..') || path.isAbsolute(subpath)) {
    return new Response('Caminho inválido', { status: 400 });
  }

  const dataDir = getDataDirectory();
  const materiaBase = path.resolve(dataDir, 'archives', String(ownerUserId), materiaSlug);

  // Candidatos de caminho para o arquivo de mídia
  const candidatePaths = [
    path.resolve(materiaBase, subpath),
    path.resolve(materiaBase, 'questoes', subpath),
    path.resolve(materiaBase, 'resumos', subpath),
    path.resolve(materiaBase, 'resumos', 'materia', subpath),
  ];

  let targetFile: string | null = null;
  for (const p of candidatePaths) {
    if (p.startsWith(materiaBase) && fs.existsSync(p) && fs.statSync(p).isFile()) {
      targetFile = p;
      break;
    }
  }

  if (!targetFile) {
    return new Response('Arquivo não encontrado', { status: 404 });
  }

  const ext = path.extname(targetFile).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const fileBuffer = fs.readFileSync(targetFile);

  return new Response(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=86400',
    },
  });
};
