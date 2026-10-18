# Academic Study Platform and Digital Signal Processing Notebook

A production-ready, full-stack academic study and exam preparation platform developed with Astro (SSR Node.js), KaTeX, SQLite, and Tailwind CSS, orchestrated by Antigravity and Claude Code agentic skills.

The platform pairs rigorous theoretical course notes with step-by-step resolved university exam problems, featuring a textbook-inspired reading experience, responsive split-screen problem solving, tag-based syllabus filtering, multi-user isolation with granular cross-user permissions, ZIP upload/backup download, and automated deployment scripts for production VPS environments (with zero conflict for existing VPN services).

---

## 1. Overview

This repository provides an end-to-end, multi-user environment for university-level engineering courses, primarily configured for Digital Signal Processing (PDS - Processamento Digital de Sinais).

Key goals and capabilities of the project:
- **Rigorous Theoretical Notebooks**: Structured logically from first principles to exam-level problems, without skipping intermediate steps.
- **Active Learning Question Bank**: Students can inspect theoretical prerequisites without spoiler calculations, attempt problems independently, and reveal verified step-by-step derivations.
- **Multi-User Role-Based Access (RBAC)**: Secure multi-user environment with `admin` and `normal` roles, isolated study archives per user, and an audit activity log.
- **Granular Cross-User Material Sharing**: Administrators can grant per-course access from one user to another; shared courses seamlessly integrate into the recipient's home and sidebar with distinct visual badges and unified tag filters.
- **Archive Management & Backups**: In-browser ZIP archive upload (full archive or single-course) with Zip Slip protection and one-click ZIP backup downloads.
- **Publication-Grade Reading Experience**: Distraction-free reading across paper, dark, and OLED display modes with reader-customizable typography and split-screen sticky question solvers.
- **Autonomous Agentic Automation**: Automates syllabus generation, PDF exam extraction, figure cropping, and vector block diagram rendering via Antigravity and Claude Code skills.
- **Production-Ready VPS Deployment**: Fully automated server provisioning script (`scripts/setup-vps.sh`), Caddy reverse proxy with automatic self-signed or Let's Encrypt TLS, systemd service hardening, and full compatibility with existing server services (such as VPN tunnels and Docker).

---

## 2. Architecture and Core Mechanics

The platform runs as a modern Server-Side Rendered (SSR) Node.js web application coupled with an embedded SQLite database and dynamic MDX rendering.

```
┌─────────────────────────────────────────────────────────────┐
│                       Clients / Users                       │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS (Port 443)
┌──────────────────────────────▼──────────────────────────────┐
│                    Caddy Reverse Proxy                      │
│   (Automatic TLS: Let's Encrypt Domain or 'tls internal')    │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP (127.0.0.1:3000)
┌──────────────────────────────▼──────────────────────────────┐
│             Astro SSR Server (Node.js Adapter)              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────┐  │
│  │ Auth & Sessions  │  │  RBAC Middleware │  │ Activity  │  │
│  │ (scrypt + cookie)│  │ (Normal vs Admin)│  │   Logs    │  │
│  └──────────────────┘  └──────────────────┘  └───────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────┐  │
│  │ Multi-User Store │  │  Dynamic MDX +   │  │ ZIP Upload│  │
│  │ (data/archives/) │  │  KaTeX Runtime   │  │ & Download│  │
│  └──────────────────┘  └──────────────────┘  └───────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────┐             ┌───────────────────────┐
│   SQLite Database     │             │  User Study Archives  │
│   (data/study.db)     │             │  (data/archives/<id>) │
└───────────────────────┘             └───────────────────────┘
```

### 2.1 Technology Stack
- **Web Framework**: Astro 5 configured in Server-Side Rendering (`output: 'server'`) with the `@astrojs/node` standalone adapter.
- **Database**: SQLite 3 via `better-sqlite3` with Write-Ahead Logging (WAL) enabled, storing user accounts, active sessions, granular access permissions, and activity audit logs.
- **Authentication & Security**:
  - Secure, HTTP-only, SameSite session cookies with cryptographically random tokens (`crypto.randomBytes`).
  - Passwords hashed using Node's native `crypto.scrypt` with unique 16-byte random salts.
  - Rate limiting against brute-force login attempts (configurable window and max attempts).
  - Sanitized ZIP extraction preventing Path Traversal ("Zip Slip") attacks and enforcing file size / extension whitelists.
