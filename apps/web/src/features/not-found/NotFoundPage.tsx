import { usePageChrome } from '../../lib/page-chrome';

export function NotFoundPage() {
  usePageChrome('404: Not found');
  return (
    <main className="max-w-xl mx-auto px-6 py-24 text-center space-y-3 sans-ui">
      <h1 className="font-serif text-3xl font-bold">404: Not found</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        Página não encontrada.{' '}
        <a href="/" className="text-[var(--accent)] hover:underline">
          Voltar à Biblioteca
        </a>
      </p>
    </main>
  );
}
