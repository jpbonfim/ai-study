import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateArchive } from '../src/node';

let archive: string;

function write(relPath: string, frontmatter: string, body = 'Texto.') {
  const file = path.join(archive, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n${body}\n`);
}

const validChapter = 'title: "Cap"\ntopic: "T"\nchapter: 1\ndescription: "D"\ntags: ["p1"]';
const validQuestion =
  'id: "q1"\ntitle: "Q"\nexam: "P1"\nyear: 2024\ntopic: "T"\ntopicSlug: "t"\ndifficulty: "Médio"\ntype: "discursiva"';

beforeEach(() => {
  archive = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-validation-'));
});
afterEach(() => fs.rmSync(archive, { recursive: true, force: true }));

describe('validateArchive', () => {
  it('accepts valid chapters and questions and ignores files outside resumos/ and questoes/', () => {
    write('pds/resumos/cap1.mdx', validChapter);
    write('pds/resumos/materia/cap2.md', `${validChapter}\ntype: "materia"\nextra: 1`);
    write('pds/questoes/q1.mdx', validQuestion);
    write('pds/notas/rascunho.md', 'qualquer: coisa');
    expect(validateArchive(archive)).toEqual({ checkedFiles: 3, issues: [] });
  });

  it('reports missing and mistyped chapter fields', () => {
    write('pds/resumos/cap1.mdx', 'title: "Cap"\nchapter: "1"\ndescription: "D"\ntype: "outro"');
    const messages = validateArchive(archive).issues.map((i) => i.message.split(':')[0]);
    expect(messages.sort()).toEqual(['chapter', 'topic', 'type']);
  });

  it('reports invalid question enums and missing local images', () => {
    write(
      'pds/questoes/q1.mdx',
      `${validQuestion}\nimage: "./fig.png"\nimages: [{ src: "./b.png" }, "https://x/y.png"]`,
    );
    fs.writeFileSync(path.join(archive, 'pds/questoes/fig.png'), '');
    write('pds/questoes/q2.mdx', validQuestion.replace('"Médio"', '"Média"'));
    const issues = validateArchive(archive).issues;
    expect(issues).toEqual([
      { file: 'pds/questoes/q1.mdx', message: 'imagem não encontrada: ./b.png' },
      { file: 'pds/questoes/q2.mdx', message: expect.stringMatching(/^difficulty: /) },
    ]);
  });

  it('reports broken YAML', () => {
    write('pds/resumos/cap1.mdx', 'title: "Cap\ntopic: [');
    expect(validateArchive(archive).issues[0]?.message).toMatch(/^frontmatter YAML inválido/);
  });
});
