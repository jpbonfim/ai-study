import type { Subject } from '@ai-study/content';
import { readItem, readJson, STORAGE_KEYS, writeItem } from '../preferences/storage';

/** Snapshot of where the user last studied (drives "Continuar estudo" on the home page). */
export interface LastVisitedSubject {
  slug: string;
  name: string;
  code: string;
  institution: string;
  period: string;
  chaptersCount: number;
  questionsCount: number;
  pageTitle: string;
  lastSectionTitle: string;
  lastUrl: string;
  url: string;
  visitedAt: string;
}

interface RecentSubject {
  slug: string;
  lastUrl?: string;
  lastSectionTitle?: string;
  visitedAt: string;
}

const MAX_RECENT_SUBJECTS = 30;
const MAX_RECENT_QUESTIONS = 50;

export function readLastVisited(): LastVisitedSubject | null {
  return readJson<LastVisitedSubject | null>(STORAGE_KEYS.lastVisitedSubject, null);
}

export function readRecentSubjects(): RecentSubject[] {
  const list = readJson<unknown>(STORAGE_KEYS.recentSubjects, []);
  return Array.isArray(list) ? (list as RecentSubject[]) : [];
}

function pushRecentSubject(entry: RecentSubject): void {
  const list = readRecentSubjects().filter((item) => item && item.slug !== entry.slug);
  list.unshift(entry);
  writeItem(STORAGE_KEYS.recentSubjects, JSON.stringify(list.slice(0, MAX_RECENT_SUBJECTS)));
}

/** Home page: remember that a subject was opened from the list. */
export function recordSubjectAccess(slug: string): void {
  pushRecentSubject({ slug, visitedAt: new Date().toISOString() });
}

/**
 * Saves the current study position. Without an explicit section title the description is derived
 * from the page (question page, question bank, or the table-of-contents entry of the hash).
 */
export function saveStudyPosition(
  subject: Pick<Subject, 'slug' | 'name' | 'code' | 'institution' | 'period' | 'chaptersCount' | 'questionsCount'>,
  pageTitle: string,
  sectionTitle?: string,
  hashOverride?: string,
): void {
  const now = new Date().toISOString();
  const { pathname, search } = window.location;
  const hash = hashOverride !== undefined ? hashOverride : window.location.hash;
  const fullUrl = pathname + search + (hash || '');

  let description = sectionTitle || pageTitle;
  if (!sectionTitle) {
    if (pathname.includes('/questoes/')) description = pageTitle;
    else if (pathname.endsWith('/questoes') || pathname.endsWith('/questoes/'))
      description = 'Banco de Questões Resolvidas';
    else if (hash) {
      const anchor = document.querySelector(`a[href*="${hash.replaceAll('"', '\\"')}"]`);
      if (anchor?.textContent) description = anchor.textContent.trim();
    }
  }

  const snapshot: LastVisitedSubject = {
    slug: subject.slug,
    name: subject.name,
    code: subject.code,
    institution: subject.institution,
    period: subject.period,
    chaptersCount: subject.chaptersCount,
    questionsCount: subject.questionsCount,
    pageTitle,
    lastSectionTitle: description,
    lastUrl: fullUrl,
    url: fullUrl,
    visitedAt: now,
  };
  writeItem(STORAGE_KEYS.lastVisitedSubject, JSON.stringify(snapshot));
  pushRecentSubject({ slug: subject.slug, lastUrl: fullUrl, lastSectionTitle: description, visitedAt: now });
}

export function readRecentQuestions(materiaSlug: string): string[] {
  const list = readJson<unknown>(STORAGE_KEYS.recentQuestions(materiaSlug), []);
  return Array.isArray(list) ? (list as string[]) : [];
}

export function recordVisitedQuestion(materiaSlug: string, questionId: string): void {
  if (!questionId || questionId === 'questoes' || questionId === 'index') return;
  const list = readRecentQuestions(materiaSlug).filter((id) => id && id !== questionId);
  list.unshift(questionId);
  writeItem(STORAGE_KEYS.recentQuestions(materiaSlug), JSON.stringify(list.slice(0, MAX_RECENT_QUESTIONS)));
}

export function readFlag(key: string): boolean {
  return readItem(key) === 'true';
}
