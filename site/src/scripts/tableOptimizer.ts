/**
 * Algoritmo Ergonômico de Otimização de Tabelas Acadêmicas
 * 
 * Corrige e balanceia as proporções de tabelas acadêmicas:
 *  1. Identificação precisa de colunas:
 *     - Fórmulas puras (equações KaTeX como conteúdo primário).
 *     - Rótulos e identificadores (textos curtos de cabeçalho/linha).
 *     - Narrativas/descrições (textos explicativos, mesmo contendo variáveis inline como $RLC$ ou $5\%$).
 *  2. Balanceamento simétrico entre colunas irmãs:
 *     - Colunas narrativas de comparação recebem exatamente a mesma largura ideal e mínima,
 *       impedindo que uma coluna seja esmagada em tiras verticais enquanto a outra se expande.
 *  3. Medida tipográfica e altura ideal:
 *     - Distribui textos narrativos em uma medida ergonômica (32 a 45 caracteres por linha),
 *       produzindo a altura de leitura recomendada (2 a 3 linhas por célula).
 *  4. Eliminação total de artefatos visuais:
 *     - Nenhum pseudo-elemento de gradiente ou máscara sobreposto ao texto no modo celular.
 *     - Rolagem horizontal nativa limpa e desobstruída no wrapper `.academic-table-wrapper`.
 */

