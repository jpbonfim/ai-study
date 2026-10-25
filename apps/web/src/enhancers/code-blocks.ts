import { readItem, STORAGE_KEYS } from '../preferences/storage';

/**
 * Wraps rendered code blocks (not Mermaid diagrams) in an academic card: a header with the
 * language label and a copy button ("Copiar" → "Copiado!"), and a horizontally scrollable body
 * that does not trigger the mobile menu swipe.
 */

const LANGUAGE_LABELS: Record<string, string> = {
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
  http: 'HTTP',
  json: 'JSON',
  html: 'HTML',
};

export const MERMAID_SYNTAX =
  /^(flowchart|graph|sequenceDiagram|stateDiagram|classDiagram|erDiagram|gantt|pie|gitGraph|journey|quadrantChart|xychart-beta)\b/m;

const COPY_ICON =
  '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />';

function headerHtml(languageLabel: string): string {
  return `
      <div class="code-block-lang flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-[var(--code-badge-color,var(--accent))] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span class="font-mono text-xs font-bold tracking-wider text-[var(--text-secondary)]">
          ${languageLabel}
        </span>
      </div>

      <button
        type="button"
        class="code-copy-btn flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[11px] font-sans font-medium cursor-pointer"
        title="Copiar código para a área de transferência"
        aria-label="Copiar código"
      >
        <svg class="w-3.5 h-3.5 text-[var(--code-badge-color,var(--accent))] copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          ${COPY_ICON}
        </svg>
        <span class="copy-text">Copiar</span>
      </button>
    `;
}

function isMermaidBlock(pre: HTMLPreElement, codeEl: Element | null, rawLang: string): boolean {
  if (
    rawLang === 'mermaid' ||
    pre.classList.contains('mermaid') ||
    pre.classList.contains('diagram-block') ||
    codeEl?.classList.contains('language-mermaid') ||
    codeEl?.classList.contains('mermaid')
  ) {
    return true;
  }
  const text = (codeEl?.textContent || pre.textContent || '').trim();
  return (!rawLang || rawLang === 'text' || rawLang === 'txt') && MERMAID_SYNTAX.test(text);
}

export function initCodeBlocks(root: ParentNode = document): void {
  const blocks = root.querySelectorAll<HTMLPreElement>(
    '.academic-prose pre, .reader-content pre, .resolution-content pre',
  );
  blocks.forEach((pre) => {
    if (pre.dataset.codeBlockProcessed === 'true') return;
    if (pre.closest('.code-block-card') || pre.closest('.diagram-card')) return;

    const codeEl = pre.querySelector('code');
    const rawLang = (
      pre.getAttribute('data-language') ||
      codeEl?.className?.match(/language-([a-zA-Z0-9_-]+)/)?.[1] ||
      ''
    ).toLowerCase();
    if (isMermaidBlock(pre, codeEl, rawLang)) return;

    const card = document.createElement('div');
    card.className = 'code-block-card my-6';
    card.setAttribute('data-scrollable', 'true');
    card.setAttribute(
      'data-code-theme',
      document.documentElement.getAttribute('data-code-theme') || readItem(STORAGE_KEYS.codeTheme) || 'mocha',
    );

    const header = document.createElement('div');
    header.className = 'code-block-header';
    header.innerHTML = headerHtml(LANGUAGE_LABELS[rawLang] || (rawLang ? rawLang.toUpperCase() : 'CÓDIGO'));

    const copyButton = header.querySelector<HTMLButtonElement>('.code-copy-btn');
    copyButton?.addEventListener('click', async () => {
      const text = (pre.querySelector('code') || pre).textContent || '';
      try {
        await navigator.clipboard.writeText(text.trimEnd());
        const label = copyButton.querySelector('.copy-text');
        if (label) label.textContent = 'Copiado!';
        copyButton.classList.add('is-copied');
        setTimeout(() => {
          if (label) label.textContent = 'Copiar';
          copyButton.classList.remove('is-copied');
        }, 2000);
      } catch (err) {
        console.warn('Erro ao copiar código:', err);
      }
    });

    pre.parentNode?.insertBefore(card, pre);
    card.appendChild(header);
    card.appendChild(pre);
    pre.dataset.codeBlockProcessed = 'true';
  });
}

/** Puts every rendered code card on the given code theme. */
export function setCardsCodeTheme(theme: string): void {
  document.querySelectorAll<HTMLElement>('.code-block-card').forEach((card) => {
    card.setAttribute('data-code-theme', theme);
  });
}

/** Applies a code theme to the document and every code card (after saving settings). */
export function applyCodeThemeToCards(theme: string): void {
  if (!theme) return;
  document.documentElement.setAttribute('data-code-theme', theme);
  setCardsCodeTheme(theme);
}

let themeSyncInstalled = false;

/** Follows code theme changes made in another tab. */
export function installCodeThemeSync(): void {
  if (themeSyncInstalled) return;
  themeSyncInstalled = true;
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEYS.codeTheme && e.newValue) applyCodeThemeToCards(e.newValue);
  });
}
