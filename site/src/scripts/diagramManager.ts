import mermaid from 'mermaid';

/**
 * Diagram Manager:
 * - Detecta blocos de código com linguagem 'mermaid' (```mermaid ... ```) e blocos com classe .diagram-block
 * - Renderiza os fluxogramas/diagramas com o Mermaid usando tema adaptado ao modo de leitura
 * - Empacota o SVG em um container ergonômico (.diagram-card):
 *    - Mostra todo o diagrama na tela quando possível sem corte vertical ou horizontal (object-fit: contain)
 *    - Se exceder a largura em telas estreitas, permite scroll horizontal livre (overflow-x: auto)
 *    - Limita a altura vertical máxima sem scroll vertical no bloco (max-height: 520px, overflow-y: hidden)
 *    - Adiciona botão com ícone de olho para abrir modal com visualização completa, pan (navegação) e zoom
 *    - Modal interativo com botões de zoom (+, -, reset), controle por mouse wheel, drag e pinch, e botão de X para fechar
 */

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
  imageElement: HTMLImageElement | null;
  targetWidth: number;
  targetHeight: number;
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
  imageElement: null,
  targetWidth: 800,
  targetHeight: 600,
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

  let modal = document.getElementById('diagram-zoom-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'diagram-zoom-modal';
    modal.className = 'diagram-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Visualizador com Zoom e Navegação');

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
              Visualizador
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
    setupModalEvents(modal);
  }

  modalRoot = modal;
  modalCanvas = modal.querySelector('#diagram-canvas');
  modalContent = modal.querySelector('#diagram-content');
  modalZoomLevelEl = modal.querySelector('.modal-zoom-display');
  modalTitleEl = modal.querySelector('.modal-title-text');

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
    modalContent.style.transition = smooth ? 'transform 0.15s ease-out' : 'none';
    modalContent.style.transform = `translate3d(${modalState.panX}px, ${modalState.panY}px, 0) scale(${modalState.scale})`;
    if (modalZoomLevelEl) {
      modalZoomLevelEl.textContent = `${Math.round(modalState.scale * 100)}%`;
    }
  }

  function setZoom(newScale: number, smooth = true): void {
    modalState.scale = Math.max(0.15, Math.min(6.0, newScale));
    applyTransform(smooth);
  }

  function resetView(): void {
    if (!modalContent || !modalCanvas) {
      modalState.scale = 1;
      modalState.panX = 0;
      modalState.panY = 0;
      applyTransform(true);
      return;
    }

    let w = modalState.targetWidth;
    let h = modalState.targetHeight;

    if (!w || !h) {
      if (modalState.svgElement) {
        w = parseFloat(modalState.svgElement.getAttribute('width') || '800') || 800;
        h = parseFloat(modalState.svgElement.getAttribute('height') || '600') || 600;
      } else if (modalState.imageElement) {
        w = modalState.imageElement.naturalWidth || 800;
        h = modalState.imageElement.naturalHeight || 600;
      } else {
        w = 800;
        h = 600;
      }
    }

    const canvasW = modalCanvas.clientWidth > 0 ? modalCanvas.clientWidth : window.innerWidth;
    const canvasH = modalCanvas.clientHeight > 0 ? modalCanvas.clientHeight : (window.innerHeight - 80);
    const padW = Math.max(200, canvasW * 0.90);
    const padH = Math.max(200, canvasH * 0.85);

    const fitScale = Math.min(padW / w, padH / h);
    modalState.scale = Math.max(0.15, Math.min(4.5, fitScale));
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
    const newScale = Math.max(0.15, Math.min(6.0, modalState.scale * zoomFactor));

    // Ajusta o pan para aproximar/afastar do ponto do mouse
    modalState.panX -= (mouseX - modalState.panX) * (newScale / modalState.scale - 1);
    modalState.panY -= (mouseY - modalState.panY) * (newScale / modalState.scale - 1);
    modalState.scale = newScale;

    applyTransform(false);
  }, { passive: false });

  // Evita drag padrão do navegador em imagens
  canvas?.addEventListener('dragstart', (e) => e.preventDefault());

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
      modalState.scale = Math.max(0.15, Math.min(6.0, modalState.initialScale * factor));
      applyTransform(false);
    }
  }, { passive: true });

  canvas?.addEventListener('touchend', (e: TouchEvent) => {
    if (e.touches.length === 1) {
      modalState.isDragging = true;
      modalState.startX = e.touches[0].clientX - modalState.panX;
      modalState.startY = e.touches[0].clientY - modalState.panY;
      modalState.initialPinchDist = 0;
    } else if (e.touches.length === 0) {
      modalState.isDragging = false;
      modalState.initialPinchDist = 0;
    }
  }, { passive: true });
}

