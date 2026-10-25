import crypto from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { sessions, users } from '../db/schema';
import { type PublicUser, toPublicUser } from '../users/user-repository';

export interface CreatedSession {
  sessionId: string;
  expiresAt: Date;
}

/** Server-side sessions persisted in SQLite; the id travels in the `session_id` cookie. */
export class SessionStore {
  constructor(
    private readonly db: AppDatabase,
    private readonly maxAgeMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get maxAgeSeconds(): number {
    return Math.floor(this.maxAgeMs / 1000);
  }

  create(userId: number, ipAddress: string | null, userAgent: string | null): CreatedSession {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(this.now() + this.maxAgeMs);
    this.db
      .insert(sessions)
      .values({ id: sessionId, userId, ipAddress, userAgent, expiresAt: expiresAt.toISOString() })
      .run();
    return { sessionId, expiresAt };
  }

  /** Returns the session's user, deleting the session when it has expired. */
  findUser(sessionId: string): PublicUser | null {
    if (!sessionId) return null;
    const row = this.db
      .select({ expiresAt: sessions.expiresAt, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sessionId))
      .get();
    if (!row) return null;
    if (this.now() > new Date(row.expiresAt).getTime()) {
      this.delete(sessionId);
      return null;
    }
    return toPublicUser(row.user);
  }

  delete(sessionId: string): void {
    this.db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  }

  deleteAllForUser(userId: number): void {
    this.db.delete(sessions).where(eq(sessions.userId, userId)).run();
  }

  /** Removes sessions past their expiration date; returns how many were removed. */
  purgeExpired(): number {
    return this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date(this.now()).toISOString()))
      .run().changes;
  }
}
