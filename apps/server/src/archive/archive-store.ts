import fs from 'node:fs';
import path from 'node:path';

/** File extensions accepted inside archives (uploads, sync and media). */
export const ARCHIVE_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.txt',
]);

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

export class InvalidPathError extends Error {}

/**
 * Normalizes a relative archive path and rejects traversal or absolute paths.
 * Returns the cleaned POSIX-style relative path.
 */
export function cleanRelativePath(relPath: string): string {
  if (typeof relPath !== 'string' || !relPath) throw new InvalidPathError('Caminho vazio.');
  const normalized = path.posix.normalize(relPath.replaceAll('\\', '/')).replace(/^\/+/, '');
  if (normalized.startsWith('..') || normalized.includes('/../') || path.isAbsolute(normalized) || normalized === '.') {
    throw new InvalidPathError(`Caminho inválido: ${relPath}`);
  }
  return normalized;
}

/** Resolves `relPath` inside `baseDir`, guaranteeing the result does not escape it. */
export function resolveInside(baseDir: string, relPath: string): string {
  const target = path.resolve(baseDir, cleanRelativePath(relPath));
  if (target !== baseDir && !target.startsWith(baseDir + path.sep)) {
    throw new InvalidPathError(`Caminho fora do archive: ${relPath}`);
  }
  return target;
}

export function isValidSubjectSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/**
 * Locates each user's archive on disk (`<dataDir>/archives/<userId>/<subject>/...`).
 * A local archive overlay can replace one user's archive during development.
 */
export class ArchiveStore {
  readonly archivesRoot: string;

  constructor(
    dataDir: string,
    private readonly localArchive: { dir: string; userId: number } | null = null,
  ) {
    this.archivesRoot = path.join(dataDir, 'archives');
    fs.mkdirSync(this.archivesRoot, { recursive: true });
  }

  userDir(userId: number): string {
    if (this.localArchive && this.localArchive.userId === userId) return this.localArchive.dir;
    return path.join(this.archivesRoot, String(userId));
  }

  /** Whether this user's archive is the development overlay (never replaced by uploads/sync). */
  isLocalOverlay(userId: number): boolean {
    return this.localArchive?.userId === userId;
  }

  ensureUserDir(userId: number): string {
    const dir = this.userDir(userId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  removeUserDir(userId: number): void {
    fs.rmSync(path.join(this.archivesRoot, String(userId)), { recursive: true, force: true });
  }

  /** Directory of a subject, or null when the slug is invalid. Existence is not checked. */
  subjectDir(userId: number, slug: string): string | null {
    return isValidSubjectSlug(slug) ? path.join(this.userDir(userId), slug) : null;
  }

  listSubjectDirNames(userId: number): string[] {
    const dir = this.userDir(userId);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map((e) => e.name);
  }

  /** A scratch directory next to the users' archives (same filesystem, so renames are atomic). */
  createTempDir(prefix: string): string {
    return fs.mkdtempSync(path.join(this.archivesRoot, `_temp_${prefix}_`));
  }
}
