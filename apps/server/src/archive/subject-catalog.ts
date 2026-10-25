import fs from 'node:fs';
import path from 'node:path';
import {
  type ChapterMeta,
  compareSubjects,
  normalizeSubject,
  type QuestionMeta,
  type Subject,
} from '@ai-study/content';
import type { SubjectAccessPolicy } from '../permissions/authorization';
import type { PermissionRepository } from '../permissions/permission-repository';
import type { PublicUser } from '../users/user-repository';
import type { ArchiveStore } from './archive-store';
import { countMarkdownFiles, type DocumentIndex } from './document-index';

/** A subject as seen by a given user: their own, or shared with them by its owner. */
export interface SubjectView extends Subject {
  ownerUserId: number;
  ownerUsername?: string;
  ownerDisplayName?: string;
  isShared: boolean;
}

/** Content of another user's subject with the same code, offered as "tags de outros". */
export interface OtherSource {
  ownerUserId: number;
  ownerDisplayName: string;
  ownerUsername: string;
  materiaSlug: string;
  chapters: ChapterMeta[];
  questions: QuestionMeta[];
}

export interface Notebook {
  subject: SubjectView;
  primaryOwnerId: number;
  isOwnSubject: boolean;
  chapters: ChapterMeta[];
  questions: QuestionMeta[];
  otherSources: OtherSource[];
}

export class SubjectCatalog {
  constructor(
    private readonly store: ArchiveStore,
    private readonly documents: DocumentIndex,
    private readonly permissions: PermissionRepository,
    private readonly access: SubjectAccessPolicy,
  ) {}

  /** Reads `materia.json` of a subject directory; null when missing or unreadable. */
  readSubject(ownerId: number, dirName: string): Subject | null {
    const dir = this.store.subjectDir(ownerId, dirName);
    if (!dir) return null;
    const jsonPath = path.join(dir, 'materia.json');
    if (!fs.existsSync(jsonPath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<string, unknown>;
      return normalizeSubject(data, dirName, {
        chapters: countMarkdownFiles(path.join(dir, 'resumos')),
        questions: countMarkdownFiles(path.join(dir, 'questoes')),
      });
    } catch (err) {
      console.error(`[subjects] invalid materia.json at ${jsonPath}:`, err);
      return null;
    }
  }

  listOwn(userId: number): SubjectView[] {
    const seen = new Set<string>();
    const subjects: SubjectView[] = [];
    for (const dirName of this.store.listSubjectDirNames(userId)) {
      const subject = this.readSubject(userId, dirName);
      if (!subject || seen.has(subject.slug)) continue;
      seen.add(subject.slug);
      subjects.push({ ...subject, ownerUserId: userId, isShared: false });
    }
    return subjects.sort(compareSubjects);
  }

  listShared(userId: number): SubjectView[] {
    return this.permissions.listGrantedTo(userId).flatMap((grant) => {
      const subject = this.readSubject(grant.ownerUserId, grant.materiaSlug);
      if (!subject) return [];
      return [
        {
          ...subject,
          ownerUserId: grant.ownerUserId,
          ownerUsername: grant.ownerUsername,
          ownerDisplayName: grant.ownerDisplayName,
          isShared: true,
        },
      ];
    });
  }

  listAccessible(userId: number): { own: SubjectView[]; shared: SubjectView[] } {
    return { own: this.listOwn(userId), shared: this.listShared(userId) };
  }

  /**
   * Resolves which subject `/:slug` shows: an explicit `owner` (shared with the user, or any
   * subject for admins / granted users), the user's own subject, or one shared with them.
   */
  resolveNotebook(user: PublicUser, slug: string, requestedOwnerId: number | null): Notebook | null {
    const { own, shared } = this.listAccessible(user.id);
    let primaryOwnerId = user.id;
    let subject: SubjectView | undefined = own.find((s) => s.slug === slug);

    if (requestedOwnerId !== null) {
      const sharedMatch = shared.find((s) => s.slug === slug && s.ownerUserId === requestedOwnerId);
      if (sharedMatch || this.access.canRead(user, requestedOwnerId, slug)) {
        primaryOwnerId = requestedOwnerId;
        subject = sharedMatch ?? this.listOwn(requestedOwnerId).find((s) => s.slug === slug);
      }
    } else if (!subject) {
      const sharedMatch = shared.find((s) => s.slug === slug);
      if (sharedMatch) {
        primaryOwnerId = sharedMatch.ownerUserId;
        subject = sharedMatch;
      }
    }
    if (!subject) return null;

    const subjectDir = this.store.subjectDir(primaryOwnerId, slug);
    if (!subjectDir) return null;
    const isOwnSubject = user.id === primaryOwnerId;
    const code = subject.code.trim().toUpperCase();

    const otherSources: OtherSource[] =
      code && isOwnSubject
        ? shared
            .filter((s) => s.ownerUserId !== primaryOwnerId && s.code.trim().toUpperCase() === code)
            .map((s) => this.loadOtherSource(s))
        : [];

    return {
      subject,
      primaryOwnerId,
      isOwnSubject,
      chapters: this.documents.listChapters(subjectDir, slug),
      questions: this.documents.listQuestions(subjectDir, slug),
      otherSources,
    };
  }

  private loadOtherSource(subject: SubjectView): OtherSource {
    const dir = this.store.subjectDir(subject.ownerUserId, subject.slug);
    return {
      ownerUserId: subject.ownerUserId,
      ownerDisplayName: subject.ownerDisplayName || subject.ownerUsername || `Usuário ${subject.ownerUserId}`,
      ownerUsername: subject.ownerUsername || '',
      materiaSlug: subject.slug,
      chapters: dir ? this.documents.listChapters(dir, subject.slug) : [],
      questions: dir ? this.documents.listQuestions(dir, subject.slug) : [],
    };
  }
}
