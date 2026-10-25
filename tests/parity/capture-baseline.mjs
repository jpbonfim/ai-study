#!/usr/bin/env node
/**
 * Captures the reference output of the CURRENT site (main worktree) running against the parity
 * fixture: rendered chapter HTML, full question pages, subject pages and API responses.
 * The result is written to .parity/baseline/ (gitignored: it contains private archive content).
 *
 * Usage: OLD_SITE_URL=http://127.0.0.1:4100 node tests/parity/capture-baseline.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../.parity/baseline');
const baseUrl = process.env.OLD_SITE_URL || 'http://127.0.0.1:4100';

const ACCOUNTS = [
  { username: 'admin', password: 'admin-parity' },
  { username: 'colega', password: 'colega-parity' },
];

async function login({ username, password }) {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username} failed: ${res.status}`);
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('no session cookie');
  return cookie;
}

function writeFile(relPath, content) {
  const full = path.join(outDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

async function get(cookie, url) {
  const res = await fetch(`${baseUrl}${url}`, { headers: { cookie }, redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location'), body: await res.text() };
}

function extractAll(html, regex) {
  return [...html.matchAll(regex)].map((m) => m[1]);
}

async function captureAccount(account) {
  const cookie = await login(account);
  const accountDir = account.username;
  const home = await get(cookie, '/');
  writeFile(`${accountDir}/pages/home.html`, home.body);

  const subjects = [...home.body.matchAll(/href="([^"]+)"\s+data-materia-slug="([^"]+)"/g)].map((m) => ({
    href: m[1].replaceAll('&amp;', '&'),
    slug: m[2],
  }));

  const manifest = { account: account.username, subjects: [] };

  for (const subject of subjects) {
    if (subject.href === '#') continue;
    const owner = new URL(subject.href, baseUrl).searchParams.get('owner');
    const ownerQuery = owner ? `&owner=${owner}` : '';
    const subjectDir = `${accountDir}/subjects/${subject.slug}${owner ? `@${owner}` : ''}`;

    const page = await get(cookie, subject.href);
    writeFile(`${subjectDir}/index.html`, page.body);

    const meta = await get(cookie, `/api/chapters?materia=${subject.slug}&metadata_only=1${ownerQuery}`);
    writeFile(`${subjectDir}/api/chapters-metadata.json`, meta.body);
    const chapters = JSON.parse(meta.body).chapters || [];

    for (const chapter of chapters) {
      const res = await get(
        cookie,
        `/api/chapters?materia=${subject.slug}&chapter_id=${encodeURIComponent(chapter.id)}${ownerQuery}`,
      );
      writeFile(`${subjectDir}/chapters/${chapter.type}/${chapter.id}.json`, res.body);
    }

    const tags = [...new Set(chapters.flatMap((c) => c.tags || []))];
    for (const tag of tags) {
      const tagged = await get(cookie, `/${subject.slug}?tag=${encodeURIComponent(tag)}${ownerQuery}`);
      writeFile(`${subjectDir}/tag-pages/${tag}.html`, tagged.body);
      for (const type of ['materia', 'questoes']) {
        const progressive = await get(
          cookie,
          `/api/chapters?mode=progressive&materia=${subject.slug}&tag=${encodeURIComponent(tag)}&type=${type}${ownerQuery}`,
        );
        writeFile(`${subjectDir}/api/progressive-${tag}-${type}.json`, progressive.body);
      }
    }

    const bank = await get(cookie, `/${subject.slug}/questoes${owner ? `?owner=${owner}` : ''}`);
    writeFile(`${subjectDir}/questoes.html`, bank.body);
    const questionIds = [...new Set(extractAll(bank.body, /data-question-id="([^"]+)"/g))];
    for (const qid of questionIds) {
      const q = await get(cookie, `/${subject.slug}/questoes/${qid}${owner ? `?owner=${owner}` : ''}`);
      writeFile(`${subjectDir}/questoes/${qid}.html`, q.body);
    }

    manifest.subjects.push({ ...subject, owner, chapters: chapters.length, questions: questionIds.length });
  }

  for (const route of ['/conta', '/configuracoes', '/admin', '/api/sync/status']) {
    const res = await get(cookie, route);
    writeFile(
      `${accountDir}/pages${route.replaceAll('/', '_')}.${route.startsWith('/api') ? 'json' : 'html'}`,
      `${res.status}\n${res.location || ''}\n${res.body}`,
    );
  }
  if (account.username === 'admin') {
    for (const route of ['/admin/api/users', '/admin/api/permissions', '/admin/api/logs?limit=5']) {
      const res = await get(cookie, route);
      writeFile(`${accountDir}/api${route.replaceAll('/', '_').replace('?', '_')}.json`, res.body);
    }
  }

  writeFile(`${accountDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  return manifest;
}

fs.rmSync(outDir, { recursive: true, force: true });
for (const account of ACCOUNTS) {
  const manifest = await captureAccount(account);
  const totals = manifest.subjects.reduce(
    (acc, s) => ({ chapters: acc.chapters + s.chapters, questions: acc.questions + s.questions }),
    { chapters: 0, questions: 0 },
  );
  console.log(
    `${account.username}: ${manifest.subjects.length} subjects, ${totals.chapters} chapters, ${totals.questions} questions`,
  );
}
