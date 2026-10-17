/**
 * Equation Group Manager
 * 
 * Detecta sequências contíguas de blocos de equações matemáticas display (.katex-display).
 * Quando dois ou mais blocos de equação aparecem sequencialmente (sem texto interveniente):
 * - Agrupa-os em um único container visual (.katex-display.katex-display-group).
 * - Mantém cada equação em sua própria linha (empilhamento vertical ergonômico).
 * - Elimina nós intermediários vazios ou parágrafos redundantes gerados por parsers de Markdown.
 */

export function initEquationGroups(root: Document | HTMLElement = document): void {
  // Coleta todos os blocos display de fórmulas que não estejam aninhados em outro .katex-display
  const displays = Array.from(root.querySelectorAll<HTMLElement>('.katex-display')).filter((el) => {
    if (el.dataset.equationGrouped === 'true') return false;
    if (el.classList.contains('katex-display-group')) return false;
    if (el.parentElement?.closest('.katex-display')) return false;
    return true;
  });

  if (displays.length < 2) {
    displays.forEach((el) => (el.dataset.equationGrouped = 'true'));
    return;
  }
  displays.forEach((el) => (el.dataset.equationGrouped = 'true'));

  function getEffectiveBlock(el: HTMLElement): HTMLElement {
    const parent = el.parentElement;
    if (parent && parent.tagName === 'P') {
      const remaining = Array.from(parent.childNodes).filter((n) => {
        if (n === el) return false;
        if (n.nodeType === Node.TEXT_NODE) return (n.textContent || '').trim().length > 0;
        if (n.nodeType === Node.ELEMENT_NODE) {
          const tag = (n as HTMLElement).tagName;
          return tag !== 'BR' && (n as HTMLElement).textContent?.trim().length !== 0;
        }
        return true;
      });
      if (remaining.length === 0) {
        return parent;
      }
    }
    return el;
  }

  const groups: HTMLElement[][] = [];
  let currentGroup: HTMLElement[] = [];

  for (let i = 0; i < displays.length; i++) {
    const el = displays[i];
    if (currentGroup.length === 0) {
      currentGroup.push(el);
    } else {
      const prev = currentGroup[currentGroup.length - 1];
      const prevBlock = getEffectiveBlock(prev);
      const currBlock = getEffectiveBlock(el);

      if (prevBlock.parentElement === currBlock.parentElement) {
        let isAdjacent = false;
        let sib: Node | null = prevBlock.nextSibling;

        while (sib) {
          if (sib === currBlock) {
            isAdjacent = true;
            break;
          }
          if (sib.nodeType === Node.TEXT_NODE && !(sib.textContent || '').trim()) {
            sib = sib.nextSibling;
          } else if (
            sib.nodeType === Node.ELEMENT_NODE &&
            (sib as HTMLElement).tagName === 'P' &&
            !(sib as HTMLElement).textContent?.trim()
          ) {
            sib = sib.nextSibling;
          } else if (sib.nodeType === Node.ELEMENT_NODE && (sib as HTMLElement).tagName === 'BR') {
            sib = sib.nextSibling;
          } else {
            break;
          }
        }

        if (isAdjacent) {
          currentGroup.push(el);
        } else {
          if (currentGroup.length > 1) {
            groups.push(currentGroup);
          }
          currentGroup = [el];
        }
      } else {
        if (currentGroup.length > 1) {
          groups.push(currentGroup);
        }
        currentGroup = [el];
      }
    }
  }

  if (currentGroup.length > 1) {
    groups.push(currentGroup);
  }

  groups.forEach((group) => {
    const firstEl = group[0];
    const firstBlock = getEffectiveBlock(firstEl);
    const parent = firstBlock.parentNode;
    if (!parent) return;

    const groupContainer = document.createElement('div');
    groupContainer.className = 'katex-display katex-display-group my-4 overflow-x-auto';
    groupContainer.dataset.equationGrouped = 'true';

    group.forEach((item) => {
      item.dataset.equationGrouped = 'true';
      const block = getEffectiveBlock(item);

      const itemWrapper = document.createElement('div');
      itemWrapper.className = 'katex-display-item';

      itemWrapper.appendChild(item);
      groupContainer.appendChild(itemWrapper);

      if (block !== item && block.parentNode) {
        block.parentNode.removeChild(block);
      }
    });

    parent.insertBefore(groupContainer, firstBlock);
    if (firstBlock.parentNode && firstBlock.parentNode === parent) {
      // Se firstBlock for o próprio item, ele já foi movido para dentro de groupContainer
      if (firstBlock.childNodes.length === 0) {
        parent.removeChild(firstBlock);
      }
    }
  });
}
