import type { SubjectView } from '@ai-study/server/api-types';
import { ApiError, apiFetch } from '../../api/client';
import { buildOfflineHtml, type OfflineDatabase } from './offline-template';

interface ExportPayload {
  name: string;
  db: OfflineDatabase;
  images: Record<string, string>;
}

/** File name of the export, derived from the subject name (as before). */
export function offlineFileName(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
}

/** Builds the standalone HTML of a subject in the browser and saves it. */
export async function downloadOfflineExport(subject: SubjectView): Promise<void> {
  const res = await apiFetch(`/api/exports/${subject.ownerUserId}/${encodeURIComponent(subject.slug)}`);
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
  const payload = (await res.json()) as ExportPayload;
  const html = buildOfflineHtml(payload.name, payload.db, payload.images);

  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = offlineFileName(payload.name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
