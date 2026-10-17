import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import katex from 'katex';
import { getDataDirectory, getPersistentMdxCache, setPersistentMdxCache } from './db.ts';
import { renderMath } from '../utils/katex.ts';
import { isDevMode, getLocalArchiveDirectory } from './dev-archive.ts';
import { renderBlockDiagramHtml } from './block-diagram-runtime.ts';

export interface SectionItem {
  id: string;
  title: string;
}

export interface ChapterMetadata {
  id: string;
  filePath: string;
  materia: string;
  title: string;
  topic: string;
  chapter: number;
  order: number;
  description: string;
  type: 'materia' | 'questoes';
  tags: string[];
  sections: SectionItem[];
  relatedQuestions: string[];
  ownerUserId: number;
}

export interface ChapterItem extends ChapterMetadata {
  htmlContent: string;
  rawContent: string;
}

export interface QuestionOption {
  label: string;
  text: string;
  renderedText: string;
}

export interface QuestionImage {
  src: string;
  caption?: string;
}

export interface QuestionMetadata {
  id: string;
  filePath: string;
  materia: string;
  title: string;
  exam: string;
  year: number;
  topic: string;
  topicSlug: string;
  tags: string[];
  difficulty: 'Fácil' | 'Médio' | 'Difícil';
  type: 'multipla_escolha' | 'discursiva';
  ownerUserId: number;
}

export interface QuestionItem extends QuestionMetadata {
  statement: string;
  renderedStatement: string;
  options: QuestionOption[];
  correctOption?: string;
  expectedAnswer?: string;
  renderedExpectedAnswer?: string;
  images: QuestionImage[];
  theoryHtml: string;
  resolutionHtml: string;
  bodyHtml: string;
}

// Configuração do marked com renderizador customizado de blocos de código e diagramas
marked.setOptions({
  gfm: true,
  breaks: false,
});

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = (lang || '').trim();
      const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (language === 'mermaid') {
        return `<pre class="mermaid diagram-block" data-language="mermaid"><code class="language-mermaid">${escapedText}</code></pre>\n`;
      }
      return `<pre data-language="${language}"><code class="language-${language}">${escapedText}</code></pre>\n`;
    },
  },
});

// ============================================================
// Renderizador de Alertas GitHub-style ([!NOTE], [!TIP], etc.)
// ============================================================

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

  const firstPara = pMatch[1];
  const remaining = pMatch[2] ? pMatch[2].trim() : '';

  const headerMatch = firstPara.match(
    /^[^\S\r\n]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\S\r\n]*([^\r\n<]*)(?:(?:\r?\n|<br\s*\/?>)([\s\S]*))?$/i
  );
  if (!headerMatch) return null;

  const type = headerMatch[1].toLowerCase();
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
  if (!html || !html.includes('[!')) return html;

  // 1. Processa blocos <blockquote> gerados a partir de "> [!TIPO]"
  html = html.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (match, inner) => {
    const alert = parseAlertBlock(inner);
    if (!alert) return match;
    return renderAlertHtml(alert);
  });

  // 2. Processa parágrafos soltos (sem blockquote) que comecem diretamente com "[!TIPO]"
  html = html.replace(/<p>([^\S\r\n]*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][\s\S]*?)<\/p>/gi, (match, pInner) => {
    const alert = parseAlertBlock(`<p>${pInner}</p>`);
    if (!alert) return match;
    return renderAlertHtml(alert);
  });

  return html;
}

// Cache em memória de itens processados: chave = cacheKey
const renderCache = new Map<string, { mtime: number; data: any }>();

let lastEpochCheckTime = 0;
let lastKnownEpochMtime = 0;

/**
 * Sincroniza o cache em memória com o epoch do servidor.
 * Se o script clear-server-cache.sh atualizar data/.cache_epoch, o cache em memória
 * do processo Node ativo (dev ou produção) é imediatamente limpo.
 */
