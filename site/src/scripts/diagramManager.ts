import mermaid from 'mermaid';

/**
 * Diagram Manager:
 * - Detecta blocos de código com linguagem 'mermaid' (```mermaid ... ```) e blocos com classe .diagram-block
 * - Renderiza os fluxogramas/diagramas com o Mermaid usando tema adaptado ao modo de leitura
 * - Empacota o SVG em um container ergonômico (.diagram-card):
 *    - Tenta mostrar todo o diagrama na tela quando possível (max-width: 100%)
 *    - Se exceder a largura ou para preservar legibilidade, permite scroll horizontal livre (overflow-x: auto)
 *    - Limita a altura vertical máxima sem scroll vertical no bloco (max-height: 480px, overflow-y: hidden)
 *    - Adiciona botão com ícone de olho para abrir modal com visualização, pan (navegação) e zoom
 *    - Modal interativo com botões de zoom (+, -, reset), controle por mouse wheel, drag e pinch, e botão de X para fechar
 */

// Estado global do modal de visualização
interface ModalState {
  scale: number;
  panX: number;
  panY: number;
  isDragging: boolean;
  startX: number;
  startY: number;
  initialPinchDist: number;
  initialScale: number;
  svgElement: SVGElement | null;
}

const modalState: ModalState = {
  scale: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  initialPinchDist: 0,
  initialScale: 1,
  svgElement: null,
};

let modalRoot: HTMLElement | null = null;
let modalCanvas: HTMLElement | null = null;
let modalContent: HTMLElement | null = null;
let modalZoomLevelEl: HTMLElement | null = null;
let modalTitleEl: HTMLElement | null = null;

/**
 * Cria ou retorna o elemento singleton do modal de visualização de diagrama
 */
