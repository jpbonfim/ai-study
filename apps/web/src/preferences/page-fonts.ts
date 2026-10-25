/**
 * Google Fonts stylesheet of each page, matching what each page of the previous version loaded:
 * interface pages load the UI fonts, reading pages add Lora (a reading font option) and the
 * settings page also loads every JetBrains Mono weight and its italics (it previews all options).
 * Pages without a font's italics get the browser's synthesized italic, as before.
 */
const FAMILIES = {
  garamond: 'family=EB+Garamond:ital,wght@0,400..800;1,400..800',
  newsreader: 'family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700',
  monoRegular: 'family=JetBrains+Mono:wght@400;500',
  monoComplete: 'family=JetBrains+Mono:ital,wght@0,400..700;1,400..700',
  lora: 'family=Lora:ital,wght@0,400..700;1,400..700',
};

const stylesheet = (...families: string[]) => `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;

const FONT_STYLESHEETS = {
  interface: stylesheet(FAMILIES.garamond, FAMILIES.newsreader, FAMILIES.monoRegular),
  reading: stylesheet(FAMILIES.garamond, FAMILIES.newsreader, FAMILIES.monoRegular, FAMILIES.lora),
  settings: stylesheet(FAMILIES.garamond, FAMILIES.newsreader, FAMILIES.monoComplete, FAMILIES.lora),
};

type FontSet = keyof typeof FONT_STYLESHEETS;

const INTERFACE_PAGES = new Set(['', 'login', 'conta', 'admin', 'upload']);

function fontSetForPath(pathname: string): FontSet {
  const firstSegment = pathname.split('/').filter(Boolean)[0] ?? '';
  if (firstSegment === 'configuracoes') return 'settings';
  return INTERFACE_PAGES.has(firstSegment) ? 'interface' : 'reading';
}

const LINK_ID = 'page-fonts';

/** Points the page's font stylesheet at the set the page uses (creating the link on first use). */
export function applyPageFonts(pathname: string): void {
  const href = FONT_STYLESHEETS[fontSetForPath(pathname)];
  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    // Like the server-rendered <link> it replaces: text waits for the font definitions.
    link.setAttribute('blocking', 'render');
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}
