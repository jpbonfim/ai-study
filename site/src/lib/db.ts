import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Carrega variáveis de ambiente
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: 'normal' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface SafeUser {
  id: number;
  username: string;
  displayName: string;
  role: 'normal' | 'admin';
  createdAt: string;
}

export interface SessionRow {
  id: string;
  user_id: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
}

export interface SubjectPermissionRow {
  id: number;
  owner_user_id: number;
  granted_user_id: number;
  subject_code: string;
  materia_slug: string;
  granted_by: number;
  granted_at: string;
}

export interface ActivityLogRow {
  id: number;
  user_id: number | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Resolve o diretório raiz de dados (onde fica study.db e archives/)
 */
export function getDataDirectory(): string {
  if (process.env.DATA_DIR) {
    const customPath = path.isAbsolute(process.env.DATA_DIR)
      ? process.env.DATA_DIR
      : path.resolve(process.cwd(), process.env.DATA_DIR);
    if (!fs.existsSync(customPath)) {
      fs.mkdirSync(customPath, { recursive: true });
    }
    return customPath;
  }

  const candidatePaths = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), '../data'),
    path.resolve(import.meta.dirname || process.cwd(), '../../../data'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }

  // Se nenhum existir, cria no pai ou atual
  const defaultDir = path.resolve(process.cwd(), '../data');
  fs.mkdirSync(defaultDir, { recursive: true });
  return defaultDir;
}

const dataDir = getDataDirectory();
const dbPath = path.join(dataDir, 'study.db');

// Garante que subpasta de archives exista
const archivesDir = path.join(dataDir, 'archives');
if (!fs.existsSync(archivesDir)) {
  fs.mkdirSync(archivesDir, { recursive: true });
}

export const db = new Database(dbPath);

// Configurações de performance e integridade
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Criação das tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'normal' CHECK(role IN ('normal', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subject_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_code TEXT NOT NULL COLLATE NOCASE,
    materia_slug TEXT NOT NULL,
    granted_by INTEGER NOT NULL REFERENCES users(id),
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_user_id, granted_user_id, subject_code)
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_permissions_granted ON subject_permissions(granted_user_id);
  CREATE INDEX IF NOT EXISTS idx_permissions_owner ON subject_permissions(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_permissions_code ON subject_permissions(subject_code);
  CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action);
  CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
`);

/**
 * Inicializa o administrador se nenhum existir no banco
 */
function seedInitialAdmin() {
  const adminCountStmt = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`);
  const { count } = adminCountStmt.get() as { count: number };

  if (count === 0) {
    const adminUsername = (process.env.ADMIN_USERNAME || 'admin').trim();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminDisplayName = (process.env.ADMIN_DISPLAY_NAME || 'Administrador').trim();

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(adminPassword, salt);

    const insertAdmin = db.prepare(`
      INSERT INTO users (username, display_name, password_hash, role)
      VALUES (?, ?, ?, 'admin')
    `);

    const result = insertAdmin.run(adminUsername, adminDisplayName, hash);
    const adminId = result.lastInsertRowid;

    // Garante que a pasta de archive do admin exista
    const adminArchiveDir = path.join(dataDir, 'archives', String(adminId));
    if (!fs.existsSync(adminArchiveDir)) {
      fs.mkdirSync(adminArchiveDir, { recursive: true });
    }

    console.log(`[DB] Usuário administrador inicial criado com sucesso: ${adminUsername} (ID: ${adminId})`);
  }
}

seedInitialAdmin();

export function toSafeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  };
}
