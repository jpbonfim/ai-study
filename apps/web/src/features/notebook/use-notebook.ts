import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

/** Notebook of `/:materia` (the `owner` query selects a subject shared by another user). */
export function useNotebook(slug: string, owner: number | null) {
  return useQuery({
    queryKey: ['notebook', slug, owner],
    queryFn: () => api.notebook(slug, owner),
  });
}

export function parseOwnerParam(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
