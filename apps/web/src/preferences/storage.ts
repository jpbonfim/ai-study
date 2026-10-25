/**
 * Safe access to localStorage (private windows and blocked storage must never break a page).
 * Every persisted key of the app is listed in STORAGE_KEYS so names stay compatible with the
 * previous version (users keep their preferences and history).
 */
export const STORAGE_KEYS = {
  theme: 'study_theme',
  fontKey: 'study_font_key',
  fontFamily: 'study_font_family',
  fontSize: 'study_font_size',
  maxWidth: 'study_max_width',
  textAlign: 'study_text_align',
  codeTheme: 'study_code_theme',
  codeFontKey: 'study_code_font_key',
  codeFont: 'study_code_font',
  codeSize: 'study_code_size',
  mathScriptScale: 'study_math_script_scale',
  mathMinSize: 'study_math_min_size',
  sidebarCollapsed: 'study_sidebar_collapsed',
  showOtherTags: 'study_show_other_tags',
  lastVisitedSubject: 'last_visited_subject',
  recentSubjects: 'study_recent_materias',
  lastCacheBust: 'study_last_cache_bust',
  selectedTag: (materia: string) => `study_selected_tag_${materia}`,
  selectedSection: (materia: string) => `study_selected_section_${materia}`,
  tocExpanded: (materia: string, group: string) => `study_toc_expanded_${materia}_${group}`,
  recentQuestions: (materia: string) => `study_recent_questions_${materia}`,
} as const;

export function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the preference simply is not persisted.
  }
}

export function removeItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** All keys currently stored (snapshot), for prefix-based cleanups. */
export function listKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}
