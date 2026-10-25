import type {
  ChapterMeta,
  Difficulty,
  QuestionImage,
  QuestionMeta,
  QuestionOption,
  QuestionType,
  SectionRef,
  StudyType,
  Subject,
} from './types';

/**
 * Normalization rules mirror the defaults the content has always been read with, so documents
 * written by the skills keep their meaning (e.g. a document without tags belongs to `teste-1`).
 */

type Frontmatter = Record<string, unknown>;

const DEFAULT_TAG = 'teste-1';
const MATERIA_SUBFOLDER = 'resumos/materia/';

function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function normalizeTags(frontmatter: Frontmatter): string[] {
  const raw = frontmatter.tags || (frontmatter.tag ? [frontmatter.tag] : [DEFAULT_TAG]);
  const tags = (Array.isArray(raw) ? raw : [raw]).map((t) => String(t));
  return tags.length > 0 ? tags : [DEFAULT_TAG];
}

function baseName(relPath: string): string {
  const file = relPath.split('/').pop() ?? relPath;
  return file.replace(/\.(md|mdx)$/i, '');
}

export function isMarkdownFile(name: string): boolean {
  return /\.(md|mdx)$/i.test(name);
}

export function normalizeChapterMeta(frontmatter: Frontmatter, relPath: string, materiaSlug: string): ChapterMeta {
  const inMateriaSubfolder = `/${relPath}`.includes(`/${MATERIA_SUBFOLDER}`);
  const type = (frontmatter.type ||
    frontmatter.studyType ||
    (inMateriaSubfolder ? 'materia' : 'questoes')) as StudyType;
  const name = baseName(relPath);
  const id = asString(frontmatter.id, inMateriaSubfolder && !name.startsWith('materia-') ? `materia-${name}` : name);

  return {
    id,
    path: relPath,
    materia: asString(frontmatter.materia, materiaSlug),
    title: asString(frontmatter.title, `Capítulo ${frontmatter.chapter || 1}`),
    topic: asString(frontmatter.topic, 'Geral'),
    chapter: Number(frontmatter.chapter || 1),
    order: Number(frontmatter.order || frontmatter.chapter || 1),
    description: asString(frontmatter.description),
    type,
    tags: normalizeTags(frontmatter),
    sections: Array.isArray(frontmatter.sections) ? (frontmatter.sections as SectionRef[]) : [],
    relatedQuestions: Array.isArray(frontmatter.relatedQuestions) ? (frontmatter.relatedQuestions as string[]) : [],
  };
}

function normalizeImages(frontmatter: Frontmatter): QuestionImage[] {
  const raw = (frontmatter.images || (frontmatter.image ? [frontmatter.image] : [])) as unknown[];
  if (!Array.isArray(raw)) return [];
  const defaultCaption = (idx: number) =>
    raw.length === 1 ? 'Diagrama esquemático oficial da questão' : `Figura ${idx + 1}`;

  return raw.map((img, idx) => {
    if (typeof img === 'string') return { src: img, caption: defaultCaption(idx) };
    if (img && typeof img === 'object') {
      const entry = img as { src?: unknown; caption?: unknown };
      return { src: asString(entry.src), caption: asString(entry.caption, defaultCaption(idx)) };
    }
    return { src: '', caption: defaultCaption(idx) };
  });
}

function normalizeOptions(frontmatter: Frontmatter): QuestionOption[] {
  const raw = frontmatter.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((opt) => {
    const entry = (opt ?? {}) as { label?: unknown; text?: unknown };
    return { label: asString(entry.label), text: asString(entry.text) };
  });
}

export function normalizeQuestionMeta(
  frontmatter: Frontmatter,
  relPath: string,
  materiaSlug: string,
  currentYear = new Date().getFullYear(),
): QuestionMeta {
  const id = asString(frontmatter.id, baseName(relPath));
  const correctOption = frontmatter.correctOption;
  return {
    id,
    path: relPath,
    materia: asString(frontmatter.materia, materiaSlug),
    title: asString(frontmatter.title, id),
    exam: asString(frontmatter.exam, 'Avaliação'),
    year: Number(frontmatter.year || currentYear),
    topic: asString(frontmatter.topic, 'Geral'),
    topicSlug: asString(frontmatter.topicSlug, 'geral'),
    tags: normalizeTags(frontmatter),
    difficulty: (frontmatter.difficulty || 'Médio') as Difficulty,
    type: (frontmatter.type || 'multipla_escolha') as QuestionType,
    statement: asString(frontmatter.statement),
    options: normalizeOptions(frontmatter),
    ...(correctOption !== undefined && correctOption !== null ? { correctOption: String(correctOption) } : {}),
    expectedAnswer: asString(frontmatter.expectedAnswer),
    images: normalizeImages(frontmatter),
  };
}

export function normalizeSubject(
  data: Record<string, unknown>,
  dirName: string,
  counts: { chapters: number; questions: number },
): Subject {
  const chaptersCount = counts.chapters || Number(data.chaptersCount || 0);
  const questionsCount = counts.questions || Number(data.questionsCount || 0);
  return {
    slug: asString(data.slug, dirName),
    name: asString(data.name, dirName),
    code: asString(data.code),
    institution: asString(data.institution, 'Universidade'),
    period: asString(data.period),
    description: asString(data.description),
    status: (data.status as Subject['status']) || (counts.chapters > 0 ? 'active' : 'coming_soon'),
    chaptersCount,
    questionsCount,
    topics: Array.isArray(data.topics) ? (data.topics as string[]) : [],
  };
}

/** Summary chapters: subject summaries first, then by `order`. */
export function compareChapters(a: ChapterMeta, b: ChapterMeta): number {
  const typeA = a.type === 'materia' ? 0 : 1;
  const typeB = b.type === 'materia' ? 0 : 1;
  if (typeA !== typeB) return typeA - typeB;
  return a.order - b.order;
}

/** Questions: newest exam year first, then by title. */
export function compareQuestions(a: QuestionMeta, b: QuestionMeta): number {
  if (a.year !== b.year) return b.year - a.year;
  return a.title.localeCompare(b.title);
}

/** Subjects: active ones first, then by name. */
export function compareSubjects(a: Subject, b: Subject): number {
  if (a.status === 'active' && b.status !== 'active') return -1;
  if (a.status !== 'active' && b.status === 'active') return 1;
  return a.name.localeCompare(b.name);
}
