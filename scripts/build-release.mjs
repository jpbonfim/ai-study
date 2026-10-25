#!/usr/bin/env node
/**
 * Builds a self-contained release in release/<id>/, ready to be copied to the server:
 *
 *   server.mjs          bundled API server
 *   web/                built SPA (served by Caddy, or by the server with WEB_DIST_DIR)
 *   package.json        the bundle's runtime externals, pinned to the versions in package-lock.json
 *   package-lock.json   so the server runs `npm ci` and gets exactly what was tested
 *   activate.sh         installs and switches to this release on the server
 *   study-site.service  systemd unit installed by activate.sh
 *   RELEASE.json        id, commit and build date
 *
 * Everything that needs CPU (TypeScript, Vite, esbuild) runs here, not on the server.
 * Usage: node scripts/build-release.mjs   (prints the release directory on stdout)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIME_EXTERNALS } from '../apps/server/runtime-externals.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Progress goes to stderr: stdout carries only the release directory (read by deploy.sh).
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: [0, 2, 2] });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const commit = git('rev-parse', '--short=10', 'HEAD');
const dirty = git('status', '--porcelain') !== '';
if (dirty) console.warn('[release] Aviso: há alterações não commitadas; o release leva o sufixo -dirty.');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const id = `${stamp}-${commit}${dirty ? '-dirty' : ''}`;
const out = path.join(root, 'release', id);

run('npm', ['run', 'build']);

fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'apps/server/dist/server.mjs'), path.join(out, 'server.mjs'));
fs.copyFileSync(path.join(root, 'apps/server/dist/server.mjs.map'), path.join(out, 'server.mjs.map'));
fs.cpSync(path.join(root, 'apps/web/dist'), path.join(out, 'web'), { recursive: true });
fs.copyFileSync(path.join(root, 'scripts/activate-release.sh'), path.join(out, 'activate.sh'));
fs.chmodSync(path.join(out, 'activate.sh'), 0o755);
fs.copyFileSync(path.join(root, 'scripts/study-site.service'), path.join(out, 'study-site.service'));

const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const pinned = (name) => {
  const version = lock.packages[`node_modules/${name}`]?.version;
  if (!version) throw new Error(`${name} não está no package-lock.json`);
  return version;
};
const dependencies = Object.fromEntries(RUNTIME_EXTERNALS.map((name) => [name, pinned(name)]));
const manifest = {
  name: 'ai-study-release',
  private: true,
  type: 'module',
  engines: { node: '>=24' },
  dependencies,
  // better-sqlite3 downloads its prebuilt native binary in an install script.
  allowScripts: { [`better-sqlite3@${dependencies['better-sqlite3']}`]: true },
};
fs.writeFileSync(path.join(out, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], out);

const release = { id, commit, dirty, builtAt: new Date().toISOString() };
fs.writeFileSync(path.join(out, 'RELEASE.json'), `${JSON.stringify(release, null, 2)}\n`);

console.error(`[release] ${id} pronto.`);
console.log(out);
