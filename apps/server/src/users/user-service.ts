import type { ArchiveStore } from '../archive/archive-store';
import { hashPassword, verifyPassword } from '../auth/passwords';
import type { SessionStore } from '../auth/session-store';
import { type PublicUser, type Role, toPublicUser, type UserRepository } from './user-repository';

/** A rule violation whose message is shown to the user as-is. */
export class UserRuleError extends Error {}

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const MIN_PASSWORD_LENGTH = 6;

/** Account lifecycle rules: validation, archive folders and session invalidation. */
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
    private readonly archives: ArchiveStore,
  ) {}

  async authenticate(username: string, password: string): Promise<PublicUser | null> {
    const clean = username.trim();
    if (!clean || !password) return null;
    const row = this.users.findByUsername(clean);
    if (!row || !(await verifyPassword(password, row.passwordHash))) return null;
    return toPublicUser(row);
  }

  /** Id of the account with this username (case-insensitive), if any. */
  idOf(username: string): number | null {
    return this.users.findByUsername(username)?.id ?? null;
  }

  list(): PublicUser[] {
    return this.users.listAll().map(toPublicUser);
  }

  async create(input: { username: string; displayName: string; password: string; role: Role }): Promise<PublicUser> {
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!username || username.length < 3) throw new UserRuleError('Nome de usuário deve ter pelo menos 3 caracteres.');
    if (!USERNAME_PATTERN.test(username)) {
      throw new UserRuleError('Nome de usuário pode conter apenas letras, números, ponto, hífen e sublinhado.');
    }
    if (!displayName) throw new UserRuleError('Nome de exibição é obrigatório.');
    if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
      throw new UserRuleError('A senha deve ter pelo menos 6 caracteres.');
    }
    if (this.users.findByUsername(username)) throw new UserRuleError(`O usuário "${username}" já está cadastrado.`);

    const row = this.users.insert({
      username,
      displayName,
      passwordHash: await hashPassword(input.password),
      role: input.role,
    });
    this.archives.ensureUserDir(row.id);
    return toPublicUser(row);
  }

  update(id: number, data: { displayName?: string; role?: Role }): void {
    this.users.update(id, {
      ...(data.displayName !== undefined ? { displayName: data.displayName.trim() } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
    });
  }

  /** Changes the password and signs the user out everywhere. */
  async changePassword(id: number, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new UserRuleError('A nova senha deve ter pelo menos 6 caracteres.');
    }
    this.users.updatePasswordHash(id, await hashPassword(newPassword));
    this.sessions.deleteAllForUser(id);
  }

  /** Deletes the account (sessions and grants cascade) and its archive folder. */
  delete(id: number): void {
    const row = this.users.findById(id);
    if (!row) return;
    if (row.role === 'admin' && this.users.countAdmins() <= 1) {
      throw new UserRuleError('Não é permitido remover o único administrador do sistema.');
    }
    this.users.delete(id);
    try {
      this.archives.removeUserDir(id);
    } catch (err) {
      console.error(`[users] could not remove archive of user ${id}:`, err);
    }
  }

  /** Creates the initial administrator when the database has none. */
  async ensureInitialAdmin(admin: { username: string; password: string; displayName: string }): Promise<void> {
    if (this.users.countAdmins() > 0) return;
    const row = this.users.insert({
      username: admin.username,
      displayName: admin.displayName,
      passwordHash: await hashPassword(admin.password),
      role: 'admin',
    });
    this.archives.ensureUserDir(row.id);
    console.log(`[users] initial administrator created: ${row.username} (id ${row.id})`);
  }
}
