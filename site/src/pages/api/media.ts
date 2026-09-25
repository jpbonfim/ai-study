import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDirectory } from '../../lib/db';
import { hasPermissionToSubject } from '../../lib/permissions';
import { isDevMode, getLocalArchiveDirectory } from '../../lib/dev-archive';

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

  // Validação de Permissão (em dev mode local, permite acesso imediato a arquivos locais)
  const hasAccess =
    isDevMode() ||
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

  // Bases candidatas (em dev mode, prioriza archive/ local da raiz)
  const candidateBases: string[] = [];
  if (isDevMode()) {
    const localArchive = getLocalArchiveDirectory();
    if (localArchive) {
      candidateBases.push(path.resolve(localArchive, materiaSlug));
    }
  }
  candidateBases.push(materiaBase);
  if (!isDevMode()) {
    const localArchive = getLocalArchiveDirectory();
    if (localArchive) {
      candidateBases.push(path.resolve(localArchive, materiaSlug));
    }
  }

  let targetFile: string | null = null;
  for (const base of candidateBases) {
    if (!fs.existsSync(base)) continue;
    const candidatePaths = [
      path.resolve(base, subpath),
      path.resolve(base, 'questoes', subpath),
      path.resolve(base, 'resumos', subpath),
      path.resolve(base, 'resumos', 'materia', subpath),
    ];
    for (const p of candidatePaths) {
      if (p.startsWith(base) && fs.existsSync(p) && fs.statSync(p).isFile()) {
        targetFile = p;
        break;
      }
    }
    if (targetFile) break;
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