export function optimizeSingleTable(table: HTMLTableElement): void {
  if (!table) return;
  if (table.dataset.tableOptimized === 'true') return;
  table.dataset.tableOptimized = 'true';

  // 1. Garante wrapper limpo sem sobreposições
  let wrapper = table.parentElement;
  if (!wrapper || !wrapper.classList.contains('academic-table-wrapper')) {
    wrapper = document.createElement('div');
    wrapper.className = 'academic-table-wrapper';
    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Tabela acadêmica com rolagem horizontal independente');
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  }

  table.classList.add('academic-table');

  const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
  if (!headerRow) return;

  const headerCells = Array.from(headerRow.querySelectorAll('th, td')) as HTMLElement[];
  const colCount = headerCells.length;
  if (colCount === 0) return;

  const bodyRows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];

  // Fator de escala baseado no tamanho computado da fonte
  const computedStyle = window.getComputedStyle(table);
  const fontSize = parseFloat(computedStyle.fontSize) || 18;
  const charWidthFactor = fontSize * 0.56;

  enum ColCategory {
    FORMULA = 'FORMULA',
    LABEL = 'LABEL',
    NARRATIVE = 'NARRATIVE',
  }

  interface ColData {
    index: number;
    th: HTMLElement;
    cells: HTMLElement[];
    headerLen: number;
    maxTextLen: number;
    avgTextLen: number;
    hasMath: boolean;
    maxMathWidth: number;
    category: ColCategory;
    calculatedWidth: number;
    minWidth: number;
  }

  const columns: ColData[] = [];

  // 2. Coleta de Métricas Semânticas por Coluna
  for (let c = 0; c < colCount; c++) {
    const th = headerCells[c];
    const thText = (th?.textContent || '').trim();
    const headerLen = thText.length;

    const cells = bodyRows
      .map((row) => Array.from(row.querySelectorAll('td, th'))[c] as HTMLElement | undefined)
      .filter((cell): cell is HTMLElement => Boolean(cell));

    let hasMath = Boolean(th?.querySelector('.katex'));
    let maxMathWidth = 0;
    let maxTextLen = headerLen;
    let totalTextLen = headerLen;
    let count = 1;

    for (const cell of cells) {
      const katexEls = cell.querySelectorAll('.katex');
      if (katexEls.length > 0) {
        hasMath = true;
        katexEls.forEach((k) => {
          const w = (k as HTMLElement).scrollWidth || (k as HTMLElement).offsetWidth || 0;
          if (w > maxMathWidth) maxMathWidth = w;
        });
      }

      const text = (cell.textContent || '').trim();
      const len = text.length;
      if (len > maxTextLen) maxTextLen = len;
      totalTextLen += len;
      count++;
    }

    const avgTextLen = totalTextLen / count;

    // Classificação semântica rigorosa:
    // - FORMULA: Coluna cujo objetivo principal é exibir fórmulas matemáticas isoladas (ex: equações de transformada, critérios matemáticos),
    //   onde o texto explicativo é mínimo (<= 25 caracteres em média).
    // - NARRATIVE: Coluna com texto conceitual, descritivo ou comparativo (> 30 caracteres em média ou max > 45),
    //   mesmo contendo fórmulas inline pontuais (como "$RLC$" ou "$5\%$").
    // - LABEL: Rótulos e identificadores curtos (título da linha, unidade, etc.).
    let category: ColCategory;
    if (hasMath && avgTextLen <= 25 && maxMathWidth > 40) {
      category = ColCategory.FORMULA;
    } else if (avgTextLen > 30 || maxTextLen > 45) {
      category = ColCategory.NARRATIVE;
    } else {
      category = ColCategory.LABEL;
    }

    columns.push({
      index: c,
      th,
      cells,
      headerLen,
      maxTextLen,
      avgTextLen,
      hasMath,
      maxMathWidth,
      category,
      calculatedWidth: 0,
      minWidth: 0,
    });
  }

  // 3. Balanceamento Ergonômico de Larguras
  // Identifica todas as colunas narrativas para equalizar suas medidas de leitura
  const narrativeCols = columns.filter((col) => col.category === ColCategory.NARRATIVE);

  if (narrativeCols.length > 0) {
    // Calcula o volume médio de texto do conjunto narrativo
    const maxNarrativeAvg = Math.max(...narrativeCols.map((c) => c.avgTextLen));

    // Almeja a medida tipográfica áurea de 34 a 42 caracteres por linha (gerando altura de 2 a 3 linhas)
    const targetCPL = Math.max(34, Math.min(44, Math.round(maxNarrativeAvg / 2.5)));
    const balancedNarrativeWidth = Math.round(targetCPL * charWidthFactor + 48);
    const balancedNarrativeMin = Math.max(280, Math.round(28 * charWidthFactor + 40));
    const finalNarrativeWidth = Math.max(balancedNarrativeMin, Math.min(480, balancedNarrativeWidth));

    // Atribui EXATAMENTE a mesma largura e largura mínima para TODAS as colunas narrativas irmãs
    narrativeCols.forEach((col) => {
      col.calculatedWidth = finalNarrativeWidth;
      col.minWidth = balancedNarrativeMin;
    });
  }

  // Dimensiona as colunas de Fórmula e de Rótulo
  columns.forEach((col) => {
    if (col.category === ColCategory.FORMULA) {
      const formulaComfort = Math.round(col.maxMathWidth + 48);
      col.minWidth = Math.max(180, formulaComfort);
      col.calculatedWidth = Math.max(col.minWidth, Math.min(360, formulaComfort + 16));
    } else if (col.category === ColCategory.LABEL) {
      // Rótulos curtos (ex: "Critério de Comparação", "Unidade Típica")
      const labelTextComfort = Math.round(Math.min(col.maxTextLen, 26) * charWidthFactor + 40);
      col.minWidth = Math.max(160, Math.min(240, labelTextComfort));
      col.calculatedWidth = Math.max(col.minWidth, Math.min(270, labelTextComfort + 16));
    }
  });

  // 4. Criação / Atualização de <colgroup> para Aplicação Nativa no Layout da Tabela
  let colgroup = table.querySelector('colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    table.insertBefore(colgroup, table.firstChild);
  }
  colgroup.innerHTML = '';

  columns.forEach((col) => {
    const colElement = document.createElement('col');
    colElement.style.width = `${col.calculatedWidth}px`;
    colElement.style.minWidth = `${col.minWidth}px`;
    colgroup.appendChild(colElement);

    const widthPx = `${col.calculatedWidth}px`;
    const minWidthPx = `${col.minWidth}px`;

    if (col.th) {
      col.th.style.width = widthPx;
      col.th.style.minWidth = minWidthPx;
    }

    col.cells.forEach((cell) => {
      cell.style.width = widthPx;
      cell.style.minWidth = minWidthPx;
    });
  });

  // 5. Otimização de Altura e Alinhamento Vertical das Linhas
  bodyRows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td, th')) as HTMLElement[];
    let hasNarrative = false;

    cells.forEach((cell, idx) => {
      const col = columns[idx];
      const text = (cell.textContent || '').trim();
      if (col && col.category === ColCategory.NARRATIVE && text.length > 30) {
        hasNarrative = true;
      }
    });

    if (hasNarrative) {
      row.classList.add('academic-row-multiline');
      row.classList.remove('academic-row-singleline');
    } else {
      row.classList.add('academic-row-singleline');
      row.classList.remove('academic-row-multiline');
    }
  });
}

/**
 * Otimiza todas as tabelas presentes no documento
 */
export function optimizeAllAcademicTables(): void {
  const tables = document.querySelectorAll(
    '.academic-prose table, article table, table.academic-table'
  );
  tables.forEach((t) => optimizeSingleTable(t as HTMLTableElement));
}

/**
 * Inicializador global com escutas de redimensionamento e alteração de preferências
 */
export function initTableOptimizer(): void {
  if (typeof window === 'undefined') return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', optimizeAllAcademicTables);
  } else {
    setTimeout(optimizeAllAcademicTables, 20);
  }

  let resizeTimer: any = null;
  window.addEventListener(
    'resize',
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(optimizeAllAcademicTables, 120);
    },
    { passive: true }
  );

  (window as any).__reoptimizeAcademicTables = optimizeAllAcademicTables;
}
