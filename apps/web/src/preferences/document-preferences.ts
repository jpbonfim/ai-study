import { readItem, STORAGE_KEYS } from './storage';

export type ThemeName = 'paper' | 'dark' | 'oled';

/**
 * Which preferences a page applies. Reading pages apply everything; account/admin/login pages
 * only follow the color theme (as they always did).
 */
export type PreferenceScope = 'reading' | 'theme-only';

export const DEFAULT_CODE_FONT = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

const READER_PROPERTIES = [
  '--reader-font-family',
  '--reader-font-size',
  '--reader-max-width',
  '--reader-text-align',
  '--code-font-family',
  '--code-font-size',
  '--katex-script-scale',
  '--katex-min-font-size',
] as const;

export function readTheme(): ThemeName {
  const saved = readItem(STORAGE_KEYS.theme);
  return saved === 'dark' || saved === 'oled' ? saved : 'paper';
}

export function applyThemeClasses(root: HTMLElement, theme: ThemeName): void {
  root.classList.remove('theme-paper', 'theme-dark', 'theme-oled', 'dark');
  if (theme === 'oled') root.classList.add('dark', 'theme-oled');
  else if (theme === 'dark') root.classList.add('dark', 'theme-dark');
  else root.classList.add('theme-paper');
}

/** Applies the saved theme and (for reading pages) the saved reading preferences to `<html>`. */
export function applyDocumentPreferences(root: HTMLElement, scope: PreferenceScope): void {
  applyThemeClasses(root, readTheme());

  if (scope === 'theme-only') {
    for (const property of READER_PROPERTIES) root.style.removeProperty(property);
    root.removeAttribute('data-text-align');
    root.removeAttribute('data-code-theme');
    root.classList.remove('sidebar-collapsed');
    return;
  }

  root.classList.toggle('sidebar-collapsed', readItem(STORAGE_KEYS.sidebarCollapsed) === 'true');

  const setOptional = (property: string, value: string | null) => {
    if (value) root.style.setProperty(property, value);
    else root.style.removeProperty(property);
  };
  setOptional('--reader-font-family', readItem(STORAGE_KEYS.fontFamily));
  setOptional('--reader-font-size', readItem(STORAGE_KEYS.fontSize));
  setOptional('--reader-max-width', readItem(STORAGE_KEYS.maxWidth));

  const textAlign = readItem(STORAGE_KEYS.textAlign) || 'justify';
  root.style.setProperty('--reader-text-align', textAlign);
  root.setAttribute('data-text-align', textAlign);

  root.setAttribute('data-code-theme', readItem(STORAGE_KEYS.codeTheme) || 'mocha');
  root.style.setProperty('--code-font-family', readItem(STORAGE_KEYS.codeFont) || DEFAULT_CODE_FONT);
  root.style.setProperty('--code-font-size', readItem(STORAGE_KEYS.codeSize) || '13px');
  root.style.setProperty('--katex-script-scale', readItem(STORAGE_KEYS.mathScriptScale) || '0.64');
  root.style.setProperty('--katex-min-font-size', readItem(STORAGE_KEYS.mathMinSize) || '10.5px');
}

export function scopeForPath(pathname: string): PreferenceScope {
  return /^\/(login|conta|admin)(\/|$)/.test(pathname) ? 'theme-only' : 'reading';
}
