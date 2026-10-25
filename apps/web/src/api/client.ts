import type {
  LogEntry,
  Notebook,
  PermissionListing,
  PublicUser,
  SessionInfo,
  StoredDocument,
  SubjectView,
  Indexed,
} from '@ai-study/server/api-types';
import type { ChapterMeta, QuestionMeta } from '@ai-study/content';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export type ChapterDocument = StoredDocument<Indexed<ChapterMeta>>;
export type QuestionDocument = StoredDocument<Indexed<QuestionMeta>>;

export interface AdminUser extends PublicUser {
  materias: { slug: string; name: string; code: string }[];
}

export const api = {
  session: () => request<SessionInfo>('/api/session'),
  login: (username: string, password: string) =>
    fetch('/api/login', jsonInit('POST', { username, password })),
  recordPageView: (path: string) =>
    fetch('/api/activity/page-view', jsonInit('POST', { path })).catch(() => undefined),

  subjects: () => request<{ own: SubjectView[]; shared: SubjectView[] }>('/api/subjects'),
  notebook: (slug: string, owner: number | null) =>
    request<Notebook>(`/api/subjects/${encodeURIComponent(slug)}${owner ? `?owner=${owner}` : ''}`),
  chapter: (owner: number, slug: string, id: string) =>
    request<ChapterDocument>(`/api/documents/${owner}/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(id)}`),
  question: (owner: number, slug: string, id: string) =>
    request<QuestionDocument>(`/api/documents/${owner}/${encodeURIComponent(slug)}/questions/${encodeURIComponent(id)}`),
  subjectDocuments: (owner: number, slug: string) =>
    request<{ chapters: ChapterDocument[]; questions: QuestionDocument[] }>(
      `/api/documents/${owner}/${encodeURIComponent(slug)}`,
    ),

  admin: {
    users: () => request<{ users: PublicUser[] }>('/admin/api/users'),
    permissions: () => request<{ permissions: PermissionListing[]; users: AdminUser[] }>('/admin/api/permissions'),
    logs: (params: URLSearchParams) =>
      request<{ total: number; logs: LogEntry[] }>(`/admin/api/logs?${params.toString()}`),
    createUser: (payload: Record<string, unknown>) =>
      request<{ success: true; user: PublicUser }>('/admin/api/users', jsonInit('POST', payload)),
    updateUser: (payload: Record<string, unknown>) => request<{ success: true }>('/admin/api/users', jsonInit('PUT', payload)),
    deleteUser: (id: number) => request<{ success: true }>(`/admin/api/users?id=${id}`, { method: 'DELETE' }),
    grant: (payload: Record<string, unknown>) =>
      request<{ success: true }>('/admin/api/permissions', jsonInit('POST', payload)),
    revoke: (id: number) => request<{ success: true }>(`/admin/api/permissions?id=${id}`, { method: 'DELETE' }),
  },
};

/** URL of a subject asset served through the permission-checked media endpoint. */
export function mediaUrl(owner: number, slug: string, relPath: string): string {
  return `/api/media?user=${owner}&materia=${encodeURIComponent(slug)}&path=${encodeURIComponent(relPath)}`;
}
