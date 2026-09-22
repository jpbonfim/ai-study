import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { getDataDirectory } from './db.ts';
import { logActivity } from './log.ts';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

// Whitelist rigorosa de extensões permitidas dentro do arquivo ZIP
const ALLOWED_EXTENSIONS = new Set([
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

// Limite de descompressão para prevenir Zip Bombs (ex: máximo 500 MB descompactado)
const MAX_DECOMPRESSED_BYTES = 500 * 1024 * 1024;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  filesCount?: number;
  totalBytes?: number;
}

/**
 * Valida a integridade e segurança de um arquivo ZIP antes da extração
 */
export function validateZipSecurity(zip: any): ValidationResult {
  const entries = zip.getEntries();
  if (!entries || entries.length === 0) {
    return { valid: false, error: 'O arquivo ZIP está vazio.' };
  }

  let totalSize = 0;
  let fileCount = 0;

  for (const entry of entries) {
    const rawName = entry.entryName;

    // Proteção contra Path Traversal
    if (rawName.includes('..') || path.isAbsolute(rawName) || rawName.startsWith('/') || rawName.startsWith('\\')) {
      return {
        valid: false,
        error: `Tentativa de Path Traversal detectada no item: ${rawName}`,
      };
    }

    // Se for diretório, pula checagem de extensão
    if (entry.isDirectory || rawName.endsWith('/')) {
      continue;
    }

    fileCount++;
    totalSize += entry.header?.size || entry.size || 0;

    if (totalSize > MAX_DECOMPRESSED_BYTES) {
      return {
        valid: false,
        error: 'O conteúdo descompactado excede o limite de segurança de armazenamento.',
      };
    }

    const ext = path.extname(rawName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        error: `Arquivo com extensão não permitida encontrado no ZIP: "${rawName}" (${ext}). Apenas documentos e imagens são aceitos.`,
      };
    }
  }

  return { valid: true, filesCount: fileCount, totalBytes: totalSize };
}

/**
 * Processa o upload do archive completo de um usuário
 */
