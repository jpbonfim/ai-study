import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { loginRedirectPath } from './session';

export const queryClient = new QueryClient({
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
