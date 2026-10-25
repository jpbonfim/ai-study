import fs from 'node:fs';
import path from 'node:path';
import { isMarkdownFile } from '@ai-study/content';
import { parseDocument } from '@ai-study/content/node';

interface RawDocument {
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface OfflineExportData {
  db: { resumos: RawDocument[]; questoes: Record<string, RawDocument> };
  /** Question figures as data URIs, keyed by `./name` and `name`. */
  images: Record<string, string>;
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

function markdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return isMarkdownFile(entry.name) ? [full] : [];
  });
}

function readRaw(file: string): RawDocument {
  const { frontmatter, body } = parseDocument(fs.readFileSync(file, 'utf8'));
  return { frontmatter, body: body.trim() };
}

/** Everything the offline HTML of a subject embeds (raw documents and question figures). */
export function buildOfflineExport(subjectDir: string): OfflineExportData {
  const resumos = markdownFiles(path.join(subjectDir, 'resumos')).map(readRaw);

  const questoes: Record<string, RawDocument> = {};
  for (const file of markdownFiles(path.join(subjectDir, 'questoes'))) {
    const doc = readRaw(file);
    const id = String(doc.frontmatter.id || path.basename(file).replace(/\.(md|mdx)$/, ''));
    questoes[id] = doc;
  }

  const images: Record<string, string> = {};
  const questionsDir = path.join(subjectDir, 'questoes');
  if (fs.existsSync(questionsDir)) {
    for (const name of fs.readdirSync(questionsDir)) {
      const type = IMAGE_TYPES[path.extname(name).slice(1).toLowerCase()];
      if (!type) continue;
      const uri = `data:${type};base64,${fs.readFileSync(path.join(questionsDir, name)).toString('base64')}`;
      images[`./${name}`] = uri;
      images[name] = uri;
    }
  }

  return { db: { resumos, questoes }, images };
}