/**
 * Abre o modal de visualização de diagrama com o SVG selecionado garantindo dimensões reais
 */
export function openDiagramModal(svgSource: SVGElement, title?: string): void {
  const modal = getOrCreateModal();
  // Mostra o modal e trava scroll da página ANTES de medir dimensões
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  modalContent.innerHTML = '';
  const clonedSvg = svgSource.cloneNode(true) as SVGElement;

  // Isola IDs de markers e defs no SVG clonado para evitar conflitos com o documento original
  const markerDefs = clonedSvg.querySelectorAll('defs marker[id], defs [id]');
  markerDefs.forEach((def) => {
    const oldId = def.getAttribute('id');
    if (!oldId) return;
    const newId = `${oldId}-modal`;
    def.setAttribute('id', newId);
    clonedSvg.querySelectorAll(`[marker-end="url(#${oldId})"]`).forEach((el) => {
      el.setAttribute('marker-end', `url(#${newId})`);
    });
    clonedSvg.querySelectorAll(`[marker-start="url(#${oldId})"]`).forEach((el) => {
      el.setAttribute('marker-start', `url(#${newId})`);
    });
    clonedSvg.querySelectorAll(`[marker-mid="url(#${oldId})"]`).forEach((el) => {
      el.setAttribute('marker-mid', `url(#${newId})`);
    });
    clonedSvg.querySelectorAll(`[fill="url(#${oldId})"]`).forEach((el) => {
      el.setAttribute('fill', `url(#${newId})`);
    });
  });

  // Obtém as dimensões reais do viewBox da SVG
  const vb = svgSource.viewBox?.baseVal;
  let w = vb && vb.width > 0 ? vb.width : (svgSource.clientWidth || 800);
  let h = vb && vb.height > 0 ? vb.height : (svgSource.clientHeight || 600);

  // Fixa dimensões intrínsecas explícitas no SVG clonado para que NUNCA colapse para 0x0
  clonedSvg.setAttribute('width', `${w}`);
  clonedSvg.setAttribute('height', `${h}`);
  clonedSvg.removeAttribute('style');
  clonedSvg.style.width = `${w}px`;
  clonedSvg.style.height = `${h}px`;
  clonedSvg.style.display = 'block';
  clonedSvg.style.maxWidth = 'none';
  clonedSvg.style.maxHeight = 'none';

  modalContent.appendChild(clonedSvg);
  modalState.svgElement = clonedSvg;
  modalState.imageElement = null;
  modalState.targetWidth = w;
  modalState.targetHeight = h;

  if (modalTitleEl) {
    modalTitleEl.textContent = title || 'Visualizador de Diagrama';
  }

  // Dimensões da janela visível para ajuste inicial automático
  const canvasW = (modalCanvas && modalCanvas.clientWidth > 0) ? modalCanvas.clientWidth : window.innerWidth;
  const canvasH = (modalCanvas && modalCanvas.clientHeight > 0) ? modalCanvas.clientHeight : (window.innerHeight - 80);

  const padW = Math.max(200, canvasW * 0.90);
  const padH = Math.max(200, canvasH * 0.85);

  // Escala que ajusta perfeitamente o diagrama para preencher a tela no carregamento inicial
  const fitScale = Math.min(padW / w, padH / h);
  modalState.scale = Math.max(0.15, Math.min(4.5, fitScale));
  modalState.panX = 0;
  modalState.panY = 0;
  modalState.isDragging = false;

  modalContent.style.transform = `translate3d(0, 0, 0) scale(${modalState.scale})`;
  if (modalZoomLevelEl) {
    modalZoomLevelEl.textContent = `${Math.round(modalState.scale * 100)}%`;
  }
}

/**
 * Abre o modal de visualização para uma imagem (PNG/JPG/SVG) com suporte a zoom, pan e ajuste responsivo
 */
