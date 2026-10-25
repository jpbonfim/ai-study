import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router';
import { ApiError, api } from '../api/client';
import { AccountPage } from '../features/account/AccountPage';
import { AdminPage } from '../features/admin/AdminPage';
import { HomePage } from '../features/home/HomePage';
import { LoginPage } from '../features/login/LoginPage';
import { NotebookPage } from '../features/notebook/NotebookPage';
import { QuestionBankPage } from '../features/notebook/QuestionBankPage';
import { QuestionPage } from '../features/notebook/QuestionPage';
import { NotFoundPage } from '../features/not-found/NotFoundPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { trackLocation } from '../lib/navigation-history';
import { installCacheShortcut } from '../lib/study-cache';
import { applyDocumentPreferences, scopeForPath } from '../preferences/document-preferences';
import { ThemeProvider } from '../preferences/theme';
import { loginRedirectPath, RequireSession } from './session';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
  queryCache: new QueryCache({
    onError: (error) => {
      // An expired session anywhere sends the user back to the login page.
      if (error instanceof ApiError && error.status === 401 && window.location.pathname !== '/login') {
        window.location.href = loginRedirectPath(window.location.pathname, window.location.search);
      }
    },
  }),
});

/** Cross-page effects: preferences scope per route, page-view audit, scroll reset, Alt+C. */
/** Plain links (e.g. inside rendered content) navigate inside the app instead of reloading it. */
function useInAppLinks(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest('a');
      const href = anchor?.getAttribute('href');
      if (!anchor || !href || href === '#' || anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target !== '_self') return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || /^\/(api|admin\/api)\//.test(url.pathname)) return;
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
      { path: '/configuracoes', element: <RequireSession>{(s) => <SettingsPage session={s} />}</RequireSession> },
      { path: '/conta', element: <RequireSession>{(s) => <AccountPage session={s} />}</RequireSession> },
      { path: '/upload', element: <Navigate to="/conta" replace /> },
      { path: '/admin', element: <RequireSession admin>{(s) => <AdminPage session={s} />}</RequireSession> },
      { path: '/:materia', element: <RequireSession>{(s) => <NotebookPage session={s} />}</RequireSession> },
      {
        path: '/:materia/questoes',
        element: <RequireSession>{(s) => <QuestionBankPage session={s} />}</RequireSession>,
      },
      {
        path: '/:materia/questoes/:slug',
        element: <RequireSession>{(s) => <QuestionPage session={s} />}</RequireSession>,
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
