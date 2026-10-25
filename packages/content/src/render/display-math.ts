import katex from 'katex';

export interface DisplayMathGroup {
  start: number;
  end: number;
  equations: string[];
}

/** Finds `$$...$$` blocks and merges the ones separated only by whitespace into groups. */
export function findDisplayMathGroups(text: string): DisplayMathGroup[] {
  const groups: DisplayMathGroup[] = [];
  let current: DisplayMathGroup | null = null;
  for (const match of text.matchAll(/\$\$([\s\S]+?)\$\$/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const equation = match[1] ?? '';
    if (current && text.slice(current.end, start).trim() === '') {
      current.end = end;
      current.equations.push(equation);
    } else {
      if (current) groups.push(current);
      current = { start, end, equations: [equation] };
    }
  }
  if (current) groups.push(current);
  return groups;
}

function renderDisplayEquation(equation: string): string {
  try {
    return katex.renderToString(equation.trim(), { displayMode: true, throwOnError: false, output: 'html' });
  } catch {
    return `$$${equation}$$`;
  }
}

/** A single equation card, or one card stacking every equation of the group. */
export function renderDisplayMathGroup(group: DisplayMathGroup): string {
  const rendered = group.equations.map(renderDisplayEquation);
  if (rendered.length === 1) {
    return `<div class="katex-display my-4 overflow-x-auto">${rendered[0]}</div>`;
  }
  const items = rendered.map((r) => `<div class="katex-display-item">${r}</div>`).join('');
  return `<div class="katex-display katex-display-group my-4 overflow-x-auto">${items}</div>`;
}

export function renderInlineEquation(equation: string): string | null {
  try {
    return katex.renderToString(equation.trim(), { displayMode: false, throwOnError: false, output: 'html' });
  } catch {
    return null;
  }
}
