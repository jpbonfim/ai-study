/**
 * Content parity: renders every chapter and question of the fixture with the new pipeline and
 * compares it with the HTML the current site produced (captured by capture-baseline.mjs).
 *
 * Both sides are re-serialized through the same DOM implementation so only real markup
 * differences fail the test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type ChapterMeta,
  type CodeHighlighter,
  loadCodeHighlighter,
  normalizeChapterMeta,
  normalizeQuestionMeta,
  type QuestionMeta,
  renderChapterHtml,
  renderQuestion,
} from '@ai-study/content';
import { parseDocument } from '@ai-study/content/node';
import { createHtmlSanitizer } from '@ai-study/content/sanitize';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const baselineDir = path.resolve(here, '../../.parity/baseline/admin/subjects');
const dataDir = path.resolve(here, '../../../data-dev');
const hasBaseline = fs.existsSync(baselineDir);

const dom = new JSDOM('<!doctype html><body></body>');
const sanitize = createHtmlSanitizer(dom.window as unknown as Parameters<typeof createHtmlSanitizer>[0]);

/** Canonical form: parsed by a DOM, random SVG marker ids neutralized, whitespace collapsed. */
function canonical(html: string): string {
  const template = dom.window.document.createElement('template');
  template.innerHTML = html;
  return template.innerHTML
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/arrow-[a-z0-9]+/g, 'arrow-ID')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim();
}

function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}:\n  old: …${a.slice(Math.max(0, i - 80), i + 120)}\n  new: …${b.slice(Math.max(0, i - 80), i + 120)}`;
}

interface SubjectFixture {
  dirName: string;
  ownerId: number;
  slug: string;
  dir: string;
  questions: Map<string, { meta: QuestionMeta; body: string }>;
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(md|mdx)$/i.test(e.name) ? [full] : [];
  });
}

function loadSubject(dirName: string): SubjectFixture {
  const [slug, owner] = dirName.split('@') as [string, string | undefined];
  const ownerId = owner ? Number(owner) : 1;
  const dir = path.join(dataDir, 'archives', String(ownerId), slug);
  const questions = new Map<string, { meta: QuestionMeta; body: string }>();
  for (const file of walk(path.join(dir, 'questoes'))) {
    const { frontmatter, body } = parseDocument(fs.readFileSync(file, 'utf8'));
    const meta = normalizeQuestionMeta(frontmatter, path.relative(dir, file), slug);
    if (!questions.has(meta.id)) questions.set(meta.id, { meta, body });
  }
  return { dirName, ownerId, slug, dir, questions };
}

function mediaResolver(subject: SubjectFixture) {
  return (rel: string) =>
    `/api/media?user=${subject.ownerId}&materia=${encodeURIComponent(subject.slug)}&path=${encodeURIComponent(rel)}`;
}

const subjects = hasBaseline ? fs.readdirSync(baselineDir).map(loadSubject) : [];
let highlighter: CodeHighlighter;

beforeAll(async () => {
  highlighter = await loadCodeHighlighter();
});

describe.skipIf(!hasBaseline)('chapter parity', () => {
  for (const subject of subjects) {
    const chapterDir = path.join(baselineDir, subject.dirName, 'chapters');
    const jsonFiles = fs.existsSync(chapterDir)
      ? fs
          .readdirSync(chapterDir)
          .flatMap((type) => fs.readdirSync(path.join(chapterDir, type)).map((f) => path.join(chapterDir, type, f)))
      : [];

    for (const jsonFile of jsonFiles) {
      const old = JSON.parse(fs.readFileSync(jsonFile, 'utf8')).chapter as {
        filePath: string;
        htmlContent: string;
      } & ChapterMeta;
      it(`${subject.dirName}/${old.type}/${old.id}`, () => {
        const { frontmatter, body } = parseDocument(fs.readFileSync(old.filePath, 'utf8'));
        const meta = normalizeChapterMeta(frontmatter, path.relative(subject.dir, old.filePath), subject.slug);
        expect(meta.id).toBe(old.id);
        expect(meta.type).toBe(old.type);
        expect(meta.tags).toEqual(old.tags);
        expect(meta.sections).toEqual(old.sections);

        const html = renderChapterHtml(body, {
          materiaSlug: subject.slug,
          resolveAssetUrl: mediaResolver(subject),
          highlighter,
          findQuestion: (id) => subject.questions.get(id)?.meta,
        });
        const a = canonical(old.htmlContent);
        const b = canonical(html);
        if (a !== b) expect.fail(firstDifference(a, b));

        // Sanitization must not alter legitimate content.
        // Links to local files (file://) are intentionally dropped by the sanitizer.
        const withoutLocalLinks = b.replace(/ href="file:[^"]*"/g, '');
        const sanitized = canonical(sanitize(html));
        if (sanitized !== withoutLocalLinks) {
          expect.fail(`sanitizer changed content ${firstDifference(withoutLocalLinks, sanitized)}`);
        }
      });
    }
  }
});

function extract(document: Document, selector: string): string {
  return document.querySelector(selector)?.innerHTML ?? '';
}

describe.skipIf(!hasBaseline)('question parity', () => {
  for (const subject of subjects) {
    const questionDir = path.join(baselineDir, subject.dirName, 'questoes');
    if (!fs.existsSync(questionDir)) continue;
    for (const file of fs.readdirSync(questionDir)) {
      const id = file.replace(/\.html$/, '');
      it(`${subject.dirName}/${id}`, () => {
        const entry = subject.questions.get(id);
        expect(entry, 'question exists in fixture').toBeDefined();
        if (!entry) return;
        const pageWindow = new JSDOM(fs.readFileSync(path.join(questionDir, file), 'utf8')).window;
        const page = pageWindow.document;
        const rendered = renderQuestion(entry.meta, entry.body, {
          materiaSlug: subject.slug,
          resolveAssetUrl: mediaResolver(subject),
          highlighter,
        });

        const pairs: Array<[string, string, string]> = [
          ['statement', extract(page, '.question-sticky-col .academic-prose'), rendered.statementHtml],
          ['theory', extract(page, '.theory-card-panel > div:last-child'), rendered.theoryHtml],
          ['resolution', extract(page, '.resolution-card-panel > div:last-child'), rendered.resolutionHtml],
        ];
        const options = [...page.querySelectorAll('.option-item')];
        options.forEach((opt, i) => {
          pairs.push([`option ${i}`, opt.querySelector('div')?.innerHTML ?? '', rendered.options[i]?.html ?? '']);
        });
        const expected = page.querySelector('#resolution-expected-box .academic-prose');
        if (expected) pairs.push(['expected', expected.innerHTML, rendered.expectedAnswerHtml]);

        pageWindow.close();

        for (const [label, oldHtml, newHtml] of pairs) {
          const a = canonical(oldHtml);
          const b = canonical(newHtml);
          if (a !== b) expect.fail(`${label} ${firstDifference(a, b)}`);
        }
      });
    }
  }
});
