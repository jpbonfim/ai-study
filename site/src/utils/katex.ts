import katex from 'katex';

/**
 * Renderiza expressões matemáticas KaTeX ($...$ e $$...$$) e formatação de texto
 * (enunciados, opções de alternativas, respostas esperadas/gabaritos),
 * preservando equações, comandos LaTeX avulsos e garantindo integridade visual.
 */
export function renderMath(content?: string | null): string {
  if (!content) return '';

  // 0. Processa blocos de código cercados (fenced code blocks: ```lang\n...``` ou colapsados)
  const codeBlocks: string[] = [];
  let text = content.replace(/(?:^|\n)[ \t]*```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```(?:\r?\n|$)/g, (_, lang, code) => {
    const language = (lang || '').trim();
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="academic-code-block my-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-mono overflow-x-auto text-[var(--text-primary)]" data-language="${language}"><code class="language-${language}">${escapedCode}</code></pre>`
    );
    return `\n\n___CODE_BLOCK_${idx}___\n\n`;
  });

  // Também suporta blocos colapsados em linha única (ex: ```http GET / ... ```)
  text = text.replace(/```([a-zA-Z0-9_-]+)[ \t]+([\s\S]*?)```/g, (_, lang, code) => {
    const language = (lang || '').trim();
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="academic-code-block my-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-mono overflow-x-auto text-[var(--text-primary)]" data-language="${language}"><code class="language-${language}">${escapedCode}</code></pre>`
    );
    return `\n\n___CODE_BLOCK_${idx}___\n\n`;
  });

  // 0.5 Protege código inline (`...`) para não capturar cifrões internos
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    inlineCodes.push(`<code class="px-1 py-0.5 rounded bg-[var(--bg-subtle)] text-xs font-mono text-[var(--accent)]">${escaped}</code>`);
    return `___INLINE_CODE_${idx}___`;
  });

  // 1. Processa display math $$ ... $$ agrupando blocos contíguos
  const mathBlockRegex = /\$\$([\s\S]+?)\$\$/g;
  const blocks: { start: number; end: number; math: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = mathBlockRegex.exec(text)) !== null) {
    blocks.push({
      start: match.index,
      end: mathBlockRegex.lastIndex,
      math: match[1],
    });
  }

  const groups: { start: number; end: number; equations: string[] }[] = [];
  let currentGroup: { start: number; end: number; equations: string[] } | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!currentGroup) {
      currentGroup = {
        start: block.start,
        end: block.end,
        equations: [block.math],
      };
    } else {
      const between = text.slice(currentGroup.end, block.start);
      if (between.trim() === '') {
        currentGroup.end = block.end;
        currentGroup.equations.push(block.math);
      } else {
        groups.push(currentGroup);
        currentGroup = {
          start: block.start,
          end: block.end,
          equations: [block.math],
        };
      }
    }
  }
  if (currentGroup) {
    groups.push(currentGroup);
  }

  const groupPlaceholders: string[] = [];

  // Substitui de trás para frente para manter índices válidos
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    const renderedList = group.equations.map((eq) => {
      try {
        return katex.renderToString(eq.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
      } catch {
        return `$$${eq}$$`;
      }
    });

    let groupHtml = '';
    if (renderedList.length === 1) {
      groupHtml = `<div class="katex-display my-4 overflow-x-auto">${renderedList[0]}</div>`;
    } else {
      const items = renderedList
        .map((r) => `<div class="katex-display-item">${r}</div>`)
        .join('');
      groupHtml = `<div class="katex-display katex-display-group my-4 overflow-x-auto">${items}</div>`;
    }

    const placeholder = `___MATH_GROUP_${i}___`;
    groupPlaceholders[i] = groupHtml;
    text = text.slice(0, group.start) + placeholder + text.slice(group.end);
  }

  // 2. Processa inline math $ ... $
  const mathBlocks: string[] = [];
  text = text.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_, math) => {
    try {
      const rendered = katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
        output: 'html',
      });
      const idx = mathBlocks.length;
      mathBlocks.push(rendered);
      return `___MATH_BLOCK_${idx}___`;
    } catch {
      return `$${math}$`;
    }
  });

  // 3. Suporte resiliente a comandos e expressões LaTeX não delimitados por $ (ex: \Omega, \rho_{min}, 180^\circ)
  if (text.includes('\\')) {
    const looseLatexRegex = /(?:\\[a-zA-Z]+(?:\{[^}]*\}|_[a-zA-Z0-9]+|_{[^}]+}|\^[a-zA-Z0-9]+|\^{[^}]+})*|[0-9]+(?:\^[a-zA-Z0-9]+|\^{[^}]+}|_[a-zA-Z0-9]+|_{[^}]+})+)/g;
    text = text.replace(looseLatexRegex, (cmd) => {
      if (cmd.includes('___MATH_')) return cmd;
      try {
        const rendered = katex.renderToString(cmd.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        const idx = mathBlocks.length;
        mathBlocks.push(rendered);
        return `___MATH_BLOCK_${idx}___`;
      } catch {
        return cmd;
      }
    });
  }

  // 4. Escapa caracteres especiais de HTML fora dos blocos matemáticos
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 5. Suporte a negrito, itálico, código inline e quebras de linha
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/___INLINE_CODE_(\d+)___/g, (_, idx) => inlineCodes[parseInt(idx, 10)] || '');
  text = text.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-[var(--bg-subtle)] text-xs font-mono text-[var(--accent)]">$1</code>');
  text = text.replace(/\n/g, '<br />');

  // 6. Restaura os blocos matemáticos compilados em HTML pelo KaTeX
  text = text.replace(/___MATH_GROUP_(\d+)___/g, (_, idx) => {
    return groupPlaceholders[parseInt(idx, 10)] || '';
  });

  text = text.replace(/___MATH_BLOCK_(\d+)___/g, (_, idx) => {
    return mathBlocks[parseInt(idx, 10)] || '';
  });

  // 7. Restaura os blocos de código formatados
  text = text.replace(/___CODE_BLOCK_(\d+)___/g, (_, idx) => {
    return codeBlocks[parseInt(idx, 10)] || '';
  });

  return text;
}