export function openImageModal(imgSrc: string, title?: string): void {
  const modal = getOrCreateModal();
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const content = modalContent || modal.querySelector('#diagram-content') as HTMLElement;
  if (!content) return;
  modalContent = content;
  content.innerHTML = '';

  const img = document.createElement('img');
  img.src = imgSrc;
  img.alt = title || 'Imagem';
  img.style.display = 'block';
  img.style.maxWidth = 'none';
  img.style.maxHeight = 'none';
  img.style.userSelect = 'none';
  (img.style as any).webkitUserDrag = 'none';

  modalContent.appendChild(img);
  modalState.svgElement = null;
  modalState.imageElement = img;

  if (modalTitleEl) {
    modalTitleEl.textContent = title || 'Visualizador de Imagem';
  }

  const applyInitialFit = (width: number, height: number) => {
    modalState.targetWidth = width;
    modalState.targetHeight = height;

    const canvasW = (modalCanvas && modalCanvas.clientWidth > 0) ? modalCanvas.clientWidth : window.innerWidth;
    const canvasH = (modalCanvas && modalCanvas.clientHeight > 0) ? modalCanvas.clientHeight : (window.innerHeight - 80);

    const padW = Math.max(200, canvasW * 0.90);
    const padH = Math.max(200, canvasH * 0.85);

    const fitScale = Math.min(padW / width, padH / height);
    modalState.scale = Math.max(0.15, Math.min(4.5, fitScale));
    modalState.panX = 0;
    modalState.panY = 0;
    modalState.isDragging = false;

    if (modalContent) {
      modalContent.style.transition = 'none';
      modalContent.style.transform = `translate3d(0, 0, 0) scale(${modalState.scale})`;
    }
    if (modalZoomLevelEl) {
      modalZoomLevelEl.textContent = `${Math.round(modalState.scale * 100)}%`;
    }
  };

  if (img.complete && img.naturalWidth > 0) {
    applyInitialFit(img.naturalWidth, img.naturalHeight);
  } else {
    applyInitialFit(800, 600);
    img.onload = () => {
      applyInitialFit(img.naturalWidth, img.naturalHeight);
    };
  }
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
 * Retorna as variáveis de tema refinadas no estilo acadêmico clássico
 */
function getMermaidConfig(isDark: boolean, isOled: boolean) {
  return {
    startOnLoad: false,
    securityLevel: 'loose' as const,
    theme: 'base' as const,
    themeVariables: {
      darkMode: isDark,
      fontFamily: 'var(--reader-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
      fontSize: '13px',
      primaryColor: isDark ? (isOled ? '#141414' : '#1e2229') : '#fdfbf7',
      primaryTextColor: isDark ? '#e6e4df' : '#221e1a',
      primaryBorderColor: isDark ? '#4a5568' : '#7d6f61',
      lineColor: isDark ? '#9da7b7' : '#5c5042',
      secondaryColor: isDark ? '#16191f' : '#f4ebd9',
      tertiaryColor: isDark ? '#0f1115' : '#fcf8ef',
      clusterBkg: isDark ? (isOled ? '#0a0a0a' : '#16191f') : '#f5ece0',
      clusterBorder: isDark ? '#3d4450' : '#b8a896',
      edgeLabelBackground: isDark ? '#1e2229' : '#fdfbf7',
      nodeBorder: isDark ? '#4a5568' : '#7d6f61',
      mainBkg: isDark ? (isOled ? '#141414' : '#1e2229') : '#fdfbf7',
      titleColor: isDark ? '#e6e4df' : '#221e1a',
    },
    flowchart: {
      htmlLabels: true,
      curve: 'basis' as const,
      padding: 16,
      nodeSpacing: 42,
      rankSpacing: 42,
      useMaxWidth: false,
    },
  };
}

/**
 * Inicializa e processa todos os diagramas da página
 */
export async function initDiagrams(): Promise<void> {
  if (typeof window === 'undefined') return;

  getOrCreateModal();

  const currentTheme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('study_theme') || 'paper';
  const isDark = currentTheme === 'dark' || currentTheme === 'oled';
  const isOled = currentTheme === 'oled';

  mermaid.initialize(getMermaidConfig(isDark, isOled));

  // 1. Re-renderiza cartões já criados se o tema tiver mudado
  const existingCards = Array.from(
    document.querySelectorAll<HTMLElement>('.diagram-card[data-mermaid-code]')
  );

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
          setupSvgResponsive(svgEl);
          const eyeBtn = card.querySelector('.diagram-eye-btn');
          if (eyeBtn) {
            eyeBtn.onclick = () => {
              openDiagramModal(svgEl, title || 'Diagrama Esquemático / Fluxograma');
            };
          }
        }
      }
    } catch {
      // Ignora falhas de re-renderização pontual
    }
  }

  // 2. Inicializa diagramas de blocos especializados de sistemas (.system-block-card)
  document.querySelectorAll<HTMLElement>('.system-block-card').forEach((card) => {
    if (card.dataset.diagramProcessed === 'true') return;
    const eyeBtn = card.querySelector('.diagram-eye-btn');
    const svgEl = card.querySelector('.diagram-viewport svg') as SVGElement;
    const title = card.dataset.diagramTitle || 'Diagrama de Blocos de Sistemas';

    if (svgEl) {
      setupSvgResponsive(svgEl);
      const viewport = card.querySelector('.diagram-viewport');
      viewport?.addEventListener('dblclick', (e) => {
        e.preventDefault();
        openDiagramModal(svgEl, title);
      });
    }

    if (eyeBtn && svgEl) {
      eyeBtn.addEventListener('click', () => {
        openDiagramModal(svgEl, title);
      });
    }

    card.setAttribute('data-diagram-processed', 'true');
  });

  // 3. Inicializa imagens com zoom interativo (executa SEMPRE)
  setupZoomableImages();

  // 4. Busca blocos gerados por markdown (```mermaid) e blocos dedicados .diagram-block
  const mermaidCodeBlocks = Array.from(
    document.querySelectorAll<HTMLElement>('.academic-prose pre[data-language="mermaid"], pre.astro-code[data-language="mermaid"]')
  );
  const customDiagramBlocks = Array.from(
    document.querySelectorAll<HTMLElement>('.diagram-block')
  );

  const targets = [...mermaidCodeBlocks, ...customDiagramBlocks];
  if (targets.length === 0) return;

  for (let i = 0; i < targets.length; i++) {
    const el = targets[i];
    if (el.dataset.diagramProcessed === 'true') continue;

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

    const titleMatch = code.match(/%%\s*title:\s*(.+)/i);
    if (titleMatch && !title) {
      title = titleMatch[1].trim();
    }

    const diagramId = `mermaid-diagram-${Date.now()}-${i}`;

    try {
      const { svg } = await mermaid.render(diagramId, code);

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
            title="Visualizar diagrama completo com zoom e navegação"
            aria-label="Visualizar diagrama completo com zoom e navegação"
          >
            <svg class="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Visualizar</span>
          </button>
        </div>

        <div
          class="diagram-viewport"
          tabindex="0"
          role="region"
          aria-label="Diagrama esquemático com rolagem horizontal independente"
        >
          ${svg}
        </div>
      `;

      const eyeBtn = card.querySelector('.diagram-eye-btn');
      const svgEl = card.querySelector('.diagram-viewport svg') as SVGElement;
      if (svgEl) {
        setupSvgResponsive(svgEl);
      }

      if (eyeBtn && svgEl) {
        eyeBtn.addEventListener('click', () => {
          openDiagramModal(svgEl, title || 'Diagrama Esquemático / Fluxograma');
        });
      }

      el.parentNode?.replaceChild(card, el);
      card.setAttribute('data-diagram-processed', 'true');
    } catch (err) {
      console.warn('[DiagramManager] Erro ao renderizar diagrama mermaid:', err);
      el.setAttribute('data-diagram-processed', 'true');
    }
  }
}

/**
 * Configura o comportamento de clique para abrir o modal em todas as imagens ampliáveis
 */
export function setupZoomableImages(): void {
  if (typeof window === 'undefined') return;

  // Delegação global: garante que qualquer imagem com atributo ou classe de zoom abra o visualizador interativo
  if (!(window as any).__hasImageZoomDelegation) {
    (window as any).__hasImageZoomDelegation = true;
    document.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement)?.closest('img[data-zoomable-image], .zoomable-question-image');
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        const src = (target as HTMLImageElement).src || target.getAttribute('src');
        const title = target.getAttribute('data-image-title') || target.getAttribute('alt') || 'Visualização da Imagem';
        if (src) {
          openImageModal(src, title);
        }
      }
    });
  }
}

if (typeof window !== 'undefined') {
  (window as any).openImageModal = openImageModal;
  (window as any).openDiagramModal = openDiagramModal;
}

/**
 * Calibra a visualização da SVG para que caiba com perfeição sem cortes
 */
function setupSvgResponsive(svgEl: SVGElement): void {
  const vb = svgEl.viewBox?.baseVal;
  if (!vb) return;

  // Garante que o SVG escale proporcionalmente mantendo seu aspect ratio natural
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgEl.style.maxWidth = '100%';
  svgEl.style.maxHeight = '480px';
  svgEl.style.width = 'auto';
  svgEl.style.height = 'auto';
  svgEl.style.display = 'block';

  // Se o diagrama for largo (> 520px) em telas estreitas, garante largura mínima legível para acionar scroll horizontal
  if (vb.width > 520) {
    svgEl.style.minWidth = `min(${vb.width}px, 520px)`;
  }
}
