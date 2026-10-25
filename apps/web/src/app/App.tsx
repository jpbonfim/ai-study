import type { SessionInfo } from '@ai-study/server/api-types';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router';
import { api } from '../api/client';
import { HomePage } from '../features/home/HomePage';
import { LoginPage } from '../features/login/LoginPage';
import { NotFoundPage } from '../features/not-found/NotFoundPage';
import { trackLocation } from '../lib/navigation-history';
import { installCacheShortcut } from '../lib/study-cache';
import { applyDocumentPreferences, scopeForPath } from '../preferences/document-preferences';
import { ThemeProvider } from '../preferences/theme';
import { queryClient } from './query-client';
import { pageModules } from './route-preload';
import { RequireSession } from './session';

/**
 * Route that loads its page module before rendering (route `lazy`, not React.lazy: no Suspense
 * boundary, so the page appears as soon as it is ready, without React's fallback throttling).
 */
function protectedPage<M>(
  loadModule: () => Promise<M>,
  render: (module: M, session: SessionInfo) => ReactNode,
  options: { admin?: boolean } = {},
) {
  return async () => {
    const module = await loadModule();
    return {
      element: <RequireSession admin={options.admin}>{(session) => render(module, session)}</RequireSession>,
    };
  };
}

/** Cross-page effects: preferences scope per route, page-view audit, scroll reset, Alt+C. */
/** Plain links (e.g. inside rendered content) navigate inside the app instead of reloading it. */
function useInAppLinks(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest('a');
      const href = anchor?.getAttribute('href');
      if (!anchor || !href || href === '#' || anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target !== '_self') return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || /^\/(api|admin\/api)\//.test(url.pathname)) return;
      // Anchors within the current page are handled by the page (smooth scroll, lazy chapters).
      if (url.hash && url.pathname.replace(/\/+$/, '') === window.location.pathname.replace(/\/+$/, '')) return;
      event.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);
}

function RootLayout() {
  const location = useLocation();
  useInAppLinks();

  useEffect(() => installCacheShortcut(), []);

  useEffect(() => {
    trackLocation(location.pathname + location.search + location.hash);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    applyDocumentPreferences(document.documentElement, scopeForPath(location.pathname));
    if (location.pathname !== '/login') void api.recordPageView(location.pathname);
  }, [location.pathname]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page (path) starts at the top.
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname, location.hash]);

  return <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <RequireSession>{(s) => <HomePage session={s} />}</RequireSession> },
      { path: '/configuracoes', lazy: protectedPage(pageModules.settings, (m, s) => <m.SettingsPage session={s} />) },
      { path: '/conta', lazy: protectedPage(pageModules.account, (m, s) => <m.AccountPage session={s} />) },
      { path: '/upload', element: <Navigate to="/conta" replace /> },
      {
        path: '/admin',
        lazy: protectedPage(pageModules.admin, (m, s) => <m.AdminPage session={s} />, { admin: true }),
      },
      { path: '/:materia', lazy: protectedPage(pageModules.notebook, (m, s) => <m.NotebookPage session={s} />) },
      {
        path: '/:materia/questoes',
        lazy: protectedPage(pageModules.questionBank, (m, s) => <m.QuestionBankPage session={s} />),
      },
      {
        path: '/:materia/questoes/:slug',
        lazy: protectedPage(pageModules.question, (m, s) => <m.QuestionPage session={s} />),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
