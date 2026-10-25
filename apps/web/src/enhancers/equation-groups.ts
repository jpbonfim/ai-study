/**
 * Merges consecutive display equations (`.katex-display` blocks with nothing but whitespace,
 * empty paragraphs or `<br>` between them) into a single stacked card
 * (`.katex-display.katex-display-group`).
 */

/** The block that actually sits in the flow: the equation itself or a paragraph holding only it. */
function effectiveBlock(el: HTMLElement): HTMLElement {
  const parent = el.parentElement;
  if (parent?.tagName === 'P') {
    const others = Array.from(parent.childNodes).filter((n) => {
      if (n === el) return false;
      if (n.nodeType === Node.TEXT_NODE) return (n.textContent || '').trim().length > 0;
      if (n.nodeType === Node.ELEMENT_NODE) {
        const element = n as HTMLElement;
        return element.tagName !== 'BR' && element.textContent?.trim().length !== 0;
      }
      return true;
    });
    if (others.length === 0) return parent;
  }
  return el;
}

function isAdjacent(previous: HTMLElement, current: HTMLElement): boolean {
  if (previous.parentElement !== current.parentElement) return false;
  let sibling: Node | null = previous.nextSibling;
  while (sibling) {
    if (sibling === current) return true;
    const isBlankText = sibling.nodeType === Node.TEXT_NODE && !(sibling.textContent || '').trim();
    const element = sibling.nodeType === Node.ELEMENT_NODE ? (sibling as HTMLElement) : null;
    const isEmptyParagraph = element?.tagName === 'P' && !element.textContent?.trim();
    if (!isBlankText && !isEmptyParagraph && element?.tagName !== 'BR') return false;
    sibling = sibling.nextSibling;
  }
  return false;
}

export function initEquationGroups(root: ParentNode = document): void {
  const displays = Array.from(root.querySelectorAll<HTMLElement>('.katex-display')).filter(
    (el) =>
      el.dataset.equationGrouped !== 'true' &&
      !el.classList.contains('katex-display-group') &&
      !el.parentElement?.closest('.katex-display'),
  );
  displays.forEach((el) => {
    el.dataset.equationGrouped = 'true';
  });
  if (displays.length < 2) return;

  const groups: HTMLElement[][] = [];
  let current: HTMLElement[] = [];
  for (const el of displays) {
    const previous = current[current.length - 1];
    if (previous && isAdjacent(effectiveBlock(previous), effectiveBlock(el))) {
      current.push(el);
    } else {
      if (current.length > 1) groups.push(current);
      current = [el];
    }
  }
  if (current.length > 1) groups.push(current);

  for (const group of groups) {
    const firstBlock = effectiveBlock(group[0] as HTMLElement);
    const parent = firstBlock.parentNode;
    if (!parent) continue;

    const container = document.createElement('div');
    container.className = 'katex-display katex-display-group my-4 overflow-x-auto';
    container.dataset.equationGrouped = 'true';
    // Inserted before moving the equations, so removing their paragraphs cannot detach it.
    parent.insertBefore(container, firstBlock);
    for (const item of group) {
      const block = effectiveBlock(item);
      const wrapper = document.createElement('div');
      wrapper.className = 'katex-display-item';
      wrapper.appendChild(item);
      container.appendChild(wrapper);
      if (block !== item) block.parentNode?.removeChild(block);
    }
    if (firstBlock.parentNode === parent && firstBlock.childNodes.length === 0) parent.removeChild(firstBlock);
  }
}
