import type { ChapterMeta, QuestionMeta, StudyType } from '@ai-study/content';
import type { Indexed, Notebook, SubjectView } from '@ai-study/server/api-types';

/**
 * Pure derivations of a notebook (a subject plus other users' sources with the same code) into
 * what the study pages show: tag options, table of contents, sidebar question links and the
 * chapters of a tag. Tags of other users are namespaced as `user_<ownerId>::<tag>`.
 */

export interface TagOption {
  id: string;
  label: string;
  chaptersCount: number;
  questionsCount: number;
  isFromOtherUser: boolean;
  ownerUserId?: number;
  ownerUsername?: string;
  ownerDisplayName?: string;
}

export interface ChapterEntry {
  meta: Indexed<ChapterMeta>;
  ownerUserId: number;
  materiaSlug: string;
  isFromOther: boolean;
  ownerDisplayName?: string;
  /** Tags this chapter answers to in the sidebar filter. */
  matchTags: string[];
}

export interface TocItem {
  id: string;
  title: string;
  subsections: { id: string; title: string }[];
  tags: string[];
  type: StudyType;
  isFromOther: boolean;
}

export interface QuestionEntry {
  meta: Indexed<QuestionMeta>;
  ownerUserId: number;
  materiaSlug: string;
  isFromOther: boolean;
  ownerDisplayName?: string;
  matchTags: string[];
}

export const OTHER_TAG_PREFIX = 'user_';

export function namespacedTag(ownerId: number, tag: string): string {
  return `${OTHER_TAG_PREFIX}${ownerId}::${tag}`;
}

/** `user_2::p1` → `{ ownerId: 2, tag: 'p1' }`; plain tags → null. */
export function parseNamespacedTag(tag: string): { ownerId: number; tag: string } | null {
  if (!tag.startsWith(OTHER_TAG_PREFIX) || !tag.includes('::')) return null;
  const [ownerPart = '', raw = ''] = tag.split('::');
  return { ownerId: Number.parseInt(ownerPart.replace(OTHER_TAG_PREFIX, ''), 10), tag: raw };
}

/** Display name of a tag (the namespace is dropped). */
export function tagDisplayName(tag: string | null): string {
  if (!tag) return '';
  return tag.includes('::') ? (tag.split('::')[1] ?? '') : tag;
}

const unique = <T>(values: T[]) => [...new Set(values)];

export function buildTagOptions(notebook: Notebook): TagOption[] {
  const own = unique([...notebook.chapters.flatMap((c) => c.tags), ...notebook.questions.flatMap((q) => q.tags)]);
  const options: TagOption[] = own.map((tag) => ({
    id: tag,
    label: tag.trim(),
    chaptersCount: notebook.chapters.filter((c) => c.tags.includes(tag)).length,
    questionsCount: notebook.questions.filter((q) => q.tags.includes(tag)).length,
    isFromOtherUser: false,
  }));
  for (const source of notebook.otherSources) {
    const tags = unique([...source.chapters.flatMap((c) => c.tags), ...source.questions.flatMap((q) => q.tags)]);
    for (const tag of tags) {
      options.push({
        id: namespacedTag(source.ownerUserId, tag),
        label: tag.trim(),
        chaptersCount: source.chapters.filter((c) => c.tags.includes(tag)).length,
        questionsCount: source.questions.filter((q) => q.tags.includes(tag)).length,
        isFromOtherUser: true,
        ownerUserId: source.ownerUserId,
        ownerDisplayName: source.ownerDisplayName,
        ownerUsername: source.ownerUsername,
      });
    }
  }
  return options;
}

export function buildChapterEntries(notebook: Notebook): ChapterEntry[] {
  const primary = notebook.primaryOwnerId;
  return [
    ...notebook.chapters.map((meta) => ({
      meta,
      ownerUserId: primary,
      materiaSlug: notebook.subject.slug,
      isFromOther: false,
      matchTags: [...meta.tags, ...meta.tags.map((t) => namespacedTag(primary, t))],
    })),
    ...notebook.otherSources.flatMap((source) =>
      source.chapters.map((meta) => ({
        meta,
        ownerUserId: source.ownerUserId,
        materiaSlug: source.materiaSlug,
        isFromOther: true,
        ownerDisplayName: source.ownerDisplayName,
        matchTags: meta.tags.map((t) => namespacedTag(source.ownerUserId, t)),
      })),
    ),
  ];
}

