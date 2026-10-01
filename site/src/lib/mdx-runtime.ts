import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import katex from 'katex';
import { getDataDirectory } from './db.ts';
import { renderMath } from '../utils/katex.ts';
import { isDevMode, getLocalArchiveDirectory } from './dev-archive.ts';
import { renderBlockDiagramHtml } from './block-diagram-runtime.ts';

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
  return item;
}

/**
 * Lê todos os capítulos de uma matéria de um usuário
 */
export function loadUserChapters(userId: number, materiaSlug: string): ChapterItem[] {
  const dataDir = getDataDirectory();
  const localArchive = getLocalArchiveDirectory();
  const localResumos = localArchive ? path.join(localArchive, materiaSlug, 'resumos') : null;
  const userResumos = path.join(dataDir, 'archives', String(userId), materiaSlug, 'resumos');

  const candidateDirs: string[] = [];
  if (isDevMode()) {
    if (localResumos) candidateDirs.push(localResumos);
    candidateDirs.push(userResumos);
  } else {
    candidateDirs.push(userResumos);
    if (localResumos) candidateDirs.push(localResumos);
  }

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
            const chap = processChapterFile(fullPath, userId, materiaSlug);
            if (!seenIds.has(chap.id)) {
              seenIds.add(chap.id);
              results.push(chap);
            }
          } catch (err) {
            console.error(`Erro ao carregar capítulo em ${fullPath}:`, err);
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
 * Lê todas as questões de uma matéria de um usuário
 */
export function loadUserQuestions(userId: number, materiaSlug: string): QuestionItem[] {
  const dataDir = getDataDirectory();
  const localArchive = getLocalArchiveDirectory();
  const localQuestoes = localArchive ? path.join(localArchive, materiaSlug, 'questoes') : null;
  const userQuestoes = path.join(dataDir, 'archives', String(userId), materiaSlug, 'questoes');

  const candidateDirs: string[] = [];
  if (isDevMode()) {
    if (localQuestoes) candidateDirs.push(localQuestoes);
    candidateDirs.push(userQuestoes);
  } else {
    candidateDirs.push(userQuestoes);
    if (localQuestoes) candidateDirs.push(localQuestoes);
  }

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
    const questions = loadUserQuestions(ownerUserId, materiaSlug);
    let q = questions.find((item) => item.id === questionId);

    if (!q) {
      return `<div class="my-4 p-3.5 rounded-lg border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-muted)] not-prose">[Questão <code>${questionId}</code> não encontrada no acervo]</div>`;
    }

  const statementPreview = q.renderedStatement || renderMath(q.statement || '');
  const badgeType = q.type === 'discursiva' ? 'Dissertativa' : 'Múltipla Escolha';

    return `
<div class="question-card-preview my-6 p-4 sm:p-5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] not-prose shadow-sm hover:border-[var(--accent)] transition-all">
  <div class="sans-ui flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-[var(--border-subtle)] text-[11px]">
    <div class="flex items-center gap-1.5 flex-wrap">
      <span class="font-bold text-[var(--accent)] uppercase tracking-wider">
        Exercício • ${q.exam} (${q.year})
      </span>
      <span class="text-[var(--text-muted)]">•</span>
      <span class="text-[var(--text-secondary)] font-medium">
        ${q.topic}
      </span>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <span class="rounded px-2 py-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] uppercase font-semibold text-[var(--text-muted)]">
        ${badgeType}
      </span>
      <span class="text-[var(--text-muted)] italic text-[10px]">
        ${q.difficulty}
      </span>
    </div>
  </div>

  <h4 class="font-serif text-lg font-bold text-[var(--text-primary)] mb-2 leading-snug">
    <a href="/${materiaSlug}/questoes/${q.id}" class="hover:text-[var(--accent)] transition-colors">
      ${q.title}
    </a>
  </h4>

  ${
    statementPreview
      ? `<div class="font-serif text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-3 mb-3 leading-relaxed">${statementPreview}</div>`
      : ''
  }

  <div class="sans-ui flex items-center justify-end pt-2 border-t border-[var(--border-subtle)] text-xs">
    <a
      href="/${materiaSlug}/questoes/${q.id}"
      class="font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1.5"
    >
      <span>Consultar Resolução Passo a Passo</span>
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
