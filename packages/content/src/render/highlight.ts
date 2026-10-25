import { createHighlighter, type Highlighter } from 'shiki';

/** Code themes the reader can switch between instantly (all are embedded as CSS variables). */
export const CODE_THEMES = {
  mocha: 'catppuccin-mocha',
  tokyo: 'tokyo-night',
  dracula: 'dracula',
  onedark: 'one-dark-pro',
  monokai: 'monokai',
} as const;

export type CodeThemeKey = keyof typeof CODE_THEMES;

const SUPPORTED_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'c',
  'cpp',
  'matlab',
  'bash',
  'json',
  'html',
  'css',
  'http',
  'markdown',
  'yaml',
  'latex',
  'diff',
  'text',
] as const;

const LANGUAGE_ALIASES: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  'c++': 'cpp',
  octave: 'matlab',
  txt: 'text',
};

export interface CodeHighlighter {
  /** Returns highlighted `<pre>` HTML, or null when highlighting fails. */
  highlight(code: string, rawLang: string): string | null;
}

class ShikiCodeHighlighter implements CodeHighlighter {
  constructor(private readonly shiki: Highlighter) {}

  highlight(code: string, rawLang: string): string | null {
    const requested = LANGUAGE_ALIASES[rawLang] ?? rawLang;
    const lang = this.shiki.getLoadedLanguages().includes(requested) ? requested : 'text';
    try {
      const html = this.shiki.codeToHtml(code, { themes: CODE_THEMES, defaultColor: false, lang });
      return html.replace('<pre ', `<pre data-language="${rawLang || 'text'}" `);
    } catch {
      return null;
    }
  }
}

let highlighterPromise: Promise<CodeHighlighter> | null = null;

/** Lazily creates the shared highlighter (loads grammars, themes and the regex engine once). */
export function loadCodeHighlighter(): Promise<CodeHighlighter> {
  highlighterPromise ??= createHighlighter({
    themes: Object.values(CODE_THEMES),
    langs: [...SUPPORTED_LANGUAGES],
  }).then((shiki) => new ShikiCodeHighlighter(shiki));
  return highlighterPromise;
}

/** Whether a markdown body contains fenced code blocks that would need the highlighter. */
export function needsCodeHighlighter(markdown: string): boolean {
  return /(^|\n)[ \t]*(```|~~~)/.test(markdown);
}
