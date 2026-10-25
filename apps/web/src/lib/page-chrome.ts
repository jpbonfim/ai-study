import { useEffect } from 'react';

export const DEFAULT_BODY_CLASS =
  'min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors duration-200';

/** Sets the document title and the `<body>` classes of the current page. */
export function usePageChrome(title: string, bodyClass: string = DEFAULT_BODY_CLASS): void {
  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    document.body.className = bodyClass;
  }, [bodyClass]);
}
