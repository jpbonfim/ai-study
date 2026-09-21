/**
 * Question Sequence Manager
 * 
 * Detecta sequências contíguas de previews de questões (.question-card-preview).
 * Se um bloco contiver mais do que 2 questões em sequência no texto:
 * - Mantém as 2 primeiras visíveis.
 * - Oculta as questões excedentes (3ª em diante).
 * - Adiciona um botão elegante de expandir/colapsar as questões restantes.
 */

export function initQuestionSequences(root: Document | HTMLElement = document): void {
  const allCards = Array.from(root.querySelectorAll<HTMLElement>('.question-card-preview'));
  if (allCards.length === 0) return;

  const groups: HTMLElement[][] = [];
  let currentGroup: HTMLElement[] = [];

  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i];
    if (currentGroup.length === 0) {
      currentGroup.push(card);
    } else {
      const prevCard = currentGroup[currentGroup.length - 1];
      
      // Encontra o próximo elemento irmão relevante (ignorando nós vazios ou quebras)
      let next: Element | null = prevCard.nextElementSibling;
      while (next && next !== card && next.tagName === 'P' && !next.textContent?.trim()) {
        next = next.nextElementSibling;
      }

      if (next === card) {
        currentGroup.push(card);
      } else {
        if (currentGroup.length > 2) {
          groups.push(currentGroup);
        }
        currentGroup = [card];
      }
    }
  }

  if (currentGroup.length > 2) {
    groups.push(currentGroup);
  }

  groups.forEach((group) => {
    // Evita reaplicar em nós já processados
    if (group[0].dataset.sequenceGrouped === 'true') return;
    group.forEach((card) => (card.dataset.sequenceGrouped = 'true'));

    const hiddenCards = group.slice(2);
    const hiddenCount = hiddenCards.length;

    // Oculta inicialmente as questões da 3ª em diante
    hiddenCards.forEach((card) => {
      card.style.display = 'none';
      card.classList.add('question-sequence-hidden');
    });

    // Cria o container do botão de alternância
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'question-sequence-toggle-wrap not-prose my-3 text-center';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className =
      'question-sequence-toggle-btn sans-ui inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--accent)] hover:border-[var(--accent)] transition-all cursor-pointer shadow-xs select-none';

    let isExpanded = false;

    function renderButtonState(): void {
      if (isExpanded) {
        toggleBtn.innerHTML = `
          <svg class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
          </svg>
          <span>Recolher questões do bloco (${hiddenCount} ocultadas)</span>
        `;
      } else {
        toggleBtn.innerHTML = `
          <svg class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
          <span>Ver mais ${hiddenCount} ${hiddenCount === 1 ? 'questão' : 'questões'} deste bloco</span>
        `;
      }
    }

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      isExpanded = !isExpanded;
      hiddenCards.forEach((card) => {
        card.style.display = isExpanded ? '' : 'none';
      });
      renderButtonState();
    });

    renderButtonState();
    toggleContainer.appendChild(toggleBtn);

    // Insere o botão logo após o último card do bloco
    const lastCard = group[group.length - 1];
    if (lastCard.parentNode) {
      lastCard.parentNode.insertBefore(toggleContainer, lastCard.nextSibling);
    }
  });
}