export function syncServerCacheEpoch(): void {
  const now = Date.now();
  if (now - lastEpochCheckTime < 1000) return;
  lastEpochCheckTime = now;

  try {
    const epochFile = path.join(getDataDirectory(), '.cache_epoch');
    if (fs.existsSync(epochFile)) {
      const stat = fs.statSync(epochFile);
      if (lastKnownEpochMtime > 0 && stat.mtimeMs !== lastKnownEpochMtime) {
        renderCache.clear();
      }
      lastKnownEpochMtime = stat.mtimeMs;
    }
  } catch {}
}

export function clearServerRenderCache(): void {
  renderCache.clear();
}

/**
 * Converte URLs relativas de imagens em endpoints de mídia autenticados
 */
export function rewriteImageUrls(
  html: string,
  ownerUserId: number,
  materiaSlug: string,
  sourceDir: string
): string {
  // Substitui <img src="./imagem.png" ...> e markdown ![] (./imagem.png)
  return html.replace(/(?:src=["']|href=["'])(\.\/[^"']+)["']/g, (match, relUrl) => {
    const cleanRel = relUrl.replace(/^\.\//, '');
    const fullMediaUrl = `/api/media?user=${ownerUserId}&materia=${encodeURIComponent(materiaSlug)}&path=${encodeURIComponent(cleanRel)}`;
    return match.replace(relUrl, fullMediaUrl);
  });
}

/**
 * Renderiza markdown completo com equações KaTeX e suporte a tabelas/GFM
 */
export function renderMarkdownWithKatex(
  content: string,
  ownerUserId: number = 1,
  materiaSlug: string = 'pds',
  sourceDir: string = ''
): string {
  if (!content || !content.trim()) return '';

  // 0. Limpa comentários JSX/MDX e HTML para evitar vazamento como texto na página
  let text = content.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // 1. Localiza todos os blocos display math $$ ... $$ e agrupa os contíguos (sequenciais)
  const mathBlockRegex = /\$\$([\s\S]+?)\$\$/g;
  const blocks: { start: number; end: number; math: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = mathBlockRegex.exec(text)) !== null) {
    blocks.push({
      start: match.index,
      end: mathBlockRegex.lastIndex,
      math: match[1],
    });
  }

  // Agrupa blocos de equações contíguos (separados apenas por espaços e quebras de linha)
  const groups: { start: number; end: number; equations: string[] }[] = [];
  let currentGroup: { start: number; end: number; equations: string[] } | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!currentGroup) {
      currentGroup = {
        start: block.start,
        end: block.end,
        equations: [block.math],
      };
    } else {
      const between = text.slice(currentGroup.end, block.start);
      if (between.trim() === '') {
        currentGroup.end = block.end;
        currentGroup.equations.push(block.math);
      } else {
        groups.push(currentGroup);
        currentGroup = {
          start: block.start,
          end: block.end,
          equations: [block.math],
        };
      }
    }
  }
  if (currentGroup) {
    groups.push(currentGroup);
  }

  const groupHtmlMap = new Map<number, string>();

  // Substitui cada grupo de equações de trás para frente no texto
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    const renderedList = group.equations.map((eq) => {
      try {
        return katex.renderToString(eq.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
      } catch {
        return `$$${eq}$$`;
      }
    });

    let groupHtml = '';
    if (renderedList.length === 1) {
      groupHtml = `<div class="katex-display my-4 overflow-x-auto">${renderedList[0]}</div>`;
    } else {
      const items = renderedList
        .map((r) => `<div class="katex-display-item">${r}</div>`)
        .join('');
      groupHtml = `<div class="katex-display katex-display-group my-4 overflow-x-auto">${items}</div>`;
    }

    groupHtmlMap.set(i, groupHtml);
    text = text.slice(0, group.start) + `\n\n@@MATH_GROUP_${i}@@\n\n` + text.slice(group.end);
  }

  // 2. Inline math $ ... $
  const mathInlineBlocks: string[] = [];
  text = text.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_, math) => {
    try {
      const rendered = katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
        output: 'html',
      });
      const idx = mathInlineBlocks.length;
      mathInlineBlocks.push(rendered);
      return `@@MATH_INLINE_${idx}@@`;
    } catch {
      return `$${math}$`;
    }
  });

  // 3. Renderiza o markdown
  let html = marked.parse(text) as string;

  // 3.5 Processa blocos de alertas GitHub ([!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION])
  html = renderAlerts(html);

  // 4. Limpa tags <p> que envolvam blocos matemáticos display
  html = html.replace(/<p>([\s\S]*?)<\/p>/g, (fullMatch, pContent) => {
    if (!pContent.includes('@@MATH_GROUP_')) return fullMatch;

    const parts = pContent.split(/(@@MATH_GROUP_\d+@@)/g);
    return parts
      .map((part) => {
        if (part.startsWith('@@MATH_GROUP_')) return part;
        const trimmed = part.trim();
        return trimmed ? `<p>${trimmed}</p>` : '';
      })
      .filter(Boolean)
      .join('\n');
  });

  // 5. Restaura blocos matemáticos display e inline
  html = html.replace(/@@MATH_GROUP_(\d+)@@/g, (_, idx) => {
    return groupHtmlMap.get(parseInt(idx, 10)) || '';
  });

  html = html.replace(/@@MATH_INLINE_(\d+)@@/g, (_, idx) => {
    return mathInlineBlocks[parseInt(idx, 10)] || '';
  });

  // 6. Reescreve URLs de imagens
  html = rewriteImageUrls(html, ownerUserId, materiaSlug, sourceDir);

  // 7. Renderiza componentes <BlockDiagram ... /> em HTML/SVG vetorial
  const blockDiagramRegex = /(?:<p>\s*)?<[Bb]lock[Dd]iagram\b([^>]*?)(?:\/>|>(.*?)<\/[Bb]lock[Dd]iagram>)(?:\s*<\/p>)?/gis;
  html = html.replace(blockDiagramRegex, (_, attrs, slot) => {
    return renderBlockDiagramHtml(attrs, slot || '');
  });

  return html;
}

