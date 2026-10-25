import fs from 'node:fs';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import type { ArchiveStore } from '../archive/archive-store';
import { requireUser } from '../auth/middleware';
import type { AppConfig } from '../config';
import { type AppContext, type AppEnv, currentUser, jsonError, parsePositiveInt, requestOrigin } from '../http/context';
import type { ActivityLog } from '../logs/activity-log';
import type { SubjectAccessPolicy } from '../permissions/authorization';
import { type ArchiveTransfer, TransferError } from './archive-transfer';
import { MalformedFormError, PayloadTooLargeError, receiveMultipart } from './multipart';
import { createZipStream, ZipRejectedError, type ZipSource } from './zip';

interface TransferRouteDeps {
  config: AppConfig;
  store: ArchiveStore;
  transfer: ArchiveTransfer;
  access: SubjectAccessPolicy;
  activity: ActivityLog;
}

const zipResponse = (c: AppContext, sources: ZipSource[], filename: string) => {
  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  return c.body(Readable.toWeb(createZipStream(sources) as Readable) as ReadableStream);
};

const totalSize = (sources: ZipSource[]) => sources.reduce((sum, s) => sum + fs.statSync(s.file).size, 0);

export function transferRoutes(deps: TransferRouteDeps) {
  const app = new Hono<AppEnv>();
  for (const route of ['/api/upload', '/api/download', '/api/sync/*']) app.use(route, requireUser);

  /** Runs `work` with a scratch dir for the incoming multipart payload. */
  async function withUpload<T>(
    c: AppContext,
    maxBytes: number,
    work: (form: Awaited<ReturnType<typeof receiveMultipart>>) => Promise<T>,
  ) {
    const scratch = deps.store.createTempDir(`upload_${currentUser(c).id}`);
    try {
      const form = await receiveMultipart(c.req.raw, scratch, maxBytes);
      return await work(form);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }

  function guardOverlay(c: AppContext) {
    return deps.store.isLocalOverlay(currentUser(c).id)
      ? jsonError(c, 400, 'O archive deste usuário é o archive local de desenvolvimento e não pode ser substituído.')
      : null;
  }

  app.post('/api/upload', async (c) => {
    const user = currentUser(c);
    const origin = requestOrigin(c);
    const maxBytes = user.role === 'admin' ? deps.config.maxUploadBytes.admin : deps.config.maxUploadBytes.normal;
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    const blocked = guardOverlay(c);
    if (blocked) return blocked;

    try {
      return await withUpload(c, maxBytes, async (form) => {
        const file = form.files.file;
        if (!file || file.size === 0) return jsonError(c, 400, 'Nenhum arquivo ZIP foi enviado.');
        const sizeBytes = file.size;

        if ((form.fields.type || 'archive') === 'materia') {
          const slug = (form.fields.materia_slug || '').trim();
          if (!slug) return jsonError(c, 400, 'Identificador da matéria não informado.');
          const result = await deps.transfer.replaceSubject(user.id, slug, file.path);
          deps.activity.record(
            user.id,
            'upload_materia',
            { materiaSlug: result.slug, filesCount: result.filesCount, sizeBytes },
            origin,
          );
          return c.json({
            success: true,
            message: `Matéria "${slug}" atualizada com sucesso (${result.filesCount} arquivos).`,
          });
        }

        const result = await deps.transfer.replaceUserArchive(user.id, file.path);
        deps.activity.record(user.id, 'upload_archive', { filesCount: result.filesCount, sizeBytes }, origin);
        return c.json({
          success: true,
          message: `Archive completo atualizado com sucesso (${result.filesCount} arquivos).`,
        });
      });
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return jsonError(c, 413, `O arquivo enviado excede o limite máximo permitido de ${maxMb} MB.`);
      }
      if (err instanceof MalformedFormError) return jsonError(c, 400, 'Erro ao processar o formulário de upload.');
      if (err instanceof ZipRejectedError || err instanceof TransferError) return jsonError(c, 400, err.message);
      console.error('[upload] failed:', err);
      return jsonError(c, 400, `Falha ao extrair o archive: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  app.get('/api/download', (c) => {
    const user = currentUser(c);
    const slug = c.req.query('materia') || undefined;
    const requestedOwner = parsePositiveInt(c.req.query('user'));
    let ownerId = user.id;
    if (requestedOwner && requestedOwner !== user.id) {
      if (user.role !== 'admin' && (!slug || !deps.access.canRead(user, requestedOwner, slug))) {
        return c.text('Acesso negado para download do conteúdo solicitado.', 403);
      }
      ownerId = requestedOwner;
    }

    let sources: ZipSource[];
    try {
      sources = deps.transfer.downloadSources(ownerId, slug);
    } catch (err) {
      return c.text(`Erro ao gerar download: ${err instanceof Error ? err.message : String(err)}`, 404);
    }
    deps.activity.record(
      user.id,
      slug ? 'download_materia' : 'download_archive',
      { targetUserId: ownerId, materiaSlug: slug, sizeBytes: totalSize(sources) },
      requestOrigin(c),
    );
    return zipResponse(c, sources, slug ? `${slug}-archive.zip` : `archive-user-${ownerId}.zip`);
  });

  app.get('/api/sync/status', (c) => {
    const user = currentUser(c);
    return c.json({ success: true, manifest: deps.transfer.manifest(user.id, user.username) });
  });

  app.post('/api/sync/push', async (c) => {
    const user = currentUser(c);
    const blocked = guardOverlay(c);
    if (blocked) return blocked;
    try {
      // Sync bundles are bounded by the admin upload limit.
      return await withUpload(c, deps.config.maxUploadBytes.admin, async (form) => {
        let deletions: string[] = [];
        const rawDeletions = form.fields.deletions;
        if (rawDeletions?.trim()) {
          try {
            const parsed: unknown = JSON.parse(rawDeletions);
            if (Array.isArray(parsed)) deletions = parsed.filter((p): p is string => typeof p === 'string');
          } catch {
            return jsonError(c, 400, 'Campo "deletions" deve ser um JSON array válido de caminhos.');
          }
        }
        const bundle = form.files.bundle && form.files.bundle.size > 0 ? form.files.bundle.path : null;
        if (!bundle && deletions.length === 0) {
          return jsonError(c, 400, 'Nenhum arquivo para atualizar ou deletar foi enviado.');
        }
        const zipBytes = form.files.bundle?.size ?? 0;
        const result = await deps.transfer.applyPush(user.id, bundle, deletions);
        deps.activity.record(user.id, 'sync_push', { ...result, zipBytes }, requestOrigin(c));
        return c.json({
          success: true,
          ...result,
          message: `Sincronização push concluída: ${result.updatedCount} atualizados, ${result.deletedCount} removidos.`,
        });
      });
    } catch (err) {
      if (err instanceof ZipRejectedError) return jsonError(c, 400, err.message);
      if (err instanceof PayloadTooLargeError)
        return jsonError(c, 413, 'Bundle de sincronização excede o limite permitido.');
      if (err instanceof MalformedFormError) return jsonError(c, 400, 'Erro ao processar dados do formulário.');
      console.error('[sync push] failed:', err);
      return jsonError(c, 400, `Falha ao aplicar alterações: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  app.post('/api/sync/pull', async (c) => {
    const user = currentUser(c);
    let requested: string[];
    try {
      const body = (await c.req.json()) as { files?: unknown };
      requested = Array.isArray(body.files)
        ? body.files.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        : [];
    } catch {
      return jsonError(c, 400, 'Corpo da requisição deve ser um JSON válido contendo {"files": string[]}.');
    }
    if (requested.length === 0) return jsonError(c, 400, 'Nenhum arquivo válido foi solicitado para download.');
    const sources = deps.transfer.pullSources(user.id, requested);
    deps.activity.record(
      user.id,
      'sync_pull',
      { requestedCount: requested.length, filesAdded: sources.length },
      requestOrigin(c),
    );
    return zipResponse(c, sources, 'sync-delta.zip');
  });

  return app;
}
