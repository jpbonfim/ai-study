import katex from 'katex';

export interface BlockDiagramProps {
  title?: string;
  preset?:
    | 'feedback'
    | 'feedback-disturbance'
    | 'cascade'
    | 'parallel'
    | 'direct-form-1'
    | 'direct-form-2'
    | 'fir'
    | 'state-space'
    | 'custom';
  input?: string;
  output?: string;
  controller?: string;
  plant?: string;
  feedback?: string;
  feedbackSign?: '+' | '-';
  disturbance?: string;
  error?: string;
  controlSignal?: string;
  zeros?: string[];
  poles?: string[];
  delayLabel?: string;
  matrixA?: string;
  matrixB?: string;
  matrixC?: string;
  matrixD?: string;
  integratorLabel?: string;
  stateVar?: string;
  stateDotVar?: string;
}

function math(str: string | undefined): string {
  if (!str) return '';
  try {
    return katex.renderToString(str, { displayMode: false, throwOnError: false });
  } catch {
    return str;
  }
}

/** Short deterministic hash (djb2) used to derive unique, stable SVG ids. */
function stableKey(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/**
 * Parses the attributes of a <BlockDiagram ... /> tag.
 */
export function parseBlockDiagramProps(attrsStr: string): BlockDiagramProps {
  const props: Record<string, unknown> = {};

  // Matches prop="value", prop='value' or prop={...}
  const propRegex = /([a-zA-Z0-9_-]+)=(?:(["'])([\s\S]*?)\2|{([\s\S]*?)})/g;
  for (const match of attrsStr.matchAll(propRegex)) {
    const key = match[1] ?? '';
    if (match[3] !== undefined) {
      props[key] = match[3];
    } else if (match[4] !== undefined) {
      const rawVal = match[4].trim();
      try {
        // Try JSON (arrays, numbers)
        props[key] = JSON.parse(rawVal);
      } catch {
        // Fallback: strip surrounding quotes
        props[key] = rawVal.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return props as BlockDiagramProps;
}

/**
 * Renders the complete HTML of a block diagram card (.system-block-card).
 */
export function renderBlockDiagramHtml(
  attrsStr: string,
  slotContent: string = '',
  diagramKey: string = stableKey(attrsStr),
): string {
  const props = parseBlockDiagramProps(attrsStr);

  const title = props.title || 'Diagrama de Blocos de Sistemas';
  const preset = props.preset || 'feedback';
  const input = props.input || 'R(s)';
  const output = props.output || 'Y(s)';
  const controller = props.controller || 'C(s)';
  const plant = props.plant || 'G(s)';
  const feedback = props.feedback || 'H(s)';
  const feedbackSign = props.feedbackSign || '-';
  const disturbance = props.disturbance || 'D(s)';
  const error = props.error || 'E(s)';
  const controlSignal = props.controlSignal || 'U(s)';
  const matrixA = props.matrixA || 'A';
  const matrixB = props.matrixB || 'B';
  const matrixC = props.matrixC || 'C';
  const matrixD = props.matrixD || 'D';
  const integratorLabel = props.integratorLabel || '\\frac{1}{s}';
  const stateVar = props.stateVar || 'x(t)';
  const stateDotVar = props.stateDotVar || '\\dot{x}(t)';

  // Marker ids must be unique per page; a stable key keeps the rendered HTML deterministic (cacheable).
  const arrowId = `arrow-${diagramKey}`;
  const arrowUrl = `url(#${arrowId})`;

  let svgContent = '';

  if (preset === 'feedback') {
    svgContent = `
      <svg viewBox="0 0 680 220" class="system-diagram-svg w-full max-w-3xl select-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="${arrowId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" class="system-diagram-arrow" />
          </marker>
        </defs>

        <!-- Entrada R(s) -->
        <path d="M 25 80 L 102 80" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="35" y="45" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(input)}</span></div>
        </foreignObject>

        <!-- Ponto de Soma 1 -->
        <circle cx="118" cy="80" r="16" class="system-sum-junction" />
        <line x1="108" y1="80" x2="128" y2="80" class="system-sum-cross" />
        <line x1="118" y1="70" x2="118" y2="90" class="system-sum-cross" />
        <text x="96" y="74" class="system-port-sign">+</text>
        <text x="124" y="108" class="system-port-sign">${feedbackSign}</text>

        <!-- Erro E(s) -->
        <path d="M 134 80 L 180 80" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="134" y="45" width="45" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(error)}</span></div>
        </foreignObject>

        <!-- Controlador C(s) -->
        <rect x="180" y="50" width="120" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="180" y="50" width="120" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(controller)}</span></div>
        </foreignObject>

        <!-- Ação de Controle U(s) -->
        <path d="M 300 80 L 360 80" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="305" y="45" width="50" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(controlSignal)}</span></div>
        </foreignObject>

        <!-- Planta G(s) -->
        <rect x="360" y="50" width="130" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="360" y="50" width="130" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(plant)}</span></div>
        </foreignObject>

        <!-- Saída Y(s) e Nó de Derivação -->
        <path d="M 490 80 L 640 80" class="system-diagram-line" marker-end="${arrowUrl}" />
        <circle cx="540" cy="80" r="4.5" class="system-takeoff-dot" />
        <foreignObject x="600" y="45" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(output)}</span></div>
        </foreignObject>

        <!-- Malha de Realimentação H(s) -->
        <path d="M 540 80 L 540 170 L 440 170" class="system-diagram-line" marker-end="${arrowUrl}" />
        <rect x="320" y="140" width="120" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="320" y="140" width="120" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(feedback)}</span></div>
        </foreignObject>
        <path d="M 320 170 L 118 170 L 118 96" class="system-diagram-line" marker-end="${arrowUrl}" />
      </svg>
    `;
  } else if (preset === 'feedback-disturbance') {
    svgContent = `
      <svg viewBox="0 0 780 250" class="system-diagram-svg w-full max-w-4xl select-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="${arrowId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" class="system-diagram-arrow" />
          </marker>
        </defs>

        <!-- Entrada R(s) -->
        <path d="M 25 95 L 98 95" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="35" y="60" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(input)}</span></div>
        </foreignObject>

        <!-- Somador 1 -->
        <circle cx="114" cy="95" r="16" class="system-sum-junction" />
        <line x1="104" y1="95" x2="124" y2="95" class="system-sum-cross" />
        <line x1="114" y1="85" x2="114" y2="105" class="system-sum-cross" />
        <text x="92" y="89" class="system-port-sign">+</text>
        <text x="120" y="123" class="system-port-sign">${feedbackSign}</text>

        <!-- Erro -->
        <path d="M 130 95 L 175 95" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="130" y="60" width="45" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(error)}</span></div>
        </foreignObject>

        <!-- Controlador -->
        <rect x="175" y="65" width="115" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="175" y="65" width="115" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(controller)}</span></div>
        </foreignObject>

        <!-- U(s) e Somador de Perturbação 2 -->
        <path d="M 290 95 L 334 95" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="290" y="60" width="45" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(controlSignal)}</span></div>
        </foreignObject>

        <circle cx="350" cy="95" r="16" class="system-sum-junction" />
        <line x1="340" y1="95" x2="360" y2="95" class="system-sum-cross" />
        <line x1="350" y1="85" x2="350" y2="105" class="system-sum-cross" />
        <text x="328" y="89" class="system-port-sign">+</text>
        <text x="358" y="75" class="system-port-sign">+</text>

        <!-- Perturbação D(s) vindo de cima -->
        <path d="M 350 25 L 350 79" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="360" y="30" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(disturbance)}</span></div>
        </foreignObject>

        <!-- Para a Planta -->
        <path d="M 366 95 L 430 95" class="system-diagram-line" marker-end="${arrowUrl}" />
        <rect x="430" y="65" width="130" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="430" y="65" width="130" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(plant)}</span></div>
        </foreignObject>

        <!-- Saída Y(s) -->
        <path d="M 560 95 L 740 95" class="system-diagram-line" marker-end="${arrowUrl}" />
        <circle cx="630" cy="95" r="4.5" class="system-takeoff-dot" />
        <foreignObject x="700" y="60" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(output)}</span></div>
        </foreignObject>

        <!-- Realimentação -->
        <path d="M 630 95 L 630 195 L 450 195" class="system-diagram-line" marker-end="${arrowUrl}" />
        <rect x="330" y="165" width="120" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="330" y="165" width="120" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(feedback)}</span></div>
        </foreignObject>
        <path d="M 330 195 L 114 195 L 114 111" class="system-diagram-line" marker-end="${arrowUrl}" />
      </svg>
    `;
  } else if (preset === 'cascade') {
    svgContent = `
      <svg viewBox="0 0 580 120" class="system-diagram-svg w-full max-w-2xl select-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="${arrowId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" class="system-diagram-arrow" />
          </marker>
        </defs>

        <!-- Entrada -->
        <path d="M 25 60 L 95 60" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="35" y="25" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(input)}</span></div>
        </foreignObject>

        <!-- Bloco 1 -->
        <rect x="95" y="30" width="130" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="95" y="30" width="130" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(plant)}</span></div>
        </foreignObject>

        <!-- Intermediário -->
        <path d="M 225 60 L 305 60" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="235" y="25" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(controlSignal || 'W(s)')}</span></div>
        </foreignObject>

        <!-- Bloco 2 -->
        <rect x="305" y="30" width="130" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="305" y="30" width="130" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(controller)}</span></div>
        </foreignObject>

        <!-- Saída -->
        <path d="M 435 60 L 545 60" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="480" y="25" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(output)}</span></div>
        </foreignObject>
      </svg>
    `;
  } else if (preset === 'parallel') {
    svgContent = `
      <svg viewBox="0 0 580 220" class="system-diagram-svg w-full max-w-2xl select-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="${arrowId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" class="system-diagram-arrow" />
          </marker>
        </defs>

        <!-- Entrada e Nó de Derivação -->
        <path d="M 25 110 L 95 110" class="system-diagram-line" />
        <circle cx="95" cy="110" r="4.5" class="system-takeoff-dot" />
        <foreignObject x="35" y="75" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(input)}</span></div>
        </foreignObject>

        <!-- Ramo Superior -->
        <path d="M 95 110 L 95 60 L 165 60" class="system-diagram-line" marker-end="${arrowUrl}" />
        <rect x="165" y="30" width="130" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="165" y="30" width="130" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(plant)}</span></div>
        </foreignObject>
        <path d="M 295 60 L 375 60 L 375 94" class="system-diagram-line" marker-end="${arrowUrl}" />
        <text x="382" y="85" class="system-port-sign">+</text>

        <!-- Ramo Inferior -->
        <path d="M 95 110 L 95 160 L 165 160" class="system-diagram-line" marker-end="${arrowUrl}" />
        <rect x="165" y="130" width="130" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="165" y="130" width="130" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(controller)}</span></div>
        </foreignObject>
        <path d="M 295 160 L 375 160 L 375 126" class="system-diagram-line" marker-end="${arrowUrl}" />
        <text x="382" y="145" class="system-port-sign">+</text>

        <!-- Somador e Saída -->
        <circle cx="375" cy="110" r="16" class="system-sum-junction" />
        <line x1="365" y1="110" x2="385" y2="110" class="system-sum-cross" />
        <line x1="375" y1="100" x2="375" y2="120" class="system-sum-cross" />

        <path d="M 391 110 L 540 110" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="460" y="75" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(output)}</span></div>
        </foreignObject>
      </svg>
    `;
  } else if (preset === 'state-space') {
    svgContent = `
      <svg viewBox="0 0 680 260" class="system-diagram-svg w-full max-w-3xl select-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="${arrowId}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" class="system-diagram-arrow" />
          </marker>
        </defs>

        <!-- Entrada u(t) e Multiplicador B -->
        <path d="M 25 100 L 95 100" class="system-diagram-line" />
        <circle cx="95" cy="100" r="4.5" class="system-takeoff-dot" />
        <foreignObject x="35" y="65" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(input || 'u(t)')}</span></div>
        </foreignObject>

        <path d="M 95 100 L 135 100" class="system-diagram-line" marker-end="${arrowUrl}" />
        <rect x="135" y="75" width="50" height="50" rx="5" class="system-block-rect" />
        <foreignObject x="135" y="75" width="50" height="50">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center font-serif font-bold text-base"><span>${math(matrixB)}</span></div>
        </foreignObject>

        <!-- Somador de Estado -->
        <path d="M 185 100 L 224 100" class="system-diagram-line" marker-end="${arrowUrl}" />
        <circle cx="240" cy="100" r="16" class="system-sum-junction" />
        <line x1="230" y1="100" x2="250" y2="100" class="system-sum-cross" />
        <line x1="240" y1="90" x2="240" y2="110" class="system-sum-cross" />
        <text x="218" y="94" class="system-port-sign">+</text>
        <text x="248" y="132" class="system-port-sign">+</text>

        <!-- x_dot(t) -->
        <path d="M 256 100 L 315 100" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="260" y="65" width="50" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(stateDotVar)}</span></div>
        </foreignObject>

        <!-- Bloco Integrador 1/s -->
        <rect x="315" y="70" width="70" height="60" rx="6" class="system-block-rect" />
        <foreignObject x="315" y="70" width="70" height="60">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span class="system-diagram-katex">${math(integratorLabel)}</span></div>
        </foreignObject>

        <!-- x(t) e Nó de Derivação -->
        <path d="M 385 100 L 450 100" class="system-diagram-line" marker-end="${arrowUrl}" />
        <circle cx="415" cy="100" r="4.5" class="system-takeoff-dot" />
        <foreignObject x="400" y="65" width="50" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(stateVar)}</span></div>
        </foreignObject>

        <!-- Realimentação por Matriz A -->
        <path d="M 415 100 L 415 190 L 350 190" class="system-diagram-line" marker-end="${arrowUrl}" />
        <rect x="300" y="165" width="50" height="50" rx="5" class="system-block-rect" />
        <foreignObject x="300" y="165" width="50" height="50">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center font-serif font-bold text-base"><span>${math(matrixA)}</span></div>
        </foreignObject>
        <path d="M 300 190 L 240 190 L 240 116" class="system-diagram-line" marker-end="${arrowUrl}" />

        <!-- Matriz C para Saída -->
        <rect x="450" y="75" width="50" height="50" rx="5" class="system-block-rect" />
        <foreignObject x="450" y="75" width="50" height="50">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center font-serif font-bold text-base"><span>${math(matrixC)}</span></div>
        </foreignObject>
        <path d="M 500 100 L 554 100" class="system-diagram-line" marker-end="${arrowUrl}" />

        <!-- Somador de Saída -->
        <circle cx="570" cy="100" r="16" class="system-sum-junction" />
        <line x1="560" y1="100" x2="580" y2="100" class="system-sum-cross" />
        <line x1="570" y1="90" x2="570" y2="110" class="system-sum-cross" />
        <text x="548" y="94" class="system-port-sign">+</text>
        <text x="578" y="78" class="system-port-sign">+</text>

        <!-- Ramo Feedthrough com Matriz D (Caminho Superior) -->
        <path d="M 95 100 L 95 25 L 310 25" class="system-diagram-line" marker-end="${arrowUrl}" />
        <rect x="310" y="5" width="50" height="40" rx="5" class="system-block-rect" />
        <foreignObject x="310" y="5" width="50" height="40">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center font-serif font-bold text-sm"><span>${math(matrixD)}</span></div>
        </foreignObject>
        <path d="M 360 25 L 570 25 L 570 84" class="system-diagram-line" marker-end="${arrowUrl}" />

        <!-- Saída y(t) -->
        <path d="M 586 100 L 650 100" class="system-diagram-line" marker-end="${arrowUrl}" />
        <foreignObject x="610" y="65" width="60" height="30">
          <div xmlns="http://www.w3.org/1999/xhtml" class="system-fo-center"><span>${math(output || 'y(t)')}</span></div>
        </foreignObject>
      </svg>
    `;
  } else if (preset === 'custom') {
    svgContent = slotContent;
  }

  return `
<div class="diagram-card system-block-card my-8" data-scrollable="true" data-diagram-title="${title}">
  <div class="diagram-card-header">
    <div class="diagram-card-title flex items-center gap-2 min-w-0">
      <svg class="w-4 h-4 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
      <span class="font-serif font-bold text-sm text-[var(--text-primary)] truncate">${title}</span>
      <span class="text-[10px] font-mono uppercase font-semibold px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--accent)] bg-[var(--bg-subtle)] shrink-0 hidden sm:inline">Sistemas & Controle</span>
    </div>
    <button type="button" class="diagram-eye-btn flex items-center gap-1.5 px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-xs font-medium cursor-pointer shrink-0" title="Visualizar diagrama com zoom interativo e navegação" aria-label="Visualizar diagrama com zoom interativo e navegação">
      <svg class="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      <span>Visualizar</span>
    </button>
  </div>
  <div class="diagram-viewport overflow-x-auto p-4 flex justify-start items-center" tabindex="0" role="region" aria-label="Diagrama esquemático de sistemas de controle com rolagem livre">
    ${svgContent}
  </div>
</div>
`.trim();
}
