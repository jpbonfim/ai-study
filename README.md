# Academic Study Platform

A modern, full-stack academic study platform and active-learning question solver for engineering disciplines, built with **React + Vite** (SPA), a **Hono** API on Node.js, **KaTeX**, **SQLite (WAL)**, and **Tailwind CSS v4**, orchestrated by autonomous agentic skills.

The platform pairs rigorous, sequential theoretical notebooks with step-by-step resolved university exam problems, featuring textbook-inspired typography, split-screen question solving, granular role-based multi-user isolation, bidirectional CLI archive synchronization, and production-ready VPS deployment scripts.

---

## 1. Key Features

### Reading & Mathematical Typography
- **Three Publication Themes**: Paper/Sepia, Dark Library, and OLED Pure Black with persistent local preferences and custom SVG icons.
- **Advanced KaTeX Rendering**: Fast inline/display math with horizontal overflow protection, font-size limits, and dynamic scaling.
- **Equation Grouping**: Automatically merges consecutive LaTeX equation blocks into clean visual cards.
- **Multi-Theme Shiki Code Blocks**: Switch syntax highlighting across Catppuccin Mocha, Tokyo Night, Dracula, One Dark Pro, and Monokai.
- **Interactive Diagram Viewer**: Click-to-zoom modal with pan/zoom support for schematics, curves, and Mermaid diagrams.
- **Reading Comfort Controls**: Customize font family (Newsreader, Lora, Inter, JetBrains Mono), font size (16–22px), and reading column width (672–1088px).

### Active Learning & Question Solver
- **Split-Screen Workspace**: Question prompts and figures stay sticky on the left, while independent theory prerequisites and solutions scroll on the right.
- **Dual Accordion Toggles**:
  - `[ § ] Theoretical Review`: Explains the underlying principles and prerequisite formulas without problem spoilers.
  - `[ ¶ ] Step-by-Step Resolution`: Verified algebraic derivation and highlighted answer key.
- **Sequential Question Cards**: Compact question previews grouped by evaluation tag with collapsible card flows.
- **Evaluation Tag Filtering**: Instant filtering by exam or assignment tag (e.g., `p1`, `teste-1`, `final`).

### Multi-User Isolation & Security
- **Role-Based Access Control (RBAC)**: `admin` and `normal` roles with protected routes and middleware.
- **Isolated User Archives**: Each user's study materials reside in isolated directories (`data/archives/<userId>/`).
- **Granular Course Sharing**: Administrators can grant per-course access across users; shared courses display distinct badges and merge into the unified tag filter.
- **Secure Authentication**: Salted password hashing with `bcryptjs`, secure HTTP-only session cookies with expiration tracking, and rate limiting on `/api/login`.
- **Audit & Activity Logs**: Filterable administrative event tracking (logins, failed attempts, uploads, downloads, and permission changes).

### Archive Management, Sync CLI & Offline Export
- **Bidirectional Sync CLI (`scripts/sync_archive.py`)**: Incremental SHA-256 diff synchronization between local workstation and remote VPS via HTTP/REST. Supports push, pull, dry-run, and automatic conflict detection.
- **In-Browser ZIP Import/Export**: Upload single courses or full archives with Zip Slip protection; download on-the-fly streaming ZIP backups.
- **Standalone Offline Bundling**: Generates self-contained, single-file HTML exports (`downloads/[materia].html`) with embedded math, fonts, and scripts for completely offline studying.
- **Client-Side Rendering & Caching**: Chapters are rendered in the browser (Web Worker) and cached in IndexedDB with TTL/LRU limits, keeping the server light; one-click cache invalidation.

### Autonomous Agentic Skills
- Built-in skills under `.agents/skills/` compatible with **Antigravity** and **Claude Code**:
  - `question-study-generator`: Orchestrates syllabus structure, continuous theory notebooks, and subagent problem solving.
  - `summary-study-generator`: Drafts comprehensive lecture summaries directly from slides and textbooks with selective diagram extraction.
  - `explain-question`: Extracts exam PDF problems, auto-crops figures with margin protection, and structures dual `<Theory>` and `<Resolution>` MDX.
  - `block-diagram-generator`: Generates vector KaTeX block diagrams for feedback control, IIR/FIR filter structures, and state-space models.

---

## 2. Tech Stack & Architecture

