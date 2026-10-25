import { asc, count, desc, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { type UserRow, users } from '../db/schema';

export type Role = 'normal' | 'admin';

/** User data safe to expose to clients (no password hash). */
export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  createdAt: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt ?? '',
  };
}

export class UserRepository {
  constructor(private readonly db: AppDatabase) {}

  findById(id: number): UserRow | undefined {
    return this.db.select().from(users).where(eq(users.id, id)).get();
  }

  /** Case-insensitive lookup (the column is declared COLLATE NOCASE). */
  findByUsername(username: string): UserRow | undefined {
    return this.db.select().from(users).where(eq(users.username, username.trim())).get();
  }

  listAll(): UserRow[] {
    return this.db.select().from(users).orderBy(desc(users.role), asc(users.username)).all();
  }

  countAdmins(): number {
    return this.db.select({ n: count() }).from(users).where(eq(users.role, 'admin')).get()?.n ?? 0;
  }

  insert(data: { username: string; displayName: string; passwordHash: string; role: Role }): UserRow {
    return this.db.insert(users).values(data).returning().get();
  }

  update(id: number, data: { displayName?: string; role?: Role }): void {
    this.db
      .update(users)
      .set({ ...data, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.id, id))
      .run();
  }

  updatePasswordHash(id: number, passwordHash: string): void {
    this.db.update(users).set({ passwordHash, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(users.id, id)).run();
  }

  delete(id: number): void {
    this.db.delete(users).where(eq(users.id, id)).run();
  }
}
