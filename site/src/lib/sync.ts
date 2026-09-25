import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { getDataDirectory } from './db.ts';
import { logActivity } from './log.ts';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

// Whitelist rigorosa de extensões permitidas no archive
export const ALLOWED_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.txt',
]);

export interface FileManifestEntry {
  size: number;
  mtime: number;
  hash: string;
}

export interface UserArchiveManifest {
  userId: number;
  username: string;
  generatedAt: string;
  files: Record<string, FileManifestEntry>;
}

export interface PushResult {
  success: boolean;
  error?: string;
  updatedCount?: number;
  deletedCount?: number;
}

/**
 * Retorna o diretório do archive do usuário especificado
 */
export function getUserArchiveDirectory(userId: number): string {
  const dataDir = getDataDirectory();
  const dir = path.join(dataDir, 'archives', String(userId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Calcula o hash SHA-256 de um arquivo em disco
 */
export function computeFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Valida a segurança de um caminho relativo contra Path Traversal e extensões proibidas
 */
export function isPathSafe(relPath: string): boolean {
  if (!relPath || typeof relPath !== 'string') return false;
  const normalized = path.normalize(relPath).replace(/^[/\\]+/, '');
  if (normalized.includes('..') || path.isAbsolute(normalized)) return false;
  const ext = path.extname(normalized).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Gera o manifesto com hashes SHA-256 de todos os arquivos do archive de um usuário
 */
export function getUserArchiveManifest(userId: number, username: string): UserArchiveManifest {
  const userDir = getUserArchiveDirectory(userId);
  const files: Record<string, FileManifestEntry> = {};

  function scanDir(currentDir: string, relativeDir: string = '') {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_temp')) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_EXTENSIONS.has(ext)) {
          try {
            const stat = fs.statSync(fullPath);
            files[relPath] = {
              size: stat.size,
              mtime: Math.floor(stat.mtimeMs),
              hash: computeFileHash(fullPath),
            };
          } catch (err) {
            console.error(`[SYNC] Erro ao ler arquivo ${fullPath}:`, err);
          }
        }
      }
    }
  }

  scanDir(userDir);

  return {
    userId,
    username,
    generatedAt: new Date().toISOString(),
    files,
  };
}

/**
 * Aplica o delta de push (cria/atualiza arquivos e deleta os excluídos) de forma isolada
 */
export async function applyPushDelta(
  userId: number,
  zipBuffer: Buffer | null,
  deletions: string[],
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<PushResult> {
  const userDir = getUserArchiveDirectory(userId);
  let updatedCount = 0;
  let deletedCount = 0;
  let tempDir: string | null = null;

  try {
    // 1. Processa novos e modificados a partir do ZIP (se fornecido)
    if (zipBuffer && zipBuffer.length > 0) {
      let zip: any;
      try {
        zip = new AdmZip(zipBuffer);
      } catch {
        return { success: false, error: 'Arquivo de bundle ZIP inválido ou corrompido.' };
      }

      const entries = zip.getEntries();
      const parentDir = path.dirname(userDir);
      tempDir = path.join(parentDir, `_temp_sync_${userId}_${crypto.randomUUID()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // Valida cada entrada no ZIP antes de extrair
      for (const entry of entries) {
        const rawName = entry.entryName;
        if (entry.isDirectory || rawName.endsWith('/')) continue;
        if (!isPathSafe(rawName)) {
          return {
            success: false,
            error: `Tentativa de envio de arquivo com extensão ou caminho não permitido: ${rawName}`,
          };
        }
      }

      // Extrai com segurança no diretório temporário
      zip.extractAllTo(tempDir, true);

      // Move/copia os arquivos atualizados para a pasta do archive do usuário
      for (const entry of entries) {
        if (entry.isDirectory || entry.entryName.endsWith('/')) continue;
        const cleanRel = path.normalize(entry.entryName).replace(/^[/\\]+/, '');
        const srcPath = path.join(tempDir, cleanRel);
        const destPath = path.join(userDir, cleanRel);

        if (fs.existsSync(srcPath)) {
          const destFolder = path.dirname(destPath);
          if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder, { recursive: true });
          }
          fs.copyFileSync(srcPath, destPath);
          updatedCount++;
        }
      }
    }

    // 2. Processa as deleções solicitadas
    if (Array.isArray(deletions)) {
      for (const delPath of deletions) {
        if (!delPath || typeof delPath !== 'string') continue;
        const cleanRel = path.normalize(delPath).replace(/^[/\\]+/, '');
        if (cleanRel.includes('..') || path.isAbsolute(cleanRel)) continue;

        const targetFile = path.join(userDir, cleanRel);
        if (targetFile.startsWith(userDir) && fs.existsSync(targetFile)) {
          try {
            const stat = fs.statSync(targetFile);
            if (stat.isFile()) {
              fs.unlinkSync(targetFile);
              deletedCount++;

              // Remove diretórios pais caso fiquem vazios (até a raiz do usuário)
              let parentDir = path.dirname(targetFile);
              while (parentDir !== userDir && parentDir.startsWith(userDir)) {
                const remaining = fs.readdirSync(parentDir);
                if (remaining.length === 0) {
                  fs.rmdirSync(parentDir);
                  parentDir = path.dirname(parentDir);
                } else {
                  break;
                }
              }
            }
          } catch (err) {
            console.error(`[SYNC] Erro ao deletar arquivo ${targetFile}:`, err);
          }
        }
      }
    }

    logActivity(
      userId,
      'sync_push',
      { updatedCount, deletedCount, zipBytes: zipBuffer?.length || 0 },
      ipAddress,
      userAgent
    );

    return { success: true, updatedCount, deletedCount };
  } catch (err: any) {
    console.error(`[SYNC] Falha ao aplicar sync push para o usuário ${userId}:`, err);
    return { success: false, error: `Falha ao aplicar alterações: ${err.message}` };
  } finally {
    // LIMPEZA OBRIGATÓRIA de qualquer pasta temporária
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

/**
 * Cria um bundle ZIP contendo exclusivamente os arquivos requisitados para pull
 */
export function createPullBundle(
  userId: number,
  requestedPaths: string[],
  ipAddress?: string | null,
  userAgent?: string | null
): Buffer {
  const userDir = getUserArchiveDirectory(userId);
  const zip = new AdmZip();
  let filesAdded = 0;

  for (const relPath of requestedPaths) {
    if (!relPath || typeof relPath !== 'string') continue;
    const cleanRel = path.normalize(relPath).replace(/^[/\\]+/, '');
    if (cleanRel.includes('..') || path.isAbsolute(cleanRel)) continue;

    const fullPath = path.join(userDir, cleanRel);
    if (fullPath.startsWith(userDir) && fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const zipDir = path.dirname(cleanRel);
        const zipFolder = zipDir === '.' ? '' : zipDir;
        zip.addLocalFile(fullPath, zipFolder);
        filesAdded++;
      }
    }
  }

  logActivity(
    userId,
    'sync_pull',
    { requestedCount: requestedPaths.length, filesAdded },
    ipAddress,
    userAgent
  );

  return zip.toBuffer();
}
