import type { QuestionMeta } from '../model/types';

/** HTML of the `<QuestionCard id="..." />` preview embedded in summary chapters. */
export function renderQuestionCardHtml(
  questionId: string,
  question: QuestionMeta | undefined,
  statementHtml: string,
  materiaSlug: string,
): string {
  if (!question) {
    return `<div class="my-4 p-3.5 rounded-lg border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-muted)] not-prose">[Questão <code>${questionId}</code> não encontrada no acervo]</div>`;
  }

  const badgeType = question.type === 'discursiva' ? 'Dissertativa' : 'Múltipla Escolha';
  const href = `/${materiaSlug}/questoes/${question.id}`;

  return `
<div class="question-card-preview my-1.5 px-3.5 py-2.5 sm:px-4 sm:py-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:border-[var(--accent)] not-prose shadow-2xs transition-all">
  <div class="sans-ui flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-[var(--border-subtle)] text-xs leading-none">
    <div class="flex items-center gap-1.5 min-w-0">
      <span class="font-bold text-[var(--accent)] uppercase tracking-wider shrink-0 text-[11px] sm:text-xs">
        Exercício • ${question.exam} (${question.year})
      </span>
      <span class="text-[var(--text-muted)] shrink-0">•</span>
      <span class="text-[var(--text-secondary)] font-medium truncate text-xs sm:text-[13px]">
        ${question.topic}
      </span>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <span class="rounded px-1.5 py-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] sm:text-[11px] uppercase font-semibold text-[var(--text-muted)]">
        ${badgeType}
      </span>
      <span class="text-[var(--text-muted)] italic text-[11px] sm:text-xs">
        ${question.difficulty}
      </span>
    </div>
  </div>

  <div class="question-card-title font-serif text-[13px] sm:text-sm font-semibold text-[var(--text-primary)] mb-1 leading-snug line-clamp-1">
    <a href="${href}" class="hover:text-[var(--accent)] transition-colors">
      ${question.title}
    </a>
  </div>

  ${
    statementHtml
      ? `<div class="font-serif text-xs sm:text-[13px] text-[var(--text-secondary)] line-clamp-1 mb-1.5 leading-relaxed">${statementHtml}</div>`
      : ''
  }

  <div class="sans-ui flex items-center justify-between pt-1.5 border-t border-[var(--border-subtle)] text-xs leading-none">
    <span class="font-mono text-[11px] sm:text-xs text-[var(--text-muted)] truncate max-w-[150px]">${question.id}</span>
    <a
      href="${href}"
      class="font-semibold text-xs sm:text-[13px] text-[var(--accent)] hover:underline inline-flex items-center gap-1 shrink-0"
    >
      <span>Resolução</span>
    </a>
  </div>
</div>
`.trim();
}
