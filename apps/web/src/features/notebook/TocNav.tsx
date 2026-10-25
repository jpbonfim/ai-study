import type { StudyType } from '@ai-study/content';
import type { TocItem } from './notebook-model';

export interface TocGroupState {
  active: StudyType;
  expanded: Record<StudyType, boolean>;
}

interface TocNavProps {
  toc: TocItem[];
  /** Base href of the subject page (`/<slug>` plus `?owner=` when needed). */
  subjectHref: string | null;
  ownerQuery: string;
  activeTag: string | null;
  groups: TocGroupState;
  activeId: string | null;
  parentActiveId: string | null;
  onGroupClick: (group: StudyType, isChevronClick: boolean) => void;
}

const GROUPS: { type: StudyType; label: string; icon: string }[] = [
  {
    type: 'materia',
    label: 'Resumo da matéria',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    type: 'questoes',
    label: 'Estudo por questões',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  },
];

function TocEntries({
  items,
  hrefFor,
  typed,
  activeTag,
  activeId,
  parentActiveId,
}: {
  items: TocItem[];
  hrefFor: (id: string) => string;
  typed: boolean;
  activeTag: string | null;
  activeId: string | null;
  parentActiveId: string | null;
}) {
  return (
    <>
      {items.map((chapter, index) => {
        const hidden = activeTag !== null && !chapter.tags.includes(activeTag);
        const chapterClasses = `toc-item toc-chapter-link block font-serif font-bold text-sm text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors py-1.5 px-2.5 rounded-md${
          activeId === chapter.id ? ' is-active' : ''
        }${parentActiveId === chapter.id ? ' is-parent-active' : ''}`;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: chapter numbers (and so anchor ids) may repeat across documents.
            key={`${chapter.id}-${index}`}
            className={`space-y-0.5 sidebar-chapter-item${hidden ? ' hidden' : ''}`}
            data-chapter-tags={chapter.tags.join(',')}
            data-chapter-type={chapter.type}
            data-is-other={chapter.isFromOther ? 'true' : 'false'}
          >
            <a
              href={hrefFor(chapter.id)}
              data-toc-id={chapter.id}
              data-toc-title={chapter.title}
              {...(typed ? { 'data-chapter-type': chapter.type } : {})}
              className={chapterClasses}
            >
              {chapter.title}
            </a>
            {chapter.subsections.length > 0 && (
              <div className="pl-3 border-l-2 border-[var(--border-subtle)] space-y-0.5 ml-2 mt-0.5">
                {chapter.subsections.map((sub) => (
                  <a
                    key={sub.id}
                    href={hrefFor(sub.id)}
                    data-toc-id={sub.id}
                    data-toc-title={sub.title}
                    data-parent-id={chapter.id}
                    {...(typed ? { 'data-chapter-type': chapter.type } : {})}
                    className={`toc-item toc-sub-link sans-ui block text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-1 px-2 rounded transition-colors leading-snug${
                      activeId === sub.id ? ' is-active' : ''
                    }`}
                  >
                    {sub.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** "Conteúdo" table of contents: two collapsible groups when both kinds of chapters exist. */
export function TocNav({
  toc,
  subjectHref,
  ownerQuery,
  activeTag,
  groups,
  activeId,
  parentActiveId,
  onGroupClick,
}: TocNavProps) {
  const materiaToc = toc.filter((item) => item.type === 'materia');
  const questoesToc = toc.filter((item) => item.type !== 'materia');
  const grouped = materiaToc.length > 0 && questoesToc.length > 0;

  const visible = (items: TocItem[]) => (activeTag ? items.filter((i) => i.tags.includes(activeTag)) : items);
  const anyVisible = activeTag !== null && visible(toc).length > 0;

  const typedHref = (type: StudyType) => (id: string) =>
    subjectHref ? `${subjectHref}${ownerQuery ? `${ownerQuery}&` : '?'}type=${type}#${id}` : `#${id}`;
  const plainHref = (id: string) => (subjectHref ? `${subjectHref}${ownerQuery}#${id}` : `#${id}`);

  return (
    <div className="space-y-3" id="sidebar-toc-container">
      <div className="sans-ui flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <span>Conteúdo</span>
        <span className="text-[10px] lowercase font-normal opacity-80">(clique para ir)</span>
      </div>

      <div
        id="sidebar-toc-empty"
        className={`${anyVisible ? 'hidden ' : ''}p-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 text-xs text-[var(--text-muted)] text-center italic`}
      >
        Selecione uma tag acima para visualizar o sumário.
      </div>

      <nav className={`space-y-2 text-sm${anyVisible ? '' : ' hidden'}`} id="sidebar-toc-nav">
        {grouped ? (
          <div className="space-y-3" id="sidebar-toc-groups">
            {GROUPS.map((group) => {
              const items = group.type === 'materia' ? materiaToc : questoesToc;
              const isActive = groups.active === group.type;
              const expanded = groups.expanded[group.type];
              const hasVisible = visible(items).length > 0;
              return (
                <div
                  key={group.type}
                  className={`toc-collapsible-group space-y-1${activeTag && !hasVisible ? ' hidden' : ''}`}
                  data-group-type={group.type}
                >
                  {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-selected marks the active section, as before. */}
                  <button
                    type="button"
                    className={`toc-collapsible-btn sans-ui w-full flex items-center justify-between py-1.5 px-2.5 rounded-lg border transition-all duration-150 cursor-pointer select-none group shadow-2xs ${
                      isActive
                        ? 'border-[var(--accent)]/50 bg-[var(--accent-subtle)]/35 text-[var(--accent)] font-semibold'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40'
                    }`}
                    aria-expanded={expanded}
                    aria-selected={isActive}
                    data-target-group={group.type}
                    onClick={(e) => {
                      e.stopPropagation();
                      onGroupClick(group.type, Boolean((e.target as Element).closest('.toc-collapsible-chevron')));
                    }}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="w-5 h-5 rounded-md flex items-center justify-center bg-[var(--accent-subtle)] text-[var(--accent)] shrink-0 group-hover:scale-105 transition-transform">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={group.icon} />
                        </svg>
                      </span>
                      <span className="font-bold tracking-wider uppercase text-[11px] truncate">{group.label}</span>
                    </span>
                    <svg
                      className={`toc-collapsible-chevron w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transform transition-transform duration-200 shrink-0${expanded ? '' : ' -rotate-90'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div
                    className={`toc-collapsible-content space-y-1.5 pt-0.5${expanded ? '' : ' hidden'}`}
                    data-group-content={group.type}
                  >
                    <TocEntries
                      items={items}
                      hrefFor={typedHref(group.type)}
                      typed
                      activeTag={activeTag}
                      activeId={activeId}
                      parentActiveId={parentActiveId}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1.5" id="sidebar-toc-direct">
            <TocEntries
              items={toc}
              hrefFor={plainHref}
              typed={false}
              activeTag={activeTag}
              activeId={activeId}
              parentActiveId={parentActiveId}
            />
          </div>
        )}
      </nav>
    </div>
  );
}