| Layer | Technology |
| :--- | :--- |
| **Web app** | React 19 SPA (`apps/web`), react-router 7, TanStack Query, Vite |
| **API server** | Hono on Node.js 24 (`apps/server`), Drizzle ORM, bundled with esbuild |
| **Content pipeline** | `packages/content`: marked, KaTeX, Shiki (multi-theme), DOMPurify — shared by browser (Web Worker) and Node (tests/CLI) |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite`), `@tailwindcss/typography` |
| **Database** | SQLite 3 (`better-sqlite3`) with Write-Ahead Logging (WAL) and versioned migrations |
| **Diagrams** | Mermaid.js and KaTeX block diagrams |
| **Security** | `bcryptjs`, HTTP-only session cookies, Zip Slip / zip-bomb limits, brute-force rate limiter, sanitized HTML |
| **Sync Utility** | Python 3 CLI (`urllib`, `hashlib`, `zipfile`) with HTTP Basic and session auth |
| **Production Server** | Caddy (static SPA, API reverse proxy, automatic/internal TLS), systemd process supervision |
| **Tooling** | npm workspaces, TypeScript strict, Biome, Vitest, Playwright |

The heavy lifting (markdown/math/code rendering) happens in the browser so the VPS only serves
JSON, documents and media. Releases are built on your machine; the server only runs them.

---

## 3. Repository & Archive Structure

```
.
├── .agents/skills/              # Specialized Antigravity and Claude Code agentic skills
├── apps/
│   ├── server/                  # Hono API (auth, archives, sync, admin, logs) — bundled to dist/server.mjs
│   └── web/                     # React SPA (pages, enhancers, render worker, styles)
├── packages/
│   └── content/                 # Document model, markdown/math/code rendering, sanitizer, archive validator
├── archive/                     # Local study archive directory (unversioned, sync target)
│   └── <subject>/
│       ├── materia.json         # Subject metadata, syllabus, and evaluation tags
│       ├── resumos/*.mdx        # Continuous reading theoretical chapters
│       └── questoes/            # Solved problems (*.mdx) and cropped figures (*.png)
├── data/                        # Persistent production storage (gitignored)
│   ├── study.db                 # SQLite database (users, sessions, permissions, logs)
│   └── archives/<userId>/       # Per-user isolated study archives
├── docs/                        # Rewrite plan, feature inventory, deploy runbook
├── scripts/
│   ├── build-release.mjs        # Builds a self-contained release in release/<id>/
│   ├── deploy.sh                # Builds locally, uploads and activates a release on the VPS
│   ├── activate-release.sh      # Runs on the VPS: backup, install, switch, health check, rollback
│   ├── Caddyfile.example        # Caddy template (static SPA + API proxy, TLS)
│   ├── study-site.service       # systemd unit (installed by each release)
│   ├── setup-vps.sh             # Automated Ubuntu server provisioning script
│   ├── migrate-archive.sh       # Imports root archive/ into admin data/archives/1/
│   └── sync_archive.py          # Bidirectional CLI synchronization tool
├── tests/
│   ├── e2e/                     # Playwright specs (run against old and new site)
│   └── parity/                  # Fixture, baseline capture and comparison tools
└── .env.example                 # Environment variables template
```

---

## 4. Getting Started (Local Development)

### 4.1 Prerequisites
- **Node.js**: 24+ (see `.nvmrc`)
- **npm**: 11+
- **Python**: 3.10+ (for PDF question extraction and the sync tool)

### 4.2 Setup & Run
1. **Clone the repository**:
   ```bash
   git clone https://github.com/jpbonfim/ai-study.git
   cd ai-study
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Set your initial admin credentials (relative paths start at the repository root):
   ```env
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=change_this_secure_password
   PORT=3000
   DATA_DIR=./data
   ```

3. **Install dependencies** (npm workspaces, from the repository root):
   ```bash
   npm install
   ```

4. **Start the development servers** (API on `:3000`, web app with hot reload on `:5173`):
   ```bash
   npm run dev
   ```
   Visit `http://localhost:5173/login` and authenticate with your admin credentials.
   Outside production, the local `archive/` (where the skills write) is shown in the admin's
   account automatically; set `ENABLE_LOCAL_ARCHIVE=false` to see `data/archives/1` instead.

### 4.3 Checks
```bash
npm run check              # typecheck + lint (Biome) + unit/integration tests (Vitest)
npm run validate:archive   # validates the frontmatter of every document in archive/
npm run build              # production build (apps/web/dist + apps/server/dist/server.mjs)
npm start                  # runs the built server (set WEB_DIST_DIR=apps/web/dist to serve the SPA too)
```
End-to-end and parity tests compare this version with the previous (Astro) one; see
[`tests/parity/README.md`](tests/parity/README.md).

---

## 5. Bidirectional CLI Sync (`scripts/sync_archive.py`)

Keep your local `archive/` folder synchronized with a remote VPS instance over the REST API without copying database files or manual FTP:

```bash
# Preview differences without making changes
python3 scripts/sync_archive.py --dry-run

# Push local changes to the remote server
python3 scripts/sync_archive.py --push

# Pull server updates down to your workstation
python3 scripts/sync_archive.py --pull

# Self-signed certificates (skip SSL verification)
python3 scripts/sync_archive.py --insecure
```

You can pre-configure credentials in your local `.env`:
```env
SYNC_SITE_URL=https://your-server-ip-or-domain
SYNC_USERNAME=admin
SYNC_PASSWORD=your_password
SYNC_INSECURE=true  # Set true if using self-signed internal TLS
```

---

## 6. Production Deployment (VPS)

The full runbook (first install, migration from the Astro version, backups and rollback) is in
[`docs/deploy.md`](docs/deploy.md).

### 6.1 Automated Server Provisioning
The included [`scripts/setup-vps.sh`](scripts/setup-vps.sh) prepares a clean Ubuntu 22/24 LTS server:
- Installs Node.js 24 LTS, npm, git, rsync, and Caddy.
- Creates a dedicated unprivileged `study` system user and `/opt/study-site/{data,releases,backups}`.
- Safely configures UFW firewall (22/SSH, 80/HTTP, 443/HTTPS) with IP forwarding enabled for Docker or existing VPN tunnels.
- Supports optional custom VPN UDP ports via `VPN_PORT` (e.g. `VPN_PORT=51820 sudo -E bash scripts/setup-vps.sh`).

```bash
sudo bash scripts/setup-vps.sh
```

### 6.2 Caddy (static SPA + API proxy, TLS)
Copy [`scripts/Caddyfile.example`](scripts/Caddyfile.example) to `/etc/caddy/Caddyfile`. Caddy
serves the SPA from the active release (`/opt/study-site/app/web`) and proxies `/api/*` and
`/admin/api/*` to `127.0.0.1:3000`. Replace `:443` with your domain to get a Let's Encrypt
certificate instead of the internal one. Then `sudo systemctl reload caddy`.

### 6.3 Deploying a Release
From your machine (the build never runs on the VPS):
```bash
scripts/deploy.sh <user>@<server>
```
It builds `release/<id>/`, uploads it to `/opt/study-site/releases/<id>/` and runs its
`activate.sh` there: installs the 6 runtime packages, backs up `data/study.db`, installs the
systemd unit, switches the `app` symlink, restarts and health-checks — rolling back
automatically if the new release does not come up.

---

## 7. Agentic Skills & Claude Code Integration

Skills located in `.agents/skills/` empower Antigravity and Claude Code to author academic content autonomously:

| Skill | Role | Key Output / Utility |
| :--- | :--- | :--- |
| `question-study-generator` | High-level syllabus & theory orchestrator | Continuous reading chapters under `archive/<subject>/resumos/` |
| `summary-study-generator` | Slide & textbook chapter summarizer | Theory notes under `archive/<subject>/resumos/materia/` |
| `explain-question` | PDF question extraction & solver | Dual `<Theory>` and `<Resolution>` MDX with cropped figures |
| `block-diagram-generator` | Vector control & filter schematics | `<BlockDiagram preset="..." />` components in MDX |

### Claude Code Slash Commands (`.claude/commands/`)
- `/explain-question <pdf-path> --tag <tag>`: Scans PDF, crops diagrams, and drafts solved MDX problem.
- `/study-generator <tag>`: Generates complete theoretical chapter linked to solved questions.
- `/summary-study-generator <tag>`: Summarizes lecture notes directly from slides/handouts.
- `/block-diagram <preset>`: Configures vector KaTeX block diagram components.

---

## 8. License

This project is open-source software provided under the [MIT License](LICENSE).

This repository contains exclusively the web platform source code, UI components, server utilities, and agentic workflows. It does not contain proprietary course materials, exam sheets, or copyrighted textbooks; all study notebooks, question banks, and course assets are created and maintained independently by users outside version control.
