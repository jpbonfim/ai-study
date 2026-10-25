import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { requireUser } from '../auth/middleware';
import { type AppContext, type AppEnv, currentUser, jsonError, parsePositiveInt } from '../http/context';
import type { SubjectAccessPolicy } from '../permissions/authorization';
import { type ArchiveStore, InvalidPathError, resolveInside } from './archive-store';
import type { DocumentIndex, StoredDocument } from './document-index';
import { buildOfflineExport } from './offline-export';
import type { SubjectCatalog } from './subject-catalog';

const MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

/** Media lookup order inside a subject (figures live next to the documents that use them). */
const MEDIA_FOLDERS = ['', 'questoes', 'resumos', 'resumos/materia'];

interface ArchiveRouteDeps {
  store: ArchiveStore;
  documents: DocumentIndex;
  catalog: SubjectCatalog;
  access: SubjectAccessPolicy;
}

export function archiveRoutes(deps: ArchiveRouteDeps) {
  const app = new Hono<AppEnv>();
  app.use('/api/subjects', requireUser);
  app.use('/api/subjects/*', requireUser);
  app.use('/api/documents/*', requireUser);
  app.use('/api/media', requireUser);
  app.use('/api/exports/*', requireUser);

  app.get('/api/subjects', (c) => c.json(deps.catalog.listAccessible(currentUser(c).id)));

  app.get('/api/subjects/:slug', (c) => {
    const notebook = deps.catalog.resolveNotebook(
      currentUser(c),
      c.req.param('slug'),
      parsePositiveInt(c.req.query('owner')),
    );
    return notebook ? c.json(notebook) : jsonError(c, 404, 'Matéria não encontrada.');
  });

  /** Resolves an owner's subject directory if the caller may read it. */
  function readableSubjectDir(c: AppContext): { dir: string; slug: string } | Response {
    const ownerId = parsePositiveInt(c.req.param('ownerId'));
    const slug = c.req.param('slug') ?? '';
    if (!ownerId) return jsonError(c, 400, 'Dono inválido.');
    if (!deps.access.canRead(currentUser(c), ownerId, slug)) return jsonError(c, 403, 'Acesso negado');
    const dir = deps.store.subjectDir(ownerId, slug);
    return dir ? { dir, slug } : jsonError(c, 404, 'Matéria não encontrada.');
  }

  function documentResponse<T>(c: AppContext, doc: StoredDocument<T> | null) {
    if (!doc) return jsonError(c, 404, 'Documento não encontrado.');
    const etag = `"${doc.sha}"`;
    c.header('ETag', etag);
    c.header('Cache-Control', 'private, no-cache');
    if (c.req.header('if-none-match') === etag) return c.body(null, 304);
    return c.json(doc);
  }

  app.get('/api/documents/:ownerId/:slug/chapters/:chapterId', (c) => {
    const subject = readableSubjectDir(c);
    if (subject instanceof Response) return subject;
    return documentResponse(c, deps.documents.readChapter(subject.dir, subject.slug, c.req.param('chapterId')));
  });

  app.get('/api/documents/:ownerId/:slug/questions/:questionId', (c) => {
    const subject = readableSubjectDir(c);
    if (subject instanceof Response) return subject;
    return documentResponse(c, deps.documents.readQuestion(subject.dir, subject.slug, c.req.param('questionId')));
  });

  /** Raw documents and question figures of a subject, for the offline export built in the browser. */
  app.get('/api/exports/:ownerId/:slug', (c) => {
    const subject = readableSubjectDir(c);
    if (subject instanceof Response) return subject;
    const ownerId = parsePositiveInt(c.req.param('ownerId')) as number;
    const name = deps.catalog.readSubject(ownerId, subject.slug)?.name ?? subject.slug;
    return c.json({ name, ...buildOfflineExport(subject.dir) });
  });

  app.get('/api/media', (c) => {
    const ownerId = parsePositiveInt(c.req.query('user'));
    const slug = c.req.query('materia') || '';
    const relPath = c.req.query('path') || '';
    if (!ownerId || !slug || !relPath) return c.text('Parâmetros ausentes', 400);
    if (!deps.access.canRead(currentUser(c), ownerId, slug))
      return c.text('Acesso negado a este recurso de mídia', 403);

    const base = deps.store.subjectDir(ownerId, slug);
    if (!base) return c.text('Arquivo não encontrado', 404);
    let file: string | null = null;
    try {
      for (const folder of MEDIA_FOLDERS) {
        const candidate = resolveInside(base, folder ? `${folder}/${relPath}` : relPath);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          file = candidate;
          break;
        }
      }
    } catch (err) {
      if (err instanceof InvalidPathError) return c.text('Caminho inválido', 400);
      throw err;
    }
    if (!file) return c.text('Arquivo não encontrado', 404);

    const stat = fs.statSync(file);
    c.header('Content-Type', MEDIA_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    c.header('Content-Length', String(stat.size));
    c.header('Cache-Control', 'private, max-age=86400');
    return c.body(Readable.toWeb(fs.createReadStream(file)) as ReadableStream);
  });

  return app;
}
