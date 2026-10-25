import type { StudyType } from '@ai-study/content';
import type { Notebook, SessionInfo } from '@ai-study/server/api-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { readItem, STORAGE_KEYS, writeItem } from '../../preferences/storage';
import { ChapterFlow, type ChapterFlowHandle } from './ChapterFlow';
import {
  buildChapterEntries,
  buildQuestionEntries,
  buildTagOptions,
  buildToc,
  chaptersForTag,
  type FlowChapter,
  initialSectionFor,
  namespacedTag,
  type TocItem,
  tagDisplayName,
} from './notebook-model';
import { type ReadingFlow, StudyLayout } from './StudyLayout';
import { useStudyState } from './study-state';
import { parseOwnerParam, useNotebook } from './use-notebook';

interface FlowState {
  tag: string;
  section: StudyType;
  chapters: FlowChapter[];
  origin: 'initial' | 'fetched';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Section a URL hash points to (TOC entry, else the anchor naming convention). */
function sectionFromHash(hash: string, toc: TocItem[]): StudyType | null {
  const id = hash.replace(/^#/, '');
  if (!id) return null;
  for (const item of toc) {
    if (item.id === id || item.subsections.some((s) => s.id === id)) return item.type;
  }
  if (id.includes('cap-materia-')) return 'materia';
  if (id.startsWith('cap-')) return 'questoes';
  return null;
}

export function NotebookPage({ session }: { session: SessionInfo }) {
  const { materia: slug = '' } = useParams();
  const [params] = useSearchParams();
  const notebook = useNotebook(slug, parseOwnerParam(params.get('owner')));
  if (notebook.isPending) return null;
  if (notebook.error || !notebook.data) return <Navigate to="/?error=materia_nao_encontrada" replace />;
  return <NotebookView key={`${slug}:${notebook.data.primaryOwnerId}`} session={session} notebook={notebook.data} />;
}

function NotebookView({ session, notebook }: { session: SessionInfo; notebook: Notebook }) {
  const subject = notebook.subject;
  const slug = subject.slug;
  // Query parameters at page load (later changes are reflected with replaceState).
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const tagParam = initialParams.get('tag')?.trim() || null;
  const typeParam = initialParams.get('type')?.trim() || null;

  const entries = useMemo(() => buildChapterEntries(notebook), [notebook]);
  const toc = useMemo(() => buildToc(entries), [entries]);
  const tagOptions = useMemo(() => buildTagOptions(notebook), [notebook]);
  const questions = useMemo(() => buildQuestionEntries(notebook), [notebook]);
  const hasBothTypes = entries.some((e) => e.meta.type === 'materia') && entries.some((e) => e.meta.type !== 'materia');
  const initialSection = useMemo(() => initialSectionFor(entries, typeParam, tagParam), [entries, typeParam, tagParam]);
  const hasOtherUsersTags = tagOptions.some((t) => t.isFromOtherUser);

  const study = useStudyState(slug, tagParam, hasOtherUsersTags && notebook.isOwnSubject);
  const [section, setSection] = useState<StudyType>(initialSection);
  const [flow, setFlow] = useState<FlowState | null>(null);
  const flowRef = useRef<ChapterFlowHandle>(null);
  const notebookRef = useRef<HTMLElement>(null);
  const pendingScroll = useRef<{ targetId?: string; scrollToNotebook: boolean } | null>(null);
  const navigateRef = useRef<((targetId: string) => void) | null>(null);

  const showFlow = useCallback(
    (tag: string, nextSection: StudyType, origin: FlowState['origin'], targetId?: string) => {
      setFlow((current) => {
        if (current && current.tag === tag && current.section === nextSection) {
          if (targetId) navigateRef.current?.(targetId);
          return current;
        }
        pendingScroll.current = { targetId, scrollToNotebook: origin === 'fetched' && !targetId };
        return { tag, section: nextSection, chapters: chaptersForTag(notebook, tag, nextSection), origin };
      });
    },
    [notebook],
  );

  const switchSection = useCallback(
    async (next: StudyType, targetId?: string) => {
      setSection(next);
      writeItem(STORAGE_KEYS.selectedSection(slug), next);
      const url = new URL(window.location.href);
      url.searchParams.set('type', next);
      if (targetId) url.hash = `#${targetId}`;
      window.history.replaceState(window.history.state, '', url.toString());
      if (study.tag) showFlow(study.tag, next, 'fetched', targetId);
    },
    [slug, study.tag, showFlow],
  );

  // Page initialization: the preferred section (URL, hash, last used) and the tag's chapters.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once when the page opens.
  useEffect(() => {
    const preferred =
      (typeParam === 'materia' || typeParam === 'questoes' ? typeParam : null) ||
      sectionFromHash(window.location.hash, toc) ||
      (readItem(STORAGE_KEYS.selectedSection(slug)) as StudyType | null) ||
      initialSection;
    if (preferred !== initialSection) void switchSection(preferred);
    else if (study.tag) showFlow(study.tag, initialSection, tagParam ? 'initial' : 'fetched');
  }, []);

  // Tag changes after the page opened (sidebar selector, prompt cards, "Outras tags").
  const firstTagRun = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to the selected tag only.
  useEffect(() => {
    if (firstTagRun.current) {
      firstTagRun.current = false;
      return;
    }
    if (study.tag) showFlow(study.tag, section, 'fetched');
    else setFlow(null);
  }, [study.tag]);

  // After a new flow renders: go to the requested anchor, or bring the notebook into view.
  useEffect(() => {
    const pending = pendingScroll.current;
    if (!flow || !pending) return;
    pendingScroll.current = null;
    if (pending.targetId) navigateRef.current?.(pending.targetId);
    else if (pending.scrollToNotebook) notebookRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [flow]);

  const readingFlow: ReadingFlow = useMemo(
    () => ({
      renderedSection: flow?.section ?? (study.tag ? section : null),
      switchSection,
      ensureChapterLoaded: (anchorId) => flowRef.current?.ensureLoaded(anchorId) ?? Promise.resolve(false),
    }),
    [flow?.section, section, study.tag, switchSection],
  );

  const tag = study.tag;
  const flowChapters = flow?.chapters ?? [];
  const chaptersLabel =
    flow?.origin === 'fetched' && flowChapters.length > 0
      ? `${plural(flowChapters.length, 'Capítulo', 'Capítulos')} em Fluxo Contínuo`
      : plural(flowChapters.length, 'Capítulo', 'Capítulos');
  const matchTags = flow
    ? flow.origin === 'initial' && !flow.tag.startsWith('user_')
      ? [flow.tag, namespacedTag(notebook.primaryOwnerId, flow.tag)].join(',')
      : flow.tag
    : '';

  return (
    <StudyLayout
      title={`${subject.name} (${subject.code})`}
      user={session.user}
      subject={subject}
      isOwnSubject={notebook.isOwnSubject}
      tagOptions={tagOptions}
      toc={toc}
      questions={questions}
      study={study}
      flow={readingFlow}
      onNavigateReady={(navigate) => {
        navigateRef.current = navigate;
      }}
    >
      <div id="tag-select-prompt" className={`space-y-8 py-6 max-w-3xl mx-auto w-full${tag ? ' hidden' : ''}`}>
        <div className="p-8 sm:p-12 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-sm text-center space-y-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/30 mx-auto">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
              />
            </svg>
          </div>

          <div className="space-y-3">
            <div className="sans-ui text-xs font-mono font-bold uppercase tracking-widest text-[var(--accent)]">
              {subject.institution} • {subject.code}
              {subject.isShared && (
                <span className="ml-2 px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  De: {subject.ownerDisplayName || subject.ownerUsername}
                </span>
              )}
            </div>
            <h1 className="font-serif text-3xl sm:text-5xl font-bold text-[var(--text-primary)] leading-tight">
              {subject.name}
            </h1>
            <p className="font-serif text-base sm:text-lg text-[var(--text-secondary)] italic max-w-xl mx-auto">
              Para visualizar o caderno de estudos, selecione uma avaliação ou tag no menu lateral esquerdo.
            </p>
          </div>

          <div className="pt-6 border-t border-[var(--border-subtle)] space-y-4">
            <div className="sans-ui text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Tags Disponíveis para Estudo
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              {tagOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => study.selectTag(option.id)}
                  className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--accent)] transition-all cursor-pointer group shadow-2xs space-y-2 text-left w-full"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono text-base font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                        {option.label}
                      </span>
                      {option.isFromOtherUser && (
                        <span className="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                          {option.ownerDisplayName || option.ownerUsername}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="sans-ui flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                    <span>{plural(option.chaptersCount, 'Capítulo', 'Capítulos')}</span>
                    <span>•</span>
                    <span>{plural(option.questionsCount, 'Questão', 'Questões')}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="sans-ui text-xs text-[var(--text-muted)] pt-2">
            Dica: Você também pode alternar entre tags a qualquer momento pelo menu lateral.
          </div>
        </div>
      </div>

      <article id="notebook-content" ref={notebookRef} className={`space-y-14 w-full min-w-0${tag ? '' : ' hidden'}`}>
        <div className="sans-ui flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
            <span className="text-[var(--text-secondary)]">Tag selecionada:</span>
            <strong id="active-tag-display-name" className="text-[var(--accent)] font-bold font-mono text-sm">
              {tagDisplayName(tag)}
            </strong>
          </div>
          <button
            type="button"
            id="btn-switch-tag"
            onClick={() => study.selectTag(null)}
            className="text-[var(--accent)] hover:underline font-semibold cursor-pointer flex items-center gap-1"
          >
            <span>Outras tags</span>
          </button>
        </div>

        <header className="text-center pb-12 border-b border-[var(--border-strong)] space-y-4">
          <div className="sans-ui text-xs font-mono tracking-widest uppercase text-[var(--text-muted)]">
            {subject.institution} • {subject.code}
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-[var(--text-primary)] leading-tight">
            {subject.name}
          </h1>
          <p className="font-serif text-lg sm:text-xl text-[var(--text-secondary)] italic max-w-2xl mx-auto">
            {subject.period} — Caderno Integral de Estudos Teóricos e Questões Resolvidas
          </p>
          <div className="sans-ui flex items-center justify-center gap-4 pt-3 text-xs text-[var(--text-muted)]">
            <span id="header-chapters-count">{chaptersLabel}</span>
            <span>•</span>
            <span id="header-questions-count">{questions.length} Questões</span>
          </div>
        </header>

        <div
          id="no-chapters-for-tag"
          className={`${flow && flowChapters.length === 0 ? '' : 'hidden '}p-8 rounded-xl border border-dashed border-[var(--border-strong)] text-center text-sm text-[var(--text-secondary)] space-y-2`}
        >
          <p className="font-serif text-base font-bold text-[var(--text-primary)]">
            Nenhum capítulo teórico cadastrado para esta tag.
          </p>
          <p>Você pode acessar as questões diretamente pelo menu lateral ou escolher outra tag.</p>
        </div>

        <div
          className="space-y-20 w-full min-w-0"
          id="chapters-container"
          data-rendered-tag={flow?.tag ?? ''}
          data-rendered-section={flow?.section ?? ''}
        >
          {flow && (
            <ChapterFlow
              ref={flowRef}
              notebook={notebook}
              chapters={flow.chapters}
              origin={flow.origin}
              hasBothTypes={hasBothTypes}
              matchTags={matchTags}
            />
          )}
        </div>

        <div className="text-center pt-12 border-t border-[var(--border-strong)] sans-ui text-xs text-[var(--text-muted)] space-y-2">
          <p>Fim do Caderno Teórico de {subject.name}.</p>
          <p>
            Para praticar com mais exercícios, consulte o{' '}
            <Link
              id="footer-banco-link"
              to={`/${slug}/questoes${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`}
              className="text-[var(--accent)] font-semibold hover:underline"
            >
              Banco Completo de Questões Resolvidas
            </Link>
            .
          </p>
        </div>
      </article>
    </StudyLayout>
  );
}