/**
 * Lê e processa um arquivo MDX de resumo (capítulo)
 */
export function processChapterFile(
  filePath: string,
  ownerUserId: number,
  materiaSlug: string
): ChapterItem {
  syncServerCacheEpoch();
  const stat = fs.statSync(filePath);
  const cacheKey = `chap:${filePath}`;
  const cached = renderCache.get(cacheKey);

  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.data as ChapterItem;
  }

  const persistentCached = getPersistentMdxCache(cacheKey, stat.mtimeMs);
  if (persistentCached) {
    renderCache.set(cacheKey, { mtime: stat.mtimeMs, data: persistentCached });
    return persistentCached as ChapterItem;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);

  const fileDir = path.dirname(filePath);
  const isMateriaSubfolder = filePath.includes('/resumos/materia/');
  const resolvedType: 'materia' | 'questoes' = frontmatter.type ||
    frontmatter.studyType ||
    (isMateriaSubfolder ? 'materia' : 'questoes');

  const rawTags = frontmatter.tags || (frontmatter.tag ? [frontmatter.tag] : ['teste-1']);
  const tags = Array.isArray(rawTags) ? rawTags : [rawTags];

  let htmlContent = renderMarkdownWithKatex(content, ownerUserId, materiaSlug, fileDir);

  // Substitui qualquer tag <QuestionCard id="..." /> pelo HTML do card de preview (removendo tags <p> envolventes se geradas pelo Markdown)
  const questionCardRegex = /(?:<p>\s*)?<[Qq]uestion[Cc]ard\s+id=["']([^"']+)["']\s*(?:\/>|>\s*<\/[Qq]uestion[Cc]ard>)(?:\s*<\/p>)?/gi;
  htmlContent = htmlContent.replace(questionCardRegex, (_, qId) => {
    return renderQuestionCardHtml(qId.trim(), ownerUserId, materiaSlug);
  });

  const baseName = path.basename(filePath, path.extname(filePath));
  const id = frontmatter.id || (isMateriaSubfolder && !baseName.startsWith('materia-') ? `materia-${baseName}` : baseName);

  const item: ChapterItem = {
    id,
    filePath,
    materia: frontmatter.materia || materiaSlug,
    title: frontmatter.title || `Capítulo ${frontmatter.chapter || 1}`,
    topic: frontmatter.topic || 'Geral',
    chapter: Number(frontmatter.chapter || 1),
    order: Number(frontmatter.order || frontmatter.chapter || 1),
    description: frontmatter.description || '',
    type: resolvedType,
    tags: tags.length > 0 ? tags : ['teste-1'],
    sections: frontmatter.sections || [],
    relatedQuestions: frontmatter.relatedQuestions || [],
    htmlContent,
    rawContent: content,
    ownerUserId,
  };

  renderCache.set(cacheKey, { mtime: stat.mtimeMs, data: item });
  setPersistentMdxCache(cacheKey, stat.mtimeMs, item);
  return item;
}

