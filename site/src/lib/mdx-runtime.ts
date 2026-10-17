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

// Cache em memória de itens processados: chave = filePath + mtimeMs
const renderCache = new Map<string, { mtime: number; data: any }>();

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
<div class="question-card-preview my-1.5 px-3 py-2 sm:px-3.5 sm:py-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:border-[var(--accent)] not-prose shadow-2xs transition-all">
  <div class="sans-ui flex items-center justify-between gap-1 pb-1 mb-1 border-b border-[var(--border-subtle)] text-[10px] leading-none">
    <div class="flex items-center gap-1.5 min-w-0">
      <span class="font-bold text-[var(--accent)] uppercase tracking-wider shrink-0 text-[9.5px]">
        Exercício • ${q.exam} (${q.year})
      </span>
      <span class="text-[var(--text-muted)] shrink-0">•</span>
      <span class="text-[var(--text-secondary)] font-medium truncate">
        ${q.topic}
      </span>
    </div>
    <div class="flex items-center gap-1 shrink-0">
      <span class="rounded px-1.5 py-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[9px] uppercase font-semibold text-[var(--text-muted)]">
        ${badgeType}
      </span>
      <span class="text-[var(--text-muted)] italic text-[9px]">
        ${q.difficulty}
      </span>
    </div>
  </div>

  <h4 class="font-serif text-xs sm:text-[13px] font-bold text-[var(--text-primary)] mb-0.5 leading-snug line-clamp-1">
    <a href="/${materiaSlug}/questoes/${q.id}" class="hover:text-[var(--accent)] transition-colors">
      ${q.title}
    </a>
  </h4>

  ${
    statementPreview
      ? `<div class="font-serif text-[11px] sm:text-xs text-[var(--text-secondary)] line-clamp-1 mb-1 leading-snug">${statementPreview}</div>`
      : ''
  }

  <div class="sans-ui flex items-center justify-between pt-1 border-t border-[var(--border-subtle)] text-[10px] leading-none">
    <span class="font-mono text-[9px] text-[var(--text-muted)] truncate max-w-[130px]">${q.id}</span>
    <a
      href="/${materiaSlug}/questoes/${q.id}"
      class="font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1 shrink-0"
    >
      <span>Resolução</span>
      <span>&rarr;</span>
    </a>
  </div>
</div>
`.trim();
  } catch (err) {
    console.error(`Erro ao renderizar QuestionCard ${questionId}:`, err);
    return `<div class="my-4 p-3.5 rounded-lg border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-muted)] not-prose">[Questão <code>${questionId}</code> não pôde ser renderizada]</div>`;
  }
}
