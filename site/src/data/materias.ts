import fs from 'node:fs';
import path from 'node:path';
import { getDataDirectory } from '../lib/db.ts';
import { getPermissionsGrantedToUser } from '../lib/permissions.ts';
import { isDevMode, getLocalArchiveDirectory } from '../lib/dev-archive.ts';

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
  ownerUserId?: number;
  ownerUsername?: string;
  ownerDisplayName?: string;
  isShared?: boolean;
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
 * Lê uma matéria a partir de uma pasta específica
 */
function readMateriaFromDir(
  materiaDir: string,
  slug: string,
  ownerUserId: number,
  extra: Partial<Subject> = {}
): Subject | null {
  const jsonPath = path.join(materiaDir, 'materia.json');
  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw);
    const resumosDir = path.join(materiaDir, 'resumos');
    const questoesDir = path.join(materiaDir, 'questoes');

    const chaptersCount = countMdxFiles(resumosDir);
    const questionsCount = countMdxFiles(questoesDir);

    return {
      slug: data.slug || slug,
      name: data.name || slug,
      code: data.code || '',
      institution: data.institution || 'Universidade',
      period: data.period || '',
      description: data.description || '',
      status: data.status || (chaptersCount > 0 ? 'active' : 'coming_soon'),
      chaptersCount: chaptersCount || data.chaptersCount || 0,
      questionsCount: questionsCount || data.questionsCount || 0,
      topics: data.topics || [],
      ownerUserId,
      ...extra,
    };
  } catch (err) {
    console.error(`Erro ao carregar dados da matéria em ${jsonPath}:`, err);
    return null;
  }
}

/**
 * Carrega as matérias do próprio usuário a partir de data/archives/<userId>/
 * e também da pasta archive/ local quando em modo desenvolvimento.
 */
export function loadUserMaterias(userId: number): Subject[] {
  const dataDir = getDataDirectory();
  const userDir = path.join(dataDir, 'archives', String(userId));
  const materias: Subject[] = [];
  const seenSlugs = new Set<string>();

  // Em modo desenvolvimento (ou com flag ativa), lê diretamente da pasta 'archive/' local
  if (isDevMode()) {
    const localArchiveDir = getLocalArchiveDirectory();
    if (localArchiveDir && fs.existsSync(localArchiveDir)) {
      try {
        const localEntries = fs.readdirSync(localArchiveDir, { withFileTypes: true });
        for (const entry of localEntries) {
          if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
          const matSlug = entry.name;
          const mat = readMateriaFromDir(path.join(localArchiveDir, matSlug), matSlug, userId, {
            isShared: false,
          });
          if (mat) {
            materias.push(mat);
            seenSlugs.add(mat.slug);
          }
        }
      } catch (err) {
        console.error('[DEV-ARCHIVE] Erro ao ler matérias do diretório local archive/:', err);
      }
    }
  }

  // Carrega as matérias persistidas em data/archives/<userId>/ (caso não tenham sido sobrepostas pelo archive local)
  if (fs.existsSync(userDir)) {
    try {
      const entries = fs.readdirSync(userDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const matSlug = entry.name;
        if (seenSlugs.has(matSlug)) continue;

        const mat = readMateriaFromDir(path.join(userDir, matSlug), matSlug, userId, {
          isShared: false,
        });
        if (mat) {
          materias.push(mat);
          seenSlugs.add(mat.slug);
        }
      }
    } catch (err) {
      console.error(`[DB] Erro ao ler matérias de ${userDir}:`, err);
    }
  }

  return materias.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Carrega matérias compartilhadas com o usuário através de permissões
 */
export function loadSharedMaterias(userId: number): Subject[] {
  const dataDir = getDataDirectory();
  const permissions = getPermissionsGrantedToUser(userId);
  const materias: Subject[] = [];

  for (const perm of permissions) {
    const ownerDir = path.join(dataDir, 'archives', String(perm.owner_user_id), perm.materia_slug);
    if (!fs.existsSync(ownerDir)) continue;

    const mat = readMateriaFromDir(ownerDir, perm.materia_slug, perm.owner_user_id, {
      isShared: true,
      ownerUsername: perm.owner_username,
      ownerDisplayName: perm.owner_display_name,
    });

    if (mat) {
      materias.push(mat);
    }
  }

  return materias;
}

/**
 * Carrega todas as matérias acessíveis pelo usuário (próprias e compartilhadas)
 */
export function loadAllAccessibleMaterias(userId: number): {
  own: Subject[];
  shared: Subject[];
  all: Subject[];
} {
  const own = loadUserMaterias(userId);
  const shared = loadSharedMaterias(userId);

  return {
    own,
    shared,
    all: [...own, ...shared],
  };
}

/**
 * Compatibilidade legada para rotas estáticas ou fallback
 */
export const MATERIAS: Subject[] = loadUserMaterias(1);

export function getMateria(slug: string, userId: number = 1): Subject | undefined {
  const { all } = loadAllAccessibleMaterias(userId);
  return all.find((m) => m.slug === slug);
}

export function formatTag(tag: string): string {
  if (!tag) return '';
  return tag.trim();
}