/**
 * Lê e processa um arquivo MDX de questão
 */
export function processQuestionFile(
  filePath: string,
  ownerUserId: number,
  materiaSlug: string
): QuestionItem {
  syncServerCacheEpoch();
  const stat = fs.statSync(filePath);
  const cacheKey = `quest:${filePath}`;
  const cached = renderCache.get(cacheKey);

  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.data as QuestionItem;
  }

  const persistentCached = getPersistentMdxCache(cacheKey, stat.mtimeMs);
  if (persistentCached) {
    renderCache.set(cacheKey, { mtime: stat.mtimeMs, data: persistentCached });
    return persistentCached as QuestionItem;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);
  const fileDir = path.dirname(filePath);

  const rawTags = frontmatter.tags || (frontmatter.tag ? [frontmatter.tag] : ['teste-1']);
  const tags = Array.isArray(rawTags) ? rawTags : [rawTags];

  // Extrai <Theory> e <Resolution>
  let theoryText = '';
  let resolutionText = '';
  let bodyText = content;

  const theoryMatch = content.match(/<Theory>([\s\S]*?)<\/Theory>/i);
  if (theoryMatch) {
    theoryText = theoryMatch[1].trim();
    bodyText = bodyText.replace(theoryMatch[0], '');
  }

  const resolutionMatch = content.match(/<Resolution>([\s\S]*?)<\/Resolution>/i);
  if (resolutionMatch) {
    resolutionText = resolutionMatch[1].trim();
    bodyText = bodyText.replace(resolutionMatch[0], '');
  }

  const theoryHtml = renderMarkdownWithKatex(theoryText, ownerUserId, materiaSlug, fileDir);
  const resolutionHtml = renderMarkdownWithKatex(resolutionText, ownerUserId, materiaSlug, fileDir);
  const bodyHtml = renderMarkdownWithKatex(bodyText.trim(), ownerUserId, materiaSlug, fileDir);

  // Formatação de Imagens
  const rawImages = frontmatter.images || (frontmatter.image ? [frontmatter.image] : []);
  const images: QuestionImage[] = rawImages.map((img: any, idx: number) => {
    let src = '';
    let caption: string | undefined;

    if (typeof img === 'string') {
      src = img;
      caption = rawImages.length === 1 ? 'Diagrama esquemático oficial da questão' : `Figura ${idx + 1}`;
    } else if (img && typeof img === 'object') {
      src = img.src || '';
      caption = img.caption || (rawImages.length === 1 ? 'Diagrama esquemático oficial da questão' : `Figura ${idx + 1}`);
    }

    if (src.startsWith('./')) {
      const cleanRel = src.replace(/^\.\//, '');
      src = `/api/media?user=${ownerUserId}&materia=${encodeURIComponent(materiaSlug)}&path=${encodeURIComponent(cleanRel)}`;
    }

    return { src, caption };
  });

  // Opções com LaTeX renderizado
  const rawOptions = frontmatter.options || [];
  const options: QuestionOption[] = rawOptions.map((opt: any) => ({
    label: String(opt.label || ''),
    text: String(opt.text || ''),
    renderedText: renderMath(String(opt.text || '')),
  }));

  const statement = frontmatter.statement || '';
  const renderedStatement = renderMarkdownWithKatex(statement, ownerUserId, materiaSlug, fileDir);

  const expectedAnswer = frontmatter.expectedAnswer || '';
  const renderedExpectedAnswer = renderMath(expectedAnswer);

  const id = frontmatter.id || path.basename(filePath, path.extname(filePath));

  const item: QuestionItem = {
    id,
    filePath,
    materia: frontmatter.materia || materiaSlug,
    title: frontmatter.title || id,
    exam: frontmatter.exam || 'Avaliação',
    year: Number(frontmatter.year || new Date().getFullYear()),
    topic: frontmatter.topic || 'Geral',
    topicSlug: frontmatter.topicSlug || 'geral',
    tags: tags.length > 0 ? tags : ['teste-1'],
    difficulty: frontmatter.difficulty || 'Médio',
    type: frontmatter.type || 'multipla_escolha',
    statement,
    renderedStatement,
    options,
    correctOption: frontmatter.correctOption,
    expectedAnswer,
    renderedExpectedAnswer,
    images,
    theoryHtml,
    resolutionHtml,
    bodyHtml,
    ownerUserId,
  };

  renderCache.set(cacheKey, { mtime: stat.mtimeMs, data: item });
  setPersistentMdxCache(cacheKey, stat.mtimeMs, item);
  return item;
}

