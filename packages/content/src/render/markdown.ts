import { Marked } from 'marked';
import { renderAlerts } from './alerts';
import { renderBlockDiagramHtml } from './block-diagram';
import {
  type DisplayMathGroup,
  findDisplayMathGroups,
  renderDisplayMathGroup,
  renderInlineEquation,
} from './display-math';
import type { CodeHighlighter } from './highlight';

/** Maps a document-relative asset reference (without the leading `./`) to a URL. */
export type AssetUrlResolver = (relativePath: string) => string;

export interface MarkdownRenderOptions {
  resolveAssetUrl: AssetUrlResolver;
  /** When absent, code blocks are rendered as plain escaped `<pre>` blocks. */
  highlighter?: CodeHighlighter | null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createMarked(highlighter: CodeHighlighter | null | undefined): Marked {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const rawLang = (lang || '').trim().toLowerCase();
        const escapedText = escapeHtml(text);

        if (rawLang === 'mermaid') {
          return `<pre class="mermaid diagram-block" data-language="mermaid"><code class="language-mermaid">${escapedText}</code></pre>\n`;
        }

        const highlighted = highlighter?.highlight(text, rawLang);
        if (highlighted) return `${highlighted}\n`;

        return `<pre class="shiki" data-language="${rawLang || 'text'}"><code class="language-${rawLang || 'text'}">${escapedText}</code></pre>\n`;
      },
    },
  });
  return marked;
}

export function rewriteRelativeAssetUrls(html: string, resolveAssetUrl: AssetUrlResolver): string {
  return html.replace(/(?:src=["']|href=["'])(\.\/[^"']+)["']/g, (match, relUrl: string) =>
    match.replace(relUrl, resolveAssetUrl(relUrl.replace(/^\.\//, ''))),
  );
}

const BLOCK_DIAGRAM_TAG =
  /(?:<p>\s*)?<[Bb]lock[Dd]iagram\b([^>]*?)(?:\/>|>(.*?)<\/[Bb]lock[Dd]iagram>)(?:\s*<\/p>)?/gis;

/**
 * Renders a markdown body (GFM + KaTeX math + alerts + `<BlockDiagram>`) to HTML.
 *
 * Math is tokenized before markdown parsing so that markdown never mangles LaTeX
 * (underscores, asterisks, backslashes); code is protected first so `$` inside code stays literal.
 * The output is NOT sanitized: callers must sanitize before inserting it into a page.
 */
export function renderMarkdown(content: string, options: MarkdownRenderOptions): string {
  if (!content?.trim()) return '';

  // 0. Drop MDX/HTML comments so they never leak as text.
  let text = content.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<!--[\s\S]*?-->/g, '');

  // 0.5 Protect fenced and inline code so `$` inside code is never treated as math.
  const codeBlocks: string[] = [];
  text = text.replace(/(?:^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\1(?=\n|$)/g, (match) => {
    codeBlocks.push(match);
    return `\n\n%%KATEX_CODE_BLOCK_${codeBlocks.length - 1}%%\n\n`;
  });
  const inlineCodes: string[] = [];
  text = text.replace(/(`+)([\s\S]*?)\1/g, (match) => {
    inlineCodes.push(match);
    return `%%KATEX_INLINE_CODE_${inlineCodes.length - 1}%%`;
  });

  // 1. Display math, grouping contiguous equations. Replaced back to front to keep offsets valid.
  const groupHtml = new Map<number, string>();
  const groups = findDisplayMathGroups(text);
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i] as DisplayMathGroup;
    groupHtml.set(i, renderDisplayMathGroup(group));
    text = `${text.slice(0, group.start)}\n\n@@MATH_GROUP_${i}@@\n\n${text.slice(group.end)}`;
  }

  // 2. Inline math.
  const inlineMath: string[] = [];
  text = text.replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (_, math: string) => {
    const rendered = renderInlineEquation(math);
    if (rendered === null) return `$${math}$`;
    inlineMath.push(rendered);
    return `@@MATH_INLINE_${inlineMath.length - 1}@@`;
  });

  // 2.5 Restore code before markdown parsing.
  text = text.replace(/%%KATEX_INLINE_CODE_(\d+)%%/g, (_, idx: string) => inlineCodes[Number(idx)] ?? '');
  text = text.replace(/%%KATEX_CODE_BLOCK_(\d+)%%/g, (_, idx: string) => codeBlocks[Number(idx)] ?? '');

  // 3. Markdown.
  let html = createMarked(options.highlighter).parse(text, { async: false });

  // 3.5 GitHub-style alerts.
  html = renderAlerts(html);

  // 4. Unwrap display math from the paragraphs markdown wrapped them in.
  html = html.replace(/<p>([\s\S]*?)<\/p>/g, (fullMatch, inner: string) => {
    if (!inner.includes('@@MATH_GROUP_')) return fullMatch;
    return inner
      .split(/(@@MATH_GROUP_\d+@@)/g)
      .map((part) => {
        if (part.startsWith('@@MATH_GROUP_')) return part;
        const trimmed = part.trim();
        return trimmed ? `<p>${trimmed}</p>` : '';
      })
      .filter(Boolean)
      .join('\n');
  });

  // 5. Restore math.
  html = html.replace(/@@MATH_GROUP_(\d+)@@/g, (_, idx: string) => groupHtml.get(Number(idx)) || '');
  html = html.replace(/@@MATH_INLINE_(\d+)@@/g, (_, idx: string) => inlineMath[Number(idx)] || '');

  // 6. Relative assets.
  html = rewriteRelativeAssetUrls(html, options.resolveAssetUrl);

  // 7. Block diagrams.
  html = html.replace(BLOCK_DIAGRAM_TAG, (_, attrs: string, slot: string | undefined) =>
    renderBlockDiagramHtml(attrs, slot || ''),
  );

  return html;
}
