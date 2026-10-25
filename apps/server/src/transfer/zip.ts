import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { ARCHIVE_EXTENSIONS, cleanRelativePath, InvalidPathError, resolveInside } from '../archive/archive-store';

/** Upper bound for the uncompressed content of an uploaded archive (zip bomb protection). */
export const MAX_DECOMPRESSED_BYTES = 500 * 1024 * 1024;

export class ZipRejectedError extends Error {}

export interface ZipFileEntry {
  /** Normalized relative path inside the archive. */
  path: string;
  uncompressedSize: number;
}

export type EntryCheck = (rawName: string) => string | null;

/** Upload rule: no traversal, only document/image extensions. Returns an error message or null. */
export const uploadEntryCheck: EntryCheck = (rawName) => {
  if (rawName.includes('..') || path.isAbsolute(rawName) || rawName.startsWith('/') || rawName.startsWith('\\')) {
    return `Tentativa de Path Traversal detectada no item: ${rawName}`;
  }
  const ext = path.extname(rawName).toLowerCase();
  if (!ARCHIVE_EXTENSIONS.has(ext)) {
    return `Arquivo com extensão não permitida encontrado no ZIP: "${rawName}" (${ext}). Apenas documentos e imagens são aceitos.`;
  }
  return null;
};

/** Sync rule: same constraints, reported with the sync CLI's wording. */
export const syncEntryCheck: EntryCheck = (rawName) => {
  try {
    const clean = cleanRelativePath(rawName);
    if (!ARCHIVE_EXTENSIONS.has(path.extname(clean).toLowerCase())) throw new InvalidPathError(rawName);
    return null;
  } catch {
    return `Tentativa de envio de arquivo com extensão ou caminho não permitido: ${rawName}`;
  }
};

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zip) => (err ? reject(err) : resolve(zip)));
  });
}

function isDirectoryEntry(entry: yauzl.Entry): boolean {
  return entry.fileName.endsWith('/');
}

/** Iterates the central directory, calling `visit` for every file entry (directories skipped). */
async function forEachEntry(zip: yauzl.ZipFile, visit: (entry: yauzl.Entry) => Promise<void>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      const task = isDirectoryEntry(entry) ? Promise.resolve() : visit(entry);
      task.then(() => zip.readEntry(), reject);
    });
    zip.on('end', () => resolve());
    zip.on('error', reject);
    zip.readEntry();
  });
}

/**
 * Validates every entry (before anything is written) and then extracts the archive into
 * `targetDir`, streaming each file to disk. Decompressed bytes are counted while writing, so a
 * lying header cannot exceed the limit.
 */
export async function extractZip(
  zipPath: string,
  targetDir: string,
  check: EntryCheck,
): Promise<{ files: ZipFileEntry[]; totalBytes: number }> {
  let zip: yauzl.ZipFile;
  try {
    zip = await openZip(zipPath);
  } catch {
    throw new ZipRejectedError('Arquivo ZIP corrompido ou formato inválido.');
  }

  try {
    const files: ZipFileEntry[] = [];
    let declaredBytes = 0;
    await forEachEntry(zip, async (entry) => {
      const problem = check(entry.fileName);
      if (problem) throw new ZipRejectedError(problem);
      declaredBytes += entry.uncompressedSize;
      if (declaredBytes > MAX_DECOMPRESSED_BYTES) {
        throw new ZipRejectedError('O conteúdo descompactado excede o limite de segurança de armazenamento.');
      }
      files.push({ path: cleanRelativePath(entry.fileName), uncompressedSize: entry.uncompressedSize });
    });
    if (files.length === 0) throw new ZipRejectedError('O arquivo ZIP está vazio.');
  } finally {
    zip.close();
  }

  // Second pass: extraction.
  const extractor = await openZip(zipPath);
  let writtenBytes = 0;
  const written: ZipFileEntry[] = [];
  try {
    await forEachEntry(extractor, async (entry) => {
      const relPath = cleanRelativePath(entry.fileName);
      const destination = resolveInside(targetDir, relPath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const source = await new Promise<NodeJS.ReadableStream>((resolve, reject) =>
        extractor.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream))),
      );
      const limiter = new Transform({
        transform(chunk: Buffer, _enc, done) {
          writtenBytes += chunk.length;
          if (writtenBytes > MAX_DECOMPRESSED_BYTES) {
            done(new ZipRejectedError('O conteúdo descompactado excede o limite de segurança de armazenamento.'));
          } else {
            done(null, chunk);
          }
        },
      });
      await pipeline(source, limiter, fs.createWriteStream(destination));
      written.push({ path: relPath, uncompressedSize: entry.uncompressedSize });
    });
  } finally {
    extractor.close();
  }
  return { files: written, totalBytes: writtenBytes };
}

export interface ZipSource {
  /** Absolute path on disk. */
  file: string;
  /** Path inside the zip. */
  name: string;
}

/** Streams a zip containing the given files. */
export function createZipStream(sources: ZipSource[]): NodeJS.ReadableStream {
  const zip = new yazl.ZipFile();
  for (const source of sources) zip.addFile(source.file, source.name);
  zip.end();
  return zip.outputStream;
}

/** Every file below `dir` (recursively), as zip sources rooted at `prefix`. */
export function collectFiles(dir: string, prefix: string): ZipSource[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return collectFiles(full, name);
    return entry.isFile() ? [{ file: full, name }] : [];
  });
}