function getCandidateDirs(userId: number, materiaSlug: string, subfolder: 'resumos' | 'questoes'): string[] {
  const dataDir = getDataDirectory();
  const localArchive = getLocalArchiveDirectory();
  const localDir = localArchive ? path.join(localArchive, materiaSlug, subfolder) : null;
  const userDir = path.join(dataDir, 'archives', String(userId), materiaSlug, subfolder);

  const candidateDirs: string[] = [];
  if (isDevMode()) {
    if (localDir) candidateDirs.push(localDir);
    candidateDirs.push(userDir);
  } else {
    candidateDirs.push(userDir);
    if (localDir) candidateDirs.push(localDir);
  }
  return candidateDirs;
}

/**
 * Lê apenas os metadados (frontmatter) de um capítulo sem processar Markdown ou KaTeX
 */
export function processChapterMetadata(
  filePath: string,
  ownerUserId: number,
  materiaSlug: string
): ChapterMetadata {
  syncServerCacheEpoch();
  const stat = fs.statSync(filePath);
  const cacheKey = `chap_meta:${filePath}`;
  const cached = renderCache.get(cacheKey);

  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.data as ChapterMetadata;
  }

  const persistentCached = getPersistentMdxCache(cacheKey, stat.mtimeMs);
  if (persistentCached) {
    renderCache.set(cacheKey, { mtime: stat.mtimeMs, data: persistentCached });
    return persistentCached as ChapterMetadata;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data: frontmatter } = matter(raw);

  const isMateriaSubfolder = filePath.includes('/resumos/materia/');
  const resolvedType: 'materia' | 'questoes' = frontmatter.type ||
    frontmatter.studyType ||
    (isMateriaSubfolder ? 'materia' : 'questoes');

  const rawTags = frontmatter.tags || (frontmatter.tag ? [frontmatter.tag] : ['teste-1']);
  const tags = Array.isArray(rawTags) ? rawTags : [rawTags];
  const baseName = path.basename(filePath, path.extname(filePath));
  const id = frontmatter.id || (isMateriaSubfolder && !baseName.startsWith('materia-') ? `materia-${baseName}` : baseName);

  const meta: ChapterMetadata = {
    id,
    filePath,
    materia: frontmatter.materia || materiaSlug,
    title: frontmatter.title || `Capítulo ${frontmatter.chapter || 1}`,
    topic: frontmatter.topic || 'Geral',
    chapter: Number(frontmatter.chapter || 1),
    order: Number(frontmatter.order || frontmatter.chapter || 1),
    description: frontmatter.description || '',
    type: resolvedType,
    tags: tags.length > 0 ? tags : ['teste-1'],
    sections: frontmatter.sections || [],
    relatedQuestions: frontmatter.relatedQuestions || [],
    ownerUserId,
  };

  renderCache.set(cacheKey, { mtime: stat.mtimeMs, data: meta });
  setPersistentMdxCache(cacheKey, stat.mtimeMs, meta);
  return meta;
}

