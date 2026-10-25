import { and, asc, count, desc, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { AppDatabase } from '../db/client';
import { type SubjectPermissionRow, subjectPermissions, users } from '../db/schema';

export interface GrantedPermission extends SubjectPermissionRow {
  ownerUsername: string;
  ownerDisplayName: string;
}

/** Row shape used by the admin panel (snake_case keys are part of the admin API contract). */
export interface PermissionListing {
  id: number;
  owner_user_id: number;
  granted_user_id: number;
  subject_code: string;
  materia_slug: string;
  granted_by: number;
  granted_at: string | null;
  owner_username: string;
  owner_display_name: string;
  granted_username: string;
  granted_display_name: string;
  granted_by_username: string;
}

export class PermissionRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Inserts or refreshes the grant (unique per owner, grantee and subject code). */
  upsert(grant: {
    ownerUserId: number;
    grantedUserId: number;
    subjectCode: string;
    materiaSlug: string;
    grantedBy: number;
  }): void {
    this.db
      .insert(subjectPermissions)
      .values(grant)
      .onConflictDoUpdate({
        target: [subjectPermissions.ownerUserId, subjectPermissions.grantedUserId, subjectPermissions.subjectCode],
        set: { materiaSlug: grant.materiaSlug, grantedBy: grant.grantedBy, grantedAt: sql`CURRENT_TIMESTAMP` },
      })
      .run();
  }

  findById(id: number): SubjectPermissionRow | undefined {
    return this.db.select().from(subjectPermissions).where(eq(subjectPermissions.id, id)).get();
  }

  delete(id: number): void {
    this.db.delete(subjectPermissions).where(eq(subjectPermissions.id, id)).run();
  }

  /** Subjects other users shared with `userId`. */
  listGrantedTo(userId: number): GrantedPermission[] {
    return this.db
      .select({
        permission: subjectPermissions,
        ownerUsername: users.username,
        ownerDisplayName: users.displayName,
      })
      .from(subjectPermissions)
      .innerJoin(users, eq(subjectPermissions.ownerUserId, users.id))
      .where(eq(subjectPermissions.grantedUserId, userId))
      .orderBy(asc(subjectPermissions.subjectCode))
      .all()
      .map((r) => ({ ...r.permission, ownerUsername: r.ownerUsername, ownerDisplayName: r.ownerDisplayName }));
  }

  /** Whether `requesterId` may read the owner's subject (matched by subject code or slug, case-insensitively). */
  hasGrant(requesterId: number, ownerId: number, subjectCodeOrSlug: string): boolean {
    const target = subjectCodeOrSlug.trim();
    const row = this.db
      .select({ n: count() })
      .from(subjectPermissions)
      .where(
        and(
          eq(subjectPermissions.ownerUserId, ownerId),
          eq(subjectPermissions.grantedUserId, requesterId),
          or(
            sql`${subjectPermissions.subjectCode} = ${target} COLLATE NOCASE`,
            sql`${subjectPermissions.materiaSlug} = ${target} COLLATE NOCASE`,
          ),
        ),
      )
      .get();
    return (row?.n ?? 0) > 0;
  }

  listAll(): PermissionListing[] {
    const owner = alias(users, 'owner');
    const granted = alias(users, 'granted');
    const grantor = alias(users, 'grantor');
    return this.db
      .select({
        id: subjectPermissions.id,
        owner_user_id: subjectPermissions.ownerUserId,
        granted_user_id: subjectPermissions.grantedUserId,
        subject_code: subjectPermissions.subjectCode,
        materia_slug: subjectPermissions.materiaSlug,
        granted_by: subjectPermissions.grantedBy,
        granted_at: subjectPermissions.grantedAt,
        owner_username: owner.username,
        owner_display_name: owner.displayName,
        granted_username: granted.username,
        granted_display_name: granted.displayName,
        granted_by_username: grantor.username,
      })
      .from(subjectPermissions)
      .innerJoin(owner, eq(subjectPermissions.ownerUserId, owner.id))
      .innerJoin(granted, eq(subjectPermissions.grantedUserId, granted.id))
      .innerJoin(grantor, eq(subjectPermissions.grantedBy, grantor.id))
      .orderBy(desc(subjectPermissions.grantedAt))
      .all();
  }
}
