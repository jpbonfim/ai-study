import { listKeys, removeItem, STORAGE_KEYS, writeItem } from '../preferences/storage';
import { clearRenderCache } from '../render/render-cache';

/** Prefix of the HTML cache kept in localStorage by the previous version (cleaned up when found). */
const LEGACY_CACHE_PREFIX = 'study_cache_';

/** Clears every cached study render (reading preferences are kept). */
export async function clearStudyCache(): Promise<void> {
  await clearRenderCache();
  for (const key of listKeys()) {
    if (key.startsWith(LEGACY_CACHE_PREFIX)) removeItem(key);
  }
  writeItem(STORAGE_KEYS.lastCacheBust, String(Date.now()));
  console.info('[StudyCache] Cache local de estudos invalidado com sucesso.');
}

const BUST_PARAMS = ['nocache', 'clear_cache', 'bust'];

/** `?nocache`, `?clear_cache` or `?bust` in the URL clear the cache and are removed from it. */
export async function consumeCacheBustParams(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (!BUST_PARAMS.some((p) => params.has(p))) return;
  await clearStudyCache();
  for (const p of BUST_PARAMS) params.delete(p);
  const query = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

/** Alt+C anywhere: clear the study cache and reload. */
export function installCacheShortcut(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      void clearStudyCache().then(() => {
        console.info('[Study] Cache do navegador limpo via atalho Alt + C.');
        window.location.reload();
      });
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
