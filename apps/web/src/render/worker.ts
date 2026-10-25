/// <reference lib="webworker" />
import {
  type CodeHighlighter,
  loadCodeHighlighter,
  needsCodeHighlighter,
  renderChapterHtml,
  renderQuestion,
  renderQuestionStatementPreview,
} from '@ai-study/content';
import { mediaUrl } from '../api/client';
import type { RenderRequest, WorkerMessage, WorkerReply } from './protocol';

/**
 * Renders study documents off the main thread (markdown, KaTeX, Shiki). Output is NOT sanitized
 * here; the main thread sanitizes before inserting HTML into the page.
 */

let highlighter: CodeHighlighter | null = null;

async function highlighterFor(...sources: string[]): Promise<CodeHighlighter | null> {
  if (!highlighter && sources.some(needsCodeHighlighter)) highlighter = await loadCodeHighlighter();
  return highlighter;
}

async function handle(request: RenderRequest): Promise<unknown> {
  const resolveAssetUrl = (rel: string) => mediaUrl(request.ownerId, request.materiaSlug, rel);

  switch (request.kind) {
    case 'chapter': {
      const byId = new Map(request.questions.map((q) => [q.id, q]));
      return renderChapterHtml(request.body, {
        materiaSlug: request.materiaSlug,
        resolveAssetUrl,
        highlighter: await highlighterFor(request.body, ...request.questions.map((q) => q.statement)),
        findQuestion: (id) => byId.get(id),
      });
    }
    case 'question':
      return renderQuestion(request.meta, request.body, {
        materiaSlug: request.materiaSlug,
        resolveAssetUrl,
        highlighter: await highlighterFor(request.body, request.meta.statement),
      });
    case 'statements': {
      const context = {
        materiaSlug: request.materiaSlug,
        resolveAssetUrl,
        highlighter: await highlighterFor(...request.questions.map((q) => q.statement)),
      };
      return Object.fromEntries(request.questions.map((q) => [q.id, renderQuestionStatementPreview(q, context)]));
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, request } = event.data;
  let reply: WorkerReply;
  try {
    reply = { id, ok: true, result: await handle(request) };
  } catch (err) {
    reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);
};
