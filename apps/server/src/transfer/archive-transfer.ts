import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ARCHIVE_EXTENSIONS, type ArchiveStore, cleanRelativePath, resolveInside } from '../archive/archive-store';
import { collectFiles, extractZip, syncEntryCheck, uploadEntryCheck, type ZipSource } from './zip';

export class TransferError extends Error {}

export interface ManifestEntry {
  size: number;
  mtime: number;
  hash: string;
}

export interface ArchiveManifest {
  userId: number;
  username: string;
  generatedAt: string;
  files: Record<string, ManifestEntry>;
}

const SUBJECT_SLUG = /^[a-z0-9-_]+$/;

/** The single top-level folder of an extracted archive, when that is all it contains. */
function singleRootFolder(dir: string): string | null {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  return items.length === 1 && items[0]?.isDirectory() ? path.join(dir, items[0].name) : null;
}

/**
 * Archive-level operations: ZIP upload/download and the incremental sync protocol used by
 * `scripts/sync_archive.py`. Replacements are prepared in a scratch directory and swapped in with
 * renames, so a failed upload never leaves a half-replaced archive.
 */
export class ArchiveTransfer {
  private readonly hashCache = new Map<string, { size: number; mtimeMs: number; hash: string }>();

  constructor(private readonly store: ArchiveStore) {}

  async replaceUserArchive(userId: number, zipPath: string): Promise<{ filesCount: number }> {
    return this.withScratch(`${userId}`, async (scratch) => {
      const extracted = path.join(scratch, 'extracted');
      const { files } = await extractZip(zipPath, extracted, uploadEntryCheck);
      this.swapIn(singleRootFolder(extracted) ?? extracted, this.store.userDir(userId), scratch);
      return { filesCount: files.length };
    });
  }

  async replaceSubject(
    userId: number,
    rawSlug: string,
    zipPath: string,
  ): Promise<{ slug: string; filesCount: number }> {
    const slug = rawSlug.trim().toLowerCase();
    if (!slug || !SUBJECT_SLUG.test(slug)) throw new TransferError('Identificador (slug) da matéria inválido.');
    return this.withScratch(`${userId}_${slug}`, async (scratch) => {
      const extracted = path.join(scratch, 'extracted');
      const { files } = await extractZip(zipPath, extracted, uploadEntryCheck);
      const source = fs.existsSync(path.join(extracted, 'materia.json'))
        ? extracted
        : (singleRootFolder(extracted) ?? extracted);
      this.swapIn(source, path.join(this.store.ensureUserDir(userId), slug), scratch);
      return { slug, filesCount: files.length };
    });
  }

  /** Files of a whole archive (`archive/...`) or of one subject (`<slug>/...`) for download. */
  downloadSources(userId: number, slug?: string): ZipSource[] {
    if (slug) {
      const dir = this.store.subjectDir(userId, slug);
      if (!dir || !fs.existsSync(dir)) throw new TransferError(`Matéria "${slug}" não encontrada para download.`);
      return collectFiles(dir, slug);
    }
    const dir = this.store.userDir(userId);
    if (!fs.existsSync(dir)) throw new TransferError('Archive do usuário não encontrado para download.');
    return collectFiles(dir, 'archive');
  }

  manifest(userId: number, username: string): ArchiveManifest {
    const root = this.store.ensureUserDir(userId);
    const files: Record<string, ManifestEntry> = {};
    const scan = (dir: string, rel: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name.startsWith('_temp')) continue;
        const full = path.join(dir, entry.name);
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) scan(full, relPath);
        else if (entry.isFile() && ARCHIVE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          const stat = fs.statSync(full);
          files[relPath] = { size: stat.size, mtime: Math.floor(stat.mtimeMs), hash: this.hashOf(full, stat) };
        }
      }
    };
    scan(root, '');
    return { userId, username, generatedAt: new Date().toISOString(), files };
  }

  /** Applies a sync push: writes the bundle's files over the archive, then deletes paths. */
  async applyPush(
    userId: number,
    bundlePath: string | null,
    deletions: string[],
  ): Promise<{ updatedCount: number; deletedCount: number }> {
    const root = this.store.ensureUserDir(userId);
    let updatedCount = 0;
    if (bundlePath) {
      updatedCount = await this.withScratch(`sync_${userId}`, async (scratch) => {
        const { files } = await extractZip(bundlePath, scratch, syncEntryCheck);
        for (const file of files) {
          const destination = resolveInside(root, file.path);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.copyFileSync(path.join(scratch, file.path), destination);
        }
        return files.length;
      });
    }

    let deletedCount = 0;
    for (const rawPath of deletions) {
      let target: string;
      try {
        target = resolveInside(root, rawPath);
      } catch {
        continue;
      }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
      fs.unlinkSync(target);
      deletedCount++;
      this.pruneEmptyParents(path.dirname(target), root);
    }
    return { updatedCount, deletedCount };
  }

  /** Sources for a sync pull (unsafe or missing paths are skipped). */
  pullSources(userId: number, requested: string[]): ZipSource[] {
    const root = this.store.userDir(userId);
    return requested.flatMap((rawPath) => {
      try {
        const name = cleanRelativePath(rawPath);
        const file = resolveInside(root, name);
        return fs.existsSync(file) && fs.statSync(file).isFile() ? [{ file, name }] : [];
      } catch {
        return [];
      }
    });
  }

  private hashOf(file: string, stat: fs.Stats): string {
    const cached = this.hashCache.get(file);
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.hash;
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    this.hashCache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, hash });
    return hash;
  }

  private pruneEmptyParents(dir: string, root: string): void {
    let current = dir;
    while (current !== root && current.startsWith(root + path.sep) && fs.readdirSync(current).length === 0) {
      fs.rmdirSync(current);
      current = path.dirname(current);
    }
  }

  /** Replaces `target` with `source` via renames; the previous content is discarded with the scratch dir. */
  private swapIn(source: string, target: string, scratch: string): void {
    if (fs.existsSync(target)) fs.renameSync(target, path.join(scratch, 'previous'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
  }

  private async withScratch<T>(label: string, work: (scratch: string) => Promise<T>): Promise<T> {
    const scratch = this.store.createTempDir(label);
    try {
      return await work(scratch);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }
}