/**
 * Lê apenas os metadados (frontmatter) de uma questão sem processar Markdown ou KaTeX
 */
export function processQuestionMetadata(
  filePath: string,
  ownerUserId: number,
  materiaSlug: string
): QuestionMetadata {
  syncServerCacheEpoch();
  const stat = fs.statSync(filePath);
  const cacheKey = `quest_meta:${filePath}`;
  const cached = renderCache.get(cacheKey);

  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.data as QuestionMetadata;
  }

  const persistentCached = getPersistentMdxCache(cacheKey, stat.mtimeMs);
  if (persistentCached) {
    renderCache.set(cacheKey, { mtime: stat.mtimeMs, data: persistentCached });
    return persistentCached as QuestionMetadata;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data: frontmatter } = matter(raw);

  const rawTags = frontmatter.tags || (frontmatter.tag ? [frontmatter.tag] : ['teste-1']);
  const tags = Array.isArray(rawTags) ? rawTags : [rawTags];
  const id = frontmatter.id || path.basename(filePath, path.extname(filePath));

  const meta: QuestionMetadata = {
    id,
    filePath,
    materia: frontmatter.materia || materiaSlug,
    title: frontmatter.title || id,
    exam: frontmatter.exam || 'Avaliação',
    year: Number(frontmatter.year || new Date().getFullYear()),
    topic: frontmatter.topic || 'Geral',
    topicSlug: frontmatter.topicSlug || 'geral',
    tags: tags.length > 0 ? tags : ['teste-1'],
    difficulty: frontmatter.difficulty || 'Médio',
    type: frontmatter.type || 'multipla_escolha',
    ownerUserId,
  };

  renderCache.set(cacheKey, { mtime: stat.mtimeMs, data: meta });
  setPersistentMdxCache(cacheKey, stat.mtimeMs, meta);
  return meta;
}

/**
 * Lê apenas os metadados de todos os capítulos de uma matéria (rápido, sem compilação pesada)
 */
export function loadUserChaptersMetadata(userId: number, materiaSlug: string): ChapterMetadata[] {
  const candidateDirs = getCandidateDirs(userId, materiaSlug, 'resumos');
  const results: ChapterMetadata[] = [];
  const seenIds = new Set<string>();

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;

    function walk(d: string) {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (/\.(md|mdx)$/i.test(entry.name)) {
          try {
            const meta = processChapterMetadata(fullPath, userId, materiaSlug);
            const key = `${meta.type}:${meta.id}`;
            if (!seenIds.has(key)) {
              seenIds.add(key);
              results.push(meta);
            }
          } catch (err) {
            console.error(`Erro ao carregar metadados do capítulo em ${fullPath}:`, err);
          }
        }
      }
    }

    walk(dir);
  }

  return results.sort((a, b) => {
    const typeA = a.type === 'materia' ? 0 : 1;
    const typeB = b.type === 'materia' ? 0 : 1;
    if (typeA !== typeB) return typeA - typeB;
    return a.order - b.order;
  });
}

/**
 * Lê apenas os metadados de todas as questões de uma matéria (rápido, sem compilação pesada)
 */
export function loadUserQuestionsMetadata(userId: number, materiaSlug: string): QuestionMetadata[] {
  const candidateDirs = getCandidateDirs(userId, materiaSlug, 'questoes');
  const results: QuestionMetadata[] = [];
  const seenIds = new Set<string>();

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;

    function walk(d: string) {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (/\.(md|mdx)$/i.test(entry.name)) {
          try {
            const meta = processQuestionMetadata(fullPath, userId, materiaSlug);
            if (!seenIds.has(meta.id)) {
              seenIds.add(meta.id);
              results.push(meta);
            }
          } catch (err) {
            console.error(`Erro ao carregar metadados da questão em ${fullPath}:`, err);
          }
        }
      }
    }

    walk(dir);
  }

  return results.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Lê e compila apenas os capítulos que pertencem a uma determinada tag (ou todos se tag não informada)
 */
