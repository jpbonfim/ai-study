import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import {
  ADMIN,
  buildZip,
  login,
  multipart,
  SUBJECT_FILES,
  startTestServer,
  type TestServer,
  writeArchive,
} from './helpers';

let server: TestServer;
let adminCookie: string;

beforeEach(async () => {
  server = await startTestServer();
  adminCookie = await login(server, ADMIN.username, ADMIN.password);
});
afterEach(() => server.close());

const json = (cookie: string, body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function createUser(username: string, role = 'normal') {
  const res = await server.request(
    '/admin/api/users',
    json(adminCookie, { username, displayName: username.toUpperCase(), password: 'secret1', role }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { user: { id: number } }).user.id;
}

function zipEntries(buffer: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const names: string[] = [];
      zip.on('entry', (e: yauzl.Entry) => {
        names.push(e.fileName);
        zip.readEntry();
      });
      zip.on('end', () => resolve(names.sort()));
      zip.readEntry();
    });
  });
}

describe('authentication', () => {
  it('rejects anonymous API calls with 401 and Basic challenge', async () => {
    const res = await server.request('/api/subjects');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Basic');
  });

  it("omits the Basic challenge for the web app's own calls (no native browser dialog)", async () => {
    for (const path of ['/api/session', '/admin/api/users']) {
      const res = await server.request(path, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBeNull();
    }
  });

  it('issues an httpOnly lax session cookie and reports the session', async () => {
    const res = await server.request('/api/login', json('', ADMIN));
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/session_id=.+HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const session = await (await server.request('/api/session', { headers: { cookie: adminCookie } })).json();
    expect(session).toMatchObject({ user: { username: 'admin', role: 'admin' }, uploadLimitMb: 100 });
  });

  it('accepts form-encoded logins, Basic and Bearer auth', async () => {
    const form = await server.request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(ADMIN),
    });
    expect(form.status).toBe(200);
    const basic = `Basic ${Buffer.from(`${ADMIN.username}:${ADMIN.password}`).toString('base64')}`;
    expect((await server.request('/api/sync/status', { headers: { authorization: basic } })).status).toBe(200);
    const token = adminCookie.split('=')[1];
    expect((await server.request('/api/session', { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
  });

  it('rate limits repeated failures', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await server.request('/api/login', json('', { username: 'admin', password: 'wrong' }));
      expect(res.status).toBe(401);
    }
    const blocked = await server.request('/api/login', json('', ADMIN));
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: string }).error).toMatch(/Tente novamente em \d+ segundos/);
  });

  it('logs out (JSON and redirect forms)', async () => {
    const res = await server.request('/api/logout', { headers: { cookie: adminCookie, accept: 'application/json' } });
    expect(await res.json()).toEqual({ success: true });
    expect((await server.request('/api/session', { headers: { cookie: adminCookie } })).status).toBe(401);
    const other = await login(server, ADMIN.username, ADMIN.password);
    const redirect = await server.request('/api/logout', { headers: { cookie: other } });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('/login');
  });

  it('records login activity', () => {
    const { logs } = server.services.activity.query({ limit: 10, offset: 0 });
    expect(logs.map((l) => l.action)).toContain('login');
  });

  it('records a page view at most once per session and path within 5 minutes', async () => {
    const cookie = await login(server, ADMIN.username, ADMIN.password);
    const view = (path: string) => server.request('/api/activity/page-view', json(cookie, { path }));
    expect((await view('/pds')).status).toBe(204);
    await view('/pds');
    await view('/conta');
    const { logs } = server.services.activity.query({ limit: 50, offset: 0 });
    const viewed = logs.filter((l) => l.action === 'page_view').map((l) => JSON.parse(l.details ?? '{}').path);
    expect(viewed.sort()).toEqual(['/conta', '/pds']);
  });
});

