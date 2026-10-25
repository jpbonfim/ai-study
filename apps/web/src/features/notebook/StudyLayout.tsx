import type { StudyType } from '@ai-study/content';
import type { PublicUser, SubjectView } from '@ai-study/server/api-types';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { HeaderActions } from '../../components/HeaderActions';
import { DesktopSidebarOpenButton, MobileMenuIcon, SidebarBackdrop } from '../../components/SidebarChrome';
import { usePageChrome } from '../../lib/page-chrome';
import { recordVisitedQuestion, readRecentQuestions, saveStudyPosition } from '../../lib/study-history';
import { useSidebar } from '../../lib/use-sidebar';
import { readItem, STORAGE_KEYS, writeItem } from '../../preferences/storage';
import { downloadOfflineExport } from '../export/offline-export';
import type { QuestionEntry, TagOption, TocItem } from './notebook-model';
import { SidebarQuestions } from './SidebarQuestions';
import type { StudyState } from './study-state';
import { TagSelector } from './TagSelector';
import { type TocGroupState, TocNav } from './TocNav';
import { ContentRefreshContext, useContentEnhancers } from './use-content-enhancers';

/** Hooks the subject page (the continuous reading flow) offers to the layout's navigation. */
export interface ReadingFlow {
  /** Section of the chapters currently rendered. */
  renderedSection: StudyType | null;
  switchSection(section: StudyType, targetId?: string): Promise<void>;
  /** Loads a lazy chapter section if needed; resolves once its content is in the page. */
  ensureChapterLoaded(anchorId: string): Promise<boolean>;
}

interface StudyLayoutProps {
  title: string;
  user: PublicUser;
  subject: SubjectView;
  isOwnSubject: boolean;
  tagOptions: TagOption[];
  toc: TocItem[];
  questions: QuestionEntry[];
  study: StudyState;
  currentQuestionId?: string | null;
  wide?: boolean;
  flow?: ReadingFlow;
  /** Receives the in-page navigation function (jump to an anchor of the reading flow). */
  onNavigateReady?: (navigate: (targetId: string) => void) => void;
  children: ReactNode;
}

const DESKTOP_MIN_WIDTH = 1024;

function readExpanded(slug: string, group: StudyType): boolean | null {
  const value = readItem(STORAGE_KEYS.tocExpanded(slug, group));
  return value === null ? null : value === 'true';
}

