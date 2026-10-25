import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ThemeName } from '../preferences/document-preferences';
import { useTheme } from '../preferences/theme';

const THEME_TITLES: Record<ThemeName, string> = {
  paper: 'Tema: Papel / Sépia',
  dark: 'Tema: Escuro',
  oled: 'Tema: Preto OLED',
};

/** Theme dropdowns are mutually exclusive across the page: opening one closes the others. */
const CLOSE_MENUS_EVENT = 'study-close-theme-menus';
export function closeAllThemeMenus(): void {
  window.dispatchEvent(new Event(CLOSE_MENUS_EVENT));
}

function SunIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 3v1m0 16v1m9-9h-1M4 12h-1m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function MoonIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  );
}

function EclipseIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </svg>
  );
}

const THEME_OPTIONS: { value: ThemeName; label: string; icon: (cls: string) => React.ReactNode }[] = [
  { value: 'paper', label: 'Papel / Sépia', icon: (cls) => <SunIcon className={`${cls} text-[#b45309]`} /> },
  { value: 'dark', label: 'Escuro', icon: (cls) => <MoonIcon className={`${cls} text-[#58a6ff]`} /> },
  { value: 'oled', label: 'Preto OLED', icon: (cls) => <EclipseIcon className={`${cls} text-[#e5b378]`} /> },
];

/** Round theme button with its dropdown, the settings gear and the sidebar close (X) button. */
export function HeaderActions({ onCloseSidebar }: { onCloseSidebar?: () => void }) {
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    window.addEventListener(CLOSE_MENUS_EVENT, close);
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener(CLOSE_MENUS_EVENT, close);
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5 sans-ui">
      <div className="relative theme-selector-root">
        <button
          type="button"
          className="theme-dropdown-trigger w-8 h-8 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center cursor-pointer shadow-xs"
          aria-label={THEME_TITLES[theme]}
          title={THEME_TITLES[theme]}
          onClick={(e) => {
            e.stopPropagation();
            const willOpen = !menuOpen;
            closeAllThemeMenus();
            setMenuOpen(willOpen);
          }}
        >
          <SunIcon className="theme-icon-paper w-4 h-4 text-[var(--accent)] shrink-0" />
          <MoonIcon className="theme-icon-dark w-4 h-4 text-[var(--accent)] shrink-0" />
          <EclipseIcon className="theme-icon-oled w-4 h-4 text-[var(--accent)] shrink-0" />
        </button>

        <div
          className={`theme-dropdown-menu ${menuOpen ? '' : 'hidden'} absolute right-0 mt-1.5 w-44 z-50 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] p-1 shadow-lg shadow-black/10 text-xs space-y-0.5`}
        >
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)] mb-1">
            Tema
          </div>
          {THEME_OPTIONS.map((option) => {
            const active = option.value === theme;
            return (
              <button
                key={option.value}
                type="button"
                data-theme-val={option.value}
                className={`theme-opt-btn w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer${
                  active ? ' font-semibold text-[var(--text-primary)] bg-[var(--bg-subtle)]' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setTheme(option.value);
                  setMenuOpen(false);
                }}
              >
                <div className="flex items-center gap-2">
                  {option.icon('w-3.5 h-3.5 shrink-0')}
                  <span>{option.label}</span>
                </div>
                <span className={`theme-check text-[var(--accent)] font-bold ${active ? '' : 'hidden'}`}>✓</span>
              </button>
            );
          })}
        </div>
      </div>

      <Link
        to="/configuracoes"
        className="w-8 h-8 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center cursor-pointer shadow-xs shrink-0"
        aria-label="Abrir configurações de leitura"
        title="Configurações"
      >
        <svg
          className="w-4 h-4 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </Link>

      <button
        type="button"
        className="sidebar-close-btn w-8 h-8 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors flex items-center justify-center cursor-pointer shadow-xs shrink-0"
        aria-label="Fechar ou esconder menu lateral"
        title="Fechar menu lateral"
        onClick={onCloseSidebar}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
