import type { QuestionMeta, RenderedQuestion } from '@ai-study/content';
import type { Indexed, Notebook, SessionInfo } from '@ai-study/server/api-types';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { renderQuestionPage } from '../../render/render-client';
import { buildChapterEntries, buildQuestionEntries, buildTagOptions, buildToc, namespacedTag } from './notebook-model';
import { StudyLayout } from './StudyLayout';
import { useStudyState } from './study-state';
import { parseOwnerParam, useNotebook } from './use-notebook';

interface ResolvedQuestion {
  meta: Indexed<QuestionMeta>;
  ownerUserId: number;
  materiaSlug: string;
  isFromOther: boolean;
  ownerDisplayName: string;
  /** Questions of the same owner (previous/next navigation). */
  scope: Indexed<QuestionMeta>[];
}

/** Finds the question: explicit `q_owner` first, then the subject owner, then other sources. */
function resolveQuestion(notebook: Notebook, id: string, qOwner: number | null): ResolvedQuestion | null {
  const primary = {
    ownerUserId: notebook.primaryOwnerId,
    materiaSlug: notebook.subject.slug,
    questions: notebook.questions,
  };
  const fromPrimary = () => {
    const meta = primary.questions.find((q) => q.id === id);
    return meta ? { meta, ...primary, isFromOther: false, ownerDisplayName: '', scope: primary.questions } : null;
  };
  const fromSource = (source: Notebook['otherSources'][number]) => {
    const meta = source.questions.find((q) => q.id === id);
    return meta
      ? {
          meta,
          ownerUserId: source.ownerUserId,
          materiaSlug: source.materiaSlug,
          isFromOther: true,
          ownerDisplayName: source.ownerDisplayName,
          scope: source.questions,
        }
      : null;
  };

  if (qOwner !== null) {
    if (qOwner === notebook.primaryOwnerId) {
      const found = fromPrimary();
      if (found) return found;
    } else {
      const source = notebook.otherSources.find((s) => s.ownerUserId === qOwner);
      const found = source ? fromSource(source) : null;
      if (found) return found;
    }
  }
  const found = fromPrimary();
  if (found) return found;
  for (const source of notebook.otherSources) {
    const other = fromSource(source);
    if (other) return other;
  }
  return null;
}

export function QuestionPage({ session }: { session: SessionInfo }) {
  const { materia: slug = '', slug: questionId = '' } = useParams();
  const [params] = useSearchParams();
  const notebook = useNotebook(slug, parseOwnerParam(params.get('owner')));
  if (notebook.isPending) return null;
  if (notebook.error || !notebook.data) return <Navigate to="/?error=materia_nao_encontrada" replace />;
  const question = resolveQuestion(notebook.data, questionId, parseOwnerParam(params.get('q_owner')));
  if (!question) return <Navigate to={`/${slug}/questoes?error=questao_nao_encontrada`} replace />;
  return (
    <QuestionView
      key={`${slug}:${notebook.data.primaryOwnerId}`}
      session={session}
      notebook={notebook.data}
      question={question}
    />
  );
}

