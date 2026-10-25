#!/usr/bin/env node
/**
 * Builds the parity fixture data directory used by BOTH the current site (main worktree)
 * and the rewrite during side-by-side comparisons.
 *
 * Sources are only read: ../main/data (database + per-user archives) and ../main/archive
 * (local archive written by the skills). The fixture reproduces what the current site shows in
 * dev mode (local archive overrides the stored archive per subject) and adds a second user with
 * shared subjects so cross-user features (shared badge, other users' tags) can be exercised.
 *
 * Usage: node tests/parity/prepare-fixture.mjs [targetDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, '../../..');
const mainWorktree = path.join(workspaceRoot, 'main');
const targetDir = path.resolve(process.argv[2] || path.join(workspaceRoot, 'data-dev'));

export const FIXTURE_USERS = {
  admin: { id: 1, password: 'admin-parity' },
  colleague: { username: 'colega', displayName: 'Colega de Turma', password: 'colega-parity' },
};

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function resetTarget() {
  if (targetDir.startsWith(mainWorktree)) {
    throw new Error(`Refusing to write inside the main worktree: ${targetDir}`);
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(targetDir, 'archives'), { recursive: true });
}

function copyDatabase() {
  const source = new Database(path.join(mainWorktree, 'data', 'study.db'), { readonly: true });
  // VACUUM INTO produces a consistent single-file copy without touching the source WAL.
  source.exec(`VACUUM INTO '${path.join(targetDir, 'study.db').replaceAll("'", "''")}'`);
  source.close();
}

function buildAdminArchive() {
  const adminDir = path.join(targetDir, 'archives', '1');
  const storedDir = path.join(mainWorktree, 'data', 'archives', '1');
  if (fs.existsSync(storedDir)) copyDir(storedDir, adminDir);

  const localArchive = path.join(mainWorktree, 'archive');
  for (const entry of fs.readdirSync(localArchive, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const dest = path.join(adminDir, entry.name);
    fs.rmSync(dest, { recursive: true, force: true });
    copyDir(path.join(localArchive, entry.name), dest);
  }
}

function seedUsersAndPermissions() {
  const db = new Database(path.join(targetDir, 'study.db'));
  db.pragma('foreign_keys = ON');

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    hash(FIXTURE_USERS.admin.password),
    FIXTURE_USERS.admin.id,
  );

  db.exec('DELETE FROM sessions; DELETE FROM subject_permissions; DELETE FROM compiled_mdx_cache;');
  db.prepare('DELETE FROM users WHERE id <> ?').run(FIXTURE_USERS.admin.id);

  const colleague = FIXTURE_USERS.colleague;
  const colleagueId = Number(
    db
      .prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'normal')")
      .run(colleague.username, colleague.displayName, hash(colleague.password)).lastInsertRowid,
  );

  // The colleague owns a copy of "redes" under another slug with the same subject code, so the
  // admin sees the colleague's tags as "tags de outros" inside their own "redes".
  const adminArchive = path.join(targetDir, 'archives', '1');
  const colleagueArchive = path.join(targetDir, 'archives', String(colleagueId));
  copyDir(path.join(adminArchive, 'redes'), path.join(colleagueArchive, 'redes-colega'));
  const materiaJsonPath = path.join(colleagueArchive, 'redes-colega', 'materia.json');
  const materiaJson = JSON.parse(fs.readFileSync(materiaJsonPath, 'utf8'));
  materiaJson.slug = 'redes-colega';
  materiaJson.name = `${materiaJson.name} (Turma B)`;
  fs.writeFileSync(materiaJsonPath, `${JSON.stringify(materiaJson, null, 2)}\n`);

  const pdsCode = JSON.parse(fs.readFileSync(path.join(adminArchive, 'pds', 'materia.json'), 'utf8')).code;
  const grant = db.prepare(
    `INSERT INTO subject_permissions (owner_user_id, granted_user_id, subject_code, materia_slug, granted_by)
     VALUES (?, ?, ?, ?, 1)`,
  );
  grant.run(colleagueId, 1, String(materiaJson.code).toUpperCase(), 'redes-colega');
  grant.run(1, colleagueId, String(pdsCode).toUpperCase(), 'pds');

  db.close();
  return colleagueId;
}

resetTarget();
copyDatabase();
buildAdminArchive();
const colleagueId = seedUsersAndPermissions();
console.log(`Fixture ready at ${targetDir} (admin=1, colega=${colleagueId})`);
