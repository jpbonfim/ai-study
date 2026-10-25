import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { SESSION_QUERY_KEY, useSessionQuery } from '../../app/session';
import { usePageChrome } from '../../lib/page-chrome';

const INPUT_CLASS =
  'sans-ui w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-page)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:outline-none transition-all shadow-2xs';

type SubmitState = 'idle' | 'submitting' | 'success';

export function LoginPage() {
  usePageChrome(
    'Acesso à Biblioteca | Cadernos de Estudo Acadêmico',
    'min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors duration-200 flex flex-col justify-between py-8 px-4 sm:px-6',
  );
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSessionQuery();
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState>('idle');

  if (session.data) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setState('submitting');
    try {
      const res = await api.login(String(form.get('username') ?? ''), String(form.get('password') ?? ''));
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (res.ok && data.success) {
        setState('success');
        await queryClient.resetQueries({ queryKey: SESSION_QUERY_KEY });
        navigate(redirect, { replace: true });
      } else {
        setError(data.error || 'Falha na autenticação. Verifique os dados.');
        setState('idle');
      }
    } catch {
      setError('Erro de rede ou servidor indisponível. Tente novamente.');
      setState('idle');
    }
  }

  const submitText = state === 'submitting' ? 'Autenticando...' : state === 'success' ? 'Sucesso! Redirecionando...' : 'Entrar na Biblioteca';

  return (
    <>
      <header className="max-w-md mx-auto w-full text-center space-y-2">
        <span className="sans-ui text-[11px] font-mono uppercase tracking-widest text-[var(--accent)] font-semibold">
          Biblioteca Acadêmica Digital
        </span>
        <div className="h-0.5 w-12 bg-[var(--accent)] mx-auto rounded-full" />
      </header>

      <main className="max-w-md mx-auto w-full my-auto">
        <div className="p-8 sm:p-10 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-sm space-y-8">
          <div className="text-center space-y-2">
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--text-primary)] tracking-tight">
              Autenticação
            </h1>
            <p className="font-serif text-sm text-[var(--text-secondary)] italic">
              Informe suas credenciais para acessar seus cadernos de estudo e materiais didáticos.
            </p>
          </div>

          <div
            id="error-banner"
            className={`${error ? '' : 'hidden '}p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs sans-ui text-center leading-relaxed`}
            role="alert"
          >
            {error}
          </div>

          <form id="login-form" className="space-y-5" method="POST" action="/api/login" onSubmit={onSubmit}>
            <input type="hidden" name="redirect" id="redirect-input" value={redirect} />

            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block sans-ui text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider"
              >
                Usuário
              </label>
              <input
                type="text"
                id="username"
                name="username"
                required
                // biome-ignore lint/a11y/noAutofocus: the login page exists to type credentials.
                autoFocus
                autoComplete="username"
                placeholder="seu.usuario"
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block sans-ui text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider"
              >
                Senha
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={INPUT_CLASS}
              />
            </div>

            <button
              type="submit"
              id="submit-btn"
              disabled={state !== 'idle'}
              className="sans-ui w-full py-3 px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] hover:opacity-90 text-white dark:text-black font-semibold text-sm transition-all cursor-pointer shadow-xs flex items-center justify-center gap-2 mt-2"
            >
              <span id="submit-text">{submitText}</span>
              <span id="submit-spinner" className={`${state === 'idle' ? 'hidden ' : ''}animate-spin`}>
                &#9696;
              </span>
            </button>
          </form>

          <div className="pt-4 border-t border-[var(--border-subtle)] text-center">
            <p className="font-serif text-xs text-[var(--text-muted)] italic">
              Contas são criadas e administradas pelo responsável do sistema.
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-md mx-auto w-full text-center sans-ui text-xs text-[var(--text-muted)]">
        Sessão protegida por criptografia com controle de acesso granular.
      </footer>
    </>
  );
}
