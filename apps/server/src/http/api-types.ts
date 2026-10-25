/**
 * Types of the JSON API, shared with the web app (type-only imports, no runtime coupling).
 */
export type { Indexed, StoredDocument } from '../archive/document-index';
export type { Notebook, OtherSource, SubjectView } from '../archive/subject-catalog';
export type { LogEntry } from '../logs/activity-log';
export type { PermissionListing } from '../permissions/permission-repository';
export type { ArchiveManifest } from '../transfer/archive-transfer';
export type { PublicUser, Role } from '../users/user-repository';

export interface SessionInfo {
  user: import('../users/user-repository').PublicUser;
  uploadLimitMb: number;
  clientCache: { ttlMinutes: number; maxEntries: number };
}
