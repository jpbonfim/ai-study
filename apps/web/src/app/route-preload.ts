import { api } from '../api/client';
import { parseOwnerParam } from '../features/notebook/use-notebook';
import { queryClient } from './query-client';

/** Page modules, loaded on demand (shared by the router's lazy components and preloading). */
export const pageModules = {
  account: () => import('../features/account/AccountPage'),
  admin: () => import('../features/admin/AdminPage'),
  notebook: () => import('../features/notebook/NotebookPage'),
  questionBank: () => import('../features/notebook/QuestionBankPage'),
  question: () => import('../features/notebook/QuestionPage'),
  settings: () => import('../features/settings/SettingsPage'),
};

const RESERVED = new Set(['login', 'conta', 'configuracoes', 'admin', 'upload']);

/**
 * Starts, in parallel with the session check, what the opening page will need: its code and,
 * for subject pages, the notebook data. Without this they would load one after the other.
 */
export function preloadForLocation(pathname: string, search: string): void {
  const [first, second, third] = pathname.split('/').filter(Boolean);
  if (!first) return;
  if (first === 'conta') void pageModules.account();
  else if (first === 'admin') void pageModules.admin();
  else if (first === 'configuracoes') void pageModules.settings();
  if (RESERVED.has(first)) return;

  if (!second) void pageModules.notebook();
  else if (second === 'questoes') void (third ? pageModules.question() : pageModules.questionBank());
  else return;

  const owner = parseOwnerParam(new URLSearchParams(search).get('owner'));
  void queryClient.prefetchQuery({ queryKey: ['notebook', first, owner], queryFn: () => api.notebook(first, owner) });
}
