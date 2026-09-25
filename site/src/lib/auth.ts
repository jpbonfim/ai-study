import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { db, toSafeUser, getDataDirectory, type UserRow, type SafeUser, type SessionRow } from './db.ts';
import { logActivity } from './log.ts';

// ============================================================
// HASHING DE SENHA
// ============================================================

export function hashPassword(password: string): string {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function authenticateUser(username: string, password: string): SafeUser | null {
  const cleanUsername = username.trim();
  if (!cleanUsername || !password) return null;
  const user = getUserByUsername(cleanUsername);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return null;
  }
  return toSafeUser(user);
}

// ============================================================
// GERENCIAMENTO DE SESSÕES
// ============================================================

export function getSessionMaxAgeMs(): number {
  const days = parseInt(process.env.SESSION_MAX_AGE_DAYS || '7', 10);
  return days * 24 * 60 * 60 * 1000;
}

export function createSession(
  userId: number,
  ipAddress: string | null = null,
  userAgent: string | null = null
): { sessionId: string; expiresAt: Date } {
  const sessionId = crypto.randomUUID();
  const maxAgeMs = getSessionMaxAgeMs();
  const expiresAt = new Date(Date.now() + maxAgeMs);

  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(sessionId, userId, ipAddress, userAgent, expiresAt.toISOString());

  return { sessionId, expiresAt };
}

export function getSessionUser(sessionId: string): SafeUser | null {
  if (!sessionId) return null;

  const stmt = db.prepare(`
    SELECT s.id as session_id, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `);

  const row = stmt.get(sessionId) as (UserRow & { session_id: string; expires_at: string }) | undefined;
  if (!row) return null;

  // Verifica expiração
  const expiresTime = new Date(row.expires_at).getTime();
  if (Date.now() > expiresTime) {
    deleteSession(sessionId);
    return null;
  }

  return toSafeUser(row);
}

export function deleteSession(sessionId: string): void {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  stmt.run(sessionId);
}

export function deleteUserSessions(userId: number): void {
  const stmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  stmt.run(userId);
}

