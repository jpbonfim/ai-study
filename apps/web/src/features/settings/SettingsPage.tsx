import type { SessionInfo } from '@ai-study/server/api-types';
import { useQuery } from '@tanstack/react-query';
import katex from 'katex';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client';
import { HeaderActions } from '../../components/HeaderActions';
import { DesktopSidebarOpenButton, MobileMenuIcon, SidebarBackdrop } from '../../components/SidebarChrome';
import { applyCodeThemeToCards } from '../../enhancers/code-blocks';
import { initTableOptimizer } from '../../enhancers/table-optimizer';
import { getPreviousLocation } from '../../lib/navigation-history';
import { usePageChrome } from '../../lib/page-chrome';
import { clearStudyCache } from '../../lib/study-cache';
import { readLastVisited } from '../../lib/study-history';
import { useSidebar } from '../../lib/use-sidebar';
import { listKeys, removeItem } from '../../preferences/storage';
import { cacheStats } from '../../render/render-cache';
import previewCodeHtml from './preview-code.html?raw';
import {
  CODE_FONTS,
  CODE_THEME_COLORS,
  CODE_THEME_LABELS,
  DEFAULT_SETTINGS,
  FONTS,
  isDirty,
  loadSavedSettings,
  normalizePx,
  persistSettings,
  type ReadingSettings,
  TEXT_ALIGN_LABELS,
} from './reading-settings';

const PREVIEW_MATH = {
  inline: katex.renderToString('\\omega_s > 2\\omega_M \\iff f_s > 2f_M', { throwOnError: false }),
  fraction: katex.renderToString('H(e^{j\\omega}) = \\frac{X_c(j\\Omega_s)}{1 - a_1 z^{-1}} + \\frac{x_n}{2}', {
    throwOnError: false,
  }),
  display: katex.renderToString('y[n] = \\sum_{k=0}^{M} b_k x_{n-k} + e^{j\\omega_0 n}', {
    displayMode: true,
    throwOnError: false,
  }),
};

/** Keys cleared together with the render cache ("Limpar Cache do Navegador"). */
const CACHE_KEY_PREFIXES = ['study_cache_', 'study_recent_questions_', 'study_toc_', 'study_manifest_'];

type StatusKind = 'saved' | 'reset' | 'cache-cleared';
type StatusMessage = { kind: StatusKind } | null;

/** Classes of an option card: selected in the draft (accent border) or not. */
function optionClass(base: string, selected: boolean): string {
  return selected
    ? `${base} border-2 border-[var(--accent)] bg-[var(--accent-subtle)]`
    : `${base} border-[var(--border-subtle)]`;
}

function SavedTag({
  className,
  saved,
  children = '✓ Salvo',
}: {
  className: string;
  saved: boolean;
  children?: ReactNode;
}) {
  return <span className={`${className}${saved ? '' : ' hidden'}`}>{children}</span>;
}

function Section({
  title,
  description,
  badge,
  badgeId,
  bordered = false,
  children,
}: {
  title: string;
  description: string;
  badge: string;
  badgeId: string;
  bordered?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`p-6 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] ${bordered ? 'space-y-6' : 'space-y-4'}`}
    >
      <div
        className={`flex items-center justify-between${bordered ? ' border-b border-[var(--border-subtle)] pb-4' : ''}`}
      >
        <div>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: section heading markup kept as before. */}
          <label className="font-bold text-[var(--text-primary)] text-base block">{title}</label>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">{description}</p>
        </div>
        <span
          id={badgeId}
          className="font-mono text-xs text-[var(--accent)] font-semibold bg-[var(--bg-subtle)] px-2.5 py-1 rounded border border-[var(--border-subtle)]"
        >
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function CustomValueRow({
  label,
  inputId,
  buttonId,
  value,
  min,
  max,
  step,
  unit,
  width,
  onChange,
  onApply,
  blur,
}: {
  label: string;
  inputId: string;
  buttonId: string;
  value: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  width: string;
  onChange: (value: string) => void;
  onApply: () => void;
  blur: () => void;
}) {
  return (
    <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
      <span className="text-[var(--text-secondary)] font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          id={inputId}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={blur}
          className={`${width} px-3 py-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-page)] text-[var(--text-primary)] font-mono font-bold text-center focus:outline-none focus:border-[var(--accent)]`}
        />
        <span className="font-mono text-[var(--text-muted)]">{unit}</span>
        <button
          type="button"
          id={buttonId}
          onClick={onApply}
          className="px-3 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--accent)] font-semibold transition-colors cursor-pointer"
        >
          Testar
        </button>
      </div>
    </div>
  );
}

/** Number input that edits a draft value but keeps showing the user's typing while focused. */
function useCustomInput(draftValue: string, toInput: (draft: string) => string, apply: (input: string) => void) {
  const [text, setText] = useState(() => toInput(draftValue));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(toInput(draftValue));
  }, [draftValue, toInput]);
  return {
    value: text,
    onChange: (value: string) => {
      focused.current = true;
      setText(value);
      apply(value);
    },
    onApply: () => apply(text),
    blur: () => {
      focused.current = false;
    },
  };
}