describe('admin', () => {
  it('forbids admin API for normal users', async () => {
    await createUser('aluno');
    const cookie = await login(server, 'aluno', 'secret1');
    expect((await server.request('/admin/api/users', { headers: { cookie } })).status).toBe(403);
  });

  it('validates new users with the same messages', async () => {
    const res = await server.request(
      '/admin/api/users',
      json(adminCookie, { username: 'ab', displayName: 'x', password: '123456' }),
    );
    expect(await res.json()).toEqual({ error: 'Nome de usuário deve ter pelo menos 3 caracteres.' });
    await createUser('aluno');
    const dup = await server.request(
      '/admin/api/users',
      json(adminCookie, { username: 'ALUNO', displayName: 'x', password: '123456' }),
    );
    expect(((await dup.json()) as { error: string }).error).toBe('O usuário "aluno" já está cadastrado.');
  });

  it('changes passwords and invalidates sessions', async () => {
    const id = await createUser('aluno');
    const cookie = await login(server, 'aluno', 'secret1');
    await server.request('/admin/api/users', json(adminCookie, { id, newPassword: 'novasenha' }, 'PUT'));
    expect((await server.request('/api/session', { headers: { cookie } })).status).toBe(401);
    await login(server, 'aluno', 'novasenha');
  });

  it('edits users and refuses deleting oneself', async () => {
    const id = await createUser('aluno');
    await server.request('/admin/api/users', json(adminCookie, { id, displayName: 'Novo Nome', role: 'admin' }, 'PUT'));
    const users = (
      (await (await server.request('/admin/api/users', { headers: { cookie: adminCookie } })).json()) as {
        users: { id: number; displayName: string; role: string }[];
      }
    ).users;
    expect(users.find((u) => u.id === id)).toMatchObject({ displayName: 'Novo Nome', role: 'admin' });
    const self = await server.request('/admin/api/users?id=1', { method: 'DELETE', headers: { cookie: adminCookie } });
    expect(self.status).toBe(400);
  });

  it('deletes users and their archive', async () => {
    const id = await createUser('aluno');
    writeArchive(server.dataDir, id, { 'x/materia.json': '{}' });
    await server.request(`/admin/api/users?id=${id}`, { method: 'DELETE', headers: { cookie: adminCookie } });
    expect(fs.existsSync(path.join(server.dataDir, 'archives', String(id)))).toBe(false);
  });

  it('paginates and filters logs', async () => {
    const res = await server.request('/admin/api/logs?action=login&limit=30', { headers: { cookie: adminCookie } });
    const data = (await res.json()) as { total: number; logs: { action: string; username: string }[] };
    expect(data.total).toBeGreaterThan(0);
    expect(data.logs.every((l) => l.action === 'login')).toBe(true);
  });
});

