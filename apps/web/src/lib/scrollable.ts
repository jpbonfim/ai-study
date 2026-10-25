const SCROLLABLE_SELECTOR =
  '.academic-table-wrapper, table, .katex-display, .katex, pre, code, .diagram-viewport, .diagram-card, .diagram-modal, .code-block-card, [data-scrollable], .overflow-x-auto, .overflow-y-auto, [style*="overflow"]';

/**
 * Whether a touch started inside something that scrolls on its own (tables, formulas, code,
 * diagrams or any overflowing container), where a horizontal swipe must not open the menu.
 */
export function isInsideScrollable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(SCROLLABLE_SELECTOR)) return true;
  let current: Element | null = target;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    if (['auto', 'scroll'].includes(style.overflowX) && current.scrollWidth > current.clientWidth + 4) return true;
    if (['auto', 'scroll'].includes(style.overflowY) && current.scrollHeight > current.clientHeight + 4) return true;
    current = current.parentElement;
  }
  return false;
}
