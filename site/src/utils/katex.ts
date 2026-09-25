import katex from 'katex';

/**
 * Renderiza expressões matemáticas KaTeX embutidas ($...$ e $$...$$) dentro de strings de texto,
 * preservando formatação, convertendo quebras de linha e garantindo segurança tipográfica.
 */
export function renderMath(content?: string | null): string {
  if (!content) return '';

  // 1. Processa display math $$ ... $$ agrupando blocos contíguos
  const mathBlockRegex = /\$\$([\s\S]+?)\$\$/g;
  const blocks: { start: number; end: number; math: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = mathBlockRegex.exec(content)) !== null) {
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
      const between = content.slice(currentGroup.end, block.start);
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
  let text = content;

  // Substitui de trás para frente para manter índices válidos
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    const renderedList = group.equations.map((eq) => {
      try {
        return katex.renderToString(eq.trim(), {
          displayMode: true,
          throwOnError: false,
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
      });
      const idx = mathBlocks.length;
      mathBlocks.push(rendered);
      return `___MATH_BLOCK_${idx}___`;
    } catch {
      return `$${math}$`;
    }
  });

  // 3. Escapa caracteres especiais de HTML fora dos blocos matemáticos
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 4. Suporte a negrito, itálico, código inline e quebras de linha
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-[var(--bg-subtle)] text-xs font-mono text-[var(--accent)]">$1</code>');
  text = text.replace(/\n/g, '<br />');

  // 5. Restaura os blocos matemáticos compilados em HTML pelo KaTeX
  text = text.replace(/___MATH_GROUP_(\d+)___/g, (_, idx) => {
    return groupPlaceholders[parseInt(idx, 10)] || '';
  });

  text = text.replace(/___MATH_BLOCK_(\d+)___/g, (_, idx) => {
    return mathBlocks[parseInt(idx, 10)] || '';
  });

  return text;
}
