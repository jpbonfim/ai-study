import { and, count, desc, eq, gte, like, lte, or, type SQL, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { activityLogs, users } from '../db/schema';

/** Audit actions recorded by the platform (the admin panel filters by these). */
export type ActivityAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'page_view'
  | 'upload_archive'
  | 'upload_materia'
  | 'download_archive'
  | 'download_materia'
  | 'sync_push'
  | 'sync_pull'
  | 'admin_create_user'
  | 'admin_update_user'
  | 'admin_change_password'
  | 'admin_delete_user'
  | 'admin_grant_permission'
  | 'admin_revoke_permission';

export interface RequestOrigin {
  ip: string | null;
  userAgent: string | null;
}

export interface LogQuery {
  userId?: number;
  action?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  limit: number;
  offset: number;
}

export interface LogEntry {
  id: number;
  user_id: number | null;
  username: string | null;
  display_name: string | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string | null;
}

export class ActivityLog {
  constructor(private readonly db: AppDatabase) {}

  record(
    userId: number | null,
    action: ActivityAction,
    details: Record<string, unknown> | string | null = null,
    origin: RequestOrigin = { ip: null, userAgent: null },
  ): void {
    try {
      const serialized = details === null ? null : typeof details === 'string' ? details : JSON.stringify(details);
      this.db
        .insert(activityLogs)
        .values({ userId, action, details: serialized, ipAddress: origin.ip, userAgent: origin.userAgent })
        .run();
    } catch (err) {
      // Auditing must never break the request being audited.
      console.error('[activity-log] failed to record', action, err);
    }
  }

  query(options: LogQuery): { total: number; page: number; limit: number; logs: LogEntry[] } {
    const filters: SQL[] = [];
    if (options.userId !== undefined) filters.push(eq(activityLogs.userId, options.userId));
    if (options.action) filters.push(eq(activityLogs.action, options.action));
    if (options.fromDate) filters.push(gte(activityLogs.createdAt, options.fromDate));
    if (options.toDate) filters.push(lte(activityLogs.createdAt, options.toDate));
    if (options.search) {
      const pattern = `%${options.search}%`;
      filters.push(
        or(like(activityLogs.details, pattern), like(users.username, pattern), like(users.displayName, pattern)) as SQL,
      );
    }
    const where = filters.length > 0 ? and(...filters) : undefined;

    const total =
      this.db
        .select({ n: count() })
        .from(activityLogs)
        .leftJoin(users, eq(activityLogs.userId, users.id))
        .where(where)
        .get()?.n ?? 0;

    const logs = this.db
      .select({
        id: activityLogs.id,
        user_id: activityLogs.userId,
        username: users.username,
        display_name: users.displayName,
        action: activityLogs.action,
        details: activityLogs.details,
        ip_address: activityLogs.ipAddress,
        user_agent: activityLogs.userAgent,
        created_at: activityLogs.createdAt,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(where)
      .orderBy(desc(activityLogs.createdAt))
      .limit(options.limit)
      .offset(options.offset)
      .all();

    return { total, page: Math.floor(options.offset / options.limit) + 1, limit: options.limit, logs };
  }

  purgeOlderThan(days: number): number {
    return this.db
      .delete(activityLogs)
      .where(sql`${activityLogs.createdAt} < datetime('now', '-' || ${days} || ' days')`)
      .run().changes;
  }
}

/**
 * Page views are logged at most once per session and path every 5 minutes, to keep the audit
 * log useful without recording every navigation.
 */
export class PageViewThrottle {
  private readonly lastLogged = new Map<string, number>();

  constructor(
    private readonly intervalMs = 5 * 60 * 1000,
    private readonly maxEntries = 2000,
    private readonly now: () => number = Date.now,
  ) {}

  shouldLog(sessionKey: string, path: string): boolean {
    const key = `${sessionKey}:${path}`;
    const now = this.now();
    if (now - (this.lastLogged.get(key) ?? 0) <= this.intervalMs) return false;
    if (this.lastLogged.size > this.maxEntries) this.lastLogged.clear();
    this.lastLogged.set(key, now);
    return true;
  }
}
