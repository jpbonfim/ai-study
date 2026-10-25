import type { QuestionMeta, RenderedQuestion } from '@ai-study/content';

/** Requests understood by the render worker. */
export type RenderRequest =
  | {
      kind: 'chapter';
      body: string;
      materiaSlug: string;
      ownerId: number;
      questions: QuestionMeta[];
    }
  | { kind: 'question'; meta: QuestionMeta; body: string; materiaSlug: string; ownerId: number }
  | { kind: 'statements'; questions: QuestionMeta[]; materiaSlug: string; ownerId: number };

export interface RenderResultMap {
  chapter: string;
  question: RenderedQuestion;
  statements: Record<string, string>;
}

export type RenderResult<K extends RenderRequest['kind']> = RenderResultMap[K];

export interface WorkerMessage {
  id: number;
  request: RenderRequest;
}

export type WorkerReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
