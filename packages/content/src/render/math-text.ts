import {
  type DisplayMathGroup,
  findDisplayMathGroups,
  renderDisplayMathGroup,
  renderInlineEquation,
} from './display-math';

/**
 * Renders short rich text (question statements, multiple-choice options, expected answers):
 * KaTeX math ($...$ and $$...$$), loose LaTeX commands, fenced/inline code, bold/italic and line
 * breaks. Everything outside math and code is HTML-escaped.
 */
export function renderMath(content?: string | null): string {
  if (!content) return '';

  // 0. Fenced code blocks (```lang\n...``` or collapsed on one line)
  const codeBlocks: string[] = [];
  let text = content.replace(
    /(?:^|\n)[ \t]*```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```(?:\r?\n|$)/g,
    (_, lang, code) => {
      const language = (lang || '').trim();
      const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const idx = codeBlocks.length;
      codeBlocks.push(
        `<pre class="academic-code-block my-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-mono overflow-x-auto text-[var(--text-primary)]" data-language="${language}"><code class="language-${language}">${escapedCode}</code></pre>`,
      );
      return `\n\n___CODE_BLOCK_${idx}___\n\n`;
    },
  );

  // Also supports blocks collapsed on a single line (e.g. ```http GET / ... ```)
  text = text.replace(/```([a-zA-Z0-9_-]+)[ \t]+([\s\S]*?)```/g, (_, lang, code) => {
    const language = (lang || '').trim();
    const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="academic-code-block my-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-mono overflow-x-auto text-[var(--text-primary)]" data-language="${language}"><code class="language-${language}">${escapedCode}</code></pre>`,
    );
    return `\n\n___CODE_BLOCK_${idx}___\n\n`;
  });

  // 0.5 Protect inline code (`...`) so dollar signs inside it are not treated as math
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    inlineCodes.push(
      `<code class="px-1 py-0.5 rounded bg-[var(--bg-subtle)] text-xs font-mono text-[var(--accent)]">${escaped}</code>`,
    );
    return `___INLINE_CODE_${idx}___`;
  });

  // 1. Display math $$ ... $$, grouping contiguous blocks (replaced back to front so offsets stay valid)
  const groupPlaceholders: string[] = [];
  const groups = findDisplayMathGroups(text);
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i] as DisplayMathGroup;
    groupPlaceholders[i] = renderDisplayMathGroup(group);
    text = `${text.slice(0, group.start)}___MATH_GROUP_${i}___${text.slice(group.end)}`;
  }

  // 2. Inline math $ ... $
  const mathBlocks: string[] = [];
  text = text.replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (_, math: string) => {
    const rendered = renderInlineEquation(math);
    if (rendered === null) return `$${math}$`;
    mathBlocks.push(rendered);
    return `___MATH_BLOCK_${mathBlocks.length - 1}___`;
  });

  // 3. Loose LaTeX commands not delimited by $ (e.g. \Omega, \rho_{min}, 180^\circ)
  if (text.includes('\\')) {
    const looseLatexRegex =
      /(?:\\[a-zA-Z]+(?:\{[^}]*\}|_[a-zA-Z0-9]+|_{[^}]+}|\^[a-zA-Z0-9]+|\^{[^}]+})*|[0-9]+(?:\^[a-zA-Z0-9]+|\^{[^}]+}|_[a-zA-Z0-9]+|_{[^}]+})+)/g;
    text = text.replace(looseLatexRegex, (cmd) => {
      if (cmd.includes('___MATH_')) return cmd;
      const rendered = renderInlineEquation(cmd);
      if (rendered === null) return cmd;
      mathBlocks.push(rendered);
      return `___MATH_BLOCK_${mathBlocks.length - 1}___`;
    });
  }

  // 4. Escape HTML outside math blocks
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 5. Bold, italic, inline code and line breaks
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/___INLINE_CODE_(\d+)___/g, (_, idx) => inlineCodes[parseInt(idx, 10)] || '');
  text = text.replace(
    /`([^`]+)`/g,
    '<code class="px-1 py-0.5 rounded bg-[var(--bg-subtle)] text-xs font-mono text-[var(--accent)]">$1</code>',
  );
  text = text.replace(/\n/g, '<br />');

  // 6. Restore rendered math
  text = text.replace(/___MATH_GROUP_(\d+)___/g, (_, idx) => {
    return groupPlaceholders[parseInt(idx, 10)] || '';
  });

  text = text.replace(/___MATH_BLOCK_(\d+)___/g, (_, idx) => {
    return mathBlocks[parseInt(idx, 10)] || '';
  });

  // 7. Restore code blocks
  text = text.replace(/___CODE_BLOCK_(\d+)___/g, (_, idx) => {
    return codeBlocks[parseInt(idx, 10)] || '';
  });

  return text;
}