export function loadUserChaptersByTag(
  userId: number,
  materiaSlug: string,
  tag?: string | null,
  type?: 'materia' | 'questoes' | null
): ChapterItem[] {
  const candidateDirs = getCandidateDirs(userId, materiaSlug, 'resumos');
  const results: ChapterItem[] = [];
  const seenIds = new Set<string>();

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;

    function walk(d: string) {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (/\.(md|mdx)$/i.test(entry.name)) {
          try {
            const meta = processChapterMetadata(fullPath, userId, materiaSlug);
            const key = `${meta.type}:${meta.id}`;
            if (seenIds.has(key)) continue;

            const matchesTag = !tag || (meta.tags || []).includes(tag);
            const matchesType = !type || (meta.type || 'questoes') === type;
            if (matchesTag && matchesType) {
              seenIds.add(key);
              results.push(processChapterFile(fullPath, userId, materiaSlug));
            }
          } catch (err) {
            console.error(`Erro ao carregar capítulo por tag em ${fullPath}:`, err);
          }
        }
      }
    }

    walk(dir);
  }

  return results.sort((a, b) => {
    const typeA = a.type === 'materia' ? 0 : 1;
    const typeB = b.type === 'materia' ? 0 : 1;
    if (typeA !== typeB) return typeA - typeB;
    return a.order - b.order;
  });
}

/**
 * Carrega e compila um capítulo específico pelo seu identificador (id/slug)
 */
export function loadChapterById(
  chapterId: string,
  userId: number,
  materiaSlug: string
): ChapterItem | null {
  const candidateDirs = getCandidateDirs(userId, materiaSlug, 'resumos');
  const cleanId = chapterId.replace(/^materia-/, '');
  const wantsMateria = chapterId.startsWith('materia-');

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;

    function walk(d: string): ChapterItem | null {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
          const res = walk(fullPath);
          if (res) return res;
        } else if (/\.(md|mdx)$/i.test(entry.name)) {
          const base = path.basename(entry.name, path.extname(entry.name));
          const isMat = fullPath.includes('/resumos/materia/');
          if (wantsMateria) {
            if (isMat && (base === cleanId || base === chapterId)) {
              return processChapterFile(fullPath, userId, materiaSlug);
            }
          } else {
            if (!isMat && base === chapterId) {
              return processChapterFile(fullPath, userId, materiaSlug);
            }
          }
        }
      }
      return null;
    }

    const found = walk(dir);
    if (found) return found;
  }
  return null;
}

/**
 * Carrega e compila uma questão específica pelo seu identificador (id/slug)
 */
export function loadQuestionById(
  questionId: string,
  userId: number,
  materiaSlug: string
): QuestionItem | null {
  const candidateDirs = getCandidateDirs(userId, materiaSlug, 'questoes');

  // Checagem rápida por nome de arquivo direto
  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const ext of ['.mdx', '.md']) {
      const direct = path.join(dir, `${questionId}${ext}`);
      if (fs.existsSync(direct)) {
        try {
          return processQuestionFile(direct, userId, materiaSlug);
        } catch (err) {
          console.error(`Erro ao carregar questão direta ${direct}:`, err);
        }
      }
    }
  }

  // Fallback: busca por id do frontmatter
  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && /\.(md|mdx)$/i.test(entry.name)) {
        const fullPath = path.join(dir, entry.name);
        try {
          const meta = processQuestionMetadata(fullPath, userId, materiaSlug);
          if (meta.id === questionId) {
            return processQuestionFile(fullPath, userId, materiaSlug);
          }
        } catch {}
      }
    }
  }

  return null;
}

/**
 * Lê todos os capítulos de uma matéria de um usuário (compilação completa)
 */
