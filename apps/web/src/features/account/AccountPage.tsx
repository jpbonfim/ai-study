import type { SessionInfo } from '@ai-study/server/api-types';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { HeaderActions } from '../../components/HeaderActions';
import { usePageChrome } from '../../lib/page-chrome';

type Feedback = { type: 'success' | 'error'; message: string } | null;

const FILE_INPUT_CLASS =
  'sans-ui w-full text-xs text-[var(--text-secondary)] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-[var(--border-subtle)] file:bg-[var(--bg-page)] file:text-[var(--text-primary)] file:font-semibold hover:file:bg-[var(--bg-surface-hover)] file:cursor-pointer';

/** Posts an upload form and turns the response (JSON or plain text) into user feedback. */
async function submitUpload(form: HTMLFormElement): Promise<Feedback> {
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: new FormData(form) });
    if (!(res.headers.get('content-type') || '').includes('application/json')) {
      const raw = await res.text();
      return { type: 'error', message: raw || `Erro no servidor (HTTP ${res.status})` };
    }
    const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
    return res.ok && data.success
      ? { type: 'success', message: data.message || 'Upload concluído com sucesso!' }
      : { type: 'error', message: data.error || 'Erro ao processar upload.' };
  } catch (err) {
    return { type: 'error', message: `Falha ao enviar: ${err instanceof Error ? err.message : 'Erro de conexão com o servidor.'}` };
  }
}

