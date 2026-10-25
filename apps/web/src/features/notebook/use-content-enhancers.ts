import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { initCodeBlocks, installCodeThemeSync, setCardsCodeTheme } from '../../enhancers/code-blocks';
import { initDiagrams } from '../../enhancers/diagrams';
import { initEquationGroups } from '../../enhancers/equation-groups';
import { initQuestionSequences } from '../../enhancers/question-sequences';
import { initTableOptimizer } from '../../enhancers/table-optimizer';

async function runEnhancers(): Promise<void> {
  const steps: [string, () => unknown][] = [
    ['tableOptimizer', initTableOptimizer],
    ['diagramManager', initDiagrams],
    ['codeBlocks', initCodeBlocks],
    ['questionSequence', initQuestionSequences],
    ['equationGroups', initEquationGroups],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      console.warn(`[Optimizer] ${name}:`, err);
    }
  }
}

/**
 * Applies the content enhancers (tables, diagrams, code cards, question sequences, equation
 * groups) to rendered study content. Returns a function to call after new content is inserted;
 * calls within the same frame are coalesced. Also re-renders Mermaid diagrams on theme changes.
 */
export function useContentEnhancers(): () => void {
  const scheduled = useRef(0);

  useEffect(() => {
    installCodeThemeSync();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-theme') void initDiagrams();
        if (mutation.attributeName === 'data-code-theme') {
          const theme = document.documentElement.getAttribute('data-code-theme');
          if (theme) setCardsCodeTheme(theme);
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-code-theme'] });
    return () => observer.disconnect();
  }, []);

  return useCallback(() => {
    if (scheduled.current) return;
    scheduled.current = requestAnimationFrame(() => {
      scheduled.current = 0;
      void runEnhancers();
    });
  }, []);
}

/** Lets content components (chapters, question sections) ask the layout to re-run enhancers. */
export const ContentRefreshContext = createContext<() => void>(() => undefined);

export function useContentRefresh(): () => void {
  return useContext(ContentRefreshContext);
}