- **Dynamic Content & Math Rendering**:
  - Markdown / MDX parsed at runtime with `gray-matter`, `marked`, and `katex` (`site/src/lib/mdx-runtime.ts`).
  - Inline and block KaTeX rendering ($...$ and $$...$$) with horizontal scroll protection (`.katex-display`).
  - Automatic asset rewriting routing local `./image.png` references to authenticated media streaming endpoints (`/api/media/[...path]`).
- **Styling**: Tailwind CSS v4 with semantic CSS variables supporting Paper/Sepia, Dark Library, and OLED Black modes.
- **Reverse Proxy & TLS**: Caddy web server providing reverse proxying to `127.0.0.1:3000` with self-signed certificates (`tls internal` for raw IP access) or Let's Encrypt for domains.
- **Process Supervision**: hardened `systemd` service with automatic restarts and security sandboxing.

### 2.2 Content Storage Model
Each user has their own isolated content directory under `data/archives/<userId>/`:
- `data/archives/<userId>/<subject>/materia.json`: Course manifest defining course codes, institution, syllabus, and evaluation tags.
- `data/archives/<userId>/<subject>/resumos/*.mdx`: Theoretical chapters rendered in continuous reading sequence.
- `data/archives/<userId>/<subject>/questoes/*.mdx`: Solved exam questions (`multipla_escolha` or `discursiva`) with separate `<Theory>` and `<Resolution>` sections.
- `data/archives/<userId>/<subject>/questoes/*.png`: High-resolution figures and schematics cropped from primary source exam PDFs.

> **Note**: For local development or initial migrations, the repository's root `archive/` folder can be migrated directly into the primary admin user's directory (`data/archives/1/`) using `scripts/migrate-archive.sh`.

### 2.3 Role-Based Access Control (RBAC)
- **Normal User (`role: 'normal'`)**:
  - Access to their own study materials in `data/archives/<userId>/`.
  - Access to specific courses of other users that have been explicitly granted by an administrator.
  - Ability to upload new course materials via ZIP or download their own archive backup.
  - Reader typography customization and profile settings.
- **Administrator (`role: 'admin'`)**:
  - Everything a normal user can do.
  - Access to the Administration Panel (`/admin`).
  - User management: create, view, edit role, reset password, delete users.
  - Granular permission manager: grant or revoke access to any course from user A to user B.
  - Activity and audit log viewer: filter logs by user, action type, IP address, and date.

### 2.4 Cross-User Course Sharing & Unified Tag Selector
When an administrator grants user B access to user A's course (e.g. `pds`):
- The course immediately appears on user B's dashboard and sidebar.
- A visual indicator badge (`[Compartilhado: <dono>]`) clearly marks the course and its origin.
- The sidebar evaluation tag dropdown dynamically unifies tags from user B's own courses and the shared course, tagging shared evaluation filters accordingly.
- Media requests for diagrams and schematics within shared courses are securely authenticated and streamed via `/api/media`.

