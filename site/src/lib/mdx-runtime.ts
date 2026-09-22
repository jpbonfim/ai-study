import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import katex from 'katex';
import { getDataDirectory } from './db.ts';
import { renderMath } from '../utils/katex.ts';

export interface SectionItem {
  id: string;
  title: string;
}

export interface ChapterItem {
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
  htmlContent: string;
  rawContent: string;
  ownerUserId: number;
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

export interface QuestionItem {
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
  ownerUserId: number;
}

// Configuração do marked
marked.setOptions({
  gfm: true,
  breaks: false,
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

  const mathBlocks: string[] = [];

  // 1. Display math $$ ... $$
  let text = content.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    try {
      const rendered = katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
      });
      const idx = mathBlocks.length;
      mathBlocks.push(rendered);
      return `@@MATH_DISPLAY_${idx}@@`;
    } catch {
      return `$$${math}$$`;
    }
  });

  // 2. Inline math $ ... $
  text = text.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_, math) => {
    try {
      const rendered = katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
      });
      const idx = mathBlocks.length;
      mathBlocks.push(rendered);
      return `@@MATH_INLINE_${idx}@@`;
    } catch {
      return `$${math}$`;
    }
  });

  // 3. Renderiza o markdown
  let html = marked.parse(text) as string;

  // 4. Restaura blocos matemáticos
  html = html.replace(/@@MATH_DISPLAY_(\d+)@@/g, (_, idx) => {
    const rendered = mathBlocks[parseInt(idx, 10)] || '';
    return `<div class="katex-display my-4 overflow-x-auto">${rendered}</div>`;
  });

  html = html.replace(/@@MATH_INLINE_(\d+)@@/g, (_, idx) => {
    return mathBlocks[parseInt(idx, 10)] || '';
  });

  // 5. Reescreve URLs de imagens
  html = rewriteImageUrls(html, ownerUserId, materiaSlug, sourceDir);

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

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content } = matter(raw);

  const fileDir = path.dirname(filePath);
  const isMateriaSubfolder = filePath.includes('/resumos/materia/');
  const resolvedType: 'materia' | 'questoes' = frontmatter.type ||
    frontmatter.studyType ||
    (isMateriaSubfolder ? 'materia' : 'questoes');

  const rawTags = frontmatter.tags || (frontmatter.tag ? [frontmatter.tag] : ['teste-1']);
  const tags = Array.isArray(rawTags) ? rawTags : [rawTags];

  const htmlContent = renderMarkdownWithKatex(content, ownerUserId, materiaSlug, fileDir);

  const id = path.basename(filePath, path.extname(filePath));

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
  const renderedStatement = renderMath(statement);

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
  return item;
}

/**
 * Lê todos os capítulos de uma matéria de um usuário
 */
export function loadUserChapters(userId: number, materiaSlug: string): ChapterItem[] {
  const dataDir = getDataDirectory();
  const resumosDir = path.join(dataDir, 'archives', String(userId), materiaSlug, 'resumos');

  if (!fs.existsSync(resumosDir)) return [];

  const results: ChapterItem[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(md|mdx)$/i.test(entry.name)) {
        try {
          const chap = processChapterFile(fullPath, userId, materiaSlug);
          results.push(chap);
        } catch (err) {
          console.error(`Erro ao carregar capítulo em ${fullPath}:`, err);
        }
      }
    }
  }

  walk(resumosDir);

  return results.sort((a, b) => {
    const typeA = a.type === 'materia' ? 0 : 1;
    const typeB = b.type === 'materia' ? 0 : 1;
    if (typeA !== typeB) return typeA - typeB;
    return a.order - b.order;
  });
}

/**
 * Lê todas as questões de uma matéria de um usuário
 */
export function loadUserQuestions(userId: number, materiaSlug: string): QuestionItem[] {
  const dataDir = getDataDirectory();
  const questoesDir = path.join(dataDir, 'archives', String(userId), materiaSlug, 'questoes');

  if (!fs.existsSync(questoesDir)) return [];

  const results: QuestionItem[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(md|mdx)$/i.test(entry.name)) {
        try {
          const q = processQuestionFile(fullPath, userId, materiaSlug);
          results.push(q);
        } catch (err) {
          console.error(`Erro ao carregar questão em ${fullPath}:`, err);
        }
      }
    }
  }

  walk(questoesDir);

  return results.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return a.title.localeCompare(b.title);
  });
}