export function buildQuestionEntries(notebook: Notebook): QuestionEntry[] {
  const primary = notebook.primaryOwnerId;
  return [
    ...notebook.questions.map((meta) => ({
      meta,
      ownerUserId: primary,
      materiaSlug: notebook.subject.slug,
      isFromOther: false,
      matchTags: [...meta.tags, ...meta.tags.map((t) => namespacedTag(primary, t))],
    })),
    ...notebook.otherSources.flatMap((source) =>
      source.questions.map((meta) => ({
        meta,
        ownerUserId: source.ownerUserId,
        materiaSlug: source.materiaSlug,
        isFromOther: true,
        ownerDisplayName: source.ownerDisplayName,
        matchTags: meta.tags.map((t) => namespacedTag(source.ownerUserId, t)),
      })),
    ),
  ];
}

/** Anchor id of a chapter section in the continuous reading flow. */
export function chapterAnchorId(type: StudyType, chapterNumber: number, otherOwnerId?: number): string {
  const prefix = otherOwnerId !== undefined ? `other-${otherOwnerId}-` : '';
  return type === 'materia' ? `${prefix}cap-materia-${chapterNumber}` : `${prefix}cap-${chapterNumber}`;
}

export function buildToc(entries: ChapterEntry[]): TocItem[] {
  return entries.map((entry) => ({
    id: chapterAnchorId(entry.meta.type, entry.meta.chapter, entry.isFromOther ? entry.ownerUserId : undefined),
    title: `Capítulo ${entry.meta.chapter}: ${entry.meta.topic}${entry.isFromOther ? ` (${entry.ownerDisplayName})` : ''}`,
    subsections: entry.meta.sections,
    tags: entry.matchTags,
    type: entry.meta.type || 'questoes',
    isFromOther: entry.isFromOther,
  }));
}

/** Section shown first on `/:materia`: `?type`, else the one that has chapters for the tag. */
export function initialSectionFor(
  entries: ChapterEntry[],
  typeParam: string | null,
  tagParam: string | null,
): StudyType {
  if (typeParam === 'materia' || typeParam === 'questoes') return typeParam;
  const hasMateria = entries.some((e) => e.meta.type === 'materia');
  const hasQuestoes = entries.some((e) => e.meta.type !== 'materia');
  if (hasMateria && hasQuestoes) {
    if (!tagParam) return 'materia';
    const raw = tagParam.includes('::') ? (tagParam.split('::')[1] ?? '') : tagParam;
    const tagHasMateria = entries.some((e) => e.meta.tags.includes(raw) && e.meta.type === 'materia');
    const tagHasQuestoes = entries.some((e) => e.meta.tags.includes(raw) && e.meta.type !== 'materia');
    return !tagHasMateria && tagHasQuestoes ? 'questoes' : 'materia';
  }
  return hasQuestoes && !hasMateria ? 'questoes' : 'materia';
}

export interface FlowChapter {
  meta: Indexed<ChapterMeta>;
  ownerUserId: number;
  materiaSlug: string;
  /** The tag was another user's (`user_X::tag`): anchors are namespaced. */
  isOtherUserTag: boolean;
  ownerDisplayName?: string;
  anchorId: string;
}

/** Chapters of the continuous reading flow for a tag and section, in reading order. */
export function chaptersForTag(notebook: Notebook, tag: string, section: StudyType): FlowChapter[] {
  const other = parseNamespacedTag(tag);
  const primarySource = {
    ownerUserId: notebook.primaryOwnerId,
    materiaSlug: notebook.subject.slug,
    chapters: notebook.chapters,
  };
  const source =
    other && other.ownerId !== notebook.primaryOwnerId
      ? notebook.otherSources.find((s) => s.ownerUserId === other.ownerId)
      : primarySource;
  if (!source) return [];
  const rawTag = other ? other.tag : tag;
  const ownerDisplayName = other
    ? notebook.otherSources.find((s) => s.ownerUserId === other.ownerId)?.ownerDisplayName
    : undefined;

  return source.chapters
    .filter((c) => c.tags.includes(rawTag) && (c.type || 'questoes') === section)
    .sort((a, b) => a.order - b.order || a.chapter - b.chapter)
    .map((meta) => ({
      meta,
      ownerUserId: source.ownerUserId,
      materiaSlug: source.materiaSlug,
      isOtherUserTag: Boolean(other),
      ...(ownerDisplayName ? { ownerDisplayName } : {}),
      anchorId: chapterAnchorId(meta.type || section, meta.chapter, other ? source.ownerUserId : undefined),
    }));
}

/** Questions of the owner whose chapter is being rendered (question cards resolve inside it). */
export function questionsOfOwner(notebook: Notebook, ownerId: number): Indexed<QuestionMeta>[] {
  if (ownerId === notebook.primaryOwnerId) return notebook.questions;
  return notebook.otherSources.find((s) => s.ownerUserId === ownerId)?.questions ?? [];
}

/** Link to the subject, carrying `?owner=` only when it is not the user's own subject. */
export function subjectOwnerQuery(subject: SubjectView, userId: number): string {
  return subject.ownerUserId && subject.ownerUserId !== userId ? `?owner=${subject.ownerUserId}` : '';
}
