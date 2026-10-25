import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { applyThemeClasses, readTheme, type ThemeName } from './document-preferences';
import { STORAGE_KEYS, writeItem } from './storage';

interface ThemeState {
  theme: ThemeName;
  setTheme(theme: ThemeName): void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readTheme);
  const setTheme = useCallback((next: ThemeName) => {
    const root = document.documentElement;
    applyThemeClasses(root, next);
    // Observers (e.g. Mermaid diagrams) re-render when data-theme changes.
    root.setAttribute('data-theme', next);
    writeItem(STORAGE_KEYS.theme, next);
    setThemeState(next);
  }, []);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
