# ai-study

An AI-assisted study system. You give the AI your course material (lecture slides, textbooks,
past exams) and it generates the study content from it, using the agent skills in
`.agents/skills/`. The generated content is then read in a comfortable, practical web interface
that you can host on your own server, with math, code and diagrams rendered.

Each course has two kinds of content: theory notebooks, organized by exam (`p1`, `teste-1`, ...),
and solved exam questions, with the theory you need kept apart from the solution.

It runs on a small VPS and serves a few users, each with a private archive. The admin can share
courses between users.

## What's in it

- **Reading:** paper, dark and OLED themes. You can adjust font, size, column width, alignment
  and code theme. Math is rendered with KaTeX, code with Shiki, and diagrams with Mermaid and
  `<BlockDiagram />`. Figures open in a zoomable viewer.
- **Questions:** the statement and figure stay fixed on one side. On the other, "Theory" (no
  spoilers) and "Resolution" open separately. A question bank can be filtered by exam tag.
- **Accounts:** `admin` and `normal` roles, per-user archives in `data/archives/<userId>/`,
  per-course sharing, an audit log, and rate-limited login.
- **Archives:** upload and download courses as ZIP from the account page. A course can also be
  exported to a single HTML file that works offline. `scripts/sync_archive.py` syncs a local
  `archive/` folder with the server.

## How it's built

| Part | Stack |
| :--- | :--- |
| `apps/web` | React 19 SPA, react-router, TanStack Query, Tailwind CSS v4, Vite |
| `apps/server` | Hono on Node.js 24, SQLite (`better-sqlite3`, WAL) with Drizzle, bundled with esbuild |
| `packages/content` | MDX subset → HTML: marked, KaTeX, Shiki, DOMPurify; also validates the archive |
| Tooling | npm workspaces, TypeScript (strict), Biome, Vitest, Playwright |

The VPS is small, so the browser does the heavy work. Chapters are rendered in a Web Worker and
cached in IndexedDB. The server only handles auth, files and the database, and Caddy serves the
built SPA. Releases are built on your machine, never on the server.

## Running locally

Requires Node.js 24+ (see `.nvmrc`) and, for the scripts and skills, Python 3.10+.

```bash
cp .env.example .env      # set ADMIN_USERNAME / ADMIN_PASSWORD; paths are relative to the repo root
npm install
npm run dev               # API on :3000, web app on http://localhost:5173
```

If the database has no admin, one is created on start from `.env`. Outside production, the local `archive/`
folder (where the skills write) shows up in the admin account. Set `ENABLE_LOCAL_ARCHIVE=false`
to see `data/archives/1` instead.

```bash
npm run check             # typecheck, lint, unit and integration tests
npm run validate:archive  # check the frontmatter of every document in archive/
npm run build             # apps/web/dist and apps/server/dist/server.mjs
npm run test:e2e          # Playwright; setup in tests/parity/README.md
```

## Writing content

The skills live in `.agents/skills/` and work with any agent that reads `AGENTS.md` and that folder.
For Claude Code, `CLAUDE.md` and `.claude/skills` are symlinks to them, so each skill is also a slash
command (`/<skill> <args>`). Edit only `AGENTS.md` and `.agents/`.

| Skill | Usage | Output |
| :--- | :--- | :--- |
| `question-study-generator` | `/question-study-generator <tag>` | Theory notebook for an exam, linked to its questions (`archive/<course>/resumos/`) |
| `summary-study-generator` | `/summary-study-generator <tag>` | Lecture summary from slides or a textbook (`type: "materia"`) |
| `explain-question` | `/explain-question <pdf> --tag <tag>` | One question per file, with cropped figures (`archive/<course>/questoes/`) |
| `block-diagram-generator` | `/block-diagram-generator <preset>` | `<BlockDiagram />` for control loops, filter structures and state space |

`archive/` is gitignored: course material stays out of this repository.

## Syncing with the server

```bash
python3 scripts/sync_archive.py --dry-run   # show what differs
python3 scripts/sync_archive.py --push      # upload local changes
python3 scripts/sync_archive.py --pull      # download server changes
```

It compares SHA-256 hashes. When a file differs on both sides, the newer one wins. Credentials come from `.env`
(`SYNC_SITE_URL`, `SYNC_USERNAME`, `SYNC_PASSWORD`; `SYNC_INSECURE=true` for a self-signed
certificate).

## Deploying

```bash
scripts/deploy.sh <user>@<server>
```

This builds a release locally, uploads it to `/opt/study-site/releases/<id>/` and activates it.
Activation backs up the database, points the `app` symlink at the new release, restarts the
service and checks its health. If the new release doesn't come up, it rolls back. A new server is
prepared from your machine with `scripts/setup-vps.sh <user>@<server>`, configured by the
untracked `scripts/setup-vps.conf`. Configuration, retention and rollback are covered in [`docs/deploy.md`](docs/deploy.md).

## License

[MIT](LICENSE). The repository has only the code. Course material, notes and exams are not
included.
