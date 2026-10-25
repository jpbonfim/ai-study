import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { openDatabase } from '../src/db/client';

export interface TestServer {
  dataDir: string;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  close: () => void;
  services: ReturnType<typeof createApp>['services'];
}

export const ADMIN = { username: 'admin', password: 'admin-test-pw' };

export async function startTestServer(env: Record<string, string> = {}): Promise<TestServer> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-study-test-'));
  const config = readConfig({
    DATA_DIR: dataDir,
    ADMIN_USERNAME: ADMIN.username,
    ADMIN_PASSWORD: ADMIN.password,
    LOGIN_MAX_ATTEMPTS: '3',
    MAX_UPLOAD_MB_NORMAL: '1',
    // Tests never read a local archive/ that happens to exist in the checkout.
    ENABLE_LOCAL_ARCHIVE: 'false',
    ...env,
  });
  const database = openDatabase(config.databasePath);
  const { app, services } = createApp(config, database.db);
  await services.users.ensureInitialAdmin(config.initialAdmin);
  return {
    dataDir,
    services,
    request: async (p, init) => app.request(p, init),
    close: () => {
      database.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export async function login(server: TestServer, username: string, password: string): Promise<string> {
  const res = await server.request('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('no session cookie');
  return cookie;
}

/** Writes files (path → content) into a user's archive. */
export function writeArchive(dataDir: string, userId: number, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dataDir, 'archives', String(userId), rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

export function buildZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) zip.addBuffer(Buffer.from(content), name);
  zip.end();
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
}

export function multipart(fields: Record<string, string>, files: Record<string, Buffer>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const [k, v] of Object.entries(files)) form.set(k, new Blob([new Uint8Array(v)]), `${k}.zip`);
  return form;
}

export const SUBJECT_FILES = {
  'pds/materia.json': JSON.stringify({ slug: 'pds', name: 'PDS', code: 'PTC3214', institution: 'USP' }),
  'pds/resumos/cap-1.mdx':
    '---\ntitle: Cap 1\ntopic: Intro\nchapter: 1\ntags: [p1]\n---\n# Olá\n\n<QuestionCard id="q1" />\n',
  'pds/resumos/materia/01-base.mdx': '---\ntitle: Base\ntopic: Base\nchapter: 1\ntags: [p1]\n---\nTexto\n',
  'pds/questoes/q1.mdx':
    '---\nid: q1\ntitle: Questão 1\nexam: P1\nyear: 2024\ntopic: Intro\ntags: [p1]\nstatement: "Calcule $x$"\n---\n<Theory>T</Theory>\n<Resolution>R</Resolution>\n',
  'pds/questoes/fig.png': 'PNG',
};
