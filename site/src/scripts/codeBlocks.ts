/**
 * Code Blocks Enhancer:
 * - Detecta blocos de código (<pre class="astro-code"> ou .academic-prose pre) que não sejam diagramas Mermaid
 * - Adiciona uma barra de cabeçalho acadêmica (.code-block-header):
 *    - Rótulo estilizado com a linguagem de programação (Python, C, Matlab, etc.)
 *    - Botão de cópia rápida com feedback visual ("Copiar" -> "Copiado!")
 * - Garante rolagem horizontal fluida e contenção de gestos para evitar disparar o drawer móvel
 */

const LANGUAGE_MAP: Record<string, string> = {
  python: 'PYTHON',
  py: 'PYTHON',
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  matlab: 'MATLAB / OCTAVE',
  octave: 'OCTAVE',
  js: 'JAVASCRIPT',
  javascript: 'JAVASCRIPT',
  ts: 'TYPESCRIPT',
  typescript: 'TYPESCRIPT',
  bash: 'BASH / SHELL',
  sh: 'SHELL',
  text: 'CÓDIGO',
  txt: 'TEXTO',
};

export function initCodeBlocks(): void {
  if (typeof window === 'undefined') return;

  const preBlocks = Array.from(
    document.querySelectorAll<HTMLPreElement>(
      '.academic-prose pre, .reader-content pre, .resolution-content pre'
    )
  );

  preBlocks.forEach((pre) => {
    // Evita reprocessar blocos já empacotados ou diagramas
    if (pre.dataset.codeBlockProcessed === 'true') return;
    if (pre.closest('.code-block-card') || pre.closest('.diagram-card')) return;

    const codeEl = pre.querySelector('code');
    const rawLang = (
      pre.getAttribute('data-language') ||
      codeEl?.className?.match(/language-([a-zA-Z0-9_-]+)/)?.[1] ||
      ''
    ).toLowerCase();

    // Se for diagrama mermaid, classe mermaid ou componente diagram-block, NUNCA empacota como bloco de código
    if (
      rawLang === 'mermaid' ||
      pre.classList.contains('mermaid') ||
      pre.classList.contains('diagram-block') ||
      codeEl?.classList.contains('language-mermaid') ||
      codeEl?.classList.contains('mermaid')
    ) {
      return;
    }

    // Heurística de proteção: se o conteúdo de texto for sintaxe Mermaid
    const codeText = (codeEl?.textContent || pre.textContent || '').trim();
    if (
      /^(flowchart|graph|sequenceDiagram|stateDiagram|classDiagram|erDiagram|gantt|pie|gitGraph|journey|quadrantChart|xychart-beta)\b/m.test(codeText)
    ) {
      return;
    }

    const langDisplay = LANGUAGE_MAP[rawLang] || (rawLang ? rawLang.toUpperCase() : 'CÓDIGO');

    // Cria o cartão de código
    const card = document.createElement('div');
    card.className = 'code-block-card my-6';
    card.setAttribute('data-scrollable', 'true');

    // Cria a barra superior de cabeçalho
    const header = document.createElement('div');
    header.className = 'code-block-header';

    header.innerHTML = `
      <div class="code-block-lang flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span class="font-mono text-xs font-bold tracking-wider text-[var(--text-secondary)]">
          ${langDisplay}
        </span>
      </div>

      <button
        type="button"
        class="code-copy-btn flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11px] font-sans font-medium cursor-pointer"
        title="Copiar código para a área de transferência"
        aria-label="Copiar código"
      >
        <svg class="w-3.5 h-3.5 text-[var(--accent)] copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span class="copy-text">Copiar</span>
      </button>
    `;

    // Configura ação de cópia
    const copyBtn = header.querySelector('.code-copy-btn') as HTMLButtonElement;
    copyBtn?.addEventListener('click', async () => {
      const codeEl = pre.querySelector('code') || pre;
      const codeText = codeEl.textContent || '';

      try {
        await navigator.clipboard.writeText(codeText.trimEnd());
        const copyTextEl = copyBtn.querySelector('.copy-text');
        const copyIconEl = copyBtn.querySelector('.copy-icon');

        if (copyTextEl) copyTextEl.textContent = 'Copiado!';
        copyBtn.classList.add('is-copied');

        setTimeout(() => {
          if (copyTextEl) copyTextEl.textContent = 'Copiar';
          copyBtn.classList.remove('is-copied');
        }, 2000);
      } catch (err) {
        console.warn('Erro ao copiar código:', err);
      }
    });

    // Insere o card na posição do pre e anexa o header e o pre dentro dele
    pre.parentNode?.insertBefore(card, pre);
    card.appendChild(header);
    card.appendChild(pre);

    pre.dataset.codeBlockProcessed = 'true';
  });
}
