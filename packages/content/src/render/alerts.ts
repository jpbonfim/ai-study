/** GitHub-style alerts (`> [!NOTE]`, `[!TIP]`, ...) rendered as academic callout cards. */

const ALERT_ICONS: Record<string, string> = {
  note: `<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>`,
  tip: `<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.628-.756-1.596-1.92-1.596-3.579C2.5 2.454 4.887 0 8 0s5.5 2.454 5.5 5.25c0 1.659-.968 2.823-1.596 3.58a8.463 8.463 0 0 0-.541.679c-.208.3-.33.565-.371.847a.75.75 0 0 1-1.485-.21c.084-.595.337-1.08.62-1.492.204-.291.451-.583.675-.848.064-.076.134-.16.213-.253.56-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5Zm1 3h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1 0-1.5Z"></path></svg>`,
  important: `<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .25.25.25.25.25h3a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h5.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm6.25 2.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>`,
  warning: `<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>`,
  caution: `<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>`,
};

const DEFAULT_ALERT_TITLES: Record<string, string> = {
  note: 'Nota',
  tip: 'Dica',
  important: 'Importante',
  warning: 'Atenção',
  caution: 'Cuidado',
};

function parseAlertBlock(innerHtml: string): { type: string; title: string; bodyHtml: string } | null {
  const pMatch = innerHtml.match(/^\s*<p>([\s\S]*?)<\/p>([\s\S]*)$/i);
  if (!pMatch) return null;

  const firstPara = pMatch[1] ?? '';
  const remaining = pMatch[2] ? pMatch[2].trim() : '';

  const headerMatch = firstPara.match(
    /^[^\S\r\n]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\S\r\n]*([^\r\n<]*)(?:(?:\r?\n|<br\s*\/?>)([\s\S]*))?$/i,
  );
  if (!headerMatch) return null;

  const type = (headerMatch[1] ?? '').toLowerCase();
  const rawTitle = (headerMatch[2] || '').replace(/^[\s:\-–—]+/, '').trim();
  const restOfFirstPara = (headerMatch[3] || '').trim();

  const title = rawTitle || DEFAULT_ALERT_TITLES[type] || type.toUpperCase();

  let bodyHtml = '';
  if (restOfFirstPara) {
    bodyHtml += `<p>${restOfFirstPara}</p>`;
  }
  if (remaining) {
    bodyHtml += (bodyHtml ? '\n' : '') + remaining;
  }

  return { type, title, bodyHtml };
}

function renderAlertHtml({ type, title, bodyHtml }: { type: string; title: string; bodyHtml: string }): string {
  const icon = ALERT_ICONS[type] || '';
  return `<div class="markdown-alert markdown-alert-${type}" data-alert-type="${type}">
  <div class="markdown-alert-title">
    <span class="markdown-alert-icon-wrapper">${icon}</span>
    <span class="markdown-alert-title-text">${title}</span>
  </div>${bodyHtml ? `\n  <div class="markdown-alert-content">\n${bodyHtml}\n  </div>` : ''}
</div>`;
}

export function renderAlerts(html: string): string {
  if (!html?.includes('[!')) return html;

  // 1. Blockquotes produced by "> [!TYPE]"
  html = html.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (match, inner) => {
    const alert = parseAlertBlock(inner);
    if (!alert) return match;
    return renderAlertHtml(alert);
  });

  // 2. Loose paragraphs (no blockquote) starting directly with "[!TYPE]"
  html = html.replace(/<p>([^\S\r\n]*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][\s\S]*?)<\/p>/gi, (match, pInner) => {
    const alert = parseAlertBlock(`<p>${pInner}</p>`);
    if (!alert) return match;
    return renderAlertHtml(alert);
  });

  return html;
}
