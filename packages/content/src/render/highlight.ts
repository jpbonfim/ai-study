import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

/** Code themes the reader can switch between instantly (all are embedded as CSS variables). */
export const CODE_THEMES = {
  mocha: 'catppuccin-mocha',
  tokyo: 'tokyo-night',
  dracula: 'dracula',
  onedark: 'one-dark-pro',
  monokai: 'monokai',
} as const;

export type CodeThemeKey = keyof typeof CODE_THEMES;

/**
 * Grammars and themes are imported one by one so bundles only ship what the renderer uses
 * (`text` is built in). Code in other languages is rendered as plain text.
 */
const loadGrammars = () => [
  import('shiki/langs/python.mjs'),
  import('shiki/langs/javascript.mjs'),
  import('shiki/langs/typescript.mjs'),
  import('shiki/langs/c.mjs'),
  import('shiki/langs/cpp.mjs'),
  import('shiki/langs/matlab.mjs'),
  import('shiki/langs/bash.mjs'),
  import('shiki/langs/json.mjs'),
  import('shiki/langs/html.mjs'),
  import('shiki/langs/css.mjs'),
  import('shiki/langs/http.mjs'),
  import('shiki/langs/markdown.mjs'),
  import('shiki/langs/yaml.mjs'),
  import('shiki/langs/latex.mjs'),
  import('shiki/langs/diff.mjs'),
];

const loadThemes = () => [
  import('shiki/themes/catppuccin-mocha.mjs'),
  import('shiki/themes/tokyo-night.mjs'),
  import('shiki/themes/dracula.mjs'),
  import('shiki/themes/one-dark-pro.mjs'),
  import('shiki/themes/monokai.mjs'),
];

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
  constructor(private readonly shiki: HighlighterCore) {}

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
  highlighterPromise ??= createHighlighterCore({
    themes: loadThemes(),
    langs: loadGrammars(),
    engine: createOnigurumaEngine(import('shiki/wasm')),
  }).then((shiki) => new ShikiCodeHighlighter(shiki));
  return highlighterPromise;
}

/** Whether a markdown body contains fenced code blocks that would need the highlighter. */
export function needsCodeHighlighter(markdown: string): boolean {
  return /(^|\n)[ \t]*(```|~~~)/.test(markdown);
}
