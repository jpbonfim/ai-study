import fs from 'node:fs';
import path from 'node:path';

export interface Subject {
  slug: string;
  name: string;
  code: string;
  institution: string;
  period: string;
  description: string;
  status: 'active' | 'coming_soon';
  chaptersCount: number;
  questionsCount: number;
  topics: string[];
}

function countMdxFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countMdxFiles(path.join(dir, entry.name));
    } else if (/\.(md|mdx)$/i.test(entry.name)) {
      count++;
    }
  }
  return count;
}

/**
 * Carrega dinamicamente todas as matérias cadastradas na pasta 'archive/'
 * Calcula automaticamente o número de capítulos e questões existentes.
 */
function loadMateriasFromArchive(): Subject[] {
  // Procura a pasta archive em '../archive' relativo ao processo ou ao arquivo
  const candidatePaths = [
    path.resolve(process.cwd(), '../archive'),
    path.resolve(process.cwd(), 'archive'),
    path.resolve(import.meta.dirname || process.cwd(), '../../../archive'),
  ];

  const archiveDir = candidatePaths.find((p) => fs.existsSync(p));
  if (!archiveDir) {
    return [];
  }

  const entries = fs.readdirSync(archiveDir, { withFileTypes: true });
  const materias: Subject[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const matSlug = entry.name;
    const jsonPath = path.join(archiveDir, matSlug, 'materia.json');

    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        const data = JSON.parse(raw);
        const resumosDir = path.join(archiveDir, matSlug, 'resumos');
        const questoesDir = path.join(archiveDir, matSlug, 'questoes');

        const chaptersCount = countMdxFiles(resumosDir);
        const questionsCount = countMdxFiles(questoesDir);

        materias.push({
          slug: data.slug || matSlug,
          name: data.name || matSlug,
          code: data.code || '',
          institution: data.institution || 'Universidade',
          period: data.period || '',
          description: data.description || '',
          status: data.status || (chaptersCount > 0 ? 'active' : 'coming_soon'),
          chaptersCount: chaptersCount || data.chaptersCount || 0,
          questionsCount: questionsCount || data.questionsCount || 0,
          topics: data.topics || [],
        });
      } catch (err) {
        console.error(`Erro ao carregar dados da matéria em ${jsonPath}:`, err);
      }
    }
  }

  // Ordena: ativas primeiro, depois alfabeticamente
  return materias.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return a.name.localeCompare(b.name);
  });
}

export const MATERIAS: Subject[] = loadMateriasFromArchive();

export function getMateria(slug: string): Subject | undefined {
  return MATERIAS.find((m) => m.slug === slug);
}

export function formatTag(tag: string): string {
  if (!tag) return '';
  const lower = tag.toLowerCase().trim();
  if (lower === 'p1') return 'P1';
  if (lower === 'p2') return 'P2';
  if (lower === 'p3') return 'P3';
  if (lower === 'sub') return 'SUB';
  if (lower === 'rec') return 'REC';
  return tag
    .split(/[-_ ]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
