import { useEffect, useRef, useState } from 'react';
import { closeAllThemeMenus } from '../../components/HeaderActions';
import type { TagOption } from './notebook-model';

const ALL_LABEL = '-- Todas as Avaliações / Início --';

const OPTION_BASE =
  'tag-opt-btn w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] focus:text-[var(--accent)] focus:bg-[var(--accent-subtle)] focus:outline-none transition-colors duration-150 cursor-pointer group';

export function tagOptionLabel(tag: TagOption): string {
  return `${tag.label || tag.id}${tag.questionsCount > 0 ? ` (${tag.questionsCount} questões)` : ''}`;
}

interface TagSelectorProps {
  tags: TagOption[];
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
  /** Toggle "Tags de outros" (only on the user's own subject when other sources exist). */
  showOtherToggle: boolean;
  showOtherTags: boolean;
  onToggleOtherTags: () => void;
}

/** Sidebar "Tag" dropdown: searchable, keyboard navigable, other users' tags behind a toggle. */
export function TagSelector({
  tags,
  activeTag,
  onSelect,
  showOtherToggle,
  showOtherTags,
  onToggleOtherTags,
}: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const toggleMenu = (show = !open) => {
    if (show) closeAllThemeMenus();
    setOpen(show);
  };

  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const focusSearchSoon = () => setTimeout(() => searchRef.current?.focus(), 50);
  const select = (value: string | null) => {
    setOpen(false);
    onSelect(value);
  };

  const activeOption = tags.find((t) => t.id === activeTag);
  const activeLabel = activeTag && activeOption ? tagOptionLabel(activeOption) : ALL_LABEL;
  const query = filter.toLowerCase().trim();
  const isVisible = (tag: TagOption) =>
    (!tag.isFromOtherUser || showOtherTags) && (!query || tagOptionLabel(tag).toLowerCase().includes(query));

  const onOptionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = button.nextElementSibling;
      if (next instanceof HTMLElement && next.classList.contains('tag-opt-btn')) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = button.previousElementSibling;
      if (prev instanceof HTMLElement && prev.classList.contains('tag-opt-btn')) prev.focus();
      else triggerRef.current?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className="space-y-2 pb-4 border-b border-[var(--border-subtle)]" id="sidebar-tag-section">
      <div className="sans-ui flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <button
          type="button"
          id="sidebar-tag-label-btn"
          className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--accent)] transition-colors text-left"
          title="Clique para alternar opções de avaliação"
          onClick={(e) => {
            e.stopPropagation();
            triggerRef.current?.focus();
            toggleMenu();
          }}
        >
          <svg
            className="w-3.5 h-3.5 text-[var(--accent)] shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
          <span>Tag</span>
        </button>
        <span
          className="text-[10px] font-mono lowercase tracking-tight text-[var(--text-muted)]"
          id="sidebar-active-tag-hint"
        >
          {activeTag ? `(ativo: ${activeTag})` : '(nenhuma selecionada)'}
        </span>
      </div>

      {showOtherToggle && (
        <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-page)] border border-[var(--border-subtle)] sans-ui">
          <span className="text-[11px] text-[var(--text-secondary)]">Tags de outros:</span>
          <button
            type="button"
            id="other-users-tags-toggle"
            aria-pressed={showOtherTags}
            onClick={(e) => {
              e.stopPropagation();
              onToggleOtherTags();
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border hover:text-[var(--text-primary)] transition-all cursor-pointer ${
              showOtherTags
                ? 'bg-[var(--accent)] text-white dark:text-black border-[var(--accent)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
            }`}
          >
            {showOtherTags ? 'Ativado' : 'Desativado'}
          </button>
        </div>
      )}

      <div className="relative w-full" id="sidebar-tag-custom-dropdown" ref={rootRef}>
        <button
          type="button"
          id="sidebar-tag-trigger"
          ref={triggerRef}
          className={`sans-ui w-full flex items-center justify-between pl-3 pr-2.5 py-2 text-xs sm:text-[13px] font-medium rounded-lg border shadow-2xs hover:bg-[var(--bg-surface-hover)] hover:border-[var(--accent)] hover:text-[var(--accent)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:outline-none cursor-pointer transition-all duration-200 group text-left ${
            activeTag
              ? 'border-[var(--accent)] bg-[var(--accent-subtle)]/35 text-[var(--accent)] font-semibold'
              : 'border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-secondary)]'
          }`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            const willOpen = !open;
            toggleMenu(willOpen);
            if (willOpen) focusSearchSoon();
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleMenu(true);
              focusSearchSoon();
            }
          }}
        >
          <div className="flex items-center gap-2 min-w-0 truncate">
            <svg
              className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <span id="sidebar-tag-selected-label" className={`truncate${activeTag ? ' font-mono' : ''}`}>
              {activeLabel}
            </span>
          </div>
          <svg
            id="sidebar-tag-chevron"
            className={`w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-transform duration-200 shrink-0 ml-1.5${open ? ' rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div
          id="sidebar-tag-menu"
          className={`${open ? '' : 'hidden '}absolute left-0 right-0 top-full mt-1.5 z-50 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] p-1 shadow-xl shadow-black/15 text-xs sm:text-[13px] space-y-0.5 max-h-64 overflow-y-auto`}
          role="listbox"
          tabIndex={-1}
        >
          <div className="p-1 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-surface)] z-10">
            <input
              type="search"
              id="sidebar-tag-search-filter"
              ref={searchRef}
              placeholder="Filtrar tags..."
              autoComplete="off"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="sans-ui w-full px-2.5 py-1 text-xs rounded border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <TagOptionButton
            label={ALL_LABEL}
            active={!activeTag}
            onClick={() => select(null)}
            onKeyDown={onOptionKeyDown}
          />
          {tags.map((tag) =>
            isVisible(tag) ? (
              <TagOptionButton
                key={tag.id}
                label={tagOptionLabel(tag)}
                active={tag.id === activeTag}
                isOther={tag.isFromOtherUser}
                owner={tag.ownerDisplayName || tag.ownerUsername || ''}
                onClick={() => select(tag.id)}
                onKeyDown={onOptionKeyDown}
              />
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

function TagOptionButton({
  label,
  active,
  isOther,
  owner,
  onClick,
  onKeyDown,
}: {
  label: string;
  active: boolean;
  isOther?: boolean;
  owner?: string;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const shortOwner = owner && owner.length > 12 ? `${owner.slice(0, 11)}…` : owner;
  const className = active
    ? `${OPTION_BASE.replace(' text-[var(--text-secondary)]', '')} font-semibold text-[var(--accent)] bg-[var(--accent-subtle)]${isOther ? ' other-user-tag' : ''}`
    : `${OPTION_BASE}${isOther ? ' other-user-tag' : ''}`;
  return (
    <button
      type="button"
      className={className}
      role="option"
      aria-selected={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={onKeyDown}
    >
      {isOther === undefined ? (
        <span className="truncate">{label}</span>
      ) : (
        <div className="flex items-center justify-between w-full min-w-0 gap-1.5">
          <span className="truncate font-mono">{label}</span>
          {isOther && (
            <span
              className="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 shrink-0 ml-2 px-1 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20"
              title={`Matéria compartilhada por ${owner}`}
            >
              {shortOwner}
            </span>
          )}
        </div>
      )}
      <span className={`tag-opt-check text-[var(--accent)] font-bold shrink-0 ml-1.5${active ? '' : ' hidden'}`}>
        ✓
      </span>
    </button>
  );
}
