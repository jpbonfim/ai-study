import type { Notebook, SessionInfo } from '@ai-study/server/api-types';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { renderStatementPreviews } from '../../render/render-client';
import {
  buildChapterEntries,
  buildQuestionEntries,
  buildTagOptions,
  buildToc,
  type QuestionEntry,
} from './notebook-model';
import { StudyLayout } from './StudyLayout';
import { useStudyState } from './study-state';
import { parseOwnerParam, useNotebook } from './use-notebook';

const FILTER_CLASS =
  'w-full min-w-0 px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] truncate cursor-pointer text-xs shadow-2xs';

/** Statement previews of every question, rendered per owner. */
function useStatementPreviews(notebook: Notebook) {
  return useQuery({
    queryKey: ['statement-previews', notebook.subject.slug, notebook.primaryOwnerId, notebook.otherSources.length],
    queryFn: async () => {
      const sources = [
        { ownerId: notebook.primaryOwnerId, materiaSlug: notebook.subject.slug, questions: notebook.questions },
        ...notebook.otherSources.map((s) => ({ ownerId: s.ownerUserId, materiaSlug: s.materiaSlug, questions: s.questions })),
      ];
      const results = await Promise.all(
        sources.map(async (s) => ({
          ownerId: s.ownerId,
          previews: await renderStatementPreviews({ ownerId: s.ownerId, materiaSlug: s.materiaSlug }, s.questions),
        })),
      );
      return new Map(results.map((r) => [r.ownerId, r.previews]));
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Question bank card (exam, topic, type, difficulty, title, one-line statement preview). */
export function QuestionCardPreview({
  entry,
  materiaSlug,
  statementHtml,
}: {
  entry: QuestionEntry;
  materiaSlug: string;
  statementHtml: string | undefined;
}) {
  const q = entry.meta;
  const params = new URLSearchParams();
  if (entry.isFromOther) params.set('q_owner', String(entry.ownerUserId));
  const currentOwner = new URLSearchParams(window.location.search).get('owner');
  if (currentOwner) params.set('owner', currentOwner);
  const query = params.toString() ? `?${params.toString()}` : '';
  const href = `/${q.materia || materiaSlug}/questoes/${q.id}${query}`;

  return (
    <div className="question-card-preview my-1.5 px-3.5 py-2.5 sm:px-4 sm:py-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:border-[var(--accent)] not-prose shadow-2xs transition-all">
      <div className="sans-ui flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-[var(--border-subtle)] text-xs leading-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold text-[var(--accent)] uppercase tracking-wider shrink-0 text-[11px] sm:text-xs">
            Exercício • {q.exam} ({q.year})
          </span>
          <span className="text-[var(--text-muted)] shrink-0">•</span>
          <span className="text-[var(--text-secondary)] font-medium truncate text-xs sm:text-[13px]">{q.topic}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded px-1.5 py-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] sm:text-[11px] uppercase font-semibold text-[var(--text-muted)]">
            {q.type === 'discursiva' ? 'Dissertativa' : 'Múltipla Escolha'}
          </span>
          <span className="text-[var(--text-muted)] italic text-[11px] sm:text-xs">{q.difficulty}</span>
        </div>
      </div>

      <div className="question-card-title font-serif text-[13px] sm:text-sm font-semibold text-[var(--text-primary)] mb-1 leading-snug line-clamp-1">
        <Link to={href} className="hover:text-[var(--accent)] transition-colors">
          {q.title}
        </Link>
      </div>

      {q.statement && (
        <div
          className="academic-prose font-serif text-xs sm:text-[13px] text-[var(--text-secondary)] line-clamp-1 mb-1.5 leading-relaxed"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered statement, sanitized by DOMPurify.
          dangerouslySetInnerHTML={{ __html: statementHtml ?? '' }}
        />
      )}

      <div className="sans-ui flex items-center justify-between pt-1.5 border-t border-[var(--border-subtle)] text-xs leading-none">
        <span className="font-mono text-[11px] sm:text-xs text-[var(--text-muted)] truncate max-w-[150px]">{q.id}</span>
        <Link
          to={href}
          className="font-semibold text-xs sm:text-[13px] text-[var(--accent)] hover:underline inline-flex items-center gap-1 shrink-0"
        >
          <span>Resolução</span>
        </Link>
      </div>
    </div>
  );
}

export function QuestionBankPage({ session }: { session: SessionInfo }) {
  const { materia: slug = '' } = useParams();
  const [params] = useSearchParams();
  const notebook = useNotebook(slug, parseOwnerParam(params.get('owner')));
  if (notebook.isPending) return null;
  if (notebook.error || !notebook.data) return <Navigate to="/?error=materia_nao_encontrada" replace />;
  return <QuestionBankView key={`${slug}:${notebook.data.primaryOwnerId}`} session={session} notebook={notebook.data} />;
}

function QuestionBankView({ session, notebook }: { session: SessionInfo; notebook: Notebook }) {
  const subject = notebook.subject;
  const toc = useMemo(() => buildToc(buildChapterEntries(notebook)), [notebook]);
  const tagOptions = useMemo(() => buildTagOptions(notebook), [notebook]);
  const questions = useMemo(() => buildQuestionEntries(notebook), [notebook]);
  const topics = useMemo(() => [...new Set(questions.map((q) => q.meta.topic))].sort(), [questions]);
  const hasOtherUsersTags = tagOptions.some((t) => t.isFromOtherUser);
  const study = useStudyState(subject.slug, null, hasOtherUsersTags && notebook.isOwnSubject);
  const previews = useStatementPreviews(notebook);

  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const tagFilter = study.tag ?? '';

  const query = search.toLowerCase().trim();
  const visibleIds = new Set(
    questions
      .filter((entry) => {
        const text = `${entry.meta.title} ${entry.meta.statement || ''} ${entry.ownerDisplayName || ''}`.toLowerCase();
        const matchTag = tagFilter ? entry.matchTags.includes(tagFilter) : !entry.isFromOther || study.showOtherTags;
        return (!query || text.includes(query)) && (!topic || entry.meta.topic === topic) && matchTag;
      })
      .map((entry) => `${entry.ownerUserId}:${entry.meta.id}`),
  );
  const hasFilters = Boolean(query || topic || tagFilter);


  return (
    <StudyLayout
      title={`Banco de Questões | ${subject.name}`}
      user={session.user}
      subject={subject}
      isOwnSubject={notebook.isOwnSubject}
      tagOptions={tagOptions}
      toc={toc}
      questions={questions}
      study={study}
    >
      <div className="space-y-10">
        <header className="pb-6 border-b border-[var(--border-strong)] space-y-2">
          <div className="sans-ui text-xs font-mono tracking-wider uppercase text-[var(--accent)]">
            Caderno de Exercícios &amp; Provas Anteriores
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">Banco de Questões Resolvidas</h1>
          <p className="font-serif text-base text-[var(--text-secondary)] italic">
            Questões oficiais de {subject.name} com fundamentação teórica, resolução analítica passo a passo e gabarito.
          </p>
        </header>

        <div className="sans-ui p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3 text-xs shadow-2xs min-w-0">
          <div className="space-y-2.5 min-w-0">
            <div className="relative w-full min-w-0">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                id="search-input"
                placeholder="Filtrar por enunciado, palavra-chave ou conceito..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full min-w-0 pl-9 pr-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] text-xs shadow-2xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0 w-full">
              <div className="min-w-0">
                <label htmlFor="tag-filter" className="sr-only">
                  Filtrar por Tag
                </label>
                <select
                  id="tag-filter"
                  className={FILTER_CLASS}
                  value={tagFilter}
                  onChange={(e) => study.selectTag(e.target.value || null)}
                >
                  <option value="">Todas as Avaliações / Tags</option>
                  {tagOptions.map((t) => (
                    <option
                      key={t.id}
                      value={t.id}
                      className={t.isFromOtherUser ? `other-user-filter-tag${study.showOtherTags ? '' : ' hidden'}` : ''}
                    >
                      {t.label}
                      {t.isFromOtherUser ? ` (${t.ownerDisplayName || t.ownerUsername})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-0">
                <label htmlFor="topic-filter" className="sr-only">
                  Filtrar por Tópico
                </label>
                <select id="topic-filter" className={FILTER_CLASS} value={topic} onChange={(e) => setTopic(e.target.value)}>
                  <option value="">Todos os Tópicos</option>
                  {topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div
            id="results-count"
            className="text-[var(--text-muted)] text-[11px] flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]"
          >
            <span>
              Exibindo {visibleIds.size} de {questions.length} questões.
            </span>
            <button
              type="button"
              id="clear-filters-btn"
              className={`text-[var(--accent)] hover:underline${hasFilters ? '' : ' hidden'} cursor-pointer font-medium`}
              onClick={() => {
                setSearch('');
                setTopic('');
                study.selectTag(null);
              }}
            >
              Limpar filtros
            </button>
          </div>
        </div>

        <div id="questions-list" className="space-y-4">
          {questions.map((entry) => {
            const key = `${entry.ownerUserId}:${entry.meta.id}`;
            return (
              <div
                key={key}
                className={`question-entry${visibleIds.has(key) ? '' : ' hidden'}`}
                data-topic={entry.meta.topic}
                data-tags={entry.matchTags.join(',')}
                data-is-other={entry.isFromOther ? 'true' : 'false'}
              >
                {entry.isFromOther && notebook.isOwnSubject && (
                  <div className="mb-1.5 flex items-center gap-1.5 sans-ui text-xs">
                    <span className="px-2 py-0.5 rounded font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                      Compartilhada por: {entry.ownerDisplayName}
                    </span>
                  </div>
                )}
                <QuestionCardPreview
                  entry={entry}
                  materiaSlug={subject.slug}
                  statementHtml={previews.data?.get(entry.ownerUserId)?.[entry.meta.id]}
                />
              </div>
            );
          })}
        </div>
      </div>
    </StudyLayout>
  );
}
