import type { PublicUser } from '../users/user-repository';
import type { PermissionRepository } from './permission-repository';

/**
 * Single authorization policy for reading a user's subject (documents, media, exports,
 * downloads): the owner, any admin, or a user the subject was shared with.
 */
export class SubjectAccessPolicy {
  constructor(private readonly permissions: PermissionRepository) {}

  canRead(user: PublicUser, ownerId: number, materiaSlug: string): boolean {
    return user.id === ownerId || user.role === 'admin' || this.permissions.hasGrant(user.id, ownerId, materiaSlug);
  }
}
