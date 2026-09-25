import fs from 'node:fs';
import path from 'node:path';

/**
 * Determina se o sistema está executando em modo de desenvolvimento local
 * ou com a flag de archive local explicitamente ativada.
 */
export function isDevMode(): boolean {
  if (process.env.ENABLE_LOCAL_ARCHIVE === 'true' || process.env.ENABLE_LOCAL_ARCHIVE === '1') {
    return true;
  }
  if (process.env.ENABLE_LOCAL_ARCHIVE === 'false' || process.env.ENABLE_LOCAL_ARCHIVE === '0') {
    return false;
  }
  // Em ambiente Astro/Vite ou Node
  return Boolean(
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) ||
    process.env.NODE_ENV !== 'production'
  );
}

/**
 * Retorna o caminho do diretório 'archive/' local do projeto (na raiz do repositório)
 */
export function getLocalArchiveDirectory(): string | null {
  const candidatePaths = [
    path.resolve(process.cwd(), '../archive'),
    path.resolve(process.cwd(), 'archive'),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../archive'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        if (fs.statSync(p).isDirectory()) {
          return p;
        }
      } catch {}
    }
  }

  return null;
}

/**
 * Retorna o caminho de uma matéria específica dentro do archive local, se existir
 */
export function getLocalMateriaDirectory(materiaSlug: string): string | null {
  const archiveDir = getLocalArchiveDirectory();
  if (!archiveDir) return null;

  const materiaPath = path.join(archiveDir, materiaSlug);
  if (fs.existsSync(materiaPath) && fs.statSync(materiaPath).isDirectory()) {
    return materiaPath;
  }

  return null;
}