const PX_PRESETS = {
  fontSize: [
    ['16px', 'Pequeno'],
    ['18px', 'Padrão'],
    ['20px', 'Grande'],
    ['22px', 'Muito Grande'],
  ],
  maxWidth: [
    ['672px', 'Estreita'],
    ['768px', 'Padrão Livro'],
    ['896px', 'Ampla'],
    ['1088px', 'Máxima'],
  ],
  codeSize: [
    ['12px', 'Compacto'],
    ['13px', 'Padrão'],
    ['14px', 'Médio'],
    ['15px', 'Grande'],
  ],
} as const;

const ALIGN_OPTIONS: [string, string, string, string][] = [
  ['justify', 'Justificado', 'Padrão Livro', 'M4 6h16M4 10h16M4 14h16M4 18h16'],
  ['left', 'À Esquerda', 'Padrão Web', 'M4 6h16M4 10h12M4 14h16M4 18h10'],
  ['center', 'Centralizado', 'Simétrico', 'M4 6h16M6 10h12M4 14h16M7 18h10'],
  ['right', 'À Direita', 'Margem Direita', 'M4 6h16M8 10h12M4 14h16M10 18h10'],
];

const FONT_OPTIONS: [string, string, string, string][] = [
  [
    'garamond',
    "'Newsreader', 'EB Garamond', Georgia, serif",
    'Garamond / Newsreader',
    'Serif clássica de livro didático universitário e LaTeX (Padrão).',
  ],
  [
    'lora',
    "'Lora', Charter, Georgia, serif",
    'Lora / Charter',
    'Serif moderna editorial com contraste suave e leitura fluida.',
  ],
  [
    'sans',
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    'Inter / Sans-Serif',
    'Sans-serif contemporânea de alta legibilidade em monitores.',
  ],
  [
    'mono',
    "'JetBrains Mono', monospace",
    'JetBrains Mono',
    'Monoespaçada técnica com alinhamento rigoroso caractere a caractere.',
  ],
];

const CODE_THEME_OPTIONS: [string, string, string, string, string][] = [
  ['mocha', 'Mocha', 'Catppuccin', '#cba6f7', '#1e1e2e'],
  ['tokyo', 'Tokyo Night', 'Tokyo Deep', '#7aa2f7', '#1a1b26'],
  ['dracula', 'Dracula', 'Vampire Contrast', '#bd93f9', '#282a36'],
  ['onedark', 'One Dark', 'Atom Editorial', '#61afef', '#282c34'],
  ['monokai', 'Monokai', 'Classic Vibrant', '#a6e22e', '#272822'],
];

const CODE_FONT_OPTIONS: [string, string, string, string][] = [
  [
    'jetbrains',
    "'JetBrains Mono', monospace",
    'JetBrains Mono',
    'Otimizada para leitura técnica de equações e algoritmos.',
  ],
  ['fira', "'Fira Code', monospace", 'Fira Code', 'Geométrica e nítida com caracteres diferenciados.'],
  [
    'system',
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    'SF Mono / Sistema',
    'Nativa do sistema operacional (alta performance gráfica).',
  ],
  [
    'courier',
    "'Courier New', Courier, monospace",
    'Courier New (Retrô)',
    'Estilo clássico de relatórios científicos impressos.',
  ],
];

const MATH_SCALE_OPTIONS: [string, string, string][] = [
  ['0.58', 'Muito Compacto', '58% (0.58em)'],
  ['0.64', 'Compacto', '64% (0.64em)'],
  ['0.70', 'Padrão TeX', '70% (0.70em)'],
  ['0.78', 'Destacado', '78% (0.78em)'],
];

const MATH_MIN_OPTIONS: [string, string, string][] = [
  ['0px', 'Sem Limite', '0px (Desativado)'],
  ['9px', 'Compacto', '9px'],
  ['10.5px', 'Recomendado', '10.5px'],
  ['12px', 'Confortável', '12px'],
];

const pxNumber = (value: string) => String(Number.parseInt(value, 10) || 0);

