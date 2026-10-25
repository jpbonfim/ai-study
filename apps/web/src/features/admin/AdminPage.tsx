import type { LogEntry, PublicUser, SessionInfo } from '@ai-study/server/api-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { type AdminUser, api } from '../../api/client';
import { HeaderActions } from '../../components/HeaderActions';
import { usePageChrome } from '../../lib/page-chrome';

type Tab = 'users' | 'permissions' | 'logs';
type Alert = { type: 'success' | 'error'; message: string } | null;

const LOGS_PAGE_SIZE = 30;

const MODAL_INPUT =
  'w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]';
const SELECT_CLASS =
  'sans-ui w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]';
const FILTER_CLASS =
  'w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]';
const CANCEL_BUTTON =
  'px-4 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] hover:text-[var(--text-primary)] cursor-pointer';
const PRIMARY_BUTTON =
  'px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white dark:text-black font-semibold hover:opacity-90 cursor-pointer';

const LOG_ACTIONS: [string, string][] = [
  ['login', 'Login com Sucesso'],
  ['login_failed', 'Tentativa de Login Falha'],
  ['logout', 'Logout'],
  ['page_view', 'Acesso a Página'],
  ['upload_archive', 'Upload de Archive'],
  ['upload_materia', 'Upload de Matéria'],
  ['download_archive', 'Download de Archive'],
  ['download_materia', 'Download de Matéria'],
  ['admin_create_user', 'Admin: Criar Usuário'],
  ['admin_grant_permission', 'Admin: Conceder Permissão'],
  ['admin_revoke_permission', 'Admin: Revogar Permissão'],
];

const formatDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString('pt-BR') : '');

/** SQLite timestamps are UTC without a zone marker. */
const parseTimestamp = (value: string | null) => new Date(value && !value.includes('T') ? `${value.replace(' ', 'T')}Z` : (value ?? ''));

function Modal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`fixed inset-0 z-50 bg-black/60 ${open ? '' : 'hidden '}flex items-center justify-center p-4`}>
      <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] space-y-6 shadow-xl">
        {children}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tab-btn px-5 py-3 border-b-2 cursor-pointer flex items-center gap-2 ${
        active
          ? 'border-[var(--accent)] text-[var(--accent)]'
          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
      </svg>
      <span>{label}</span>
    </button>
  );
}

