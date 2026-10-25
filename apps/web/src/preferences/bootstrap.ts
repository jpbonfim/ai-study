/**
 * Inlined into index.html (see vite.config.ts) and executed before the first paint, so the page
 * never flashes with the wrong theme, font or sidebar state.
 */
import { applyDocumentPreferences, scopeForPath } from './document-preferences';
import { applyPageFonts } from './page-fonts';

const root = document.documentElement;
applyDocumentPreferences(root, scopeForPath(window.location.pathname));
applyPageFonts(window.location.pathname);
// Jumping to an anchor on load must not animate.
if (window.location.hash) root.style.scrollBehavior = 'auto';