function getOrCreateModal(): HTMLElement {
  if (modalRoot && document.body.contains(modalRoot)) {
    return modalRoot;
  }

  const existing = document.getElementById('diagram-zoom-modal');
  if (existing) {
    modalRoot = existing;
    return existing;
  }

  const modal = document.createElement('div');
  modal.id = 'diagram-zoom-modal';
  modal.className = 'diagram-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Visualizador de Diagrama com Zoom e Navegação');

  modal.innerHTML = `
    <div class="diagram-modal-backdrop"></div>
    <div class="diagram-modal-dialog">
      <!-- Barra Superior de Ferramentas -->
      <div class="diagram-modal-header">
        <div class="diagram-modal-title">
          <svg class="w-5 h-5 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <span class="modal-title-text font-serif font-bold text-sm text-[var(--text-primary)] truncate">
            Visualizador de Diagrama
          </span>
          <span class="text-xs text-[var(--text-muted)] hidden md:inline ml-2">
            • Arraste para mover • Role ou dê pinça para zoom
          </span>
        </div>

        <!-- Controles de Navegação e Zoom -->
        <div class="diagram-modal-controls">
          <button type="button" class="modal-control-btn modal-zoom-out" title="Diminuir Zoom (-)" aria-label="Diminuir Zoom">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
            </svg>
          </button>

          <span class="modal-zoom-display font-mono text-xs font-semibold text-[var(--text-secondary)] select-none">
            100%
          </span>

          <button type="button" class="modal-control-btn modal-zoom-in" title="Aumentar Zoom (+)" aria-label="Aumentar Zoom">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <button type="button" class="modal-control-btn modal-zoom-reset" title="Ajustar e Centralizar" aria-label="Ajustar e Centralizar">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>

          <div class="modal-controls-divider"></div>

          <!-- Botão X para Fechar -->
          <button type="button" class="modal-close-btn" title="Fechar visualização (Esc)" aria-label="Fechar visualização">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Área de Exibição com Pan & Zoom -->
      <div class="diagram-modal-canvas" id="diagram-canvas">
        <div class="diagram-modal-content" id="diagram-content"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modalRoot = modal;
  modalCanvas = modal.querySelector('#diagram-canvas');
  modalContent = modal.querySelector('#diagram-content');
  modalZoomLevelEl = modal.querySelector('.modal-zoom-display');
  modalTitleEl = modal.querySelector('.modal-title-text');

  setupModalEvents(modal);
  return modal;
}

/**
 * Configura todos os eventos de interação do modal (zoom, drag, pinch, close)
 */
function setupModalEvents(modal: HTMLElement): void {
  const canvas = modal.querySelector('#diagram-canvas') as HTMLElement;
  const backdrop = modal.querySelector('.diagram-modal-backdrop') as HTMLElement;
  const closeBtn = modal.querySelector('.modal-close-btn') as HTMLElement;
  const zoomInBtn = modal.querySelector('.modal-zoom-in') as HTMLElement;
  const zoomOutBtn = modal.querySelector('.modal-zoom-out') as HTMLElement;
  const resetBtn = modal.querySelector('.modal-zoom-reset') as HTMLElement;

  function applyTransform(smooth = false): void {
    if (!modalContent) return;
    modalContent.style.transition = smooth ? 'transform 0.18s ease-out' : 'none';
    modalContent.style.transform = `translate3d(${modalState.panX}px, ${modalState.panY}px, 0) scale(${modalState.scale})`;
    if (modalZoomLevelEl) {
      modalZoomLevelEl.textContent = `${Math.round(modalState.scale * 100)}%`;
    }
  }

  function setZoom(newScale: number, smooth = true): void {
    modalState.scale = Math.max(0.2, Math.min(5.0, newScale));
    applyTransform(smooth);
  }

  function resetView(): void {
    modalState.scale = 1;
    modalState.panX = 0;
    modalState.panY = 0;
    applyTransform(true);
  }

  // Fechar modal
  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);

  // Zoom via botões
  zoomInBtn?.addEventListener('click', () => setZoom(modalState.scale * 1.3, true));
  zoomOutBtn?.addEventListener('click', () => setZoom(modalState.scale / 1.3, true));
  resetBtn?.addEventListener('click', resetView);

  // Teclado
  window.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      closeModal();
    } else if (e.key === '+' || e.key === '=') {
      setZoom(modalState.scale * 1.25, true);
    } else if (e.key === '-' || e.key === '_') {
      setZoom(modalState.scale / 1.25, true);
    } else if (e.key === '0') {
      resetView();
    }
  });

  // Zoom via Roda do Mouse (centralizado no cursor)
  canvas?.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.max(0.2, Math.min(5.0, modalState.scale * zoomFactor));

    // Ajusta o pan para aproximar/afastar do ponto do mouse
    modalState.panX -= (mouseX - modalState.panX) * (newScale / modalState.scale - 1);
    modalState.panY -= (mouseY - modalState.panY) * (newScale / modalState.scale - 1);
    modalState.scale = newScale;

    applyTransform(false);
  }, { passive: false });

  // Pan / Navegação com Mouse
  canvas?.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return; // apenas botão esquerdo
    modalState.isDragging = true;
    modalState.startX = e.clientX - modalState.panX;
    modalState.startY = e.clientY - modalState.panY;
    canvas.classList.add('is-dragging');
  });

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!modalState.isDragging) return;
    modalState.panX = e.clientX - modalState.startX;
    modalState.panY = e.clientY - modalState.startY;
    applyTransform(false);
  });

  window.addEventListener('mouseup', () => {
    if (modalState.isDragging) {
      modalState.isDragging = false;
      canvas?.classList.remove('is-dragging');
    }
  });

  // Suporte a Touch no Celular / Tablet (Pan e Pinch-to-zoom)
  canvas?.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 1) {
      modalState.isDragging = true;
      modalState.startX = e.touches[0].clientX - modalState.panX;
      modalState.startY = e.touches[0].clientY - modalState.panY;
    } else if (e.touches.length === 2) {
      modalState.isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      modalState.initialPinchDist = Math.hypot(dx, dy);
      modalState.initialScale = modalState.scale;
    }
  }, { passive: true });

  canvas?.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length === 1 && modalState.isDragging) {
      modalState.panX = e.touches[0].clientX - modalState.startX;
      modalState.panY = e.touches[0].clientY - modalState.startY;
      applyTransform(false);
    } else if (e.touches.length === 2 && modalState.initialPinchDist > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / modalState.initialPinchDist;
      modalState.scale = Math.max(0.2, Math.min(5.0, modalState.initialScale * factor));
      applyTransform(false);
    }
  }, { passive: true });

  canvas?.addEventListener('touchend', () => {
    modalState.isDragging = false;
    modalState.initialPinchDist = 0;
  }, { passive: true });
}

/**
 * Abre o modal de visualização de diagrama com o SVG selecionado
 */
export function openDiagramModal(svgSource: SVGElement, title?: string): void {
  const modal = getOrCreateModal();
  if (!modalContent) return;

  modalContent.innerHTML = '';
  const clonedSvg = svgSource.cloneNode(true) as SVGElement;

  // Garante que o SVG no modal tenha tamanho intrínseco livre para zoom
  clonedSvg.removeAttribute('width');
  clonedSvg.removeAttribute('height');
  clonedSvg.style.maxWidth = 'none';
  clonedSvg.style.maxHeight = 'none';
  clonedSvg.style.width = 'auto';
  clonedSvg.style.height = 'auto';
  clonedSvg.style.display = 'block';

  modalContent.appendChild(clonedSvg);
  modalState.svgElement = clonedSvg;

  if (modalTitleEl) {
    modalTitleEl.textContent = title || 'Visualizador de Diagrama';
  }

  // Reseta estado para visualização inicial
  modalState.scale = 1;
  modalState.panX = 0;
  modalState.panY = 0;
  modalState.isDragging = false;
  modalContent.style.transform = 'translate3d(0, 0, 0) scale(1)';
  if (modalZoomLevelEl) {
    modalZoomLevelEl.textContent = '100%';
  }

  // Trava o scroll da página
  document.body.style.overflow = 'hidden';
  modal.classList.remove('hidden');
}

/**
 * Fecha o modal de visualização
 */
export function closeModal(): void {
  if (!modalRoot) return;
  modalRoot.classList.add('hidden');
  document.body.style.overflow = '';
}

/**
 * Inicializa e processa todos os diagramas da página
 */
export async function initDiagrams(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Cria modal singleton de visualização
  getOrCreateModal();

  // Obtém o tema atual para estilizar o Mermaid
  const currentTheme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('academic_theme') || 'paper';
  const isDark = currentTheme === 'dark' || currentTheme === 'oled';

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: isDark ? 'dark' : 'neutral',
    fontFamily: 'inherit',
  });

  let lastTheme = '';

  // 1. Busca blocos gerados por markdown (```mermaid)
  const mermaidCodeBlocks = Array.from(
    document.querySelectorAll<HTMLElement>('.academic-prose pre[data-language="mermaid"], pre.astro-code[data-language="mermaid"]')
  );

  // 2. Busca blocos dedicados .diagram-block
  const customDiagramBlocks = Array.from(
    document.querySelectorAll<HTMLElement>('.diagram-block')
  );

  // 3. Busca cartões já existentes para re-renderizar caso o tema tenha mudado
  const existingCards = Array.from(
    document.querySelectorAll<HTMLElement>('.diagram-card[data-mermaid-code]')
  );

  // Se o tema mudou e já temos cards existentes, re-renderiza
  for (const card of existingCards) {
    const code = card.dataset.mermaidCode;
    const title = card.dataset.diagramTitle || '';
    if (!code) continue;

    const diagramId = `mermaid-re-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    try {
      const { svg } = await mermaid.render(diagramId, code);
      const viewport = card.querySelector('.diagram-viewport');
      if (viewport) {
        viewport.innerHTML = svg;
        const svgEl = viewport.querySelector('svg') as SVGElement;
        if (svgEl) {
          const viewBox = svgEl.viewBox?.baseVal;
          if (viewBox && viewBox.width > 480) {
            svgEl.style.minWidth = `${Math.min(viewBox.width, 560)}px`;
          }
          const eyeBtn = card.querySelector('.diagram-eye-btn');
          if (eyeBtn) {
            eyeBtn.onclick = () => {
              openDiagramModal(svgEl, title || 'Diagrama Esquemático / Fluxograma');
            };
          }
        }
      }
    } catch {
      // Ignora falhas pontuais de re-renderização
    }
  }

  const targets = [...mermaidCodeBlocks, ...customDiagramBlocks];
  if (targets.length === 0) return;

  for (let i = 0; i < targets.length; i++) {
    const el = targets[i];
    if (el.dataset.diagramProcessed === 'true') continue;

    // Extrai o código Mermaid
    let code = '';
    let title = el.getAttribute('data-diagram-title') || '';

    if (el.tagName.toLowerCase() === 'pre') {
      const codeEl = el.querySelector('code') || el;
      code = codeEl.textContent || '';
    } else {
      code = el.textContent || '';
    }

    code = code.trim();
    if (!code) continue;

    // Tenta extrair título definido em comentário %% title: Meu Título
    const titleMatch = code.match(/%%\s*title:\s*(.+)/i);
    if (titleMatch && !title) {
      title = titleMatch[1].trim();
    }

    const diagramId = `mermaid-diagram-${Date.now()}-${i}`;

    try {
      // Renderiza com a API do Mermaid
      const { svg } = await mermaid.render(diagramId, code);

      // Cria o cartão de apresentação do diagrama (.diagram-card)
      const card = document.createElement('div');
      card.className = 'diagram-card my-8';
      card.setAttribute('data-scrollable', 'true');
      card.dataset.mermaidCode = code;
      card.dataset.diagramTitle = title;

      card.innerHTML = `
        <div class="diagram-card-header">
          <div class="diagram-card-title flex items-center gap-2">
            <svg class="w-4 h-4 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <span class="font-serif font-bold text-sm text-[var(--text-primary)]">
              ${title || 'Diagrama Esquemático / Fluxograma'}
            </span>
          </div>

          <button
            type="button"
            class="diagram-eye-btn flex items-center gap-1.5 px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-xs font-medium cursor-pointer"
            title="Visualizar diagrama na tela com zoom e navegação"
            aria-label="Visualizar diagrama na tela com zoom e navegação"
          >
            <!-- Ícone de Olho -->
            <svg class="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Visualizar</span>
          </button>
        </div>

        <!-- Viewport do Diagrama: Mostra todo na tela quando possível, permite scroll horizontal se exceder, sem scroll vertical no bloco -->
        <div
          class="diagram-viewport"
          tabindex="0"
          role="region"
          aria-label="Diagrama esquemático com rolagem horizontal independente"
        >
          ${svg}
        </div>
      `;

      // Registra evento no botão de Olho e calibra min-width se necessário
      const eyeBtn = card.querySelector('.diagram-eye-btn');
      const svgEl = card.querySelector('.diagram-viewport svg') as SVGElement;
      if (svgEl) {
        const viewBox = svgEl.viewBox?.baseVal;
        if (viewBox && viewBox.width > 480) {
          svgEl.style.minWidth = `${Math.min(viewBox.width, 560)}px`;
        }
      }

      if (eyeBtn && svgEl) {
        eyeBtn.addEventListener('click', () => {
          openDiagramModal(svgEl, title || 'Diagrama Esquemático / Fluxograma');
        });
      }

      // Substitui o bloco original pelo cartão renderizado
      el.parentNode?.replaceChild(card, el);
      card.setAttribute('data-diagram-processed', 'true');
    } catch (err) {
      console.warn('[DiagramManager] Erro ao renderizar diagrama mermaid:', err);
      // Mantém legível com aviso discreto
      el.setAttribute('data-diagram-processed', 'true');
    }
  }
}