// Limpeza de sessões expiradas
export function cleanExpiredSessions(): number {
  const stmt = db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`);
  const result = stmt.run();
  return result.changes;
}

const sessionCleanTimer = setInterval(cleanExpiredSessions, 60 * 60 * 1000);
sessionCleanTimer.unref();

// ============================================================
// RATE LIMITING (EM MEMÓRIA)
// ============================================================

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  blockedUntil: number | null;
}

const loginAttempts = new Map<string, RateLimitEntry>();

export function checkRateLimit(ip: string): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
  const maxAttempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10);
  const windowMinutes = parseInt(process.env.LOGIN_WINDOW_MINUTES || '15', 10);
  const windowMs = windowMinutes * 60 * 1000;

  const record = loginAttempts.get(ip);
  if (!record) {
    return { allowed: true, remainingAttempts: maxAttempts };
  }

  const now = Date.now();

  // Se o bloqueio ainda estiver ativo
  if (record.blockedUntil && record.blockedUntil > now) {
    const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds: retryAfter };
  }

  // Se a janela expirou, reseta
  if (now - record.firstAttempt > windowMs) {
    loginAttempts.delete(ip);
    return { allowed: true, remainingAttempts: maxAttempts };
  }

  // Se estourou as tentativas
  if (record.attempts >= maxAttempts) {
    const blockedUntil = record.firstAttempt + windowMs;
    record.blockedUntil = blockedUntil;
    const retryAfter = Math.ceil((blockedUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds: retryAfter };
  }

  return { allowed: true, remainingAttempts: maxAttempts - record.attempts };
}

export function recordLoginAttempt(ip: string, success: boolean): void {
  if (success) {
    loginAttempts.delete(ip);
    return;
  }

  const windowMinutes = parseInt(process.env.LOGIN_WINDOW_MINUTES || '15', 10);
  const windowMs = windowMinutes * 60 * 1000;
  const now = Date.now();

  const record = loginAttempts.get(ip);
  if (!record || now - record.firstAttempt > windowMs) {
    loginAttempts.set(ip, { attempts: 1, firstAttempt: now, blockedUntil: null });
  } else {
    record.attempts += 1;
    const maxAttempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10);
    if (record.attempts >= maxAttempts) {
      record.blockedUntil = now + windowMs;
    }
  }
}

// ============================================================
// CRUD DE USUÁRIOS
// ============================================================

export function getUserById(id: number): SafeUser | null {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const row = stmt.get(id) as UserRow | undefined;
  return row ? toSafeUser(row) : null;
}

export function getUserByUsername(username: string): UserRow | null {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');
  const row = stmt.get(username.trim()) as UserRow | undefined;
  return row || null;
}

export function getAllUsers(): SafeUser[] {
  const stmt = db.prepare('SELECT * FROM users ORDER BY role DESC, username ASC');
  const rows = stmt.all() as UserRow[];
  return rows.map(toSafeUser);
}

export function createUser(
  username: string,
  displayName: string,
  password: string,
  role: 'normal' | 'admin' = 'normal'
): SafeUser {
  const cleanUsername = username.trim().toLowerCase();
  const cleanDisplayName = displayName.trim();

  if (!cleanUsername || cleanUsername.length < 3) {
    throw new Error('Nome de usuário deve ter pelo menos 3 caracteres.');
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(cleanUsername)) {
    throw new Error('Nome de usuário pode conter apenas letras, números, ponto, hífen e sublinhado.');
  }

  if (!cleanDisplayName) {
    throw new Error('Nome de exibição é obrigatório.');
  }

  if (!password || password.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.');
  }

  const existing = getUserByUsername(cleanUsername);
  if (existing) {
    throw new Error(`O usuário "${cleanUsername}" já está cadastrado.`);
  }

  const hash = hashPassword(password);
  const stmt = db.prepare(`
    INSERT INTO users (username, display_name, password_hash, role)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(cleanUsername, cleanDisplayName, hash, role);
  const newId = Number(result.lastInsertRowid);

  // Cria a pasta de archive isolada do usuário
  const dataDir = getDataDirectory();
  const userArchiveDir = path.join(dataDir, 'archives', String(newId));
  if (!fs.existsSync(userArchiveDir)) {
    fs.mkdirSync(userArchiveDir, { recursive: true });
  }

  return {
    id: newId,
    username: cleanUsername,
    displayName: cleanDisplayName,
    role,
    createdAt: new Date().toISOString(),
  };
}

export function updateUser(
  id: number,
  data: { displayName?: string; role?: 'normal' | 'admin' }
): void {
  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: any[] = [];

  if (data.displayName !== undefined) {
    updates.push('display_name = ?');
    params.push(data.displayName.trim());
  }

  if (data.role !== undefined) {
    updates.push('role = ?');
    params.push(data.role);
  }

  params.push(id);

  const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);
}

export function changeUserPassword(id: number, newPassword: string): void {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
  }
  const hash = hashPassword(newPassword);
  const stmt = db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(hash, id);

  // Invalida todas as sessões anteriores por segurança
  deleteUserSessions(id);
}

export function deleteUser(id: number): void {
  // Impede deletar o último administrador
  const user = getUserById(id);
  if (!user) return;

  if (user.role === 'admin') {
    const adminCountStmt = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`);
    const { count } = adminCountStmt.get() as { count: number };
    if (count <= 1) {
      throw new Error('Não é permitido remover o único administrador do sistema.');
    }
  }

  // Deleta o registro no banco (as foreign keys em cascade cuidam de sessions e permissions)
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  stmt.run(id);

  // Remove a pasta do archive do usuário do disco
  try {
    const dataDir = getDataDirectory();
    const userArchiveDir = path.join(dataDir, 'archives', String(id));
    if (fs.existsSync(userArchiveDir)) {
      fs.rmSync(userArchiveDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Erro ao deletar archive do usuário ${id}:`, err);
  }
}
