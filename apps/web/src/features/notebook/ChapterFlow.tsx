import type { Notebook } from '@ai-study/server/api-types';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { renderChapter } from '../../render/render-client';
import { type FlowChapter, questionsOfOwner } from './notebook-model';
import { useContentRefresh } from './use-content-enhancers';

type ChapterLoad = { status: 'idle' | 'loading' } | { status: 'loaded'; html: string } | { status: 'error' };

export interface ChapterFlowHandle {
  /** Loads the chapter with this anchor if it is still a placeholder; true when it had to load. */
  ensureLoaded(anchorId: string): Promise<boolean>;
}

interface ChapterFlowProps {
  notebook: Notebook;
  chapters: FlowChapter[];
  /** `initial`: the flow for the URL's tag at page load; `fetched`: after switching tag/section. */
  origin: 'initial' | 'fetched';
  hasBothTypes: boolean;
  /** Tag ids the chapters answer to (data attribute used by the table of contents). */
  matchTags: string;
}

const LAZY_ROOT_MARGIN = '600px 0px';
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * Continuous reading flow of a tag: the first chapter renders right away, the others when the
 * reader gets within 600px of them (or when navigation needs them).
 */
export const ChapterFlow = forwardRef<ChapterFlowHandle, ChapterFlowProps>(function ChapterFlow(
  { notebook, chapters, origin, hasBothTypes, matchTags },
  ref,
) {
  const refreshContent = useContentRefresh();
  const [loads, setLoads] = useState<Record<string, ChapterLoad>>({});
  const inFlight = useRef(new Map<string, Promise<boolean>>());
  const placeholders = useRef(new Map<string, HTMLDivElement>());

  const load = useCallback(
    (chapter: FlowChapter): Promise<boolean> => {
      const existing = inFlight.current.get(chapter.anchorId);
      if (existing) return existing;
      const task = (async () => {
        setLoads((l) => ({ ...l, [chapter.anchorId]: { status: 'loading' } }));
        try {
          const html = await renderChapter(
            { ownerId: chapter.ownerUserId, materiaSlug: chapter.materiaSlug },
            chapter.meta,
            questionsOfOwner(notebook, chapter.ownerUserId),
          );
          setLoads((l) => ({ ...l, [chapter.anchorId]: { status: 'loaded', html } }));
          await nextFrame();
          return true;
        } catch (err) {
          console.error('Erro ao carregar capítulo sob demanda:', err);
          inFlight.current.delete(chapter.anchorId);
          setLoads((l) => ({ ...l, [chapter.anchorId]: { status: 'error' } }));
          return false;
        }
      })();
      inFlight.current.set(chapter.anchorId, task);
      return task;
    },
    [notebook],
  );

  useImperativeHandle(
    ref,
    () => ({
      ensureLoaded: async (anchorId) => {
        const chapter = chapters.find((c) => c.anchorId === anchorId);
        if (!chapter) return false;
        if (loads[anchorId]?.status === 'loaded') return false;
        return load(chapter);
      },
    }),
    [chapters, loads, load],
  );

  // New flow: forget previous loads and render the first chapter immediately.
  useEffect(() => {
    inFlight.current.clear();
    setLoads({});
    if (chapters[0]) void load(chapters[0]);
  }, [chapters, load]);

  // Lazy loading of the following chapters, once the first one is in the page (so the next
  // placeholders start far below, as when the first chapter arrived already rendered).
  const firstLoaded = chapters[0] ? loads[chapters[0].anchorId]?.status === 'loaded' : false;
  useEffect(() => {
    if (!firstLoaded) return;
    if (!('IntersectionObserver' in window)) {
      chapters.slice(1).forEach((c) => void load(c));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const chapter = chapters.find((c) => c.anchorId === (entry.target as HTMLElement).dataset.anchor);
          if (chapter) void load(chapter);
        }
      },
      { rootMargin: LAZY_ROOT_MARGIN, threshold: 0.01 },
    );
    for (const element of placeholders.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [chapters, load, firstLoaded]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: enhancers run after each chapter load.
  useEffect(() => {
    refreshContent();
  }, [loads, refreshContent]);

  return (
    <>
      {chapters.map((chapter, idx) => {
        const state = loads[chapter.anchorId] ?? { status: 'idle' };
        const isMateria = (chapter.meta.type || 'questoes') === 'materia';
        const showKind = origin === 'fetched' || hasBothTypes;
        const showOwner = origin === 'initial' && chapter.isOtherUserTag;
        return (
          <div className="space-y-12" key={`${chapter.ownerUserId}:${chapter.meta.id}`}>
            <section
              id={chapter.anchorId}
              data-chapter-id={chapter.meta.id}
              data-chapter-owner={chapter.ownerUserId}
              data-chapter-tags={matchTags}
              data-chapter-type={chapter.meta.type || 'questoes'}
              className="chapter-section scroll-mt-20 space-y-8 w-full min-w-0"
            >
              <div className="space-y-2 border-b border-[var(--border-subtle)] pb-4">
                <div className="sans-ui flex flex-wrap items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest text-[var(--accent)]">
                  <span>Capítulo {chapter.meta.chapter}</span>
                  {showKind &&
                    (origin === 'fetched' ? (
                      <span className="text-[var(--text-muted)] font-normal">
                        • {isMateria ? 'Resumo da Matéria' : 'Estudo por Questões'}
                      </span>
                    ) : (
                      <>
                        <span>•</span>
                        <span className="text-[var(--text-muted)] font-normal">
                          {isMateria ? 'Resumo da Matéria' : 'Estudo por Questões'}
                        </span>
                      </>
                    ))}
                  {showOwner && (
                    <>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        De: {chapter.ownerDisplayName}
                      </span>
                    </>
                  )}
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
                  {chapter.meta.title}
                </h2>
                {chapter.meta.description && (
                  <p className="font-serif text-base text-[var(--text-secondary)] italic">{chapter.meta.description}</p>
                )}
              </div>

              {state.status === 'loaded' ? (
                <div
                  className="academic-prose leading-relaxed text-[var(--text-primary)] space-y-6 w-full min-w-0"
                  data-chapter-body={chapter.meta.id}
                  data-loaded="true"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered study content, sanitized by DOMPurify.
                  dangerouslySetInnerHTML={{ __html: state.html }}
                />
              ) : state.status === 'error' ? (
                <div className="chapter-lazy-content" data-chapter-body={chapter.meta.id} data-loaded="false">
                  <div className="py-8 px-6 rounded-xl border border-dashed border-[var(--border-strong)] text-center space-y-3 my-4">
                    <p className="font-serif text-sm text-[var(--text-muted)]">
                      Ocorreu uma falha ao carregar este capítulo.
                    </p>
                    <button
                      type="button"
                      className="btn-retry-chapter px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
                      onClick={() => void load(chapter)}
                    >
                      Tentar Novamente
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="chapter-lazy-content"
                  data-chapter-body={chapter.meta.id}
                  data-chapter-id={chapter.meta.id}
                  data-loaded="false"
                  data-anchor={chapter.anchorId}
                  ref={(element) => {
                    if (element) placeholders.current.set(chapter.anchorId, element);
                    else placeholders.current.delete(chapter.anchorId);
                  }}
                >
                  <div className="py-12 px-6 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center space-y-3 my-4">
                    <div className="inline-block w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    <p className="font-serif text-sm text-[var(--text-secondary)] italic">
                      Avançando no material... Carregando Capítulo {chapter.meta.chapter}: {chapter.meta.title}
                    </p>
                  </div>
                </div>
              )}

              {idx < chapters.length - 1 && (
                <div className="text-center py-8 text-[var(--text-muted)] font-serif select-none">* * *</div>
              )}
            </section>
          </div>
        );
      })}
    </>
  );
});