export async function processFullArchiveUpload(
  userId: number,
  zipBuffer: Buffer,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<{ success: boolean; error?: string; filesCount?: number }> {
  let zip: any;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    return { success: false, error: 'Arquivo ZIP corrompido ou formato inválido.' };
  }

  const validation = validateZipSecurity(zip);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const dataDir = getDataDirectory();
  const userArchiveDir = path.join(dataDir, 'archives', String(userId));
  const tempDir = path.join(dataDir, 'archives', `_temp_${userId}_${crypto.randomUUID()}`);

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    // Extrai todo o conteúdo para o diretório temporário
    zip.extractAllTo(tempDir, true);

    // Se o zip extraído tiver apenas uma pasta raiz (ex: archive/ ou pds/), normaliza
    const rootItems = fs.readdirSync(tempDir, { withFileTypes: true });
    let sourceContentDir = tempDir;

    if (rootItems.length === 1 && rootItems[0].isDirectory()) {
      const singleDir = path.join(tempDir, rootItems[0].name);
      // Se a pasta interna se chamar 'archive' ou contiver matérias
      sourceContentDir = singleDir;
    }

    // Remove o conteúdo pré-existente do archive do usuário com segurança
    if (fs.existsSync(userArchiveDir)) {
      fs.rmSync(userArchiveDir, { recursive: true, force: true });
    }
    fs.mkdirSync(userArchiveDir, { recursive: true });

    // Move os arquivos da pasta temporária para a pasta definitiva do usuário
    const itemsToMove = fs.readdirSync(sourceContentDir);
    for (const item of itemsToMove) {
      const srcPath = path.join(sourceContentDir, item);
      const destPath = path.join(userArchiveDir, item);
      fs.cpSync(srcPath, destPath, { recursive: true });
    }

    logActivity(
      userId,
      'upload_archive',
      { filesCount: validation.filesCount, sizeBytes: zipBuffer.length },
      ipAddress,
      userAgent
    );

    return { success: true, filesCount: validation.filesCount };
  } catch (err: any) {
    console.error(`[UPLOAD] Erro ao extrair archive do usuário ${userId}:`, err);
    return { success: false, error: `Falha ao extrair o archive: ${err.message}` };
  } finally {
    // LIMPEZA OBRIGATÓRIA: Garante que os arquivos temporários sejam eliminados
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

/**
 * Processa o upload de uma matéria específica de um usuário
 */
export async function processMateriaUpload(
  userId: number,
  materiaSlug: string,
  zipBuffer: Buffer,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<{ success: boolean; error?: string; filesCount?: number }> {
  const cleanSlug = materiaSlug.trim().toLowerCase();
  if (!cleanSlug || !/^[a-z0-9-_]+$/.test(cleanSlug)) {
    return { success: false, error: 'Identificador (slug) da matéria inválido.' };
  }

  let zip: any;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    return { success: false, error: 'Arquivo ZIP corrompido ou formato inválido.' };
  }

  const validation = validateZipSecurity(zip);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const dataDir = getDataDirectory();
  const userMateriaDir = path.join(dataDir, 'archives', String(userId), cleanSlug);
  const tempDir = path.join(dataDir, 'archives', `_temp_${userId}_${cleanSlug}_${crypto.randomUUID()}`);

  try {
    fs.mkdirSync(tempDir, { recursive: true });
    zip.extractAllTo(tempDir, true);

    // Identifica onde está o materia.json (se na raiz do temp ou dentro de subpasta com o slug)
    let sourceDir = tempDir;
    const items = fs.readdirSync(tempDir, { withFileTypes: true });

    if (!fs.existsSync(path.join(tempDir, 'materia.json')) && items.length === 1 && items[0].isDirectory()) {
      sourceDir = path.join(tempDir, items[0].name);
    }

    // Se o diretório da matéria já existir, substitui
    if (fs.existsSync(userMateriaDir)) {
      fs.rmSync(userMateriaDir, { recursive: true, force: true });
    }
    fs.mkdirSync(userMateriaDir, { recursive: true });

    const files = fs.readdirSync(sourceDir);
    for (const f of files) {
      const src = path.join(sourceDir, f);
      const dest = path.join(userMateriaDir, f);
      fs.cpSync(src, dest, { recursive: true });
    }

    logActivity(
      userId,
      'upload_materia',
      { materiaSlug: cleanSlug, filesCount: validation.filesCount, sizeBytes: zipBuffer.length },
      ipAddress,
      userAgent
    );

    return { success: true, filesCount: validation.filesCount };
  } catch (err: any) {
    console.error(`[UPLOAD] Erro ao extrair matéria ${cleanSlug} do usuário ${userId}:`, err);
    return { success: false, error: `Falha ao extrair matéria: ${err.message}` };
  } finally {
    // LIMPEZA OBRIGATÓRIA
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

/**
 * Gera um buffer ZIP para download do archive completo ou de uma matéria específica
 */
export function createArchiveZipBuffer(userId: number, materiaSlug?: string): Buffer {
  const dataDir = getDataDirectory();
  const zip = new AdmZip();

  if (materiaSlug) {
    const materiaDir = path.join(dataDir, 'archives', String(userId), materiaSlug);
    if (!fs.existsSync(materiaDir)) {
      throw new Error(`Matéria "${materiaSlug}" não encontrada para download.`);
    }
    zip.addLocalFolder(materiaDir, materiaSlug);
  } else {
    const userArchiveDir = path.join(dataDir, 'archives', String(userId));
    if (!fs.existsSync(userArchiveDir)) {
      throw new Error('Archive do usuário não encontrado para download.');
    }
    zip.addLocalFolder(userArchiveDir, 'archive');
  }

  return zip.toBuffer();
}
