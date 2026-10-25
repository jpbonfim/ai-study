/**
 * Long runs of question previews (`.question-card-preview`, more than 2 in a row) show only the
 * first 2 plus a button to expand/collapse the rest of the block.
 */

function contiguousGroups(cards: HTMLElement[]): HTMLElement[][] {
  const groups: HTMLElement[][] = [];
  let current: HTMLElement[] = [];
  for (const card of cards) {
    const previous = current[current.length - 1];
    if (!previous) {
      current.push(card);
      continue;
    }
    // Skip empty paragraphs between cards (markdown artifacts).
    let next: Element | null = previous.nextElementSibling;
    while (next && next !== card && next.tagName === 'P' && !next.textContent?.trim()) next = next.nextElementSibling;
    if (next === card) {
      current.push(card);
    } else {
      if (current.length > 2) groups.push(current);
      current = [card];
    }
  }
  if (current.length > 2) groups.push(current);
  return groups;
}

function toggleButtonHtml(expanded: boolean, hiddenCount: number): string {
  if (expanded) {
    return `
          <svg class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
          </svg>
          <span>Recolher questões do bloco (${hiddenCount} ocultadas)</span>
        `;
  }
  return `
          <svg class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
          <span>Ver mais ${hiddenCount} ${hiddenCount === 1 ? 'questão' : 'questões'} deste bloco</span>
        `;
}

export function initQuestionSequences(root: ParentNode = document): void {
  const cards = Array.from(root.querySelectorAll<HTMLElement>('.question-card-preview'));
  for (const group of contiguousGroups(cards)) {
    const first = group[0];
    if (!first || first.dataset.sequenceGrouped === 'true') continue;
    group.forEach((card) => {
      card.dataset.sequenceGrouped = 'true';
    });

    const hiddenCards = group.slice(2);
    hiddenCards.forEach((card) => {
      card.style.display = 'none';
      card.classList.add('question-sequence-hidden');
    });

    const wrap = document.createElement('div');
    wrap.className = 'question-sequence-toggle-wrap not-prose my-3 text-center';
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      'question-sequence-toggle-btn sans-ui inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--accent)] hover:border-[var(--accent)] transition-all cursor-pointer shadow-xs select-none';

    let expanded = false;
    button.innerHTML = toggleButtonHtml(expanded, hiddenCards.length);
    button.addEventListener('click', (e) => {
      e.preventDefault();
      expanded = !expanded;
      hiddenCards.forEach((card) => {
        card.style.display = expanded ? '' : 'none';
      });
      button.innerHTML = toggleButtonHtml(expanded, hiddenCards.length);
    });
    wrap.appendChild(button);

    const last = group[group.length - 1];
    last?.parentNode?.insertBefore(wrap, last.nextSibling);
  }
}
