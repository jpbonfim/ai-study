import type { SessionInfo, SubjectView } from '@ai-study/server/api-types';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { HeaderActions } from '../../components/HeaderActions';
import { DesktopSidebarOpenButton, MobileMenuIcon, SidebarBackdrop } from '../../components/SidebarChrome';
import { usePageChrome } from '../../lib/page-chrome';
import { readLastVisited, readRecentSubjects, recordSubjectAccess } from '../../lib/study-history';
import { useSidebar } from '../../lib/use-sidebar';

export function subjectHref(subject: SubjectView): string {
  return subject.isShared ? `/${subject.slug}?owner=${subject.ownerUserId}` : `/${subject.slug}`;
}

const normalizeText = (text: string) => (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Subjects ordered by recent access (most recent first), then in their default order. */
function orderByRecentAccess(subjects: SubjectView[]): SubjectView[] {
  const recent = readRecentSubjects();
  const last = readLastVisited();
  if (last?.slug && !recent.some((r) => r.slug === last.slug)) {
    recent.unshift({ slug: last.slug, visitedAt: last.visitedAt || new Date().toISOString() });
  }
  if (recent.length === 0) return subjects;
  const priority = new Map<string, number>();
  recent.forEach((r, idx) => {
    if (r?.slug && !priority.has(r.slug)) priority.set(r.slug, 100000 - idx);
  });
  return subjects
    .map((subject, index) => ({ subject, index }))
    .sort((a, b) => {
      const scoreA = priority.get(a.subject.slug) ?? 0;
      const scoreB = priority.get(b.subject.slug) ?? 0;
      return scoreA !== scoreB ? scoreB - scoreA : a.index - b.index;
    })
    .map((entry) => entry.subject);
}

function ContinueStudying() {
  const last = useMemo(readLastVisited, []);
  let code = 'PTC3361 • Escola Politécnica da USP';
  let title = 'Processamento Digital de Sinais';
  let description = 'P1 • Amostragem, Nyquist, Aliasing, SLITs e Convolução';
  let href = '/pds';
  let buttonText = 'Continuar Caderno';
  let timeBadge = 'Caderno em andamento';

  if (last && (last.slug || last.lastUrl)) {
    title = last.name;
    code = `${last.code} • ${last.institution || 'USP'}`;
    href = last.lastUrl || last.url || `/${last.slug}`;
    if (href.includes('/questoes/')) {
      buttonText = 'Continuar Questão';
      description = last.lastSectionTitle
        ? `Última questão: ${last.lastSectionTitle}`
        : `Questão Resolvida — ${last.name}`;
    } else if (href.includes('#')) {
      buttonText = 'Continuar Leitura';
      description = last.lastSectionTitle
        ? `Continuar em: ${last.lastSectionTitle}`
        : `${last.period || ''} — Caderno Integral`;
    } else {
      buttonText = 'Continuar Caderno';
      description = last.lastSectionTitle
        ? `Última seção: ${last.lastSectionTitle}`
        : `${last.period || ''} — Caderno Integral`;
    }
    if (last.visitedAt) {
      const dt = new Date(last.visitedAt);
      timeBadge = `Último acesso: ${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  return (
    <section
      id="recent-section"
      className="p-6 rounded-lg border-2 border-[var(--accent)] bg-[var(--bg-surface)] space-y-3"
    >
      <div className="sans-ui flex items-center justify-between text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)] pb-2">
        <span className="font-mono font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
          Continuar estudo
        </span>
        <span id="recent-time-badge" className="italic">
          {timeBadge}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <div id="recent-code" className="sans-ui text-xs font-mono text-[var(--text-secondary)] font-semibold">
            {code}
          </div>
          <h2 id="recent-title" className="font-serif text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
            {title}
          </h2>
          <p id="recent-desc" className="font-serif text-sm text-[var(--text-secondary)] italic mt-0.5">
            {description}
          </p>
        </div>

        <Link
          id="recent-continue-btn"
          to={href}
          className="sans-ui shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded border border-[var(--accent)] bg-[var(--accent)] hover:opacity-90 text-white dark:text-black font-semibold text-xs transition-opacity cursor-pointer shadow-xs"
        >
          <span id="recent-continue-btn-text">{buttonText}</span>
        </Link>
      </div>
    </section>
  );
}

function SubjectNavItem({ subject, index }: { subject: SubjectView; index: number }) {
  const active = subject.status === 'active';
  const className = `sidebar-materia-item block px-3 py-2 rounded-lg border transition-all duration-150 ${
    active
      ? 'border-[var(--border-subtle)] bg-[var(--bg-page)] hover:border-[var(--accent)] hover:bg-[var(--bg-surface-hover)] group shadow-2xs cursor-pointer'
      : 'border-dashed border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)] opacity-65 cursor-not-allowed'
  }`;
  const content = (
    <>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="font-mono font-bold text-[var(--accent)]">{subject.code}</span>
        {subject.isShared ? (
          <span
            className="text-[10px] font-mono text-[var(--accent)] font-semibold truncate max-w-[130px]"
            title={`Compartilhado por ${subject.ownerDisplayName || subject.ownerUsername}`}
          >
            De: {subject.ownerDisplayName || subject.ownerUsername}
          </span>
        ) : !active ? (
          <span className="text-[10px] text-[var(--text-muted)] italic">Em breve</span>
        ) : (
          <span className="text-[10px] font-mono text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
            {subject.period || subject.institution}
          </span>
        )}
      </div>
      <div className="font-serif font-bold text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors leading-snug">
        {subject.name}
      </div>
      {active && (
        <div className="text-[11px] text-[var(--text-muted)] mt-1 flex items-center justify-between">
          <span>{subject.chaptersCount} capítulos</span>
          <span>{subject.questionsCount} testes</span>
        </div>
      )}
    </>
  );
  const props = {
    'data-materia-slug': subject.slug,
    'data-default-order': index,
    className,
    onClick: () => recordSubjectAccess(subject.slug),
  };
  return active ? (
    <Link to={subjectHref(subject)} {...props}>
      {content}
    </Link>
  ) : (
    // biome-ignore lint/a11y/useValidAnchor: subjects without content keep the previous inert "#" link.
    <a href="#" {...props}>
      {content}
    </a>
  );
}

function SubjectCard({ subject }: { subject: SubjectView }) {
  const active = subject.status === 'active';
  return (
    <article className="h-[200px] p-4 sm:p-4.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-all duration-150 flex flex-col justify-between overflow-hidden shadow-2xs group">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)] shrink-0 text-xs">
        <div className="sans-ui flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="font-mono font-bold text-[var(--accent)] uppercase tracking-wider shrink-0">
            {subject.code}
          </span>
          <span className="text-[var(--text-muted)] shrink-0">•</span>
          <span className="text-[var(--text-secondary)] truncate text-[11px] sm:text-xs">{subject.institution}</span>
          {subject.isShared && (
            <>
              <span className="text-[var(--text-muted)] shrink-0">•</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--accent)]/15 text-[var(--accent)] shrink-0">
                De: {subject.ownerDisplayName || subject.ownerUsername}
              </span>
            </>
          )}
        </div>
        {subject.period && (
          <span className="sans-ui text-[10px] sm:text-[11px] font-mono px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] shrink-0">
            {subject.period}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col justify-center py-1 sm:py-1.5">
        <h2 className="font-serif text-base sm:text-lg font-bold text-[var(--text-primary)] leading-snug line-clamp-1">
          {active ? (
            <Link to={subjectHref(subject)} className="hover:text-[var(--accent)] transition-colors">
              {subject.name}
            </Link>
          ) : (
            <span>{subject.name}</span>
          )}
        </h2>
        <p className="font-serif text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-2 mt-1 mb-1.5">
          {subject.description}
        </p>
        {subject.topics.length > 0 && (
          <div className="sans-ui text-[11px] sm:text-xs text-[var(--text-muted)] line-clamp-1">
            <span className="font-semibold text-[var(--text-secondary)] mr-1">Tópicos:</span>
            <span>{subject.topics.join(' • ')}</span>
          </div>
        )}
      </div>

      <div className="sans-ui flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-xs shrink-0">
        {active ? (
          <>
            <span className="text-[var(--text-muted)] font-mono text-[11px] sm:text-xs truncate mr-2">
              <span className="hidden sm:inline">
                {subject.chaptersCount} capítulos • {subject.questionsCount} questões
              </span>
              <span className="sm:hidden">
                {subject.chaptersCount} caps • {subject.questionsCount} questões
              </span>
            </span>
            <Link
              to={subjectHref(subject)}
              className="inline-flex items-center gap-1 font-bold text-[var(--accent)] hover:underline shrink-0 text-[11px] sm:text-xs"
            >
              <span>Abrir Caderno</span>
            </Link>
          </>
        ) : (
          <span className="text-[var(--text-muted)] italic text-[11px] sm:text-xs truncate">
            Disciplina cadastrada na estrutura (aguardando inserção de materiais via Skill Antigravity).
          </span>
        )}
      </div>
    </article>
  );
}

export function HomePage({ session }: { session: SessionInfo }) {
  usePageChrome('Cadernos de Estudo Acadêmico | Biblioteca');
  const sidebar = useSidebar();
  const subjectsQuery = useQuery({ queryKey: ['subjects'], queryFn: api.subjects });
  const [search, setSearch] = useState('');

  const subjects = useMemo(
    () => (subjectsQuery.data ? [...subjectsQuery.data.own, ...subjectsQuery.data.shared] : []),
    [subjectsQuery.data],
  );
  const navSubjects = useMemo(() => orderByRecentAccess(subjects), [subjects]);
  const query = normalizeText(search);
  const visibleNav = navSubjects.filter((s) =>
    normalizeText(`${s.name} ${s.code} ${s.institution} ${s.description} ${s.topics.join(' ')}`).includes(query),
  );
  const user = session.user;

  return (
    <>
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-page)]/95 backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            id="mobile-sidebar-toggle"
            type="button"
            aria-label="Abrir Menu de Matérias"
            className="sans-ui p-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
            onClick={sidebar.openMobile}
          >
            <MobileMenuIcon className="w-5 h-5" />
          </button>
          <span className="font-serif text-sm font-bold truncate text-[var(--text-primary)]">
            Biblioteca de Estudos
          </span>
        </div>
      </header>

      <div className="h-14 lg:hidden w-full shrink-0" aria-hidden="true" />

      <div className="flex w-full min-w-0">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: delegated handler only closes the mobile drawer after link clicks. */}
        <aside
          id="home-sidebar"
          className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] ${sidebar.mobileOpen ? '' : '-translate-x-full '}lg:translate-x-0 transition-transform duration-200 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col justify-between h-screen h-[100dvh] max-h-[100dvh] overflow-hidden`}
          onClick={sidebar.onSidebarClick}
        >
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6 overscroll-contain">
            <div className="space-y-3 pb-5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-2">
                <span className="sans-ui text-xs font-mono uppercase tracking-widest text-[var(--accent)] font-semibold">
                  Biblioteca Digital
                </span>
                <HeaderActions onCloseSidebar={sidebar.close} />
              </div>
              <h2 className="font-serif text-xl font-bold text-[var(--text-primary)] leading-snug">
                Cadernos de Estudo
              </h2>
              <p className="font-serif text-xs text-[var(--text-secondary)] italic">
                Selecione a disciplina desejada na lista abaixo para abrir o material.
              </p>
            </div>

            <div className="space-y-3">
              <div className="sans-ui text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center justify-between">
                <span>Disciplinas</span>
                <span className="font-normal font-mono text-[11px]" id="sidebar-materias-count">
                  {query
                    ? `${visibleNav.length} encontrada${visibleNav.length === 1 ? '' : 's'}`
                    : `${subjects.length} cadastradas`}
                </span>
              </div>

              <div className="relative group">
                <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors duration-200">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="search"
                  id="sidebar-materia-search"
                  placeholder="Buscar disciplina..."
                  className="sans-ui w-full pl-8 pr-7 py-1.5 text-xs sm:text-[13px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:outline-none transition-all duration-200 shadow-2xs"
                  aria-label="Buscar disciplina no catálogo"
                  autoComplete="off"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearch('');
                      e.currentTarget.blur();
                    }
                  }}
                />
                <button
                  type="button"
                  id="sidebar-materia-search-clear"
                  className={`${search ? '' : 'hidden '}absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 rounded cursor-pointer transition-colors`}
                  aria-label="Limpar busca"
                  title="Limpar busca"
                  onClick={() => {
                    setSearch('');
                    document.getElementById('sidebar-materia-search')?.focus();
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div
                id="sidebar-materias-empty"
                className={`${visibleNav.length === 0 && subjects.length > 0 ? '' : 'hidden '}p-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 text-xs text-[var(--text-muted)] text-center italic`}
              >
                Nenhuma disciplina encontrada.
              </div>

              <nav className="space-y-1 sans-ui text-sm" id="sidebar-materias-nav">
                {visibleNav.map((subject) => (
                  <SubjectNavItem
                    key={`${subject.ownerUserId}:${subject.slug}`}
                    subject={subject}
                    index={subjects.indexOf(subject)}
                  />
                ))}
              </nav>
            </div>
          </div>

          <div className="shrink-0 p-3 sm:p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] sans-ui pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]">
            <Link
              to="/conta"
              className="block p-2.5 sm:p-3 rounded-xl bg-[var(--bg-page)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-all duration-200 group cursor-pointer shadow-2xs"
              title="Acessar Minha Conta"
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/30 flex items-center justify-center font-serif text-sm font-bold shrink-0 group-hover:scale-105 transition-transform">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-serif font-bold text-xs sm:text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                      {user.displayName}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                      @{user.username} • {user.role.toUpperCase()}
                    </div>
                  </div>
                </div>
                <svg
                  className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>
        </aside>

        <SidebarBackdrop id="home-sidebar-backdrop" open={sidebar.mobileOpen} onClose={sidebar.closeMobile} />
        <DesktopSidebarOpenButton onClick={sidebar.expandDesktop} />

        <main
          id="main-content-area"
          className="flex-1 lg:pl-80 w-full min-w-0 transition-[padding] duration-200 overflow-x-clip"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-8 lg:px-12 py-10 sm:py-16 space-y-10 w-full min-w-0">
            <header className="pb-6 border-b border-[var(--border-strong)] space-y-2">
              <span className="sans-ui text-xs font-mono uppercase tracking-widest text-[var(--accent)] font-semibold">
                Portal Acadêmico
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
                Biblioteca de Conteúdos
              </h1>
              <p className="font-serif text-base text-[var(--text-secondary)] italic">
                Resumos teóricos e bancos de questões resolvidas
              </p>
            </header>

            <ContinueStudying />

            <section className="space-y-4">
              <div className="sans-ui text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center justify-between">
                <span>Disciplinas Disponíveis</span>
              </div>
              <div className="space-y-3.5">
                {subjects.map((subject) => (
                  <SubjectCard key={`${subject.ownerUserId}:${subject.slug}`} subject={subject} />
                ))}
              </div>
            </section>

            <footer className="pt-8 border-t border-[var(--border-subtle)] sans-ui text-xs text-[var(--text-muted)] flex flex-col sm:flex-row justify-between gap-4 text-center sm:text-left">
              <div>
                Renderização matemática completa com KaTeX • Rolagem horizontal independente em tabelas e equações
              </div>
              <div>Estilo clássico de livro acadêmico</div>
            </footer>
          </div>
        </main>
      </div>
    </>
  );
}
