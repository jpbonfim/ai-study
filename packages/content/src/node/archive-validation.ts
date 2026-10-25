import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { isMarkdownFile } from '../model/normalize';
import { parseDocument } from './parse-document';

/*
 * Frontmatter rules of the study archive. They mirror the content collections the Astro site
 * validated at build time, so `validate:archive` rejects exactly what `astro build` rejected.
 * Unknown keys are allowed; only the listed ones are checked.
 */

const tagsSchema = z.union([z.string(), z.array(z.string())]).optional();

const chapterSchema = z.object({
  materia: z.string().optional(),
  title: z.string(),
  topic: z.string(),
  chapter: z.number(),
  description: z.string(),
  order: z.number().optional(),
  type: z.enum(['materia', 'questoes']).optional(),
  studyType: z.enum(['materia', 'questoes']).optional(),
  tags: tagsSchema,
  tag: z.string().optional(),
  relatedQuestions: z.array(z.string()).optional(),
  sections: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
});

const imagePath = z.string();

const questionSchema = z.object({
  materia: z.string().optional(),
  id: z.string(),
  title: z.string(),
  exam: z.string(),
  year: z.number(),
  topic: z.string(),
  topicSlug: z.string(),
  tags: tagsSchema,
  tag: z.string().optional(),
  difficulty: z.enum(['Fácil', 'Médio', 'Difícil']).optional(),
  type: z.enum(['multipla_escolha', 'discursiva']).optional(),
  statement: z.string().optional(),
  options: z.array(z.object({ label: z.string(), text: z.string() })).optional(),
  correctOption: z.string().optional(),
  expectedAnswer: z.string().optional(),
  image: imagePath.optional(),
  images: z.array(z.union([imagePath, z.object({ src: imagePath, caption: z.string().optional() })])).optional(),
});

type DocumentKind = 'chapter' | 'question';

export interface ArchiveIssue {
  /** Path relative to the archive directory. */
  file: string;
  message: string;
}

export interface ArchiveValidation {
  checkedFiles: number;
  issues: ArchiveIssue[];
}

/** Chapters live under a `resumos/` folder and questions under `questoes/`, at any depth. */
function kindOf(relPath: string): DocumentKind | null {
  const folders = relPath.split('/').slice(0, -1);
  if (folders.includes('resumos')) return 'chapter';
  if (folders.includes('questoes')) return 'question';
  return null;
}

function listMarkdownFiles(dir: string, base = dir): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listMarkdownFiles(full, base));
    else if (entry.isFile() && isMarkdownFile(entry.name))
      files.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return files;
}

function describeZodIssue(issue: z.core.$ZodIssue): string {
  const field = issue.path.length > 0 ? issue.path.join('.') : '(frontmatter)';
  return `${field}: ${issue.message}`;
}

/** Local images referenced by a question must exist next to it (remote URLs are not checked). */
function missingImages(question: z.infer<typeof questionSchema>, absFile: string): string[] {
  const sources = [
    ...(question.image ? [question.image] : []),
    ...(question.images ?? []).map((img) => (typeof img === 'string' ? img : img.src)),
  ];
  return sources
    .filter((src) => !/^https?:\/\//.test(src))
    .filter((src) => !fs.existsSync(path.resolve(path.dirname(absFile), src)))
    .map((src) => `imagem não encontrada: ${src}`);
}

function validateDocument(absFile: string, kind: DocumentKind): string[] {
  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = parseDocument(fs.readFileSync(absFile, 'utf8')).frontmatter;
  } catch (err) {
    return [`frontmatter YAML inválido: ${(err as Error).message.split('\n')[0]}`];
  }
  if (kind === 'chapter') {
    const result = chapterSchema.safeParse(frontmatter);
    return result.success ? [] : result.error.issues.map(describeZodIssue);
  }
  const result = questionSchema.safeParse(frontmatter);
  return result.success ? missingImages(result.data, absFile) : result.error.issues.map(describeZodIssue);
}

/** Checks the frontmatter of every chapter and question in an archive directory. */
export function validateArchive(archiveDir: string): ArchiveValidation {
  const issues: ArchiveIssue[] = [];
  let checkedFiles = 0;
  for (const file of listMarkdownFiles(archiveDir)) {
    const kind = kindOf(file);
    if (!kind) continue;
    checkedFiles++;
    for (const message of validateDocument(path.join(archiveDir, file), kind)) issues.push({ file, message });
  }
  return { checkedFiles, issues };
}