function UsersTab({
  users,
  currentUserId,
  onCreate,
  onEdit,
  onPassword,
  onDelete,
}: {
  users: PublicUser[];
  currentUserId: number;
  onCreate: () => void;
  onEdit: (user: PublicUser) => void;
  onPassword: (user: PublicUser) => void;
  onDelete: (user: PublicUser) => void;
}) {
  return (
    <section id="tab-users" className="tab-pane space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[var(--text-primary)]">Usuários Cadastrados</h2>
          <p className="font-serif text-xs text-[var(--text-secondary)] italic">
            Cada usuário possui um repositório isolado de estudos sob <code>data/archives/&lt;user_id&gt;</code>.
          </p>
        </div>
        <button
          type="button"
          id="open-create-user-modal"
          onClick={onCreate}
          className="sans-ui px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white dark:text-black hover:opacity-90 transition-opacity cursor-pointer shadow-xs flex items-center gap-1.5"
        >
          <span>+ Adicionar Usuário</span>
        </button>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-auto shadow-2xs">
        <table className="w-full text-left text-xs sans-ui">
          <thead className="bg-[var(--bg-page)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-mono uppercase tracking-wider">
            <tr>
              <th className="p-3.5">ID</th>
              <th className="p-3.5">Usuário</th>
              <th className="p-3.5">Nome de Exibição</th>
              <th className="p-3.5">Perfil</th>
              <th className="p-3.5">Criado em</th>
              <th className="p-3.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody id="users-table-body" className="divide-y divide-[var(--border-subtle)]">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[var(--bg-page)]/50 transition-colors">
                <td className="p-3.5 font-mono text-[var(--text-muted)]">{u.id}</td>
                <td className="p-3.5 font-bold font-mono text-[var(--text-primary)]">{u.username}</td>
                <td className="p-3.5 text-[var(--text-secondary)]">{u.displayName}</td>
                <td className="p-3.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      u.role === 'admin'
                        ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                        : 'bg-[var(--bg-page)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                    }`}
                  >
                    {u.role.toUpperCase()}
                  </span>
                </td>
                <td className="p-3.5 text-[var(--text-muted)] font-mono">{formatDate(u.createdAt)}</td>
                <td className="p-3.5 text-right space-x-2">
                  <button type="button" onClick={() => onEdit(u)} className="text-[var(--accent)] hover:underline cursor-pointer">
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onPassword(u)}
                    className="text-[var(--text-secondary)] hover:underline cursor-pointer"
                  >
                    Senha
                  </button>
                  {u.id !== currentUserId && (
                    <button type="button" onClick={() => onDelete(u)} className="text-red-500 hover:underline cursor-pointer">
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PermissionsTab({ onAlert, onChanged }: { onAlert: (alert: Alert) => void; onChanged: () => void }) {
  const query = useQuery({ queryKey: ['admin', 'permissions'], queryFn: api.admin.permissions });
  const [ownerId, setOwnerId] = useState('');
  const [materiaSlug, setMateriaSlug] = useState('');
  const [grantedId, setGrantedId] = useState('');
  const users: AdminUser[] = query.data?.users ?? [];
  const permissions = query.data?.permissions ?? [];
  const owner = users.find((u) => String(u.id) === ownerId);
  const ownerMaterias = owner?.materias ?? [];

  async function onGrant(event: FormEvent) {
    event.preventDefault();
    const materia = ownerMaterias.find((m) => m.slug === materiaSlug);
    if (!ownerId || !grantedId || !materiaSlug || !materia?.code) {
      // biome-ignore lint/suspicious/noAlert: same feedback as before.
      window.alert('Preencha todos os campos da permissão.');
      return;
    }
    if (ownerId === grantedId) {
      // biome-ignore lint/suspicious/noAlert: same feedback as before.
      window.alert('O dono e o beneficiado não podem ser a mesma pessoa.');
      return;
    }
    try {
      await api.admin.grant({ ownerUserId: ownerId, grantedUserId: grantedId, subjectCode: materia.code, materiaSlug });
      onAlert({ type: 'success', message: 'Permissão concedida com sucesso!' });
      onChanged();
    } catch (err) {
      // biome-ignore lint/suspicious/noAlert: same feedback as before.
      window.alert(err instanceof Error ? err.message : 'Erro ao conceder permissão.');
    }
  }

  async function onRevoke(id: number) {
    // biome-ignore lint/suspicious/noAlert: destructive action confirmation, as before.
    if (!window.confirm('Deseja realmente revogar esta permissão de acesso?')) return;
    try {
      await api.admin.revoke(id);
      onAlert({ type: 'success', message: 'Permissão revogada com sucesso.' });
      onChanged();
    } catch (err) {
      // biome-ignore lint/suspicious/noAlert: same feedback as before.
      window.alert(err instanceof Error ? err.message : 'Erro ao revogar permissão.');
    }
  }

  let materiaPlaceholder = 'Selecione primeiro o dono...';
  if (owner && ownerMaterias.length === 0) materiaPlaceholder = 'Este usuário não tem matérias cadastradas';
  else if (owner) materiaPlaceholder = 'Selecione a matéria...';

  return (
    <section id="tab-permissions" className="tab-pane space-y-8">
      <div>
        <h2 className="font-serif text-2xl font-bold text-[var(--text-primary)]">Permissões de Compartilhamento</h2>
        <p className="font-serif text-xs text-[var(--text-secondary)] italic">
          Conceda acesso a uma disciplina de um usuário para outro. Se o código da disciplina coincidir, o usuário verá o
          toggle de tags cruzadas.
        </p>
      </div>

      <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-4 shadow-2xs">
        <span className="sans-ui text-xs font-mono uppercase tracking-widest text-[var(--accent)] font-semibold">
          Conceder Novo Acesso
        </span>

        <form id="grant-permission-form" className="grid grid-cols-1 sm:grid-cols-3 gap-4" onSubmit={onGrant}>
          <div className="space-y-1">
            <label htmlFor="perm-owner-select" className="block sans-ui text-xs font-semibold text-[var(--text-secondary)]">
              1. Usuário de Origem (Dono):
            </label>
            <select
              id="perm-owner-select"
              required
              className={SELECT_CLASS}
              value={ownerId}
              onChange={(e) => {
                setOwnerId(e.target.value);
                setMateriaSlug('');
              }}
            >
              <option value="">Selecione o dono...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} (@{u.username}) — {u.materias.length} matéria(s)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="perm-materia-select" className="block sans-ui text-xs font-semibold text-[var(--text-secondary)]">
              2. Matéria a Compartilhar:
            </label>
            <select
              id="perm-materia-select"
              required
              disabled={ownerMaterias.length === 0}
              className={`${SELECT_CLASS} disabled:opacity-50`}
              value={materiaSlug}
              onChange={(e) => setMateriaSlug(e.target.value)}
            >
              <option value="">{materiaPlaceholder}</option>
              {ownerMaterias.map((m) => (
                <option key={m.slug} value={m.slug} data-code={m.code}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="perm-granted-select" className="block sans-ui text-xs font-semibold text-[var(--text-secondary)]">
              3. Usuário Beneficiado:
            </label>
            <select
              id="perm-granted-select"
              required
              className={SELECT_CLASS}
              value={grantedId}
              onChange={(e) => setGrantedId(e.target.value)}
            >
              <option value="">Selecione quem receberá acesso...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} (@{u.username})
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3 pt-2">
            <button
              type="submit"
              id="submit-perm-btn"
              className="sans-ui py-2.5 px-5 text-xs font-semibold rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white dark:text-black hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              Conceder Permissão de Acesso
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <div className="sans-ui text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Permissões Ativas no Sistema
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-auto shadow-2xs">
          <table className="w-full text-left text-xs sans-ui">
            <thead className="bg-[var(--bg-page)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-mono uppercase tracking-wider">
              <tr>
                <th className="p-3.5">Código da Disciplina</th>
                <th className="p-3.5">Slug</th>
                <th className="p-3.5">Dono Original</th>
                <th className="p-3.5">Acesso Concedido Para</th>
                <th className="p-3.5">Concedido em</th>
                <th className="p-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody id="permissions-table-body" className="divide-y divide-[var(--border-subtle)]">
              {permissions.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--bg-page)]/50 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-[var(--accent)]">{p.subject_code}</td>
                  <td className="p-3.5 font-mono text-[var(--text-muted)]">{p.materia_slug}</td>
                  <td className="p-3.5 text-[var(--text-primary)]">
                    {p.owner_display_name} <span className="text-[var(--text-muted)] font-mono">(@{p.owner_username})</span>
                  </td>
                  <td className="p-3.5 text-[var(--text-primary)]">
                    {p.granted_display_name}{' '}
                    <span className="text-[var(--text-muted)] font-mono">(@{p.granted_username})</span>
                  </td>
                  <td className="p-3.5 text-[var(--text-muted)] font-mono">{formatDate(p.granted_at)}</td>
                  <td className="p-3.5 text-right">
                    <button type="button" onClick={() => onRevoke(p.id)} className="text-red-500 hover:underline cursor-pointer">
                      Revogar
                    </button>
                  </td>
                </tr>
              ))}
              {query.data && permissions.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[var(--text-muted)] italic">
                    Nenhuma permissão cruzada cadastrada até o momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function LogsTab({ users }: { users: PublicUser[] }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ userId: '', action: '', search: '' });
  const [applied, setApplied] = useState(filters);
  const [fetchedOnce, setFetchedOnce] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const params = new URLSearchParams({ page: String(page), limit: String(LOGS_PAGE_SIZE) });
  if (applied.userId) params.set('user_id', applied.userId);
  if (applied.action) params.set('action', applied.action);
  if (applied.search) params.set('search', applied.search);
  const query = useQuery({ queryKey: ['admin', 'logs', params.toString()], queryFn: () => api.admin.logs(params) });
  const logs: LogEntry[] = query.data?.logs ?? [];
  const total = query.data?.total ?? 0;

  const fetchPage = (next: number, nextFilters = filters) => {
    setApplied(nextFilters);
    setPage(next);
    setFetchedOnce(true);
  };

  return (
    <section id="tab-logs" className="tab-pane space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[var(--text-primary)]">Logs de Auditoria e Atividade</h2>
          <p className="font-serif text-xs text-[var(--text-secondary)] italic">
            Registros detalhados de logins, acessos a cadernos, uploads e ações administrativas com retenção automática de
            90 dias.
          </p>
        </div>
        <div className="sans-ui text-xs text-[var(--text-muted)] font-mono" id="logs-total-indicator">
          Total: {total} eventos
        </div>
      </div>

      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3 shadow-2xs">
        <form
          id="logs-filter-form"
          ref={formRef}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs sans-ui"
          onSubmit={(e) => {
            e.preventDefault();
            fetchPage(1);
          }}
        >
          <div>
            <label htmlFor="filter-log-user" className="block font-semibold text-[var(--text-muted)] mb-1">
              Usuário:
            </label>
            <select
              id="filter-log-user"
              className={FILTER_CLASS}
              value={filters.userId}
              onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
            >
              <option value="">Todos os usuários</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} (@{u.username})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-log-action" className="block font-semibold text-[var(--text-muted)] mb-1">
              Ação:
            </label>
            <select
              id="filter-log-action"
              className={FILTER_CLASS}
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            >
              <option value="">Todas as ações</option>
              {LOG_ACTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-log-search" className="block font-semibold text-[var(--text-muted)] mb-1">
              Buscar Detalhes / IP:
            </label>
            <input
              type="text"
              id="filter-log-search"
              placeholder="ex: pds, IP, etc..."
              className={FILTER_CLASS}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 py-1.5 px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white dark:text-black font-semibold hover:opacity-90 cursor-pointer"
            >
              Filtrar
            </button>
            <button
              type="button"
              id="reset-logs-filter"
              className="py-1.5 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              onClick={() => {
                const empty = { userId: '', action: '', search: '' };
                setFilters(empty);
                fetchPage(1, empty);
              }}
            >
              Limpar
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-auto shadow-2xs">
        <table className="w-full text-left text-xs sans-ui">
          <thead className="bg-[var(--bg-page)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-mono uppercase tracking-wider">
            <tr>
              <th className="p-3">Data / Hora</th>
              <th className="p-3">Usuário</th>
              <th className="p-3">Ação</th>
              <th className="p-3">Detalhes</th>
              <th className="p-3">IP / Origem</th>
            </tr>
          </thead>
          <tbody id="logs-table-body" className="divide-y divide-[var(--border-subtle)] font-mono text-[11px]">
            {fetchedOnce && query.data && logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-[var(--text-muted)] italic font-sans">
                  Nenhum evento registrado com os filtros atuais.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-[var(--bg-page)]/50 transition-colors">
                  <td className="p-3 text-[var(--text-muted)] whitespace-nowrap">
                    {parseTimestamp(log.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="p-3 font-bold text-[var(--text-primary)] whitespace-nowrap">
                    {log.username ? `@${log.username}` : 'Anônimo / Sistema'}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-[var(--bg-page)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3 font-sans text-xs text-[var(--text-secondary)] max-w-xs truncate" title={log.details || ''}>
                    {log.details || '—'}
                  </td>
                  <td className="p-3 text-[var(--text-muted)] whitespace-nowrap">{log.ip_address || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs sans-ui text-[var(--text-muted)] pt-2">
        <button
          type="button"
          id="logs-prev-btn"
          disabled={page <= 1}
          onClick={() => page > 1 && fetchPage(page - 1, applied)}
          className="px-3 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          &larr; Página Anterior
        </button>
        <span id="logs-page-indicator">
          {fetchedOnce ? `Página ${page} de ${Math.ceil(total / LOGS_PAGE_SIZE) || 1}` : 'Página 1'}
        </span>
        <button
          type="button"
          id="logs-next-btn"
          disabled={fetchedOnce && page * LOGS_PAGE_SIZE >= total}
          onClick={() => fetchPage(page + 1, applied)}
          className="px-3 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Próxima Página &rarr;
        </button>
      </div>
    </section>
  );
}

export function AdminPage({ session }: { session: SessionInfo }) {
  usePageChrome(
    'Painel de Administração | Biblioteca Acadêmica',
    'min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors duration-200 py-8 px-4 sm:px-8',
  );
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('users');
  const [alert, setAlert] = useState<Alert>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [passwordFor, setPasswordFor] = useState<PublicUser | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: api.admin.users });
  const permissionsCount = useQuery({ queryKey: ['admin', 'permissions'], queryFn: api.admin.permissions }).data
    ?.permissions.length;
  const users = usersQuery.data?.users ?? [];

  useEffect(() => {
    if (!alert) return;
    alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const timer = setTimeout(() => setAlert(null), 5000);
    return () => clearTimeout(timer);
  }, [alert]);

  /** Same as reloading the page after a change (the previous version reloaded after 800 ms). */
  const refreshAll = () => {
    setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['admin'] }), 800);
  };

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const data = await api.admin.createUser(payload);
      setAlert({ type: 'success', message: `Usuário "${data.user.username}" criado com sucesso!` });
      setCreateOpen(false);
      form.reset();
      refreshAll();
    } catch (err) {
      // biome-ignore lint/suspicious/noAlert: same feedback as before.
      window.alert(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    }
  }

  async function onEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    try {
      await api.admin.updateUser({ id: editing.id, displayName: form.get('displayName'), role: form.get('role') });
      setAlert({ type: 'success', message: 'Usuário atualizado com sucesso!' });
      setEditing(null);
      refreshAll();
    } catch (err) {
      // biome-ignore lint/suspicious/noAlert: same feedback as the other admin actions.
      window.alert(err instanceof Error ? err.message : 'Erro ao atualizar usuário.');
    }
  }

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordFor) return;
    const form = event.currentTarget;
    const newPassword = String(new FormData(form).get('newPassword') ?? '');
    try {
      await api.admin.updateUser({ id: passwordFor.id, newPassword });
      setAlert({ type: 'success', message: 'Senha atualizada com sucesso!' });
      setPasswordFor(null);
      form.reset();
    } catch (err) {
      // biome-ignore lint/suspicious/noAlert: same feedback as before.
      window.alert(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    }
  }

  async function onDelete(user: PublicUser) {
    if (
      // biome-ignore lint/suspicious/noAlert: destructive action confirmation, as before.
      !window.confirm(
        `Tem certeza que deseja EXCLUIR permanentemente o usuário @${user.username} e todos os seus cadernos? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    try {
      await api.admin.deleteUser(user.id);
      setAlert({ type: 'success', message: `Usuário @${user.username} excluído com sucesso.` });
      refreshAll();
    } catch (err) {
      // biome-ignore lint/suspicious/noAlert: same feedback as before.
      window.alert(err instanceof Error ? err.message : 'Erro ao excluir usuário.');
    }
  }

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--border-subtle)]">
          <div className="space-y-1">
            <div className="sans-ui flex items-center gap-2 text-xs">
              <Link to="/" className="text-[var(--accent)] hover:underline flex items-center gap-1 font-semibold">
                &larr; Voltar à Biblioteca
              </Link>
              <span className="text-[var(--text-muted)]">•</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--accent)]/15 text-[var(--accent)]">
                ADMINISTRADOR
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">Painel de Administração</h1>
            <p className="font-serif text-sm text-[var(--text-secondary)] italic">
              Gerencie usuários, permissões de compartilhamento de disciplinas e monitore logs do sistema.
            </p>
          </div>
          <HeaderActions />
        </header>

        <div
          id="admin-alert"
          ref={alertRef}
          className={
            alert
              ? `p-4 rounded-xl text-xs sans-ui border ${
                  alert.type === 'error'
                    ? 'bg-red-500/10 text-red-600 border-red-500/30'
                    : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                }`
              : 'hidden p-4 rounded-xl text-xs sans-ui'
          }
          role="alert"
        >
          {alert?.message}
        </div>

        <div className="flex border-b border-[var(--border-subtle)] sans-ui text-sm font-semibold gap-2 overflow-x-auto">
          <TabButton
            active={tab === 'users'}
            onClick={() => setTab('users')}
            label={`Usuários (${users.length})`}
            icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
          <TabButton
            active={tab === 'permissions'}
            onClick={() => setTab('permissions')}
            label={`Permissões (${permissionsCount ?? 0})`}
            icon="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
          <TabButton
            active={tab === 'logs'}
            onClick={() => setTab('logs')}
            label="Logs de Atividade"
            icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </div>

        <div className={tab === 'users' ? '' : 'hidden'}>
          <UsersTab
            users={users}
            currentUserId={session.user.id}
            onCreate={() => setCreateOpen(true)}
            onEdit={setEditing}
            onPassword={setPasswordFor}
            onDelete={onDelete}
          />
        </div>
        <div className={tab === 'permissions' ? '' : 'hidden'}>
          <PermissionsTab onAlert={setAlert} onChanged={refreshAll} />
        </div>
        <div className={tab === 'logs' ? '' : 'hidden'}>
          <LogsTab users={users} />
        </div>
      </div>

      <Modal open={createOpen}>
        <div className="space-y-1">
          <h3 className="font-serif text-xl font-bold text-[var(--text-primary)]">Criar Novo Usuário</h3>
          <p className="font-serif text-xs text-[var(--text-secondary)] italic">
            O novo usuário terá sua própria pasta de cadernos isolada no servidor.
          </p>
        </div>
        <form id="form-create-user" className="space-y-4 text-xs sans-ui" onSubmit={onCreate}>
          <div className="space-y-1">
            <label htmlFor="create-username" className="block font-semibold text-[var(--text-secondary)]">
              Nome de Usuário (login):
            </label>
            <input
              id="create-username"
              type="text"
              name="username"
              required
              placeholder="ex: joao.silva"
              pattern="^[a-zA-Z0-9._\-]+$"
              className={`${MODAL_INPUT} font-mono`}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="create-display-name" className="block font-semibold text-[var(--text-secondary)]">
              Nome de Exibição:
            </label>
            <input id="create-display-name" type="text" name="displayName" required placeholder="ex: João Silva" className={MODAL_INPUT} />
          </div>
          <div className="space-y-1">
            <label htmlFor="create-password" className="block font-semibold text-[var(--text-secondary)]">
              Senha Inicial:
            </label>
            <input
              id="create-password"
              type="password"
              name="password"
              required
              minLength={6}
              placeholder="mínimo 6 caracteres"
              className={MODAL_INPUT}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="create-role" className="block font-semibold text-[var(--text-secondary)]">
              Perfil de Acesso:
            </label>
            <select id="create-role" name="role" className={MODAL_INPUT}>
              <option value="normal">Normal (Estudante)</option>
              <option value="admin">Administrador do Sistema</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-3">
            <button type="button" id="close-create-user-modal" className={CANCEL_BUTTON} onClick={() => setCreateOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className={PRIMARY_BUTTON}>
              Salvar Usuário
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={editing !== null}>
        <div className="space-y-1">
          <h3 className="font-serif text-xl font-bold text-[var(--text-primary)]">Editar Usuário</h3>
          <p className="font-serif text-xs text-[var(--text-secondary)] italic">
            Altere o nome de exibição e o perfil de acesso de @{editing?.username}.
          </p>
        </div>
        {editing && (
          <form key={editing.id} id="form-edit-user" className="space-y-4 text-xs sans-ui" onSubmit={onEdit}>
            <div className="space-y-1">
              <label htmlFor="edit-display-name" className="block font-semibold text-[var(--text-secondary)]">
                Nome de Exibição:
              </label>
              <input
                id="edit-display-name"
                type="text"
                name="displayName"
                required
                defaultValue={editing.displayName}
                className={MODAL_INPUT}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-role" className="block font-semibold text-[var(--text-secondary)]">
                Perfil de Acesso:
              </label>
              <select id="edit-role" name="role" defaultValue={editing.role} className={MODAL_INPUT}>
                <option value="normal">Normal (Estudante)</option>
                <option value="admin">Administrador do Sistema</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3">
              <button type="button" className={CANCEL_BUTTON} onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button type="submit" className={PRIMARY_BUTTON}>
                Salvar Alterações
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={passwordFor !== null}>
        <div className="space-y-1">
          <h3 className="font-serif text-xl font-bold text-[var(--text-primary)]">Redefinir Senha</h3>
          <p id="password-modal-subtitle" className="font-serif text-xs text-[var(--text-secondary)] italic">
            {passwordFor ? `Defina a nova senha para o usuário @${passwordFor.username}` : ''}
          </p>
        </div>
        <form id="form-change-password" className="space-y-4 text-xs sans-ui" onSubmit={onPassword}>
          <div className="space-y-1">
            <label htmlFor="new-password-input" className="block font-semibold text-[var(--text-secondary)]">
              Nova Senha:
            </label>
            <input
              type="password"
              id="new-password-input"
              name="newPassword"
              required
              minLength={6}
              placeholder="mínimo 6 caracteres"
              className={MODAL_INPUT}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-3">
            <button type="button" id="close-password-modal" className={CANCEL_BUTTON} onClick={() => setPasswordFor(null)}>
              Cancelar
            </button>
            <button type="submit" className={PRIMARY_BUTTON}>
              Atualizar Senha
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
