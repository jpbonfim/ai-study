import type { QuestionImage, QuestionMeta } from '../model/types';
import type { CodeHighlighter } from './highlight';
import { type AssetUrlResolver, renderMarkdown } from './markdown';
import { renderMath } from './math-text';
import { renderQuestionCardHtml } from './question-card';

export interface DocumentRenderContext {
  materiaSlug: string;
  resolveAssetUrl: AssetUrlResolver;
  highlighter?: CodeHighlighter | null;
}

export interface ChapterRenderContext extends DocumentRenderContext {
  /** Questions of the same owner and subject, used to expand `<QuestionCard id="..." />`. */
  findQuestion(id: string): QuestionMeta | undefined;
}

const QUESTION_CARD_TAG =
  /(?:<p>\s*)?<[Qq]uestion[Cc]ard\s+id=["']([^"']+)["']\s*(?:\/>|>\s*<\/[Qq]uestion[Cc]ard>)(?:\s*<\/p>)?/gi;

function markdown(body: string, ctx: DocumentRenderContext): string {
  return renderMarkdown(body, { resolveAssetUrl: ctx.resolveAssetUrl, highlighter: ctx.highlighter ?? null });
}

/** Renders a summary chapter body, expanding question cards into previews. */
export function renderChapterHtml(body: string, ctx: ChapterRenderContext): string {
  return markdown(body, ctx).replace(QUESTION_CARD_TAG, (_, id: string) => {
    const questionId = id.trim();
    const question = ctx.findQuestion(questionId);
    const statementHtml = question?.statement ? markdown(question.statement, ctx) : '';
    return renderQuestionCardHtml(questionId, question, statementHtml, ctx.materiaSlug);
  });
}

export interface RenderedQuestionOption {
  label: string;
  html: string;
}

export interface RenderedQuestion {
  statementHtml: string;
  options: RenderedQuestionOption[];
  correctOptionHtml: string;
  expectedAnswerHtml: string;
  theoryHtml: string;
  resolutionHtml: string;
  bodyHtml: string;
  images: QuestionImage[];
}

/**
 * Splits a question body into its `<Theory>` / `<Resolution>` sections and renders every part
 * (statement, options, answer key, sections and any remaining body).
 */
export function renderQuestion(question: QuestionMeta, body: string, ctx: DocumentRenderContext): RenderedQuestion {
  let theory = '';
  let resolution = '';
  let rest = body;

  const theoryMatch = body.match(/<Theory>([\s\S]*?)<\/Theory>/i);
  if (theoryMatch) {
    theory = (theoryMatch[1] ?? '').trim();
    rest = rest.replace(theoryMatch[0], '');
  }
  const resolutionMatch = body.match(/<Resolution>([\s\S]*?)<\/Resolution>/i);
  if (resolutionMatch) {
    resolution = (resolutionMatch[1] ?? '').trim();
    rest = rest.replace(resolutionMatch[0], '');
  }

  return {
    statementHtml: markdown(question.statement, ctx),
    options: question.options.map((opt) => ({ label: opt.label, html: renderMath(opt.text) })),
    correctOptionHtml: question.correctOption ? renderMath(question.correctOption) : '',
    expectedAnswerHtml: question.expectedAnswer ? renderMath(question.expectedAnswer) : '',
    theoryHtml: markdown(theory, ctx),
    resolutionHtml: markdown(resolution, ctx),
    bodyHtml: markdown(rest.trim(), ctx),
    images: question.images.map((img) => ({
      caption: img.caption,
      src: img.src.startsWith('./') ? ctx.resolveAssetUrl(img.src.replace(/^\.\//, '')) : img.src,
    })),
  };
}

/** Statement preview used by question cards in the question bank. */
export function renderQuestionStatementPreview(question: QuestionMeta, ctx: DocumentRenderContext): string {
  return question.statement ? markdown(question.statement, ctx) : '';
}