export function loadUserChapters(userId: number, materiaSlug: string): ChapterItem[] {
  return loadUserChaptersByTag(userId, materiaSlug, null);
}

/**
 * Lê todas as questões de uma matéria de um usuário (compilação completa)
 */
export function loadUserQuestions(userId: number, materiaSlug: string): QuestionItem[] {
  const candidateDirs = getCandidateDirs(userId, materiaSlug, 'questoes');
  const results: QuestionItem[] = [];
  const seenIds = new Set<string>();

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;

    function walk(d: string) {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (/\.(md|mdx)$/i.test(entry.name)) {
          try {
            const q = processQuestionFile(fullPath, userId, materiaSlug);
            if (!seenIds.has(q.id)) {
              seenIds.add(q.id);
              results.push(q);
            }
          } catch (err) {
            console.error(`Erro ao carregar questão em ${fullPath}:`, err);
          }
        }
      }
    }

    walk(dir);
  }

  return results.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Renderiza o HTML visual com preview para a tag <QuestionCard id="..." />
 */
export function renderQuestionCardHtml(
  questionId: string,
  ownerUserId: number,
  materiaSlug: string
): string {
  try {
    const q = loadQuestionById(questionId, ownerUserId, materiaSlug);

    if (!q) {
      return `<div class="my-4 p-3.5 rounded-lg border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-muted)] not-prose">[Questão <code>${questionId}</code> não encontrada no acervo]</div>`;
    }

    const statementPreview = q.renderedStatement || renderMath(q.statement || '');
    const badgeType = q.type === 'discursiva' ? 'Dissertativa' : 'Múltipla Escolha';

    return `
<div class="question-card-preview my-1.5 px-3.5 py-2.5 sm:px-4 sm:py-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:border-[var(--accent)] not-prose shadow-2xs transition-all">
  <div class="sans-ui flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-[var(--border-subtle)] text-xs leading-none">
    <div class="flex items-center gap-1.5 min-w-0">
      <span class="font-bold text-[var(--accent)] uppercase tracking-wider shrink-0 text-[11px] sm:text-xs">
        Exercício • ${q.exam} (${q.year})
      </span>
      <span class="text-[var(--text-muted)] shrink-0">•</span>
      <span class="text-[var(--text-secondary)] font-medium truncate text-xs sm:text-[13px]">
        ${q.topic}
      </span>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <span class="rounded px-1.5 py-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] sm:text-[11px] uppercase font-semibold text-[var(--text-muted)]">
        ${badgeType}
      </span>
      <span class="text-[var(--text-muted)] italic text-[11px] sm:text-xs">
        ${q.difficulty}
      </span>
    </div>
  </div>

  <div class="question-card-title font-serif text-[13px] sm:text-sm font-semibold text-[var(--text-primary)] mb-1 leading-snug line-clamp-1">
    <a href="/${materiaSlug}/questoes/${q.id}" class="hover:text-[var(--accent)] transition-colors">
      ${q.title}
    </a>
  </div>

  ${
    statementPreview
      ? `<div class="font-serif text-xs sm:text-[13px] text-[var(--text-secondary)] line-clamp-1 mb-1.5 leading-relaxed">${statementPreview}</div>`
      : ''
  }

  <div class="sans-ui flex items-center justify-between pt-1.5 border-t border-[var(--border-subtle)] text-xs leading-none">
    <span class="font-mono text-[11px] sm:text-xs text-[var(--text-muted)] truncate max-w-[150px]">${q.id}</span>
    <a
      href="/${materiaSlug}/questoes/${q.id}"
      class="font-semibold text-xs sm:text-[13px] text-[var(--accent)] hover:underline inline-flex items-center gap-1 shrink-0"
    >
      <span>Resolução</span>
    </a>
  </div>
</div>
`.trim();
  } catch (err) {
    console.error(`Erro ao renderizar QuestionCard ${questionId}:`, err);
    return `<div class="my-4 p-3.5 rounded-lg border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-muted)] not-prose">[Questão <code>${questionId}</code> não pôde ser renderizada]</div>`;
  }
}
