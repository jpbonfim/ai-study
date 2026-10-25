import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  type ChapterMeta,
  compareChapters,
  compareQuestions,
  isMarkdownFile,
  normalizeChapterMeta,
  normalizeQuestionMeta,
  type QuestionMeta,
} from '@ai-study/content/model';
import { parseDocument } from '@ai-study/content/node';

export interface StoredDocument<TMeta> {
  meta: TMeta;
  body: string;
  /** SHA-256 of the file: identifies a version of the document (ETag and client cache key). */
  sha: string;
}

/** Metadata plus a cheap version id of the file (changes whenever the file changes). */
export type Indexed<TMeta> = TMeta & { version: string };

interface CachedMeta<TMeta> {
  mtimeMs: number;
  size: number;
  meta: Indexed<TMeta>;
}

function listMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(full);
    return isMarkdownFile(entry.name) ? [full] : [];
  });
}

export function countMarkdownFiles(dir: string): number {
  return listMarkdownFiles(dir).length;
}

/**
 * Reads chapter and question metadata from a subject directory. Frontmatter is parsed once per
 * file version (mtime + size) and kept in memory; bodies are read on demand.
 */
export class DocumentIndex {
  private readonly chapterCache = new Map<string, CachedMeta<ChapterMeta>>();
  private readonly questionCache = new Map<string, CachedMeta<QuestionMeta>>();

  listChapters(subjectDir: string, materiaSlug: string): Indexed<ChapterMeta>[] {
    const seen = new Set<string>();
    const result: Indexed<ChapterMeta>[] = [];
    for (const file of listMarkdownFiles(path.join(subjectDir, 'resumos'))) {
      const meta = this.readMeta(this.chapterCache, file, (fm) =>
        normalizeChapterMeta(fm, toRelative(subjectDir, file), materiaSlug),
      );
      if (!meta) continue;
      const key = `${meta.type}:${meta.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(meta);
    }
    return result.sort(compareChapters);
  }

  listQuestions(subjectDir: string, materiaSlug: string): Indexed<QuestionMeta>[] {
    const seen = new Set<string>();
    const result: Indexed<QuestionMeta>[] = [];
    for (const file of listMarkdownFiles(path.join(subjectDir, 'questoes'))) {
      const meta = this.readMeta(this.questionCache, file, (fm) =>
        normalizeQuestionMeta(fm, toRelative(subjectDir, file), materiaSlug),
      );
      if (!meta || seen.has(meta.id)) continue;
      seen.add(meta.id);
      result.push(meta);
    }
    return result.sort(compareQuestions);
  }

  readChapter(subjectDir: string, materiaSlug: string, chapterId: string): StoredDocument<Indexed<ChapterMeta>> | null {
    const meta = this.listChapters(subjectDir, materiaSlug).find((c) => c.id === chapterId);
    return meta ? readDocument(subjectDir, meta) : null;
  }

  readQuestion(
    subjectDir: string,
    materiaSlug: string,
    questionId: string,
  ): StoredDocument<Indexed<QuestionMeta>> | null {
    const meta = this.listQuestions(subjectDir, materiaSlug).find((q) => q.id === questionId);
    return meta ? readDocument(subjectDir, meta) : null;
  }

  private readMeta<TMeta>(
    cache: Map<string, CachedMeta<TMeta>>,
    file: string,
    normalize: (frontmatter: Record<string, unknown>) => TMeta,
  ): Indexed<TMeta> | null {
    try {
      const stat = fs.statSync(file);
      const cached = cache.get(file);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.meta;
      const { frontmatter } = parseDocument(fs.readFileSync(file, 'utf8'));
      const meta = { ...normalize(frontmatter), version: `${Math.floor(stat.mtimeMs)}-${stat.size}` };
      cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, meta });
      return meta;
    } catch (err) {
      console.error(`[documents] could not read ${file}:`, err);
      return null;
    }
  }
}

function toRelative(subjectDir: string, file: string): string {
  return path.relative(subjectDir, file).split(path.sep).join('/');
}

function readDocument<TMeta extends { path: string }>(subjectDir: string, meta: TMeta): StoredDocument<TMeta> {
  const raw = fs.readFileSync(path.join(subjectDir, meta.path));
  const { body } = parseDocument(raw.toString('utf8'));
  return { meta, body, sha: crypto.createHash('sha256').update(raw).digest('hex') };
}
