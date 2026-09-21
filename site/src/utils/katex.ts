import katex from 'katex';

/**
 * Renderiza expressões matemáticas KaTeX embutidas ($...$ e $$...$$) dentro de strings de texto,
 * preservando formatação, convertendo quebras de linha e garantindo segurança tipográfica.
 */
export function renderMath(content?: string | null): string {
  if (!content) return '';

  const mathBlocks: string[] = [];

  // 1. Processa display math $$ ... $$
  let text = content.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    try {
      const rendered = katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
      });
      const idx = mathBlocks.length;
      mathBlocks.push(rendered);
      return `___MATH_BLOCK_${idx}___`;
    } catch {
      return `$$${math}$$`;
    }
  });

  // 2. Processa inline math $ ... $
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

  // 4. Suporte a negrito markdown simples **texto** e quebras de linha
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\n/g, '<br />');

  // 5. Restaura os blocos matemáticos compilados em HTML pelo KaTeX
  text = text.replace(/___MATH_BLOCK_(\d+)___/g, (_, idx) => {
    return mathBlocks[parseInt(idx, 10)] || '';
  });

  return text;
}
