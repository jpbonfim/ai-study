import type { SubjectView } from '@ai-study/server/api-types';
import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { QuestionEntry } from './notebook-model';

const MAX_VISIBLE = 5;

interface SidebarQuestionsProps {
  subject: SubjectView;
  isOwnSubject: boolean;
  questions: QuestionEntry[];
  activeTag: string | null;
  showOtherTags: boolean;
  currentQuestionId: string | null;
  recentIds: string[];
}

/** Link to a question page, keeping the subject owner and the question's own owner. */
export function questionHref(subject: SubjectView, entry: QuestionEntry): string {
  const params = new URLSearchParams();
  if (entry.ownerUserId !== subject.ownerUserId) params.set('q_owner', String(entry.ownerUserId));
  if (subject.isShared) params.set('owner', String(subject.ownerUserId));
  const query = params.toString();
  return `/${subject.slug}/questoes/${entry.meta.id}${query ? `?${query}` : ''}`;
}

/**
 * "Questões Resolvidas": up to 5 questions of the active tag, most recently visited first, with a
 * FLIP animation when the order changes.
 */
export function SidebarQuestions({
  subject,
  isOwnSubject,
  questions,
  activeTag,
  showOtherTags,
  currentQuestionId,
  recentIds,
}: SidebarQuestionsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const previousRects = useRef(new Map<string, DOMRect>());

  const matching = questions
    .map((entry, order) => ({ entry, order }))
    .filter(({ entry }) =>
      activeTag ? entry.matchTags.includes(activeTag) : !entry.isFromOther || showOtherTags,
    )
    .sort((a, b) => {
      const posA = recentIds.indexOf(a.entry.meta.id);
      const posB = recentIds.indexOf(b.entry.meta.id);
      if (posA !== -1 && posB !== -1) return posA - posB;
      if (posA !== -1) return -1;
      if (posB !== -1) return 1;
      return a.order - b.order;
    });
  const visible = matching.slice(0, MAX_VISIBLE);

  const bankParams = new URLSearchParams();
  if (activeTag) bankParams.set('tag', activeTag);
  const currentOwner = new URLSearchParams(window.location.search).get('owner');
  if (currentOwner) bankParams.set('owner', currentOwner);
  const bankQuery = bankParams.toString();

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.querySelectorAll<HTMLElement>('.sidebar-question-item'));
    const animated: HTMLElement[] = [];
    const before = previousRects.current;
    const after = new Map<string, DOMRect>();
    for (const item of items) {
      const id = item.dataset.questionId ?? '';
      const rect = item.getBoundingClientRect();
      if (rect.height > 0) after.set(id, rect);
      const old = before.get(id);
      if (before.size === 0 || rect.height === 0) continue;
      if (old) {
        const deltaY = old.top - rect.top;
        if (Math.abs(deltaY) > 1) {
          item.style.transform = `translateY(${deltaY}px)`;
          item.style.transition = 'none';
          animated.push(item);
        }
      } else {
        item.style.opacity = '0';
        item.style.transform = 'translateY(14px)';
        item.style.transition = 'none';
        animated.push(item);
      }
    }
    previousRects.current = after;
    if (animated.length === 0) return;
    void list.offsetHeight;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const item of animated) {
          item.style.transition = 'transform 360ms cubic-bezier(0.25, 1, 0.5, 1), opacity 360ms ease';
          item.style.transform = '';
          item.style.opacity = '';
        }
        setTimeout(() => {
          for (const item of animated) item.style.transition = '';
        }, 380);
      });
    });
  });

  if (questions.length === 0) return null;

  return (
    <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]" id="sidebar-questions-container">
      <div className="sans-ui flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <span>Questões Resolvidas</span>
        <Link
          id="sidebar-questions-bank-link"
          to={`/${subject.slug}/questoes${bankQuery ? `?${bankQuery}` : ''}`}
          className="text-[11px] font-normal text-[var(--accent)] hover:underline"
        >
          Ver banco ({matching.length})
        </Link>
      </div>

      <div
        id="sidebar-questions-empty"
        className={`${activeTag && visible.length > 0 ? 'hidden ' : ''}p-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 text-xs text-[var(--text-muted)] text-center italic`}
      >
        Selecione uma tag acima para visualizar as questões.
      </div>

      <div className={`space-y-1.5${activeTag && visible.length > 0 ? '' : ' hidden'}`} id="sidebar-questions-list" ref={listRef}>
        {visible.map(({ entry, order }) => {
          const isOther = entry.ownerUserId !== subject.ownerUserId;
          const isCurrent = currentQuestionId === entry.meta.id;
          return (
            <Link
              key={`${entry.ownerUserId}:${entry.meta.id}`}
              to={questionHref(subject, entry)}
              data-question-id={entry.meta.id}
              data-question-order={order}
              data-question-tags={entry.matchTags.join(',')}
              data-is-other={isOther ? 'true' : 'false'}
              className={`sidebar-question-item will-change-transform sans-ui block text-xs p-2 rounded-md border transition-all ${
                isCurrent
                  ? 'bg-[var(--accent-subtle)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] border-transparent hover:border-[var(--border-subtle)]'
              }`}
            >
              <div className="font-medium truncate">
                {entry.meta.exam} ({entry.meta.year}) — {entry.meta.title}
              </div>
              {isOther && isOwnSubject && entry.ownerDisplayName && (
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono truncate mt-0.5">
                  De: {entry.ownerDisplayName}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
