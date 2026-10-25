import type { ChapterMeta, QuestionMeta, RenderedQuestion } from '@ai-study/content';
import { createHtmlSanitizer } from '@ai-study/content/sanitize';
import type { Indexed } from '@ai-study/server/api-types';
import { api } from '../api/client';
import type { RenderRequest, RenderResult, WorkerMessage, WorkerReply } from './protocol';
import { readCache, writeCache } from './render-cache';

/** Bump when the rendering pipeline changes output, to invalidate every cached render. */
const RENDERER_VERSION = 1;

const sanitize = createHtmlSanitizer(window);

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const call = pending.get(reply.id);
      if (!call) return;
      pending.delete(reply.id);
      if (reply.ok) call.resolve(reply.result);
      else call.reject(new Error(reply.error));
    };
  }
  return worker;
}

// Start the worker as soon as a page that renders content loads, so its code downloads and
// initializes while the page fetches its data.
getWorker();

function renderInWorker<K extends RenderRequest['kind']>(
  request: Extract<RenderRequest, { kind: K }>,
): Promise<RenderResult<K>> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    getWorker().postMessage({ id, request } satisfies WorkerMessage);
  });
}

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/** Identifies a set of question versions (question cards embed question data). */
function questionsFingerprint(questions: Indexed<QuestionMeta>[]): string {
  return hashString(
    questions
      .map((q) => `${q.id}@${q.version}`)
      .sort()
      .join('|'),
  );
}

async function cached<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const hit = await readCache<T>(key);
  if (hit !== null) return hit;
  const value = await produce();
  void writeCache(key, value);
  return value;
}

export interface SubjectRef {
  ownerId: number;
  materiaSlug: string;
}

/** Sanitized HTML of a summary chapter, with its question cards expanded. */
export function renderChapter(
  ref: SubjectRef,
  chapter: Indexed<ChapterMeta>,
  questions: Indexed<QuestionMeta>[],
): Promise<string> {
  const key = `v${RENDERER_VERSION}:chapter:${ref.ownerId}:${ref.materiaSlug}:${chapter.id}:${chapter.version}:${questionsFingerprint(questions)}`;
  return cached(key, async () => {
    const doc = await api.chapter(ref.ownerId, ref.materiaSlug, chapter.id);
    const html = await renderInWorker({ kind: 'chapter', body: doc.body, questions, ...ref });
    return sanitize(html);
  });
}

/** Every rendered part of a question page (sanitized). */
export function renderQuestionPage(ref: SubjectRef, question: Indexed<QuestionMeta>): Promise<RenderedQuestion> {
  const key = `v${RENDERER_VERSION}:question:${ref.ownerId}:${ref.materiaSlug}:${question.id}:${question.version}`;
  return cached(key, async () => {
    const doc = await api.question(ref.ownerId, ref.materiaSlug, question.id);
    const rendered = await renderInWorker({ kind: 'question', meta: doc.meta, body: doc.body, ...ref });
    return {
      ...rendered,
      statementHtml: sanitize(rendered.statementHtml),
      options: rendered.options.map((o) => ({ label: o.label, html: sanitize(o.html) })),
      correctOptionHtml: sanitize(rendered.correctOptionHtml),
      expectedAnswerHtml: sanitize(rendered.expectedAnswerHtml),
      theoryHtml: sanitize(rendered.theoryHtml),
      resolutionHtml: sanitize(rendered.resolutionHtml),
      bodyHtml: sanitize(rendered.bodyHtml),
    };
  });
}

/** Statement previews (question bank cards), keyed by question id. */
export function renderStatementPreviews(
  ref: SubjectRef,
  questions: Indexed<QuestionMeta>[],
): Promise<Record<string, string>> {
  const key = `v${RENDERER_VERSION}:statements:${ref.ownerId}:${ref.materiaSlug}:${questionsFingerprint(questions)}`;
  return cached(key, async () => {
    const previews = await renderInWorker({ kind: 'statements', questions, ...ref });
    return Object.fromEntries(Object.entries(previews).map(([id, html]) => [id, sanitize(html)]));
  });
}