export function AccountPage({ session }: { session: SessionInfo }) {
  usePageChrome(
    'Minha Conta & Gerenciamento de Arquivos | Biblioteca Acadêmica',
    'min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors duration-200 py-10 px-4 sm:px-8',
  );
  const { user, uploadLimitMb } = session;
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: api.subjects }).data?.own ?? [];
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [downloadSlug, setDownloadSlug] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [fullUploading, setFullUploading] = useState(false);
  const [subjectUploading, setSubjectUploading] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);

  function showFeedback(next: Feedback) {
    setFeedback(next);
    requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  async function onFullUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // biome-ignore lint/suspicious/noAlert: destructive action confirmation, as before.
    if (!window.confirm('Deseja realmente substituir TODO o seu acervo de estudos?')) return;
    const form = event.currentTarget;
    setFullUploading(true);
    const result = await submitUpload(form);
    if (result?.type === 'success') {
      form.reset();
      setConfirmText('');
    }
    showFeedback(result);
    setFullUploading(false);
  }

  async function onSubjectUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubjectUploading(true);
    const result = await submitUpload(form);
    if (result?.type === 'success') form.reset();
    showFeedback(result);
    setSubjectUploading(false);
  }

  const feedbackClass = !feedback
    ? 'hidden p-4 rounded-xl text-sm sans-ui transition-all'
    : feedback.type === 'error'
      ? 'p-4 rounded-xl text-sm sans-ui transition-all bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
      : 'p-4 rounded-xl text-sm sans-ui transition-all bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';

  const selectedSlug = downloadSlug || subjects[0]?.slug || '';

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <header className="flex items-center justify-between pb-6 border-b border-[var(--border-subtle)]">
        <div className="space-y-1">
          <div className="sans-ui flex items-center gap-2 text-xs">
            <Link to="/" className="text-[var(--accent)] hover:underline flex items-center gap-1 font-semibold">
              &larr; Voltar à Biblioteca
            </Link>
            <span className="text-[var(--text-muted)]">•</span>
            <span className="text-[var(--text-secondary)] font-mono">@{user.username}</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-[var(--text-primary)]">Minha Conta</h1>
        </div>
        <HeaderActions />
      </header>

      <section className="p-6 sm:p-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/30 flex items-center justify-center font-serif text-2xl font-bold shrink-0">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-xl font-bold text-[var(--text-primary)]">{user.displayName}</h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                    user.role === 'admin'
                      ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                      : 'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/30'
                  }`}
                >
                  {user.role === 'admin' ? 'Administrador' : 'Estudante'}
                </span>
              </div>
              <p className="sans-ui text-xs font-mono text-[var(--text-muted)] mt-0.5">
                @{user.username} • ID #{user.id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {user.role === 'admin' && (
              <Link
                to="/admin"
                className="sans-ui px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--accent)] hover:border-[var(--accent)] text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Painel Admin</span>
              </Link>
            )}
            <a
              href="/api/logout"
              className="sans-ui px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-colors"
            >
              Sair da Sessão
            </a>
          </div>
        </div>

        <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between text-xs text-[var(--text-secondary)] sans-ui gap-2">
          <span>
            Disciplinas cadastradas no seu archive: <strong>{subjects.length}</strong>
          </span>
          <span className="font-mono text-[11px] text-[var(--text-muted)]">Limite de upload: {uploadLimitMb} MB</span>
        </div>
      </section>

      <div id="feedback-alert" ref={feedbackRef} className={feedbackClass} role="alert">
        {feedback?.message}
      </div>

      <section className="p-6 sm:p-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-6 shadow-2xs">
        <div className="space-y-1">
          <span className="sans-ui text-xs font-mono uppercase tracking-widest text-[var(--accent)] font-semibold">
            Exportação Local
          </span>
          <h2 className="font-serif text-2xl font-bold text-[var(--text-primary)]">Baixar Archive em ZIP</h2>
          <p className="font-serif text-sm text-[var(--text-secondary)] italic">
            Exporte seus cadernos e resoluções para guardar cópia local ou migrar entre dispositivos.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <a
            href="/api/download?type=archive"
            className="sans-ui p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] hover:border-[var(--accent)] hover:bg-[var(--bg-surface-hover)] transition-all flex flex-col justify-between group shadow-2xs min-w-0"
          >
            <div className="space-y-1">
              <span className="font-bold text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span>Archive Completo (.zip)</span>
              </span>
              <p className="text-xs text-[var(--text-muted)]">
                Todas as disciplinas ({subjects.length}), capítulos e questões cadastradas.
              </p>
            </div>
            <span className="text-xs text-[var(--accent)] font-semibold mt-3 flex items-center gap-1">
              <span>Fazer Download</span>
              <span>&darr;</span>
            </span>
          </a>

          {subjects.length > 0 && (
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] flex flex-col justify-between space-y-3 shadow-2xs min-w-0">
              <div className="space-y-1">
                <span className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2 sans-ui">
                  <svg className="w-4 h-4 text-[var(--accent)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span>Matéria Individual (.zip)</span>
                </span>
                <p className="text-xs text-[var(--text-muted)]">Selecione uma disciplina para exportar isoladamente.</p>
              </div>

              <div className="flex items-center gap-2 pt-1 min-w-0 w-full">
                <select
                  id="download-materia-select"
                  className="sans-ui flex-1 min-w-0 w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] truncate cursor-pointer"
                  value={selectedSlug}
                  onChange={(e) => setDownloadSlug(e.target.value)}
                >
                  {subjects.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  id="download-materia-btn"
                  className="sans-ui shrink-0 px-3.5 py-1.5 text-xs rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white dark:text-black font-semibold hover:opacity-90 transition-opacity cursor-pointer text-center"
                  onClick={() => {
                    if (selectedSlug) {
                      window.location.href = `/api/download?type=materia&materia=${encodeURIComponent(selectedSlug)}`;
                    }
                  }}
                >
                  Baixar
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="p-6 sm:p-8 rounded-2xl border border-red-500/40 bg-[var(--bg-surface)] space-y-6 shadow-2xs">
        <div className="space-y-1">
          <span className="sans-ui text-xs font-mono uppercase tracking-widest text-red-500 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Substituição Total
          </span>
          <h2 className="font-serif text-2xl font-bold text-[var(--text-primary)]">Upload do Archive Completo</h2>
          <p className="font-serif text-sm text-[var(--text-secondary)] italic">
            Substitui todo o seu diretório de estudos no servidor com o conteúdo do arquivo ZIP.
          </p>
        </div>

        <div
          className="p-4 rounded-xl border-2 border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400 space-y-2 sans-ui text-xs leading-relaxed"
          role="alert"
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>ATENÇÃO: AÇÃO DESTRUTIVA E IRREVERSÍVEL</span>
          </div>
          <p>
            O envio de um novo archive completo <strong>eliminará e substituirá permanentemente</strong> todas as suas
            matérias, resumos, questões e imagens existentes no servidor. Recomenda-se baixar um backup antes de prosseguir.
          </p>
          <p className="text-[11px] opacity-90">
            Limite de upload: <strong>{uploadLimitMb} MB</strong>. O arquivo ZIP será automaticamente descompactado e
            excluído do disco em seguida.
          </p>
        </div>

        <form id="full-archive-form" className="space-y-4" onSubmit={onFullUpload}>
          <input type="hidden" name="type" value="archive" />

          <div className="space-y-1.5">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: markup kept identical to the previous version. */}
            <label className="block sans-ui text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Arquivo ZIP do Archive
            </label>
            <input type="file" name="file" accept=".zip" required className={FILE_INPUT_CLASS} />
          </div>

          <div className="p-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] space-y-2">
            <label htmlFor="confirm-text-full" className="block sans-ui text-xs font-bold text-[var(--text-primary)]">
              Digite <span className="font-mono text-red-500 font-extrabold tracking-wider">CONFIRMAR</span> para liberar o
              envio:
            </label>
            <input
              type="text"
              id="confirm-text-full"
              placeholder="Digite CONFIRMAR"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="sans-ui w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:border-red-500"
            />
          </div>

          <button
            type="submit"
            id="submit-full-btn"
            disabled={fullUploading || confirmText.trim() !== 'CONFIRMAR'}
            className="sans-ui w-full py-2.5 px-4 rounded-lg border border-red-500 bg-red-600 text-white font-semibold text-xs hover:bg-red-700 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2"
          >
            {fullUploading ? 'Enviando e processando archive...' : <span>Substituir Archive Completo</span>}
          </button>
        </form>
      </section>

      <section className="p-6 sm:p-8 rounded-2xl border border-amber-500/40 bg-[var(--bg-surface)] space-y-6 shadow-2xs">
        <div className="space-y-1">
          <span className="sans-ui text-xs font-mono uppercase tracking-widest text-amber-500 font-semibold">
            Substituição Modular
          </span>
          <h2 className="font-serif text-2xl font-bold text-[var(--text-primary)]">Upload de Matéria Específica</h2>
          <p className="font-serif text-sm text-[var(--text-secondary)] italic">
            Atualiza ou adiciona apenas uma disciplina específica sem tocar nas outras matérias.
          </p>
        </div>

        <div
          className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 space-y-1 sans-ui text-xs leading-relaxed"
          role="alert"
        >
          <div className="font-bold flex items-center gap-1.5">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Aviso de Substituição Parcial</span>
          </div>
          <p>
            O envio atualizará exclusivamente o conteúdo da matéria indicada. Se a pasta já existir, ela será substituída
            pelos novos arquivos do ZIP.
          </p>
        </div>

        <form id="materia-form" className="space-y-4" onSubmit={onSubjectUpload}>
          <input type="hidden" name="type" value="materia" />

          <div className="space-y-1.5">
            <label
              htmlFor="materia_slug_input"
              className="block sans-ui text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider"
            >
              Identificador da Matéria (slug da pasta, ex: pds)
            </label>
            <input
              type="text"
              id="materia_slug_input"
              name="materia_slug"
              required
              placeholder="ex: pds"
              pattern="^[a-z0-9\-_]+$"
              className="sans-ui w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
            />
          </div>

          <div className="space-y-1.5">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: markup kept identical to the previous version. */}
            <label className="block sans-ui text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Arquivo ZIP da Matéria
            </label>
            <input type="file" name="file" accept=".zip" required className={FILE_INPUT_CLASS} />
          </div>

          <button
            type="submit"
            id="submit-materia-btn"
            disabled={subjectUploading}
            className="sans-ui w-full py-2.5 px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white dark:text-black font-semibold text-xs hover:opacity-90 transition-all cursor-pointer shadow-xs flex items-center justify-center gap-2"
          >
            {subjectUploading ? 'Enviando matéria...' : <span>Enviar Matéria</span>}
          </button>
        </form>
      </section>

      <footer className="p-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 text-xs text-[var(--text-muted)] sans-ui space-y-2">
        <div className="font-bold text-[var(--text-secondary)]">Diretrizes de Formato e Segurança</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Extensões aceitas dentro do ZIP: <code>.md</code>, <code>.mdx</code>, <code>.json</code>, <code>.png</code>,{' '}
            <code>.jpg</code>, <code>.jpeg</code>, <code>.svg</code>, <code>.webp</code>, <code>.gif</code>.
          </li>
          <li>
            Cada pasta de disciplina deve conter um arquivo <code>materia.json</code> com os metadados (nome, código,
            tópicos).
          </li>
          <li>Após a extração, o arquivo compactado é permanentemente deletado do servidor para economia de espaço.</li>
        </ul>
      </footer>
    </div>
  );
}
