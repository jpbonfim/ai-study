import { db, type SubjectPermissionRow } from './db.ts';
import { logActivity } from './log.ts';

export interface EnrichedSubjectPermission extends SubjectPermissionRow {
  owner_username: string;
  owner_display_name: string;
  granted_username: string;
  granted_display_name: string;
  granted_by_username: string;
}

/**
 * Concede permissão de acesso a uma matéria de um usuário para outro
 */
export function grantSubjectPermission(
  ownerUserId: number,
  grantedUserId: number,
  subjectCode: string,
  materiaSlug: string,
  grantedBy: number
): void {
  if (ownerUserId === grantedUserId) {
    throw new Error('Não é necessário conceder permissão a si mesmo.');
  }

  const cleanCode = subjectCode.trim().toUpperCase();
  const cleanSlug = materiaSlug.trim().toLowerCase();

  const stmt = db.prepare(`
    INSERT INTO subject_permissions (owner_user_id, granted_user_id, subject_code, materia_slug, granted_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id, granted_user_id, subject_code) 
    DO UPDATE SET materia_slug = excluded.materia_slug, granted_by = excluded.granted_by, granted_at = CURRENT_TIMESTAMP
  `);

  stmt.run(ownerUserId, grantedUserId, cleanCode, cleanSlug, grantedBy);

  logActivity(
    grantedBy,
    'admin_grant_permission',
    { ownerUserId, grantedUserId, subjectCode: cleanCode, materiaSlug: cleanSlug }
  );
}

/**
 * Revoga uma permissão pelo ID
 */
export function revokeSubjectPermission(permissionId: number, revokedBy: number): void {
  const findStmt = db.prepare('SELECT * FROM subject_permissions WHERE id = ?');
  const perm = findStmt.get(permissionId) as SubjectPermissionRow | undefined;

  if (!perm) return;

  const deleteStmt = db.prepare('DELETE FROM subject_permissions WHERE id = ?');
  deleteStmt.run(permissionId);

  logActivity(
    revokedBy,
    'admin_revoke_permission',
    { permissionId, ownerUserId: perm.owner_user_id, grantedUserId: perm.granted_user_id, subjectCode: perm.subject_code }
  );
}

/**
 * Retorna todas as permissões concedidas a um usuário específico
 */
export function getPermissionsGrantedToUser(userId: number): Array<SubjectPermissionRow & {
  owner_username: string;
  owner_display_name: string;
}> {
  const stmt = db.prepare(`
    SELECT 
      p.*,
      u.username as owner_username,
      u.display_name as owner_display_name
    FROM subject_permissions p
    JOIN users u ON p.owner_user_id = u.id
    WHERE p.granted_user_id = ?
    ORDER BY p.subject_code ASC
  `);

  return stmt.all(userId) as any[];
}

/**
 * Retorna todas as permissões concedidas a partir de matérias de um dono específico
 */
export function getPermissionsByOwner(ownerUserId: number): Array<SubjectPermissionRow & {
  granted_username: string;
  granted_display_name: string;
}> {
  const stmt = db.prepare(`
    SELECT 
      p.*,
      u.username as granted_username,
      u.display_name as granted_display_name
    FROM subject_permissions p
    JOIN users u ON p.granted_user_id = u.id
    WHERE p.owner_user_id = ?
    ORDER BY p.subject_code ASC
  `);

  return stmt.all(ownerUserId) as any[];
}

/**
 * Retorna a lista completa de permissões do sistema (para o painel de administração)
 */
export function getAllPermissions(): EnrichedSubjectPermission[] {
  const stmt = db.prepare(`
    SELECT 
      p.*,
      o.username as owner_username,
      o.display_name as owner_display_name,
      g.username as granted_username,
      g.display_name as granted_display_name,
      b.username as granted_by_username
    FROM subject_permissions p
    JOIN users o ON p.owner_user_id = o.id
    JOIN users g ON p.granted_user_id = g.id
    JOIN users b ON p.granted_by = b.id
    ORDER BY p.granted_at DESC
  `);

  return stmt.all() as EnrichedSubjectPermission[];
}

/**
 * Verifica se um usuário tem permissão para acessar o archive de um dono e matéria
 */
export function hasPermissionToSubject(
  requesterUserId: number,
  ownerUserId: number,
  subjectCodeOrSlug: string
): boolean {
  if (requesterUserId === ownerUserId) return true;

  const target = subjectCodeOrSlug.trim();

  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM subject_permissions
    WHERE owner_user_id = ?
      AND granted_user_id = ?
      AND (subject_code = ? COLLATE NOCASE OR materia_slug = ? COLLATE NOCASE)
  `);

  const { count } = stmt.get(ownerUserId, requesterUserId, target, target) as { count: number };
  return count > 0;
}
