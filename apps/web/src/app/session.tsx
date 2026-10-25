import type { SessionInfo } from '@ai-study/server/api-types';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ApiError, api } from '../api/client';
import { configureRenderCache } from '../render/render-cache';

export const SESSION_QUERY_KEY = ['session'] as const;

export function useSessionQuery() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      const session = await api.session();
      configureRenderCache(session.clientCache);
      return session;
    },
    retry: false,
    staleTime: 60_000,
  });
}

/** Login URL that brings the user back to where they were (`/` needs no redirect). */
export function loginRedirectPath(pathname: string, search: string): string {
  return pathname !== '/' ? `/login?redirect=${encodeURIComponent(pathname + search)}` : '/login';
}

/** Renders children only for signed-in users (optionally admins), redirecting otherwise. */
export function RequireSession({
  admin = false,
  children,
}: {
  admin?: boolean;
  children: (session: SessionInfo) => ReactNode;
}) {
  const location = useLocation();
  const session = useSessionQuery();
  if (session.isPending) return null;
  if (session.error) {
    if (session.error instanceof ApiError && session.error.status === 401) {
      return <Navigate to={loginRedirectPath(location.pathname, location.search)} replace />;
    }
    return <div className="p-8 text-sm sans-ui">Erro ao carregar a sessão: {session.error.message}</div>;
  }
  if (admin && session.data.user.role !== 'admin') return <Navigate to="/?error=forbidden" replace />;
  return <>{children(session.data)}</>;
}