### 2.5 In-Browser ZIP Archive Upload & Backup Download
- **ZIP Upload (`/api/archive/upload`)**:
  - Users can upload a complete study archive or an individual course ZIP directly from the UI.
  - Validates ZIP archive structure (ensures `materia.json`, `resumos/`, or `questoes/` exist).
  - Protects against malicious ZIP archives (Zip Slip path traversal prevention).
  - Enforces strict file extension whitelists (`.json`, `.mdx`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`).
- **ZIP Download (`/api/archive/download`)**:
  - One-click backup of a specific course (`/api/archive/download?materia=pds`) or the entire user archive (`/api/archive/download?materia=_all`).
  - Generated on-the-fly using streaming `archiver`.

### 2.6 Standalone Offline Bundling
The platform includes an export generator (`site/src/pages/downloads/[materia].html.ts`) that compiles all chapters, solved exercises, KaTeX fonts, and theme scripts into a single self-contained HTML file. This file functions completely offline in any modern web browser without internet access or an active web server.

---

## 3. Project Structure

```
.
├── .agents/
│   └── skills/
│       ├── block-diagram-generator/    # Vector SVG and KaTeX block diagram generator
│       ├── explain-question/           # Problem extraction, cropping, and pedagogical solver
│       ├── question-study-generator/   # Syllabus orchestrator and theory notebook generator
│       └── summary-study-generator/    # Theory notebook generator from lecture slides/PDFs
├── archive/                            # Base/legacy course content (can be migrated to data/archives/1/)
│   └── pds/
│       ├── materia.json                # Course metadata manifest
│       ├── questoes/                   # Solved exam questions and cropped figures (MDX + PNG)
│       └── resumos/                    # Theoretical chapters in continuous reading flow (MDX)
├── data/                               # Persistent runtime storage (gitignored)
│   ├── study.db                        # SQLite database (users, sessions, permissions, audit logs)
│   └── archives/                       # Per-user study archives
│       ├── 1/                          # Admin (User 1) courses
│       │   └── pds/
│       └── 2/                          # Normal (User 2) courses
├── export/
│   └── processamento-digital-de-sinais/
│       └── main.html                   # Standalone single-file offline distribution
├── material/                           # Raw course materials (slides, exam PDFs, quizzes)
├── scripts/
│   ├── Caddyfile.example               # Production Caddy reverse proxy template (with internal TLS)
│   ├── deploy.sh                       # Production zero-downtime update script
│   ├── migrate-archive.sh              # Utility to import root archive/ into data/archives/1/
│   ├── setup-vps.sh                    # Automated VPS setup (Node 24, Caddy, UFW, VPN preservation)
│   └── study-site.service.example      # Systemd service unit definition
├── site/
│   ├── astro.config.mjs                # Astro configuration (Node SSR adapter, KaTeX, Tailwind)
│   ├── package.json                    # Dependencies and runtime scripts
│   └── src/
│       ├── components/                 # UI components (Header, Theme, Cards, Diagrams, Modal)
│       ├── layouts/                    # AcademicLayout, BaseLayout, AdminLayout
│       ├── lib/                        # Server-side business logic
│       │   ├── auth.ts                 # scrypt hashing, session cookies, rate limiting
│       │   ├── db.ts                   # SQLite schema, connection, and auto-migrations
│       │   ├── log.ts                  # Activity and audit logger
│       │   ├── mdx-runtime.ts          # Runtime MDX parser, KaTeX math compiler, media rewriter
│       │   ├── multiuser-archive.ts    # Multi-user filesystem reader and permission-aware course loader
│       │   └── zip-handler.ts          # Secure ZIP extraction (Zip Slip safe) and ZIP backup bundler
│       ├── middleware.ts               # Authentication, RBAC, and throttled page view logging
│       └── pages/
│           ├── admin/                  # Admin dashboard, user management, permissions, audit logs
│           ├── api/                    # REST APIs (auth, admin, archive upload/download, media)
│           ├── login.astro             # User login page
│           ├── index.astro             # Course catalog and user home
│           ├── configuracoes.astro     # Typography, theme, and archive upload/download settings
│           └── [materia]/              # Dynamic course reader and split-screen question views
├── .env.example                        # Environment variables template
└── README.md
```

---

## 4. Getting Started (Local Development)

### 4.1 Prerequisites
- **Node.js**: 20.0+ or 24 LTS
- **npm**: 9.0+
- **Python**: 3.10+ (required only if running the exam PDF extraction and cropping scripts)

### 4.2 Installation and Environment Setup
1. Clone the repository:
   ```bash
   git clone <repo-url> estudo-p1
   cd estudo-p1
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

   Generate a secure random session secret:
   ```bash
   openssl rand -hex 32
   ```
   Paste the generated value into `SESSION_SECRET` in `.env`. You can also configure initial administrator credentials:
   ```env
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=change_this_secure_password
   ADMIN_DISPLAY_NAME=Administrador
   HOST=0.0.0.0
   PORT=3000
   SESSION_SECRET=your_32_byte_hex_secret
   DATA_DIR=../data
   ```

3. Install dependencies in `site/`:
   ```bash
   cd site
   npm install
   ```

4. Populate initial course content:
   To import the existing `archive/` course files into the administrator's account (`data/archives/1/`):
   ```bash
   cd ..
   bash scripts/migrate-archive.sh
   ```

### 4.3 Running the Development Server
Start the local development server:
```bash
cd site
npm run dev
```
The server will start at `http://localhost:3000` (or the port defined in `.env`).
Open your browser at `http://localhost:3000/login` and log in with your configured administrator credentials.

### 4.4 Production Build Locally
To test the production build locally:
```bash
cd site
npm run build
npm run start
```

---

## 5. Deploying to a VPS (Ubuntu / Debian)

This platform is configured for self-hosting on any Ubuntu/Debian VPS. The deployment uses:
- **Node.js 24 LTS** running the standalone Astro SSR server on `127.0.0.1:3000`.
- **systemd** managing the service with automatic restarts and security sandboxing.
- **Caddy** acting as a high-performance reverse proxy with automatic TLS (self-signed `tls internal` for direct IP access or Let's Encrypt for a custom domain).
- **Firewall & VPN Coexistence**: The setup automatically preserves existing services running on the VPS, including packet forwarding and optional UDP ports for VPNs (such as WireGuard via `VPN_PORT`).

### 5.1 Step 1: Clone the Repository on the VPS
Connect to your VPS via SSH and clone the repository:
```bash
ssh user@vps-ip
git clone <repo-url> /var/www/estudo-p1
cd /var/www/estudo-p1
```

> **Tip (GitHub SSH Key)**: To clone privately without typing passwords:
> ```bash
> ssh-keygen -t ed25519 -C "vps-deploy"
> cat ~/.ssh/id_ed25519.pub
> ```
> Add the public key to your repository's **Settings > Deploy Keys** on GitHub.

### 5.2 Step 2: Configure Environment Variables
Create the production `.env` file:
```bash
cp .env.example .env
nano .env
```
Ensure you configure:
- `ADMIN_USERNAME` and a strong `ADMIN_PASSWORD`.
- `SESSION_SECRET`: generate with `openssl rand -hex 32`.
- `PORT=3000` and `HOST=127.0.0.1`.

### 5.3 Step 3: Run the Automated VPS Provisioning Script
Run the provided automated setup script as `root` (or with `sudo`):
```bash
sudo bash scripts/setup-vps.sh
```

What this script automatically does:
1. Installs system build dependencies (`build-essential`, `python3`, `curl`, `git`, `ufw`).
2. Installs Node.js 24.x LTS and npm.
3. Installs the official Caddy web server.
4. **Configures the UFW Firewall safely**:
   - Opens SSH (`22/tcp`), HTTP (`80/tcp`), and HTTPS (`443/tcp`).
   - Automatically preserves and permits existing UDP services (optionally opens custom ports via `VPN_PORT`).
   - Enables packet forwarding (`DEFAULT_FORWARD_POLICY="ACCEPT"` in `/etc/default/ufw` and `net.ipv4.ip_forward=1` in `/etc/sysctl.conf`), ensuring existing VPN tunnels and Docker bridge networks are not disrupted.
5. Installs npm packages in `site/` and builds the Astro application.
6. Populates initial course content via `migrate-archive.sh`.

### 5.4 Step 4: Configure the Caddy Reverse Proxy
Caddy automatically provides TLS encryption. Inspect `scripts/Caddyfile.example` and copy it to `/etc/caddy/Caddyfile`:

```bash
sudo cp scripts/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
```

#### Option A: Direct IP Access (No Domain Required)
If you are accessing the server directly through its IP address (e.g., `123.45.67.89`), use Caddy's internal certificate authority (`tls internal`):
```caddy
https://123.45.67.89 {
    tls internal

    reverse_proxy 127.0.0.1:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Referrer-Policy strict-origin-when-cross-origin
    }
}

http://123.45.67.89 {
    redir https://{host}{uri} permanent
}
```

#### Option B: Custom Domain (Automatic Let's Encrypt)
If you have a domain pointing to your VPS IP (e.g. `estudos.seudominio.com`):
```caddy
estudos.seudominio.com {
    reverse_proxy 127.0.0.1:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

Restart Caddy:
```bash
sudo systemctl reload caddy
```

### 5.5 Step 5: Configure and Start the systemd Service
Copy the systemd service template to the systemd directory:
```bash
sudo cp scripts/study-site.service.example /etc/systemd/system/study-site.service
sudo nano /etc/systemd/system/study-site.service
```
Ensure the `WorkingDirectory`, `ExecStart`, and `User` match your VPS paths. Then enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable study-site
sudo systemctl start study-site
sudo systemctl status study-site
```

### 5.6 Step 6: Ongoing Deployments and Zero-Downtime Updates
Whenever you push new commits to your repository, simply update the VPS using the deployment script:
```bash
bash scripts/deploy.sh
```
This script pulls the latest code from Git, runs `npm install`, compiles the production bundle with `npm run build`, and reloads the systemd service with zero manual intervention.

---

## 6. Using the Platform

### 6.1 Authentication and Roles
- **Login (`/login`)**: Direct authentication with username and password. Supports "remember me" session cookies.
- **Admin Dashboard (`/admin`)**:
  - Overview statistics: Total registered users, total courses, active sessions, and recent logs.
  - **User Management (`/admin/users`)**: Create new users, toggle admin privileges, reset user passwords, or delete accounts.
  - **Permissions Manager (`/admin/permissions`)**: Assign read access for specific courses from one user to another with real-time feedback.
  - **Audit Logs (`/admin/logs`)**: Filterable table tracking logins, failed attempts, archive uploads, permission changes, and user updates.

### 6.2 Archive Management (Upload & Download)
Navigate to the Settings page (`/configuracoes`) or use the UI shortcuts:
- **Uploading an Archive**: Upload a `.zip` file containing your course structure (`<subject>/materia.json`, `resumos/`, `questoes/`). The system verifies archive integrity and extracts files into your isolated directory (`data/archives/<userId>/<subject>/`).
- **Downloading a Backup**: Export individual courses or your entire multi-course archive as a ZIP file at any time.

### 6.3 Reader Modes, Themes, and Typography
- **Theme Palettes**: Switch between Paper / Sepia (`#fbf8f2`), Dark Library (`#151619`), and OLED Black (`#000000`).
- **Reader Settings (`/configuracoes`)**: Adjust font family (Newsreader/Garamond, Lora/Charter, Inter, JetBrains Mono), font size (16px to 22px), and content reading width (672px to 1088px). Preferences persist automatically in `localStorage`.

### 6.4 Solved Question Workspace (`/[materia]/questoes/[slug]`)
- **Sticky Split-Screen (Desktop)**: The question prompt and diagram remain pinned on the left, while theoretical prerequisite explanations and step-by-step solutions scroll independently on the right.
- **Dual Toggles**:
  - `[ § ] Explicação Teórica Necessária`: Theory and theorem review without spoilers.
  - `[ ¶ ] Resolução Passo a Passo`: Step-by-step derivations and highlighted answer key.
- **Diagram Viewer**: Click any diagram to open a full-screen interactive modal with pan and zoom.

---

## 7. Using the Agentic Skills

The repository includes specialized skills under `.agents/skills/` designed for the Antigravity agentic assistant and Claude Code:

### 7.1 `question-study-generator`
Orchestrates high-level syllabus structuring, continuous theoretical notebooks, and concurrent exam resolution across subagents.
- Generates chapters under the "Estudo por questões" tab in the sidebar.
- Enforces the Golden Writing Guideline (self-contained, practical formulas, prerequisite ordering, zero filler).
- Links `relatedQuestions` and embeds `<QuestionCard />` components.

### 7.2 `summary-study-generator`
Generates comprehensive theoretical summaries directly from course materials (lecture slides, lecture notes, textbook chapters, and syllabi) without linking question cards.
- Chapters appear under the "Resumo da matéria" tab in the sidebar.
- Uses `.agents/skills/summary-study-generator/scripts/extract_material_images.py` to extract only essential schematics and curves.

### 7.3 `explain-question`
Handles per-problem extraction from exam PDFs, diagram cropping, and dual-section (`<Theory>` and `<Resolution>`) authoring.
- CLI Utility: `.agents/skills/explain-question/scripts/extract_question.py`.
- Preserves upper mathematical definitions and enforces at least 25px vertical safety padding.

### 7.4 `block-diagram-generator`
Generates clean vector SVG block diagrams with KaTeX labels for signals and systems, feedback control, and digital filter structures.
- Presets: `feedback`, `cascade`, `parallel`, `direct-form-1`, `direct-form-2`, `fir`, `state-space`, and `custom`.

---

## 8. Using the Skills with Claude Code

The agentic skills in `.agents/skills/` are fully interoperable with Anthropic's Claude Code CLI.

### 8.1 Slash Commands (`.claude/commands/`)
- `/explain-question <pdf-path> --tag <tag>`: Scaffolds and solves exam questions with diagram cropping.
- `/study-generator <tag>`: Drafts continuous theoretical study notebooks linked to solved questions.
- `/summary-study-generator <tag>`: Generates lecture notes summaries from slides/PDFs.
- `/block-diagram <preset>`: Configures and inserts vector KaTeX block diagrams.

### 8.2 Natural Language Prompting
You can prompt Claude Code directly:
> "Read `.agents/skills/explain-question/SKILL.md` and solve all questions from `material/testes/teste-2-2023.pdf` for the tag `teste-2`."

Claude Code will consult `CLAUDE.md`, read the skill specification, execute `extract_question.py`, generate MDX solutions, and clean up temporary assets.

---

## 9. Development and Workspace Hygiene

All contributors and autonomous agents must adhere to the rules defined in `AGENTS.md`:
1. **No Loose Files in Root**: Never create temporary scripts (`.py`, `.sh`), intermediate dumps (`.json`), or scratch images in the workspace root.
2. **Mandatory Cleanup**: Any temporary debug file or script created during a session must be removed before ending the turn.
3. **Official Script Locations**: Use `.agents/skills/explain-question/scripts/extract_question.py` for extraction and cropping workflows.
4. **Process Termination**: Never leave background servers, watch tasks, or orphaned processes running at the end of an execution turn.

---

## 10. License

Educational material and codebase developed for university engineering studies. All rights reserved to original exam and course authors.
