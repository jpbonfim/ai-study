import type { CodeThemeKey } from '@ai-study/content';
import { readItem, STORAGE_KEYS, writeItem } from '../../preferences/storage';

/** Reading preferences edited on /configuracoes (persisted with the same keys as before). */
export interface ReadingSettings {
  fontKey: string;
  fontFamily: string;
  fontSize: string;
  maxWidth: string;
  textAlign: string;
  codeTheme: CodeThemeKey | string;
  codeFontKey: string;
  codeFont: string;
  codeSize: string;
  mathScriptScale: string;
  mathMinSize: string;
}

export const FONTS: Record<string, { family: string; label: string }> = {
  garamond: { family: "'Newsreader', 'EB Garamond', 'Lora', Charter, Georgia, serif", label: 'Garamond' },
  lora: { family: "'Lora', Charter, 'Bitstream Charter', Georgia, serif", label: 'Lora' },
  sans: {
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    label: 'Inter / Sans',
  },
  mono: { family: "'JetBrains Mono', 'Courier New', Courier, monospace", label: 'JetBrains Mono' },
};

export const CODE_FONTS: Record<string, { family: string; label: string }> = {
  jetbrains: { family: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
  fira: { family: "'Fira Code', monospace", label: 'Fira Code' },
  system: { family: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', label: 'SF Mono' },
  courier: { family: "'Courier New', Courier, monospace", label: 'Courier New' },
};

export const CODE_THEME_LABELS: Record<string, string> = {
  mocha: 'Catppuccin Mocha',
  tokyo: 'Tokyo Night',
  dracula: 'Dracula',
  onedark: 'Atom One Dark',
  monokai: 'Monokai',
};

/** Card colors of the code preview for each code theme. */
export const CODE_THEME_COLORS: Record<string, { bg: string; headerBg: string; border: string; text: string; badge: string }> = {
  mocha: { bg: '#1e1e2e', headerBg: '#181825', border: '#313244', text: '#cdd6f4', badge: '#cba6f7' },
  tokyo: { bg: '#1a1b26', headerBg: '#16161e', border: '#292e42', text: '#c0caf5', badge: '#7aa2f7' },
  dracula: { bg: '#282a36', headerBg: '#21222c', border: '#44475a', text: '#f8f8f2', badge: '#bd93f9' },
  onedark: { bg: '#282c34', headerBg: '#21252b', border: '#3b4048', text: '#abb2bf', badge: '#61afef' },
  monokai: { bg: '#272822', headerBg: '#1e1f1c', border: '#3e3d32', text: '#f8f8f2', badge: '#a6e22e' },
};

export const TEXT_ALIGN_LABELS: Record<string, string> = {
  justify: 'Justificado',
  left: 'À Esquerda',
  center: 'Centralizado',
  right: 'À Direita',
};

export const DEFAULT_SETTINGS: ReadingSettings = {
  fontKey: 'garamond',
  fontFamily: FONTS.garamond?.family ?? '',
  fontSize: '18px',
  maxWidth: '768px',
  textAlign: 'justify',
  codeTheme: 'mocha',
  codeFontKey: 'jetbrains',
  codeFont: CODE_FONTS.jetbrains?.family ?? '',
  codeSize: '13px',
  mathScriptScale: '0.64',
  mathMinSize: '10.5px',
};

/** Accepts `18`, `18px` or `1.125rem` and returns pixels. */
export function normalizePx(value: string | null | undefined): string {
  if (!value) return '18px';
  const trimmed = String(value).trim();
  if (trimmed.endsWith('rem')) return `${Math.round(Number.parseFloat(trimmed) * 16)}px`;
  return trimmed.endsWith('px') ? trimmed : `${trimmed}px`;
}

export function loadSavedSettings(): ReadingSettings {
  const d = DEFAULT_SETTINGS;
  return {
    fontKey: readItem(STORAGE_KEYS.fontKey) || d.fontKey,
    fontFamily: readItem(STORAGE_KEYS.fontFamily) || d.fontFamily,
    fontSize: normalizePx(readItem(STORAGE_KEYS.fontSize) || d.fontSize),
    maxWidth: normalizePx(readItem(STORAGE_KEYS.maxWidth) || d.maxWidth),
    textAlign: readItem(STORAGE_KEYS.textAlign) || d.textAlign,
    codeTheme: readItem(STORAGE_KEYS.codeTheme) || d.codeTheme,
    codeFontKey: readItem(STORAGE_KEYS.codeFontKey) || d.codeFontKey,
    codeFont: readItem(STORAGE_KEYS.codeFont) || d.codeFont,
    codeSize: normalizePx(readItem(STORAGE_KEYS.codeSize) || d.codeSize),
    mathScriptScale: readItem(STORAGE_KEYS.mathScriptScale) || d.mathScriptScale,
    mathMinSize: normalizePx(readItem(STORAGE_KEYS.mathMinSize) || d.mathMinSize),
  };
}

export function isDirty(draft: ReadingSettings, saved: ReadingSettings): boolean {
  return (
    draft.fontKey !== saved.fontKey ||
    draft.fontSize !== saved.fontSize ||
    draft.maxWidth !== saved.maxWidth ||
    draft.textAlign !== saved.textAlign ||
    draft.codeTheme !== saved.codeTheme ||
    draft.codeFontKey !== saved.codeFontKey ||
    draft.codeSize !== saved.codeSize ||
    draft.mathScriptScale !== saved.mathScriptScale ||
    draft.mathMinSize !== saved.mathMinSize
  );
}

/** Persists the settings and applies them to the whole document immediately. */
export function persistSettings(settings: ReadingSettings): void {
  writeItem(STORAGE_KEYS.fontKey, settings.fontKey);
  writeItem(STORAGE_KEYS.fontFamily, settings.fontFamily);
  writeItem(STORAGE_KEYS.fontSize, settings.fontSize);
  writeItem(STORAGE_KEYS.maxWidth, settings.maxWidth);
  writeItem(STORAGE_KEYS.textAlign, settings.textAlign);
  writeItem(STORAGE_KEYS.codeTheme, settings.codeTheme);
  writeItem(STORAGE_KEYS.codeFontKey, settings.codeFontKey);
  writeItem(STORAGE_KEYS.codeFont, settings.codeFont);
  writeItem(STORAGE_KEYS.codeSize, settings.codeSize);
  writeItem(STORAGE_KEYS.mathScriptScale, settings.mathScriptScale);
  writeItem(STORAGE_KEYS.mathMinSize, settings.mathMinSize);

  const root = document.documentElement;
  root.style.setProperty('--reader-font-family', settings.fontFamily);
  root.style.setProperty('--reader-font-size', settings.fontSize);
  root.style.setProperty('--reader-max-width', settings.maxWidth);
  root.style.setProperty('--reader-text-align', settings.textAlign);
  root.setAttribute('data-text-align', settings.textAlign);
  root.setAttribute('data-code-theme', settings.codeTheme);
  root.style.setProperty('--code-font-family', settings.codeFont);
  root.style.setProperty('--code-font-size', settings.codeSize);
  root.style.setProperty('--katex-script-scale', settings.mathScriptScale);
  root.style.setProperty('--katex-min-font-size', settings.mathMinSize);
}