function QuestionView({
  session,
  notebook,
  question,
}: {
  session: SessionInfo;
  notebook: Notebook;
  question: ResolvedQuestion;
}) {
  const subject = notebook.subject;
  const slug = subject.slug;
  const [params] = useSearchParams();
  const ownerParam = params.get('owner');
  const toc = useMemo(() => buildToc(buildChapterEntries(notebook)), [notebook]);
  const tagOptions = useMemo(() => buildTagOptions(notebook), [notebook]);
  const questions = useMemo(() => buildQuestionEntries(notebook), [notebook]);
  const hasOtherUsersTags = tagOptions.some((t) => t.isFromOtherUser);

  const q = question.meta;
  const primaryTag = q.tags[0] || 'teste-1';
  const activeTagKey =
    params.get('tag') || (question.isFromOther ? namespacedTag(question.ownerUserId, primaryTag) : primaryTag);
  const study = useStudyState(slug, activeTagKey, hasOtherUsersTags && notebook.isOwnSubject);

  const rendered = useQuery({
    queryKey: ['question-render', question.ownerUserId, question.materiaSlug, q.id, q.version],
    queryFn: () => renderQuestionPage({ ownerId: question.ownerUserId, materiaSlug: question.materiaSlug }, q),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const index = question.scope.findIndex((item) => item.id === q.id);
  const prev = index > 0 ? question.scope[index - 1] : undefined;
  const next = index < question.scope.length - 1 ? question.scope[index + 1] : undefined;
  const questionUrl = (target: Indexed<QuestionMeta>) => {
    const urlParams = new URLSearchParams();
    if (question.ownerUserId !== notebook.primaryOwnerId) urlParams.set('q_owner', String(question.ownerUserId));
    if (ownerParam) urlParams.set('owner', ownerParam);
    urlParams.set('tag', activeTagKey);
    return `/${slug}/questoes/${target.id}?${urlParams.toString()}`;
  };
  const ownerSuffix = ownerParam ? `&owner=${ownerParam}` : '';

  return (
    <StudyLayout
      title={`${q.title} | ${subject.name}`}
      user={session.user}
      subject={subject}
      isOwnSubject={notebook.isOwnSubject}
      tagOptions={tagOptions}
      toc={toc}
      questions={questions}
      study={study}
      currentQuestionId={q.id}
      wide
    >
      <div className="space-y-6">
        <div className="sans-ui flex flex-wrap items-center justify-between gap-3 text-xs pb-4 border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <Link
              to={`/${slug}/questoes?tag=${encodeURIComponent(activeTagKey)}${ownerSuffix}`}
              className="hover:text-[var(--accent)] transition-colors"
            >
              &larr; Banco de Questões
            </Link>
            <span>•</span>
            <Link
              to={`/${slug}?tag=${encodeURIComponent(activeTagKey)}${ownerSuffix}#${q.topicSlug}`}
              className="hover:text-[var(--accent)] transition-colors"
            >
              Ir para a Teoria do Capítulo &rarr;
            </Link>
          </div>
          <div className="flex items-center gap-2 font-mono">
            {question.isFromOther && notebook.isOwnSubject && (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                Compartilhada por: {question.ownerDisplayName}
              </span>
            )}
            <span className="font-bold text-[var(--accent)]">
              {q.exam} • {q.year}
            </span>
          </div>
        </div>

        <QuestionToggle question={q} rendered={rendered.data} />

        <nav className="flex items-center justify-between pt-6 border-t border-[var(--border-subtle)] sans-ui text-xs">
          {prev ? (
            <Link
              to={questionUrl(prev)}
              className="flex items-center gap-1.5 p-2 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <span>&larr;</span>
              <span className="font-mono">Anterior: {prev.title}</span>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              to={questionUrl(next)}
              className="flex items-center gap-1.5 p-2 rounded hover:bg-[var(--bg-subtle)] text-[var(--accent)] font-semibold transition-colors"
            >
              <span className="font-mono">Próxima: {next.title}</span>
              <span>&rarr;</span>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      </div>
    </StudyLayout>
  );
}

function CollapsibleCard({
  kind,
  title,
  symbol,
  open,
  onToggle,
  children,
}: {
  kind: 'theory' | 'resolution';
  title: string;
  symbol: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const label = kind === 'theory' ? 'Teoria' : 'Resolução';
  return (
    <div
      className={`question-${kind}-card my-4 rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden transition-all duration-200`}
      data-section={kind}
    >
      <button
        type="button"
        className={`${kind}-card-header w-full px-4 py-2.5 sm:px-5 sm:py-3 flex items-center justify-between text-left hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer select-none`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2.5">
          <span className="sans-ui font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--accent)] shrink-0">
            {symbol}
          </span>
          <span className="sans-ui text-xs sm:text-sm font-semibold text-[var(--text-primary)] tracking-tight">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`${kind}-card-status sans-ui text-xs text-[var(--text-muted)] font-medium`}>
            {open ? `Ocultar ${label}` : `Exibir ${label}`}
          </span>
          <span className={`${kind}-card-chevron text-xs text-[var(--text-muted)] transition-transform duration-150`}>
            {open ? '↑' : '↓'}
          </span>
        </div>
      </button>
      <div
        className={`${kind}-card-panel${open ? '' : ' hidden'} border-t border-[var(--border-subtle)] p-5 sm:p-7 bg-[var(--bg-subtle)] academic-prose leading-relaxed text-[var(--text-primary)] space-y-6 w-full min-w-0`}
      >
        {children}
      </div>
    </div>
  );
}

function Html({ html, className }: { html: string; className?: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered study content, sanitized by DOMPurify.
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Two-column question view: sticky statement with figures and options on the left; theory and
 * resolution cards (with the answer key inside the resolution) on the right.
 */
function QuestionToggle({
  question,
  rendered,
}: {
  question: Indexed<QuestionMeta>;
  rendered: RenderedQuestion | undefined;
}) {
  const [theoryOpen, setTheoryOpen] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const isMultipleChoice = question.type === 'multipla_escolha' && question.options.length > 0;
  const images = rendered?.images ?? [];
  const hasResolution = Boolean(rendered?.resolutionHtml);

  const answerBoxes = (
    <>
      {question.correctOption && (
        <div
          id="resolution-gabarito-box"
          className="mb-4 p-3.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 not-prose shadow-2xs"
        >
          <div className="flex items-center gap-2.5">
            <span className="sans-ui font-mono font-bold text-xs px-2 py-0.5 rounded bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--border-subtle)]">
              Gabarito Oficial
            </span>
            <span className="sans-ui text-xs sm:text-sm font-semibold text-[var(--text-primary)]">
              A alternativa correta é a{' '}
              <strong>
                (
                {/* biome-ignore lint/security/noDangerouslySetInnerHtml: rendered answer key, sanitized by DOMPurify. */}
                <span dangerouslySetInnerHTML={{ __html: rendered?.correctOptionHtml ?? '' }} />)
              </strong>
              .
            </span>
          </div>
        </div>
      )}
      {question.expectedAnswer && (
        <div
          id="resolution-expected-box"
          className="mb-4 p-3.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] not-prose shadow-2xs"
        >
          <div className="sans-ui text-xs font-bold uppercase tracking-wider text-[var(--accent)] mb-1">
            Gabarito / Resposta Esperada
          </div>
          <Html
            className="academic-prose text-xs sm:text-sm text-[var(--text-primary)] m-0 leading-relaxed"
            html={rendered?.expectedAnswerHtml ?? ''}
          />
        </div>
      )}
    </>
  );

  const sectionsHidden = rendered !== undefined && !hasResolution && Boolean(rendered.theoryHtml || rendered.bodyHtml);

  return (
    <div
      className="question-container not-prose"
      data-question-type={question.type}
      data-correct={question.correctOption}
    >
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <div className="question-sticky-col xl:sticky xl:top-6 xl:self-start w-full">
          <article className="p-6 sm:p-8 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] space-y-6 shadow-xs xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto reader-scrollbar">
            <div className="space-y-6">
              <div className="space-y-2 border-b border-[var(--border-subtle)] pb-4">
                <div className="sans-ui flex flex-wrap items-center justify-between gap-2 text-xs font-mono uppercase tracking-widest text-[var(--accent)]">
                  <span>
                    {question.exam} ({question.year}) • {question.topic}
                  </span>
                  <span className="rounded px-2 py-0.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[11px] font-sans font-medium">
                    {question.type === 'discursiva' ? 'Questão Dissertativa' : 'Múltipla Escolha'}
                  </span>
                </div>
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
                  {question.title}
                </h1>
                <div className="sans-ui text-xs text-[var(--text-muted)] italic">
                  Dificuldade estimada: {question.difficulty}
                </div>
              </div>

              {question.statement && (
                <div className="space-y-2">
                  <div className="sans-ui text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Enunciado da Questão
                  </div>
                  <Html
                    className="academic-prose font-serif text-base sm:text-lg text-[var(--text-primary)] leading-relaxed"
                    html={rendered?.statementHtml ?? ''}
                  />
                </div>
              )}

              {images.length > 0 && (
                <div
                  className={`my-6 grid gap-4 items-start ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}
                >
                  {images.map((img, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the same figure may legitimately repeat.
                    <figure key={`${img.src}-${idx}`} className="flex flex-col items-center justify-center text-center">
                      <img
                        src={img.src}
                        alt={img.caption || `Figura ${idx + 1}`}
                        data-zoomable-image="true"
                        data-image-title={img.caption || `Figura ${idx + 1}`}
                        className="zoomable-question-image max-h-72 w-auto object-contain cursor-zoom-in rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] transition-transform duration-200 hover:scale-[1.01]"
                        loading="lazy"
                        title="Clique para visualizar com zoom e navegação"
                      />
                      {img.caption && (
                        <figcaption className="sans-ui text-xs text-[var(--text-muted)] italic mt-2 max-w-md">
                          {img.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              )}
            </div>

            {isMultipleChoice ? (
              <div className="space-y-2 pt-4 border-t border-[var(--border-subtle)]">
                <div className="sans-ui text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center justify-between">
                  <span>Alternativas da Prova</span>
                  <span className="font-normal italic text-[11px]">Múltipla Escolha</span>
                </div>
                <div className="space-y-2.5 reader-text">
                  {question.options.map((opt, i) => {
                    const highlighted = resolutionOpen && hasResolution && question.correctOption === opt.label;
                    return (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: option labels are not guaranteed unique.
                        key={`${opt.label}-${i}`}
                        data-option-label={opt.label}
                        className={`option-item flex items-start gap-3 p-3 sm:p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] transition-all duration-200${
                          highlighted ? ' border-[var(--accent)] bg-[var(--accent-subtle)]' : ''
                        }`}
                      >
                        <span
                          className={`option-badge sans-ui font-mono font-bold text-xs px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] shrink-0 shadow-2xs${
                            highlighted ? ' border-[var(--accent)] text-[var(--accent)]' : ''
                          }`}
                        >
                          ({opt.label})
                        </span>
                        <Html
                          className="text-[var(--text-primary)] pt-0.5 leading-relaxed text-sm"
                          html={rendered?.options[i]?.html ?? ''}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] flex items-center justify-between gap-3 text-xs pt-4 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--accent)] uppercase tracking-wider">
                    Questão Dissertativa Aberta
                  </span>
                  <span className="text-[var(--text-muted)]">•</span>
                  <span className="text-[var(--text-secondary)]">Desenvolvimento formal e demonstração requeridos</span>
                </div>
                <span className="text-[var(--text-muted)] italic font-serif">Resposta Aberta</span>
              </div>
            )}
          </article>
        </div>

        <div className="space-y-4">
          {!hasResolution && answerBoxes}
          <div id="question-sections" className={`space-y-4${sectionsHidden ? ' hidden' : ''}`}>
            <div className="space-y-4">
              {rendered?.theoryHtml && (
                <CollapsibleCard
                  kind="theory"
                  title="Fundamentação Teórica Necessária"
                  symbol="§"
                  open={theoryOpen}
                  onToggle={() => setTheoryOpen((o) => !o)}
                >
                  <Html html={rendered.theoryHtml} />
                </CollapsibleCard>
              )}
              {rendered?.resolutionHtml && (
                <CollapsibleCard
                  kind="resolution"
                  title="Resolução Passo a Passo"
                  symbol="¶"
                  open={resolutionOpen}
                  onToggle={() => setResolutionOpen((o) => !o)}
                >
                  {answerBoxes}
                  <Html html={rendered.resolutionHtml} />
                </CollapsibleCard>
              )}
              {rendered?.bodyHtml && (
                <Html className="academic-prose leading-relaxed text-[var(--text-primary)]" html={rendered.bodyHtml} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