export function SettingsPage(_props: { session: SessionInfo }) {
  usePageChrome('Configurações de Leitura | Cadernos de Estudo');
  const sidebar = useSidebar();
  const navigate = useNavigate();
  const subjectsQuery = useQuery({ queryKey: ['subjects'], queryFn: api.subjects });
  const activeSubjects = useMemo(
    () =>
      [...(subjectsQuery.data?.own ?? []), ...(subjectsQuery.data?.shared ?? [])].filter((m) => m.status === 'active'),
    [subjectsQuery.data],
  );

  const [saved, setSaved] = useState<ReadingSettings>(loadSavedSettings);
  const [draft, setDraft] = useState<ReadingSettings>(saved);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [cacheInfo, setCacheInfo] = useState('Calculando tamanho...');
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const previewCardRef = useRef<HTMLDivElement>(null);
  const previewCodeRef = useRef<HTMLPreElement>(null);

  const update = (patch: Partial<ReadingSettings>) => {
    setStatus(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  useEffect(() => {
    void cacheStats().then((stats) => {
      setCacheInfo(
        stats.count === 0
          ? '0 itens em cache (0 KB)'
          : `${stats.count} ${stats.count === 1 ? 'item' : 'itens'} em cache (~${(stats.bytes / 1024).toFixed(1)} KB)`,
      );
    });
  }, []);

  // Live preview: draft values on the preview box, plus the document-wide properties the
  // previous version also previewed (alignment, math sizes, code theme).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--reader-text-align', draft.textAlign);
    root.setAttribute('data-text-align', draft.textAlign);
    root.style.setProperty('--katex-script-scale', draft.mathScriptScale);
    root.style.setProperty('--katex-min-font-size', draft.mathMinSize);
    root.setAttribute('data-code-theme', draft.codeTheme);

    const colors = CODE_THEME_COLORS[draft.codeTheme] ?? CODE_THEME_COLORS.mocha;
    const card = previewCardRef.current;
    if (card && colors) {
      card.setAttribute('data-code-theme', draft.codeTheme);
      card.style.setProperty('--code-card-bg', colors.bg);
      card.style.setProperty('--code-card-header-bg', colors.headerBg);
      card.style.setProperty('--code-card-border', colors.border);
      card.style.setProperty('--code-card-text', colors.text);
      card.style.setProperty('--code-badge-color', colors.badge);
      card.style.backgroundColor = colors.bg;
      card.style.borderColor = colors.border;
      const header = card.querySelector<HTMLElement>('.code-block-header');
      if (header) {
        header.style.backgroundColor = colors.headerBg;
        header.style.borderBottomColor = colors.border;
      }
      const badge = card.querySelector<HTMLElement>('.code-block-lang');
      if (badge) badge.style.color = colors.badge;
    }
    const pre = previewCodeRef.current;
    if (pre) {
      pre.style.fontFamily = draft.codeFont;
      pre.style.fontSize = draft.codeSize;
      pre.style.setProperty('--code-font-family', draft.codeFont);
      pre.style.setProperty('--code-font-size', draft.codeSize);
      const inner = pre.querySelector<HTMLElement>('#preview-sample-code-inner');
      if (inner) {
        inner.style.fontFamily = draft.codeFont;
        inner.style.fontSize = draft.codeSize;
        inner.querySelectorAll<HTMLElement>('span').forEach((span) => {
          const color = span.style.getPropertyValue(`--shiki-${draft.codeTheme}`);
          if (color) span.style.color = color;
        });
      }
    }
    // The sample table is sized once, with the preview typography already applied.
    initTableOptimizer();
  }, [draft]);

  function save(next: ReadingSettings, message: StatusKind = 'saved') {
    persistSettings(next);
    applyCodeThemeToCards(next.codeTheme);
    setSaved(next);
    setDraft(next);
    setStatus({ kind: message });
  }

  async function clearBrowserCache() {
    setCacheClearing(true);
    await clearStudyCache();
    for (const key of listKeys()) {
      if (CACHE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) removeItem(key);
    }
    try {
      sessionStorage.clear();
    } catch {
      // Ignore.
    }
    try {
      if ('caches' in window) {
        const names = await window.caches.keys();
        await Promise.all(names.map((name) => window.caches.delete(name)));
      }
    } catch {
      // Ignore.
    }
    setCacheCleared(true);
    setStatus({ kind: 'cache-cleared' });
    setCacheInfo('0 itens em cache (0 KB)');
    setTimeout(() => window.location.reload(), 900);
  }

  function closeSettings() {
    const previous = getPreviousLocation();
    if (previous && !previous.startsWith('/configuracoes')) {
      navigate(previous);
      return;
    }
    const last = readLastVisited();
    const target = last ? last.lastUrl || last.url || (last.slug ? `/${last.slug}` : null) : null;
    navigate(target || '/');
  }

  const sizeInput = useCustomInput(draft.fontSize, pxNumber, (value) => {
    const n = Number.parseInt(value, 10);
    if (n && n >= 10 && n <= 40) update({ fontSize: `${n}px` });
  });
  const widthInput = useCustomInput(draft.maxWidth, pxNumber, (value) => {
    const n = Number.parseInt(value, 10);
    if (n && n >= 400 && n <= 2500) update({ maxWidth: `${n}px` });
  });
  const codeSizeInput = useCustomInput(draft.codeSize, pxNumber, (value) => {
    const n = Number.parseInt(value, 10);
    if (n && n >= 8 && n <= 36) update({ codeSize: `${n}px` });
  });
  const mathScaleInput = useCustomInput(
    draft.mathScriptScale,
    (v) => String(Math.round((Number.parseFloat(v) || 0.64) * 100)),
    (value) => {
      const n = Number.parseFloat(value);
      if (!Number.isNaN(n) && n >= 30 && n <= 100) update({ mathScriptScale: (n / 100).toFixed(2) });
    },
  );
  const mathMinInput = useCustomInput(
    draft.mathMinSize,
    (v) => String(Number.parseFloat(v) || 0),
    (value) => {
      const n = Number.parseFloat(value);
      if (!Number.isNaN(n) && n >= 0 && n <= 30) update({ mathMinSize: `${n}px` });
    },
  );

  const dirty = isDirty(draft, saved);
  const fontLabel = FONTS[draft.fontKey]?.label ?? draft.fontKey;
  const alignLabel = TEXT_ALIGN_LABELS[draft.textAlign] ?? draft.textAlign;
  const mathScaleClose = (a: string, b: string) => Math.abs(Number.parseFloat(a) - Number.parseFloat(b)) < 0.015;

  let statusContent: ReactNode = dirty
    ? 'Você possui alterações na prévia que ainda não foram salvas no site.'
    : 'As configurações exibidas abaixo estão sincronizadas com todo o site.';
  if (status?.kind === 'saved') {
    statusContent = (
      <>
        <strong className="text-emerald-600 dark:text-emerald-400">✓ Alterações salvas com sucesso!</strong> Todo o site
        foi atualizado.
      </>
    );
  } else if (status?.kind === 'reset') {
    statusContent = (
      <strong className="text-emerald-600 dark:text-emerald-400">✓ Padrões de fábrica restaurados!</strong>
    );
  } else if (status?.kind === 'cache-cleared') {
    statusContent = (
      <strong className="text-emerald-600 dark:text-emerald-400">✓ Cache do navegador limpo com sucesso!</strong>
    );
  }

  const closeButton = (className: string, content: ReactNode, label?: string) => (
    <button type="button" className={`close-settings-action ${className}`} aria-label={label} onClick={closeSettings}>
      {content}
    </button>
  );

  const xIcon = (className: string) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  const trashIcon = (className: string) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );

  return (
    <>
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-page)]/95 backdrop-blur-md shadow-xs w-full min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            id="mobile-sidebar-toggle"
            type="button"
            aria-label="Abrir Menu de Navegação"
            className="sans-ui p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer shadow-xs"
            onClick={sidebar.openMobile}
          >
            <MobileMenuIcon className="w-5 h-5" />
          </button>
          <span className="font-serif text-sm font-bold truncate text-[var(--text-primary)]">Configurações</span>
        </div>
        {closeButton(
          'sans-ui inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold cursor-pointer shadow-xs transition-colors shrink-0',
          <>
            {xIcon('w-3.5 h-3.5')}
            <span>Fechar</span>
          </>,
          'Fechar Configurações e Voltar',
        )}
      </header>

      <div className="h-14 lg:hidden w-full shrink-0" aria-hidden="true" />

      <div className="flex w-full min-w-0">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: delegated handler only closes the mobile drawer after link clicks. */}
        <aside
          id="settings-sidebar"
          className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] ${sidebar.mobileOpen ? '' : '-translate-x-full '}lg:translate-x-0 transition-transform duration-200 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col justify-between overflow-y-auto p-6 space-y-6`}
          onClick={sidebar.onSidebarClick}
        >
          <div className="space-y-6">
            <div className="space-y-3 pb-5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-2">
                {closeButton(
                  'sans-ui inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer',
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                      />
                    </svg>
                    <span>Voltar à Leitura</span>
                  </>,
                )}
                <HeaderActions onCloseSidebar={sidebar.close} />
              </div>
              <div className="pt-1">
                <span className="sans-ui text-[11px] font-mono uppercase tracking-widest text-[var(--accent)] block font-semibold">
                  Painel do Estudante
                </span>
                <h2 className="font-serif text-lg font-bold text-[var(--text-primary)] leading-snug mt-1">
                  Configurações
                </h2>
              </div>
            </div>

            <div className="space-y-3">
              <div className="sans-ui text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Ir para Disciplina
              </div>
              <nav className="space-y-1 text-sm sans-ui">
                {activeSubjects.map((m) => (
                  <Link
                    key={`${m.ownerUserId}:${m.slug}`}
                    to={`/${m.slug}`}
                    className="block px-2.5 py-1.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {m.name} ({m.code})
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          <div className="p-4 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)] sans-ui">
            Preferências persistidas localmente
          </div>
        </aside>

        <SidebarBackdrop id="settings-sidebar-backdrop" open={sidebar.mobileOpen} onClose={sidebar.closeMobile} />
        <DesktopSidebarOpenButton onClick={sidebar.expandDesktop} />

        <main id="main-content-area" className="flex-1 lg:pl-80 w-full min-w-0 transition-[padding] duration-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 lg:px-12 py-10 sm:py-16 space-y-10 w-full min-w-0">
            <header className="pb-6 border-b border-[var(--border-strong)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="sans-ui text-xs font-mono uppercase tracking-wider text-[var(--accent)] font-semibold">
                    Personalização da Leitura
                  </div>
                  <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
                    Configurações de Exibição
                  </h1>
                </div>
                {closeButton(
                  'sans-ui inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-bold transition-all shadow-xs cursor-pointer self-start sm:self-auto shrink-0',
                  <>
                    {xIcon('w-4 h-4 text-[var(--text-secondary)]')}
                    <span>Fechar</span>
                  </>,
                )}
              </div>
              <p className="font-serif text-base text-[var(--text-secondary)] italic">
                Ajuste a tipografia, proporções e largura de leitura. Veja a demonstração em tempo real e clique em{' '}
                <strong>Salvar Alterações</strong> para aplicar a todo o site.
              </p>
            </header>

            <div
              id="status-banner"
              className="sans-ui p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  id="status-dot"
                  className={
                    dirty
                      ? 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0'
                      : 'w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0'
                  }
                />
                <span id="status-message" className="text-[var(--text-secondary)] font-medium">
                  {statusContent}
                </span>
              </div>
              <button
                type="button"
                id="top-save-btn"
                onClick={() => save(draft)}
                className="px-4 py-1.5 rounded border border-[var(--accent)] bg-[var(--accent)] hover:opacity-90 text-white dark:text-black font-semibold cursor-pointer transition-opacity shadow-xs shrink-0"
              >
                Salvar Alterações
              </button>
            </div>

            <div className="space-y-8 sans-ui text-sm">
              <Section
                title="1. Família Tipográfica"
                description="Selecione o estilo de letra para os resumos e fórmulas:"
                badge={`${FONTS[saved.fontKey]?.label ?? saved.fontKey} (Salvo)`}
                badgeId="active-font-badge"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {FONT_OPTIONS.map(([key, family, label, description]) => (
                    <button
                      key={key}
                      type="button"
                      data-font={key}
                      onClick={() => update({ fontKey: key, fontFamily: FONTS[key]?.family ?? draft.fontFamily })}
                      className={optionClass(
                        'font-opt-btn relative p-3.5 rounded-lg border text-left transition-all cursor-pointer bg-[var(--bg-page)]',
                        draft.fontKey === key,
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ fontFamily: family }} className="text-base font-bold">
                          {label}
                        </span>
                        <SavedTag
                          className="font-status-tag text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-bold text-[var(--accent)] border border-[var(--accent)]"
                          saved={saved.fontKey === key}
                        >
                          Salvo
                        </SavedTag>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] leading-relaxed">{description}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section
                title="2. Tamanho da Fonte"
                description="Escolha um tamanho pré-definido ou digite o número em pixels que preferir:"
                badge={`${saved.fontSize} (Salvo)`}
                badgeId="active-size-badge"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {PX_PRESETS.fontSize.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      data-size={value}
                      onClick={() => update({ fontSize: normalizePx(value) })}
                      className={optionClass(
                        'size-opt-btn relative p-3 rounded-lg border text-center transition-all cursor-pointer bg-[var(--bg-page)]',
                        draft.fontSize === value,
                      )}
                    >
                      <span className="font-bold block text-sm">{label}</span>
                      <span className="text-xs text-[var(--text-muted)] font-mono">{value}</span>
                      <SavedTag
                        className="size-status-tag text-[9px] font-mono block mt-1 font-bold text-[var(--accent)]"
                        saved={saved.fontSize === value}
                      />
                    </button>
                  ))}
                </div>
                <CustomValueRow
                  label="Ou digite qualquer valor numérico:"
                  inputId="custom-size-input"
                  buttonId="apply-custom-size-btn"
                  min={12}
                  max={36}
                  step={1}
                  unit="pixels (px)"
                  width="w-24"
                  {...sizeInput}
                />
              </Section>

              <Section
                title="3. Largura Máxima do Texto"
                description="Largura da coluna central de leitura para conforto visual:"
                badge={`${saved.maxWidth} (Salvo)`}
                badgeId="active-width-badge"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {PX_PRESETS.maxWidth.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      data-width={value}
                      onClick={() => update({ maxWidth: normalizePx(value) })}
                      className={optionClass(
                        'width-opt-btn relative p-3 rounded-lg border text-center transition-all cursor-pointer bg-[var(--bg-page)]',
                        draft.maxWidth === value,
                      )}
                    >
                      <span className="font-bold block text-sm">{label}</span>
                      <span className="text-xs text-[var(--text-muted)] font-mono">{value}</span>
                      <SavedTag
                        className="width-status-tag text-[9px] font-mono block mt-1 font-bold text-[var(--accent)]"
                        saved={saved.maxWidth === value}
                      />
                    </button>
                  ))}
                </div>
                <CustomValueRow
                  label="Ou digite a largura exata em pixels:"
                  inputId="custom-width-input"
                  buttonId="apply-custom-width-btn"
                  min={450}
                  max={2200}
                  step={10}
                  unit="pixels (px)"
                  width="w-28"
                  {...widthInput}
                />
              </Section>

              <Section
                title="4. Alinhamento do Texto"
                description="Defina o alinhamento das linhas dos cadernos teóricos e resoluções:"
                badge={`${TEXT_ALIGN_LABELS[saved.textAlign] ?? saved.textAlign} (Salvo)`}
                badgeId="active-align-badge"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {ALIGN_OPTIONS.map(([value, label, hint, icon]) => (
                    <button
                      key={value}
                      type="button"
                      data-align-opt={value}
                      onClick={() => update({ textAlign: value })}
                      className={optionClass(
                        'align-opt-btn relative p-3 rounded-lg border text-center transition-all cursor-pointer bg-[var(--bg-page)]',
                        draft.textAlign === value,
                      )}
                    >
                      <div className="flex items-center justify-center mb-1 text-[var(--accent)]">
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                        </svg>
                      </div>
                      <span className="font-bold block text-sm">{label}</span>
                      <span className="text-[11px] text-[var(--text-muted)] font-mono">{hint}</span>
                      <SavedTag
                        className="align-status-tag text-[9px] font-mono block mt-1 font-bold text-[var(--accent)]"
                        saved={saved.textAlign === value}
                      />
                    </button>
                  ))}
                </div>
              </Section>

              <Section
                bordered
                title="5. Exibição de Blocos de Código"
                description="Personalize o tema visual, a fonte monoespaçada e o tamanho das fontes dos algoritmos:"
                badge={`${CODE_THEME_LABELS[saved.codeTheme] ?? saved.codeTheme} • ${CODE_FONTS[saved.codeFontKey]?.label ?? saved.codeFontKey} • ${saved.codeSize} (Salvo)`}
                badgeId="active-code-badge"
              >
                <div className="space-y-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                    Tema de Cores do Código
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {CODE_THEME_OPTIONS.map(([value, label, hint, dot, ring]) => (
                      <button
                        key={value}
                        type="button"
                        data-code-theme-opt={value}
                        onClick={() => update({ codeTheme: value })}
                        className={optionClass(
                          'code-theme-opt-btn relative p-3 rounded-lg border text-left transition-all cursor-pointer bg-[var(--bg-page)]',
                          draft.codeTheme === value,
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="w-3 h-3 rounded-full border"
                            style={{ backgroundColor: dot, borderColor: ring }}
                          />
                          <span className="font-bold text-xs">{label}</span>
                        </div>
                        <span className="text-[11px] text-[var(--text-muted)] block leading-tight">{hint}</span>
                        <SavedTag
                          className="code-theme-status-tag text-[9px] font-mono block mt-1 font-bold text-[var(--accent)]"
                          saved={saved.codeTheme === value}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                    Família da Fonte Monoespaçada
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {CODE_FONT_OPTIONS.map(([key, family, label, description]) => (
                      <button
                        key={key}
                        type="button"
                        data-code-font-opt={key}
                        onClick={() =>
                          update({ codeFontKey: key, codeFont: CODE_FONTS[key]?.family ?? draft.codeFont })
                        }
                        className={optionClass(
                          'code-font-opt-btn relative p-3 rounded-lg border text-left transition-all cursor-pointer bg-[var(--bg-page)]',
                          draft.codeFontKey === key,
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span style={{ fontFamily: family }} className="text-sm font-bold">
                            {label}
                          </span>
                          <SavedTag
                            className="code-font-status-tag text-[9px] font-mono font-bold text-[var(--accent)]"
                            saved={saved.codeFontKey === key}
                          />
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">{description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                    Tamanho da Fonte do Código (Compacto por Padrão)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {PX_PRESETS.codeSize.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        data-code-size-opt={value}
                        onClick={() => update({ codeSize: value })}
                        className={optionClass(
                          'code-size-opt-btn relative p-2.5 rounded-lg border text-center transition-all cursor-pointer bg-[var(--bg-page)]',
                          draft.codeSize === value,
                        )}
                      >
                        <span className="font-bold block text-xs">{label}</span>
                        <span className="text-[11px] text-[var(--text-muted)] font-mono">{value}</span>
                        <SavedTag
                          className="code-size-status-tag text-[9px] font-mono block mt-0.5 font-bold text-[var(--accent)]"
                          saved={saved.codeSize === value}
                        />
                      </button>
                    ))}
                  </div>
                  <CustomValueRow
                    label="Ou digite o tamanho exato da fonte do código em pixels:"
                    inputId="custom-code-size-input"
                    buttonId="apply-custom-code-size-btn"
                    min={8}
                    max={32}
                    step={1}
                    unit="pixels (px)"
                    width="w-24"
                    {...codeSizeInput}
                  />
                </div>
              </Section>

              <Section
                bordered
                title="6. Fórmulas Matemáticas e Índices (LaTeX / KaTeX)"
                description="Controle o tamanho relativo de subscritos, sobrescritos e estabeleça um limite mínimo de legibilidade para frações:"
                badge={`${Math.round((Number.parseFloat(saved.mathScriptScale) || 0.64) * 100)}% • Mín ${saved.mathMinSize} (Salvo)`}
                badgeId="active-math-badge"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                      Proporção de Subscritos e Sobrescritos (Escala TeX)
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">
                      Padrão TeX: 70% • Otimizado: 64%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {MATH_SCALE_OPTIONS.map(([value, label, hint]) => (
                      <button
                        key={value}
                        type="button"
                        data-math-scale-opt={value}
                        onClick={() => update({ mathScriptScale: value })}
                        className={optionClass(
                          'math-scale-opt-btn relative p-2.5 rounded-lg border text-center transition-all cursor-pointer bg-[var(--bg-page)]',
                          mathScaleClose(value, draft.mathScriptScale),
                        )}
                      >
                        <span className="font-bold block text-xs">{label}</span>
                        <span className="text-[11px] text-[var(--text-muted)] font-mono">{hint}</span>
                        <SavedTag
                          className="math-scale-status-tag text-[9px] font-mono block mt-0.5 font-bold text-[var(--accent)]"
                          saved={mathScaleClose(value, saved.mathScriptScale)}
                        />
                      </button>
                    ))}
                  </div>
                  <CustomValueRow
                    label="Ou digite a porcentagem exata de escala:"
                    inputId="custom-math-scale-input"
                    buttonId="apply-custom-math-scale-btn"
                    min={40}
                    max={95}
                    step={1}
                    unit="%"
                    width="w-24"
                    {...mathScaleInput}
                  />
                </div>

                <div className="space-y-2.5 pt-4 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                      Tamanho Mínimo da Fonte (Evita Ilegibilidade em Frações)
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">
                      Garante leitura em qualquer escala
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {MATH_MIN_OPTIONS.map(([value, label, hint]) => (
                      <button
                        key={value}
                        type="button"
                        data-math-min-opt={value}
                        onClick={() => update({ mathMinSize: normalizePx(value) })}
                        className={optionClass(
                          'math-min-opt-btn relative p-2.5 rounded-lg border text-center transition-all cursor-pointer bg-[var(--bg-page)]',
                          draft.mathMinSize === value,
                        )}
                      >
                        <span className="font-bold block text-xs">{label}</span>
                        <span className="text-[11px] text-[var(--text-muted)] font-mono">{hint}</span>
                        <SavedTag
                          className="math-min-status-tag text-[9px] font-mono block mt-0.5 font-bold text-[var(--accent)]"
                          saved={saved.mathMinSize === value}
                        />
                      </button>
                    ))}
                  </div>
                  <CustomValueRow
                    label="Ou digite o limite mínimo em pixels (px):"
                    inputId="custom-math-min-input"
                    buttonId="apply-custom-math-min-btn"
                    min={0}
                    max={20}
                    step={0.5}
                    unit="pixels (px)"
                    width="w-24"
                    {...mathMinInput}
                  />
                </div>
              </Section>

              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <span>Pré-Visualização em Tempo Real</span>
                  <span id="preview-meta-info" className="font-mono lowercase font-normal text-[var(--accent)]">
                    {`${fontLabel} • ${draft.fontSize} • ${draft.maxWidth} • ${alignLabel}`}
                  </span>
                </div>

                <div className="w-full overflow-x-auto p-1 bg-[var(--bg-page)] border border-dashed border-[var(--border-strong)] rounded-lg">
                  <div
                    id="preview-box-wrapper"
                    className="mx-auto transition-all duration-150 p-6 sm:p-8 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] space-y-4"
                    style={
                      {
                        maxWidth: draft.maxWidth,
                        '--reader-font-family': draft.fontFamily,
                        '--reader-font-size': draft.fontSize,
                        '--reader-text-align': draft.textAlign,
                        '--katex-script-scale': draft.mathScriptScale,
                        '--katex-min-font-size': draft.mathMinSize,
                      } as React.CSSProperties
                    }
                  >
                    <div className="sans-ui text-xs font-mono uppercase tracking-widest text-[var(--accent)] font-semibold">
                      Demonstração de Trecho Teórico
                    </div>

                    <div
                      id="preview-text-content"
                      className="space-y-3 leading-relaxed transition-all duration-150"
                      // Applied at render time (not in an effect) so the first paint already uses the
                      // saved typography instead of transitioning into it.
                      style={
                        {
                          fontFamily: draft.fontFamily,
                          fontSize: draft.fontSize,
                          textAlign: draft.textAlign,
                          textJustify: draft.textAlign === 'justify' ? 'inter-word' : 'auto',
                          hyphens: draft.textAlign === 'justify' ? 'auto' : 'manual',
                          '--reader-font-family': draft.fontFamily,
                          '--reader-font-size': draft.fontSize,
                          '--reader-text-align': draft.textAlign,
                        } as React.CSSProperties
                      }
                    >
                      <h3 className="font-bold text-xl text-[var(--text-primary)]">
                        Teorema da Amostragem de Nyquist-Shannon
                      </h3>
                      <p className="text-[var(--text-primary)]">
                        Considere um sinal contínuo{' '}
                        <em>
                          x<sub>c</sub>(t)
                        </em>{' '}
                        de banda estritamente limitada, amostrado a uma taxa uniforme <em>T</em>. Para que a
                        reconstrução seja matematicamente perfeita, a frequência de amostragem deve satisfazer a
                        condição fundamental:
                      </p>

                      <div className="space-y-2.5 my-3">
                        <div
                          className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-center text-sm overflow-x-auto"
                          // biome-ignore lint/security/noDangerouslySetInnerHtml: static KaTeX output of fixed formulas.
                          dangerouslySetInnerHTML={{ __html: PREVIEW_MATH.inline }}
                        />
                        <div className="p-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-center text-sm overflow-x-auto">
                          <span className="text-xs font-mono text-[var(--text-muted)] block mb-1">
                            Fração com subscritos no numerador/denominador (protegida contra redução excessiva):
                          </span>
                          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static KaTeX output of fixed formulas. */}
                          <div dangerouslySetInnerHTML={{ __html: PREVIEW_MATH.fraction }} />
                        </div>
                        <div
                          className="overflow-x-auto text-center"
                          // biome-ignore lint/security/noDangerouslySetInnerHtml: static KaTeX output of fixed formulas.
                          dangerouslySetInnerHTML={{ __html: PREVIEW_MATH.display }}
                        />
                      </div>

                      <p className="text-[var(--text-secondary)]">
                        Caso contrário, ocorre o rebatimento espectral (<em>aliasing</em>), sobrepondo irreversivelmente
                        réplicas de altas frequências sobre a banda base.
                      </p>

                      <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
                        <div className="sans-ui text-[11px] font-mono uppercase tracking-wider text-[var(--accent)] font-semibold">
                          Tabela de Síntese
                        </div>
                        <table className="academic-table" id="preview-sample-table">
                          <thead>
                            <tr>
                              <th>Critério Fundamental</th>
                              <th>Relação Matemática</th>
                              <th>Descrição Teórica</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>
                                <strong>Taxa de Nyquist</strong>
                              </td>
                              <td>
                                &omega;<sub>s</sub> &gt; 2 &omega;<sub>M</sub>
                              </td>
                              <td>Condição necessária e suficiente para reconstrução sem distorção.</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
                        <div className="sans-ui text-[11px] font-mono uppercase tracking-wider text-[var(--accent)] font-semibold">
                          Bloco de Código (Fonte Mono e Tema Selecionados)
                        </div>
                        <div className="code-block-card" id="preview-sample-code-card" ref={previewCardRef}>
                          <div className="code-block-header">
                            <div className="code-block-lang flex items-center gap-1.5 font-mono text-xs font-bold">
                              <span>PYTHON</span>
                            </div>
                            <span className="text-[10px] font-mono opacity-60">Prévia</span>
                          </div>
                          <PreviewCode preRef={previewCodeRef} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    {/* biome-ignore lint/a11y/noLabelWithoutControl: section heading markup kept as before. */}
                    <label className="font-bold text-[var(--text-primary)] text-base block">
                      8. Armazenamento e Cache do Navegador
                    </label>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Limpe os cadernos e metadados salvos localmente no seu navegador para liberar espaço e forçar a
                      busca das versões mais recentes.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      id="cache-status-badge"
                      className="font-mono text-xs text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2.5 py-1 rounded border border-[var(--border-subtle)] flex items-center gap-1.5"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>{cacheCleared ? 'Cache Limpo' : 'Cache Ativo'}</span>
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                      <svg
                        className="w-4 h-4 text-[var(--accent)]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      <span>Cache Local no Navegador (localStorage &amp; Sessão)</span>
                    </div>
                    <span
                      id="browser-cache-stats"
                      className="font-mono text-[11px] font-semibold text-[var(--text-secondary)]"
                    >
                      {cacheInfo}
                    </span>
                  </div>
                  <p className="text-[var(--text-muted)] leading-relaxed">
                    Armazena os cadernos compilados e manifestos de estudo para permitir navegação imediata. Ao limpar,
                    o navegador buscará o conteúdo atualizado diretamente no próximo acesso.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[var(--border-subtle)]">
                  <div className="text-xs text-[var(--text-muted)]">
                    Suas preferências de leitura (tema, fontes, tamanhos) serão preservadas intactas.
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      id="clear-site-cache-btn"
                      disabled={cacheClearing}
                      onClick={clearBrowserCache}
                      className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-page)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)] text-xs font-bold cursor-pointer transition-all shadow-xs group${cacheClearing ? ' opacity-75 cursor-wait' : ''}`}
                    >
                      {trashIcon(
                        'w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors',
                      )}
                      <span id="clear-site-cache-text">
                        {cacheClearing ? 'Limpando cache...' : 'Limpar Cache do Navegador'}
                      </span>
                    </button>
                  </div>
                </div>

                <div
                  id="cache-feedback-message"
                  className={`${cacheCleared ? '' : 'hidden '}text-xs py-2 px-3 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)]`}
                >
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Cache do navegador limpo com sucesso!</span>
                  </div>
                  <p className="text-[var(--text-muted)] mt-1 text-[11px]">
                    O armazenamento local foi esvaziado. A página será recarregada em instantes...
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-[var(--border-strong)] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    id="reset-defaults-btn"
                    onClick={() => save(DEFAULT_SETTINGS, 'reset')}
                    className="w-full sm:w-auto px-4 py-2.5 rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Restaurar Padrões de Fábrica
                  </button>
                  <button
                    type="button"
                    id="bottom-clear-cache-btn"
                    disabled={cacheClearing}
                    onClick={clearBrowserCache}
                    className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold cursor-pointer transition-colors${cacheClearing ? ' opacity-75 cursor-wait' : ''}`}
                    title="Limpar Cache do Navegador"
                  >
                    {trashIcon('w-3.5 h-3.5 text-[var(--text-muted)]')}
                    <span>Limpar Cache</span>
                  </button>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <Link
                    to="/"
                    className="w-full sm:w-auto px-4 py-2.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-surface)] text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancelar
                  </Link>
                  <button
                    type="button"
                    id="bottom-save-btn"
                    onClick={() => save(draft)}
                    className="w-full sm:w-auto px-6 py-2.5 rounded border border-[var(--accent)] bg-[var(--accent)] hover:opacity-90 text-white dark:text-black text-xs font-bold cursor-pointer transition-opacity shadow-xs"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

/** The static syntax-highlighted sample (tokens carry one CSS variable per code theme). */
function PreviewCode({ preRef }: { preRef: React.RefObject<HTMLPreElement | null> }) {
  const inner = useMemo(() => previewCodeHtml.replace(/^<pre[^>]*>/, '').replace(/<\/pre>\s*$/, ''), []);
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: static, trusted sample markup bundled with the app.
    <pre id="preview-sample-code" ref={preRef} className="shiki" dangerouslySetInnerHTML={{ __html: inner }} />
  );
}