/** Initial state of the two TOC groups (active section and which ones are expanded). */
function initialGroups(slug: string, activeHint: StudyType | null): TocGroupState {
  const active = activeHint ?? ((readItem(STORAGE_KEYS.selectedSection(slug)) as StudyType | null) || 'materia');
  const isQuestionPage = window.location.pathname.includes('/questoes');
  const expandedFor = (group: StudyType) =>
    group === active || (readExpanded(slug, group) ?? (group === 'questoes' ? isQuestionPage : !isQuestionPage));
  return { active, expanded: { materia: expandedFor('materia'), questoes: expandedFor('questoes') } };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reading layout of every subject page: sidebar (subject, tag selector, table of contents,
 * recent questions), mobile header, scroll spy, in-page anchor navigation and position history.
 */
export function StudyLayout({
  title,
  user,
  subject,
  isOwnSubject,
  tagOptions,
  toc,
  questions,
  study,
  currentQuestionId = null,
  wide = false,
  flow,
  onNavigateReady,
  children,
}: StudyLayoutProps) {
  usePageChrome(`${title} | Caderno de Estudos`);
  const sidebar = useSidebar();
  const refreshContent = useContentEnhancers();
  const slug = subject.slug;
  const ownerQuery = subject.ownerUserId && subject.ownerUserId !== user.id ? `?owner=${subject.ownerUserId}` : '';
  const hasOtherUsersTags = tagOptions.some((t) => t.isFromOtherUser);
  const grouped = toc.some((t) => t.type === 'materia') && toc.some((t) => t.type !== 'materia');

  const [groups, setGroups] = useState<TocGroupState>(() => initialGroups(slug, flow?.renderedSection ?? null));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [parentActiveId, setParentActiveId] = useState<string | null>(null);
  const [mobileTitle, setMobileTitle] = useState(toc[0]?.title ?? title);
  const [recentIds, setRecentIds] = useState(() => readRecentQuestions(slug));

  const tocIndex = useMemo(() => {
    const index = new Map<string, { title: string; type: StudyType; parentId: string | null }>();
    for (const chapter of toc) {
      index.set(chapter.id, { title: chapter.title, type: chapter.type, parentId: null });
      for (const sub of chapter.subsections) index.set(sub.id, { title: sub.title, type: chapter.type, parentId: chapter.id });
    }
    return index;
  }, [toc]);

  const subjectSnapshot = useMemo(
    () => ({
      slug,
      name: subject.name,
      code: subject.code,
      institution: subject.institution,
      period: subject.period,
      chaptersCount: subject.chaptersCount,
      questionsCount: subject.questionsCount,
    }),
    [slug, subject],
  );
  const savePosition = useCallback(
    (sectionTitle?: string, hash?: string) => saveStudyPosition(subjectSnapshot, title, sectionTitle, hash),
    [subjectSnapshot, title],
  );

  const setGroupExpanded = useCallback(
    (group: StudyType, expanded: boolean, persist: boolean) => {
      setGroups((g) => ({ ...g, expanded: { ...g.expanded, [group]: expanded } }));
      if (persist) writeItem(STORAGE_KEYS.tocExpanded(slug, group), expanded ? 'true' : 'false');
    },
    [slug],
  );
  const activateGroup = useCallback((group: StudyType) => setGroups((g) => ({ ...g, active: group })), []);

  // The rendered section of the reading flow drives the active group (section switch events).
  const renderedSection = flow?.renderedSection ?? null;
  useEffect(() => {
    if (!renderedSection) return;
    activateGroup(renderedSection);
    setGroupExpanded(renderedSection, true, true);
  }, [renderedSection, activateGroup, setGroupExpanded]);

  // A tag without chapters in the current section moves to the other section.
  const activeTag = study.tag;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to tag changes only (like the tag-changed event).
  useEffect(() => {
    if (!grouped || !activeTag) return;
    const visibleMateria = toc.some((t) => t.type === 'materia' && t.tags.includes(activeTag));
    const visibleQuestoes = toc.some((t) => t.type !== 'materia' && t.tags.includes(activeTag));
    let section = flow?.renderedSection ?? groups.active;
    if (section === 'materia' && !visibleMateria && visibleQuestoes) section = 'questoes';
    else if (section === 'questoes' && !visibleQuestoes && visibleMateria) section = 'materia';
    if (flow && section !== flow.renderedSection) void flow.switchSection(section);
    activateGroup(section);
    setGroupExpanded(section, true, false);
  }, [activeTag, grouped]);

  // ---------------------------------------------------------------------------------------------
  // Scroll spy
  // ---------------------------------------------------------------------------------------------
  const activeIdRef = useRef<string | null>(null);
  const updateActiveSection = useCallback(() => {
    const candidates: { id: string; top: number; docTop: number; title: string; parentId: string | null; type: StudyType }[] = [];
    for (const chapter of toc) {
      if (activeTag && !chapter.tags.includes(activeTag)) continue;
      for (const id of [chapter.id, ...chapter.subsections.map((s) => s.id)]) {
        const el = document.getElementById(id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top === 0 && rect.bottom === 0 && rect.width === 0 && rect.height === 0) continue;
        const info = tocIndex.get(id);
        candidates.push({
          id,
          top: rect.top,
          docTop: rect.top + window.scrollY,
          title: info?.title ?? '',
          parentId: info?.parentId ?? null,
          type: chapter.type,
        });
      }
    }
    if (candidates.length === 0) return;
    candidates.sort((a, b) => a.docTop - b.docTop);
    const threshold = window.innerWidth < DESKTOP_MIN_WIDTH ? 90 : 70;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 60;
    let active = candidates[0];
    if (atBottom) active = candidates[candidates.length - 1];
    else {
      for (const candidate of candidates) {
        if (candidate.top <= threshold) active = candidate;
        else break;
      }
    }
    if (!active || active.id === activeIdRef.current) return;
    activeIdRef.current = active.id;
    setActiveId(active.id);
    setParentActiveId(active.parentId);
    if (active.title) setMobileTitle(active.title);
    // Expand the collapsed group that contains the active section.
    setGroups((g) => (g.expanded[active.type] ? g : { ...g, expanded: { ...g.expanded, [active.type]: true } }));
    requestAnimationFrame(() => {
      document.querySelector(`.toc-item[data-toc-id="${CSS.escape(active.id)}"]`)?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'auto',
      });
    });
    savePosition(active.title, `#${active.id}`);
  }, [toc, tocIndex, activeTag, savePosition]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateActiveSection();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [updateActiveSection]);

  useEffect(() => {
    const timer = setTimeout(updateActiveSection, 60);
    return () => clearTimeout(timer);
  }, [activeTag, updateActiveSection]);

  // ---------------------------------------------------------------------------------------------
  // Anchor navigation
  // ---------------------------------------------------------------------------------------------
  const navigateTo = useCallback(
    async (targetId: string, preferSmooth = true): Promise<boolean> => {
      if (!targetId) return false;
      const isMobile = window.innerWidth < DESKTOP_MIN_WIDTH;
      if (isMobile) sidebar.closeMobile();

      const info = tocIndex.get(targetId);
      let target = document.getElementById(targetId);

      if (!target && info && flow) {
        const current = flow.renderedSection ?? groups.active;
        if (info.type !== current) {
          activateGroup(info.type);
          setGroupExpanded(info.type, true, true);
          await flow.switchSection(info.type, targetId);
          return true;
        }
      }

      let lazyLoaded = false;
      const chapterId = info?.parentId ?? targetId;
      if (flow && (!target || target.classList.contains('chapter-section'))) {
        lazyLoaded = await flow.ensureChapterLoaded(chapterId);
        target = document.getElementById(targetId);
      }
      if (!target && info?.parentId) target = document.getElementById(info.parentId);
      if (!target) return false;

      const headerOffset = isMobile ? 70 : 40;
      const top = () => Math.max(0, (target as HTMLElement).getBoundingClientRect().top + window.scrollY - headerOffset);
      const destination = top();
      const isClose = Math.abs(destination - window.scrollY) <= window.innerHeight * 2;
      const smooth = preferSmooth && !lazyLoaded && isClose;
      window.scrollTo({ top: destination, behavior: smooth ? 'smooth' : 'auto' });
      if (!smooth) {
        // Re-align after late reflows (fonts, KaTeX, images).
        requestAnimationFrame(() => {
          if (target?.isConnected && Math.abs(top() - window.scrollY) > 2) window.scrollTo({ top: top(), behavior: 'auto' });
        });
        setTimeout(() => {
          if (target?.isConnected && Math.abs(top() - window.scrollY) > 4) window.scrollTo({ top: top(), behavior: 'auto' });
        }, 80);
      }

      const url = new URL(window.location.href);
      url.hash = `#${targetId}`;
      window.history.replaceState(window.history.state, '', url.toString());
      updateActiveSection();
      savePosition(info?.title || target.querySelector('h2, h3')?.textContent?.trim(), `#${targetId}`);
      return true;
    },
    [tocIndex, flow, groups.active, sidebar, activateGroup, setGroupExpanded, updateActiveSection, savePosition],
  );

  const navigateRef = useRef(navigateTo);
  navigateRef.current = navigateTo;

  useEffect(() => {
    onNavigateReady?.((targetId) => void navigateRef.current(targetId, false));
  }, [onNavigateReady]);

  // Same-page anchor links (table of contents and links inside the content).
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('.toc-item, a[href*="#"]');
      const href = anchor?.getAttribute('href');
      if (!anchor || !href || href === '#') return;
      const hashIndex = href.indexOf('#');
      const targetId = hashIndex === -1 ? '' : href.slice(hashIndex + 1);
      if (!targetId) return;
      const linkPath = new URL(anchor.href, window.location.origin).pathname.replace(/\/+$/, '');
      if (linkPath !== window.location.pathname.replace(/\/+$/, '')) return;
      event.preventDefault();

      const itemType = (anchor.getAttribute('data-chapter-type') ||
        anchor.closest('.sidebar-chapter-item')?.getAttribute('data-chapter-type') ||
        anchor.closest('.toc-collapsible-group')?.getAttribute('data-group-type')) as StudyType | null;
      if (itemType) setGroupExpanded(itemType, true, true);
      void navigateRef.current(targetId, true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [setGroupExpanded]);

  // Restore the anchor of the URL after (re)loading, retrying while chapters render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per page load.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    let cancelled = false;
    const restore = async () => {
      await wait(50);
      if (!hash) {
        updateActiveSection();
        return;
      }
      for (let attempt = 0; attempt < 15 && !cancelled; attempt++) {
        if (await navigateRef.current(decodeURIComponent(hash), false)) return;
        await wait(80);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------------------------
  // Study history
  // ---------------------------------------------------------------------------------------------
  useEffect(() => {
    savePosition();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') savePosition();
    };
    window.addEventListener('visibilitychange', onVisibility);
    return () => window.removeEventListener('visibilitychange', onVisibility);
  }, [savePosition]);

  useEffect(() => {
    if (!currentQuestionId) return;
    recordVisitedQuestion(slug, currentQuestionId);
    setRecentIds(readRecentQuestions(slug));
  }, [slug, currentQuestionId]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href*="/questoes/"], a[data-question-id]');
      if (!link) return;
      const id = link.getAttribute('data-question-id') || link.getAttribute('href')?.match(/\/questoes\/([^/?#]+)/)?.[1];
      if (!id || id === 'questoes') return;
      recordVisitedQuestion(slug, id);
      if (link.classList.contains('sidebar-question-item')) setRecentIds(readRecentQuestions(slug));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [slug]);

  // ---------------------------------------------------------------------------------------------
  // Group buttons
  // ---------------------------------------------------------------------------------------------
  const onGroupClick = (group: StudyType, isChevronClick: boolean) => {
    const current = flow?.renderedSection ?? groups.active;
    const isInactive = group !== current;
    if (isChevronClick || !isInactive) {
      setGroupExpanded(group, !groups.expanded[group], true);
      return;
    }
    setGroupExpanded(group, true, true);
    activateGroup(group);
    if (flow) void flow.switchSection(group);
  };

  useEffect(() => {
    refreshContent();
  });

  const showOwnerBadge = !isOwnSubject;
  const ownerName = subject.ownerDisplayName || subject.ownerUsername || `Usuário ${subject.ownerUserId}`;

  return (
    <>
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-page)]/95 backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            id="mobile-sidebar-toggle"
            type="button"
            aria-label="Abrir Índice e Sumário"
            className="sans-ui p-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer shadow-xs"
            onClick={sidebar.openMobile}
          >
            <MobileMenuIcon className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1 flex items-center">
            <span id="mobile-current-section" className="font-serif text-sm font-bold truncate text-[var(--text-primary)] leading-normal">
              {mobileTitle}
            </span>
          </div>
        </div>
      </header>

      <div className="h-14 lg:hidden w-full shrink-0" aria-hidden="true" />

      <div className="flex w-full min-w-0">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: delegated handler only closes the mobile drawer after link clicks. */}
        <aside
          id="academic-sidebar"
          className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] ${sidebar.mobileOpen ? '' : '-translate-x-full '}lg:translate-x-0 transition-transform duration-200 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col justify-between overflow-y-auto`}
          onClick={sidebar.onSidebarClick}
        >
          <div className="p-6 space-y-6">
            <div className="space-y-3 pb-5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-2">
                <Link
                  to="/"
                  className="sans-ui inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>Todas as Matérias</span>
                </Link>
                <HeaderActions onCloseSidebar={sidebar.close} />
              </div>

              <div className="pt-1">
                <span className="sans-ui text-[11px] font-mono uppercase tracking-widest text-[var(--accent)] block font-semibold">
                  {subject.code} • {subject.institution}
                </span>
                <div className="flex items-start justify-between gap-2 mt-1">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-lg font-bold text-[var(--text-primary)] leading-snug">
                      <Link to={`/${slug}${ownerQuery}`} className="hover:text-[var(--accent)] transition-colors inline">
                        {subject.name}
                      </Link>
                      {showOwnerBadge && (
                        <span
                          className="sans-ui align-middle ml-1.5 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                          title={`Matéria compartilhada por ${subject.ownerDisplayName || subject.ownerUsername || 'outro usuário'}`}
                        >
                          De: {ownerName}
                        </span>
                      )}
                    </h2>
                  </div>
                  <a
                    href={`/downloads/${slug}.html`}
                    download={`${subject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`}
                    onClick={(e) => {
                      e.preventDefault();
                      void downloadOfflineExport(subject);
                    }}
                    className="sans-ui inline-flex items-center justify-center p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all shrink-0 cursor-pointer shadow-xs group"
                    title={`Baixar todo o conteúdo de ${subject.name} em HTML offline standalone`}
                    aria-label={`Baixar ${subject.name} offline`}
                  >
                    <svg className="w-4 h-4 transition-transform group-hover:translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            </div>

            {tagOptions.length > 0 && (
              <TagSelector
                tags={tagOptions}
                activeTag={study.tag}
                onSelect={(tag) => study.selectTag(tag)}
                showOtherToggle={hasOtherUsersTags && isOwnSubject}
                showOtherTags={study.showOtherTags}
                onToggleOtherTags={study.toggleOtherTags}
              />
            )}

            {toc.length > 0 && (
              <TocNav
                toc={toc}
                subjectHref={`/${slug}`}
                ownerQuery={ownerQuery}
                activeTag={study.tag}
                groups={groups}
                activeId={activeId}
                parentActiveId={parentActiveId}
                onGroupClick={onGroupClick}
              />
            )}

            <SidebarQuestions
              subject={subject}
              isOwnSubject={isOwnSubject}
              questions={questions}
              activeTag={study.tag}
              showOtherTags={study.showOtherTags}
              currentQuestionId={currentQuestionId}
              recentIds={recentIds}
            />
          </div>

          <div className="p-4 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)] sans-ui">
            Caderno Acadêmico de Estudos
          </div>
        </aside>

        <SidebarBackdrop id="sidebar-backdrop" open={sidebar.mobileOpen} onClose={sidebar.closeMobile} />
        <DesktopSidebarOpenButton onClick={sidebar.expandDesktop} />

        <main
          id="main-content-area"
          className={`flex-1 lg:pl-80 w-full min-w-0 transition-[padding] duration-200${wide ? '' : ' overflow-x-clip'}`}
        >
          <div
            className={`mx-auto px-4 sm:px-8 lg:px-12 py-8 sm:py-14 w-full min-w-0 ${wide ? 'max-w-7xl 2xl:max-w-[94rem]' : 'reader-column'}`}
          >
            <ContentRefreshContext.Provider value={refreshContent}>{children}</ContentRefreshContext.Provider>
          </div>
        </main>
      </div>
    </>
  );
}