describe('subjects and sharing', () => {
  let colleagueId: number;
  let colleagueCookie: string;

  beforeEach(async () => {
    writeArchive(server.dataDir, 1, SUBJECT_FILES);
    colleagueId = await createUser('colega');
    colleagueCookie = await login(server, 'colega', 'secret1');
    writeArchive(server.dataDir, colleagueId, {
      'pds-b/materia.json': JSON.stringify({ slug: 'pds-b', name: 'PDS B', code: 'ptc3214' }),
      'pds-b/resumos/c.mdx': '---\ntitle: C\nchapter: 1\ntags: [p2]\n---\nC',
    });
  });

  it('lists own subjects with derived counters', async () => {
    const data = (await (await server.request('/api/subjects', { headers: { cookie: adminCookie } })).json()) as {
      own: { slug: string; chaptersCount: number; questionsCount: number; status: string }[];
    };
    expect(data.own).toEqual([
      expect.objectContaining({ slug: 'pds', chaptersCount: 2, questionsCount: 1, status: 'active' }),
    ]);
  });

  it("shares subjects and exposes other users' sources with the same code", async () => {
    await server.request(
      '/admin/api/permissions',
      json(adminCookie, { ownerUserId: colleagueId, grantedUserId: 1, subjectCode: 'PTC3214', materiaSlug: 'pds-b' }),
    );
    const shared = (await (await server.request('/api/subjects', { headers: { cookie: adminCookie } })).json()) as {
      shared: { slug: string; isShared: boolean; ownerDisplayName: string }[];
    };
    expect(shared.shared).toEqual([
      expect.objectContaining({ slug: 'pds-b', isShared: true, ownerDisplayName: 'COLEGA' }),
    ]);

    const notebook = (await (
      await server.request('/api/subjects/pds', { headers: { cookie: adminCookie } })
    ).json()) as {
      isOwnSubject: boolean;
      otherSources: { ownerUserId: number; chapters: unknown[] }[];
    };
    expect(notebook.isOwnSubject).toBe(true);
    expect(notebook.otherSources).toEqual([expect.objectContaining({ ownerUserId: colleagueId })]);
  });

  it('resolves subjects shared with the user without an explicit owner', async () => {
    await server.request(
      '/admin/api/permissions',
      json(adminCookie, { ownerUserId: 1, grantedUserId: colleagueId, subjectCode: 'PTC3214', materiaSlug: 'pds' }),
    );
    const notebook = (await (
      await server.request('/api/subjects/pds', { headers: { cookie: colleagueCookie } })
    ).json()) as {
      primaryOwnerId: number;
      isOwnSubject: boolean;
      chapters: unknown[];
    };
    expect(notebook).toMatchObject({ primaryOwnerId: 1, isOwnSubject: false });
    expect(notebook.chapters).toHaveLength(2);
  });

  it('protects documents and media by subject permission', async () => {
    const forbidden = await server.request('/api/documents/1/pds/chapters/cap-1', {
      headers: { cookie: colleagueCookie },
    });
    expect(forbidden.status).toBe(403);
    const media = await server.request('/api/media?user=1&materia=pds&path=fig.png', {
      headers: { cookie: colleagueCookie },
    });
    expect(media.status).toBe(403);
  });

  it('serves documents with ETags and 304 revalidation', async () => {
    const res = await server.request('/api/documents/1/pds/chapters/cap-1', { headers: { cookie: adminCookie } });
    const doc = (await res.json()) as { meta: { id: string; tags: string[] }; body: string; sha: string };
    expect(doc.meta).toMatchObject({ id: 'cap-1', tags: ['p1'] });
    expect(doc.body).toContain('# Olá');
    const again = await server.request('/api/documents/1/pds/chapters/cap-1', {
      headers: { cookie: adminCookie, 'if-none-match': `"${doc.sha}"` },
    });
    expect(again.status).toBe(304);
    const materia = await server.request('/api/documents/1/pds/chapters/materia-01-base', {
      headers: { cookie: adminCookie },
    });
    expect(materia.status).toBe(200);
  });

  it('finds media in subject folders and blocks traversal', async () => {
    const ok = await server.request('/api/media?user=1&materia=pds&path=fig.png', { headers: { cookie: adminCookie } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    const bad = await server.request('/api/media?user=1&materia=pds&path=../../../study.db', {
      headers: { cookie: adminCookie },
    });
    expect(bad.status).toBe(400);
  });
});

describe('upload and download', () => {
  it('replaces a single subject from a ZIP', async () => {
    writeArchive(server.dataDir, 1, SUBJECT_FILES);
    const zip = await buildZip({ 'pds/materia.json': '{"name":"Nova"}', 'pds/resumos/a.mdx': '# A' });
    const res = await server.request('/api/upload', {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: multipart({ type: 'materia', materia_slug: 'pds' }, { file: zip }),
    });
    expect(await res.json()).toEqual({ success: true, message: 'Matéria "pds" atualizada com sucesso (2 arquivos).' });
    expect(fs.readdirSync(path.join(server.dataDir, 'archives/1/pds/resumos'))).toEqual(['a.mdx']);
  });

  it('replaces the whole archive (single root folder normalized)', async () => {
    writeArchive(server.dataDir, 1, SUBJECT_FILES);
    const zip = await buildZip({ 'archive/novo/materia.json': '{}' });
    const res = await server.request('/api/upload', {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: multipart({ type: 'archive' }, { file: zip }),
    });
    expect(res.status).toBe(200);
    expect(fs.readdirSync(path.join(server.dataDir, 'archives/1'))).toEqual(['novo']);
  });

  it('rejects forbidden extensions and path traversal', async () => {
    const exe = await buildZip({ 'a/run.sh': 'x' });
    const res = await server.request('/api/upload', {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: multipart({}, { file: exe }),
    });
    expect(((await res.json()) as { error: string }).error).toContain('extensão não permitida');
  });

  it('enforces the per-role upload limit', async () => {
    await server.request(
      '/admin/api/users',
      json(adminCookie, { username: 'aluno', displayName: 'A', password: 'secret1' }),
    );
    const cookie = await login(server, 'aluno', 'secret1');
    const raw = Buffer.alloc(2 * 1024 * 1024, 1);
    const tooBig = await server.request('/api/upload', {
      method: 'POST',
      headers: { cookie },
      body: multipart({}, { file: raw }),
    });
    expect(tooBig.status).toBe(413);
  });

  it('downloads a subject and the whole archive as ZIP', async () => {
    writeArchive(server.dataDir, 1, SUBJECT_FILES);
    const subject = await server.request('/api/download?type=materia&materia=pds', {
      headers: { cookie: adminCookie },
    });
    expect(subject.headers.get('content-disposition')).toContain('pds-archive.zip');
    expect(await zipEntries(Buffer.from(await subject.arrayBuffer()))).toContain('pds/resumos/cap-1.mdx');
    const all = await server.request('/api/download?type=archive', { headers: { cookie: adminCookie } });
    expect(await zipEntries(Buffer.from(await all.arrayBuffer()))).toContain('archive/pds/materia.json');
  });
});

describe('sync protocol', () => {
  it('reports a manifest with hashes', async () => {
    writeArchive(server.dataDir, 1, SUBJECT_FILES);
    const data = (await (await server.request('/api/sync/status', { headers: { cookie: adminCookie } })).json()) as {
      manifest: { files: Record<string, { hash: string; size: number }> };
    };
    expect(data.manifest.files['pds/materia.json']?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pushes a bundle with deletions and pulls files back', async () => {
    writeArchive(server.dataDir, 1, SUBJECT_FILES);
    const bundle = await buildZip({ 'pds/resumos/novo.mdx': '# Novo' });
    const push = await server.request('/api/sync/push', {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: multipart({ deletions: JSON.stringify(['pds/questoes/q1.mdx']) }, { bundle }),
    });
    expect(await push.json()).toMatchObject({ success: true, updatedCount: 1, deletedCount: 1 });
    const pull = await server.request('/api/sync/pull', json(adminCookie, { files: ['pds/resumos/novo.mdx', '../x'] }));
    expect(await zipEntries(Buffer.from(await pull.arrayBuffer()))).toEqual(['pds/resumos/novo.mdx']);
  });

  it('rejects unsafe sync bundles', async () => {
    const bundle = await buildZip({ 'pds/x.exe': 'x' });
    const push = await server.request('/api/sync/push', {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: multipart({}, { bundle }),
    });
    expect(((await push.json()) as { error: string }).error).toContain('não permitido');
  });
});
