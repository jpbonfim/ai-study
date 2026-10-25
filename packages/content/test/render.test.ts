import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  normalizeChapterMeta,
  normalizeQuestionMeta,
  normalizeSubject,
  renderChapterHtml,
  renderMarkdown,
  renderMath,
  renderQuestion,
} from '../src/index';
import { parseDocument } from '../src/node/index';
import { createHtmlSanitizer } from '../src/sanitize';

const resolveAssetUrl = (rel: string) => `/api/media?path=${rel}`;
const sanitize = createHtmlSanitizer(new JSDOM('').window as unknown as Parameters<typeof createHtmlSanitizer>[0]);

describe('renderMarkdown', () => {
  it('renders inline and display math with KaTeX', () => {
    const html = renderMarkdown('Seja $x^2$.\n\n$$a+b$$\n$$c$$', { resolveAssetUrl });
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display-group');
    expect(html.match(/katex-display-item/g)).toHaveLength(2);
  });

  it('keeps dollar signs inside code literal', () => {
    const html = renderMarkdown('Custo `R$ 5` e $\\alpha$', { resolveAssetUrl });
    expect(html).toContain('<code>R$ 5</code>');
  });

  it('renders alerts with default titles', () => {
    const html = renderMarkdown('> [!WARNING]\n> Cuidado aqui', { resolveAssetUrl });
    expect(html).toContain('markdown-alert-warning');
    expect(html).toContain('Atenção');
  });

  it('rewrites relative assets', () => {
    const html = renderMarkdown('![fig](./fig.png)', { resolveAssetUrl });
    expect(html).toContain('src="/api/media?path=fig.png"');
  });

  it('strips MDX and HTML comments', () => {
    expect(renderMarkdown('a {/* hidden */} <!-- hidden --> b', { resolveAssetUrl })).not.toContain('hidden');
  });

  it('renders mermaid fences as diagram blocks', () => {
    const html = renderMarkdown('```mermaid\ngraph TD; A-->B\n```', { resolveAssetUrl });
    expect(html).toContain('class="mermaid diagram-block"');
  });

  it('produces deterministic block diagram markup', () => {
    const body = '<BlockDiagram preset="feedback" title="Malha" />';
    expect(renderMarkdown(body, { resolveAssetUrl })).toBe(renderMarkdown(body, { resolveAssetUrl }));
  });
});

describe('renderChapterHtml', () => {
  it('expands question cards or reports missing ones', () => {
    const question = normalizeQuestionMeta({ id: 'q1', title: 'Q', statement: 'Enunciado' }, 'questoes/q1.mdx', 'pds');
    const html = renderChapterHtml('<QuestionCard id="q1" />\n\n<QuestionCard id="nope" />', {
      materiaSlug: 'pds',
      resolveAssetUrl,
      findQuestion: (id) => (id === 'q1' ? question : undefined),
    });
    expect(html).toContain('href="/pds/questoes/q1"');
    expect(html).toContain('[Questão <code>nope</code> não encontrada no acervo]');
  });
});

describe('renderQuestion', () => {
  it('splits theory, resolution and remaining body', () => {
    const question = normalizeQuestionMeta(
      { options: [{ label: 'a', text: '$x$' }], correctOption: 'a', image: './f.png' },
      'questoes/q.mdx',
      'pds',
    );
    const rendered = renderQuestion(question, '<Theory>T</Theory>\n<Resolution>R</Resolution>\nExtra', {
      materiaSlug: 'pds',
      resolveAssetUrl,
    });
    expect(rendered.theoryHtml).toBe('<p>T</p>\n');
    expect(rendered.resolutionHtml).toBe('<p>R</p>\n');
    expect(rendered.bodyHtml).toBe('<p>Extra</p>\n');
    expect(rendered.options[0]?.html).toContain('katex');
    expect(rendered.images[0]).toEqual({
      src: '/api/media?path=f.png',
      caption: 'Diagrama esquemático oficial da questão',
    });
  });
});

describe('renderMath', () => {
  it('escapes HTML outside math', () => {
    expect(renderMath('<b>x</b> **y**')).toBe('&lt;b&gt;x&lt;/b&gt; <strong>y</strong>');
  });
});

describe('normalization defaults', () => {
  it('chapter defaults and materia subfolder ids', () => {
    const meta = normalizeChapterMeta({ chapter: 3 }, 'resumos/materia/03-x.mdx', 'pds');
    expect(meta).toMatchObject({
      id: 'materia-03-x',
      type: 'materia',
      tags: ['teste-1'],
      title: 'Capítulo 3',
      topic: 'Geral',
      order: 3,
    });
  });

  it('question defaults', () => {
    const meta = normalizeQuestionMeta({ tag: 'p1' }, 'questoes/abc.mdx', 'pds', 2030);
    expect(meta).toMatchObject({ id: 'abc', exam: 'Avaliação', year: 2030, tags: ['p1'], difficulty: 'Médio' });
  });

  it('subject status follows content', () => {
    expect(normalizeSubject({ name: 'X' }, 'x', { chapters: 0, questions: 0 }).status).toBe('coming_soon');
    expect(normalizeSubject({}, 'x', { chapters: 2, questions: 1 })).toMatchObject({
      slug: 'x',
      status: 'active',
      institution: 'Universidade',
    });
  });

  it('parses frontmatter', () => {
    expect(parseDocument('---\ntitle: A\n---\nBody')).toEqual({ frontmatter: { title: 'A' }, body: 'Body' });
  });
});

describe('sanitizer', () => {
  it('removes scripts, event handlers and javascript: URLs', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"><script>alert(2)</script>[a](javascript:alert(3))', {
      resolveAssetUrl,
    });
    const clean = sanitize(html);
    expect(clean).not.toMatch(/onerror|<script|javascript:/);
  });

  it('keeps anchors, KaTeX styles and block diagram labels', () => {
    const html = renderMarkdown('<div id="cap-1-sec"></div>\n\n$\\frac{a}{b}$\n\n<BlockDiagram preset="cascade" />', {
      resolveAssetUrl,
    });
    const clean = sanitize(html);
    expect(clean).toContain('id="cap-1-sec"');
    expect(clean).toContain('style=');
    expect(clean).toMatch(/<foreignObject[^>]*>\s*<div[^>]*class="system-fo-center"/);
  });
});
