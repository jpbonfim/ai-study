/**
 * Balances the column widths of academic tables.
 *
 * Columns are classified as FORMULA (mostly display math), LABEL (short identifiers) or
 * NARRATIVE (explanatory text, even with inline math). Sibling narrative columns get the same
 * width so none is squeezed into a thin strip, sized for 32-45 characters per line (2-3 lines per
 * cell). Each table gets a plain horizontally scrollable wrapper (`.academic-table-wrapper`).
 */

enum ColumnCategory {
  Formula = 'FORMULA',
  Label = 'LABEL',
  Narrative = 'NARRATIVE',
}

interface ColumnData {
  th: HTMLElement | undefined;
  cells: HTMLElement[];
  maxTextLen: number;
  avgTextLen: number;
  maxMathWidth: number;
  category: ColumnCategory;
  calculatedWidth: number;
  minWidth: number;
}

function ensureWrapper(table: HTMLTableElement): void {
  if (table.parentElement?.classList.contains('academic-table-wrapper')) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'academic-table-wrapper';
  wrapper.setAttribute('tabindex', '0');
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', 'Tabela acadêmica com rolagem horizontal independente');
  table.parentNode?.insertBefore(wrapper, table);
  wrapper.appendChild(table);
}

function measureColumns(table: HTMLTableElement): ColumnData[] {
  const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
  if (!headerRow) return [];
  const headerCells = Array.from(headerRow.querySelectorAll('th, td')) as HTMLElement[];
  const bodyRows = Array.from(table.querySelectorAll('tbody tr'));

  return headerCells.map((th, c) => {
    const headerLen = (th.textContent || '').trim().length;
    const cells = bodyRows
      .map((row) => Array.from(row.querySelectorAll('td, th'))[c] as HTMLElement | undefined)
      .filter((cell): cell is HTMLElement => Boolean(cell));

    let hasMath = Boolean(th.querySelector('.katex'));
    let maxMathWidth = 0;
    let maxTextLen = headerLen;
    let totalTextLen = headerLen;
    for (const cell of cells) {
      const katexEls = cell.querySelectorAll<HTMLElement>('.katex');
      if (katexEls.length > 0) {
        hasMath = true;
        katexEls.forEach((k) => {
          maxMathWidth = Math.max(maxMathWidth, k.scrollWidth || k.offsetWidth || 0);
        });
      }
      const len = (cell.textContent || '').trim().length;
      maxTextLen = Math.max(maxTextLen, len);
      totalTextLen += len;
    }
    const avgTextLen = totalTextLen / (cells.length + 1);

    let category: ColumnCategory;
    if (hasMath && avgTextLen <= 25 && maxMathWidth > 40) category = ColumnCategory.Formula;
    else if (avgTextLen > 30 || maxTextLen > 45) category = ColumnCategory.Narrative;
    else category = ColumnCategory.Label;

    return { th, cells, maxTextLen, avgTextLen, maxMathWidth, category, calculatedWidth: 0, minWidth: 0 };
  });
}

function sizeColumns(columns: ColumnData[], charWidth: number): void {
  const narrative = columns.filter((col) => col.category === ColumnCategory.Narrative);
  if (narrative.length > 0) {
    const maxAvg = Math.max(...narrative.map((c) => c.avgTextLen));
    const targetCharsPerLine = Math.max(34, Math.min(44, Math.round(maxAvg / 2.5)));
    const balancedWidth = Math.round(targetCharsPerLine * charWidth + 48);
    const balancedMin = Math.max(280, Math.round(28 * charWidth + 40));
    const finalWidth = Math.max(balancedMin, Math.min(480, balancedWidth));
    narrative.forEach((col) => {
      col.calculatedWidth = finalWidth;
      col.minWidth = balancedMin;
    });
  }

  columns.forEach((col) => {
    if (col.category === ColumnCategory.Formula) {
      const comfort = Math.round(col.maxMathWidth + 48);
      col.minWidth = Math.max(180, comfort);
      col.calculatedWidth = Math.max(col.minWidth, Math.min(360, comfort + 16));
    } else if (col.category === ColumnCategory.Label) {
      const comfort = Math.round(Math.min(col.maxTextLen, 26) * charWidth + 40);
      col.minWidth = Math.max(160, Math.min(240, comfort));
      col.calculatedWidth = Math.max(col.minWidth, Math.min(270, comfort + 16));
    }
  });
}

function applyWidths(table: HTMLTableElement, columns: ColumnData[]): void {
  let colgroup = table.querySelector('colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    table.insertBefore(colgroup, table.firstChild);
  }
  colgroup.innerHTML = '';
  for (const col of columns) {
    const element = document.createElement('col');
    element.style.width = `${col.calculatedWidth}px`;
    element.style.minWidth = `${col.minWidth}px`;
    colgroup.appendChild(element);
    for (const cell of [col.th, ...col.cells]) {
      if (!cell) continue;
      cell.style.width = `${col.calculatedWidth}px`;
      cell.style.minWidth = `${col.minWidth}px`;
    }
  }

  for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
    const cells = Array.from(row.querySelectorAll('td, th'));
    const multiline = cells.some((cell, idx) => {
      const col = columns[idx];
      return col?.category === ColumnCategory.Narrative && (cell.textContent || '').trim().length > 30;
    });
    row.classList.toggle('academic-row-multiline', multiline);
    row.classList.toggle('academic-row-singleline', !multiline);
  }
}

export function optimizeTable(table: HTMLTableElement): void {
  if (table.dataset.tableOptimized === 'true') return;
  table.dataset.tableOptimized = 'true';
  ensureWrapper(table);
  table.classList.add('academic-table');
  const columns = measureColumns(table);
  if (columns.length === 0) return;
  const fontSize = Number.parseFloat(window.getComputedStyle(table).fontSize) || 18;
  sizeColumns(columns, fontSize * 0.56);
  applyWidths(table, columns);
}

export function optimizeTables(root: ParentNode = document): void {
  root
    .querySelectorAll<HTMLTableElement>('.academic-prose table, article table, table.academic-table')
    .forEach(optimizeTable);
}

let resizeListenerInstalled = false;

/** Optimizes the tables now and again after window resizes (installed once). */
export function initTableOptimizer(): void {
  setTimeout(() => optimizeTables(), 20);
  if (resizeListenerInstalled) return;
  resizeListenerInstalled = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener(
    'resize',
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => optimizeTables(), 120);
    },
    { passive: true },
  );
}
