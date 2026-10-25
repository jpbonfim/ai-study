import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * Mirrors the schema created by the previous version of the site, so existing databases are
 * adopted as-is by the first migration. Timestamps are SQLite `CURRENT_TIMESTAMP` strings
 * (`YYYY-MM-DD HH:MM:SS`, UTC); `sessions.expires_at` is an ISO-8601 string.
 */

const createdAt = () => text('created_at').default(sql`CURRENT_TIMESTAMP`);

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['normal', 'admin'] })
    .notNull()
    .default('normal'),
  createdAt: createdAt(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [index('idx_sessions_user').on(t.userId), index('idx_sessions_expires').on(t.expiresAt)],
);

export const subjectPermissions = sqliteTable(
  'subject_permissions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerUserId: integer('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    grantedUserId: integer('granted_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subjectCode: text('subject_code').notNull(),
    materiaSlug: text('materia_slug').notNull(),
    grantedBy: integer('granted_by')
      .notNull()
      .references(() => users.id),
    grantedAt: text('granted_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    unique().on(t.ownerUserId, t.grantedUserId, t.subjectCode),
    index('idx_permissions_granted').on(t.grantedUserId),
    index('idx_permissions_owner').on(t.ownerUserId),
    index('idx_permissions_code').on(t.subjectCode),
  ],
);

export const activityLogs = sqliteTable(
  'activity_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    details: text('details'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_logs_user').on(t.userId),
    index('idx_logs_action').on(t.action),
    index('idx_logs_created').on(t.createdAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type SubjectPermissionRow = typeof subjectPermissions.$inferSelect;
export type ActivityLogRow = typeof activityLogs.$inferSelect;
