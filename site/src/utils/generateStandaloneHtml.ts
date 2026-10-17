import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export function generateStandaloneHtml(materiaSlug: string = 'pds', customMateriaName?: string): string {
  const rootDir = process.cwd();
  // rootDir might be /home/joao/.../estudo-p1/site or /home/joao/.../estudo-p1
  const projectRoot = rootDir.endsWith('site') ? path.dirname(rootDir) : rootDir;
  
  const archiveMateriaDir = path.join(projectRoot, 'archive', materiaSlug);
  const resumosDir = path.join(archiveMateriaDir, 'resumos');
  const questoesDir = path.join(archiveMateriaDir, 'questoes');

  let materiaName = customMateriaName;
  if (!materiaName) {
    const materiaJsonPath = path.join(archiveMateriaDir, 'materia.json');
    if (fs.existsSync(materiaJsonPath)) {
      try {
        const mat = JSON.parse(fs.readFileSync(materiaJsonPath, 'utf-8'));
        materiaName = mat.name;
      } catch (e) {}
    }
  }
  materiaName = materiaName || 'Processamento Digital de Sinais';

  // Encode images to base64
  const encodedImages: Record<string, string> = {};
  if (fs.existsSync(questoesDir)) {
    const files = fs.readdirSync(questoesDir);
    for (const f of files) {
      const ext = path.extname(f).toLowerCase().replace('.', '');
      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
        const filePath = path.join(questoesDir, f);
        try {
          const buffer = fs.readFileSync(filePath);
          const b64 = buffer.toString('base64');
          const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          encodedImages[`./${f}`] = `data:${mime};base64,${b64}`;
          encodedImages[f] = `data:${mime};base64,${b64}`;
        } catch (e) {
          console.error(`Erro ao codificar imagem ${f}:`, e);
        }
      }
    }
  }

  function parseMdx(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parts = content.split('---');
    if (parts.length >= 3) {
      try {
        const frontmatter = (yaml.load(parts[1]) as Record<string, any>) || {};
        const body = parts.slice(2).join('---').trim();
        return { frontmatter, body };
      } catch (e) {
        return { frontmatter: {}, body: content };
      }
    }
    return { frontmatter: {}, body: content };
  }

  function getFilesRecursively(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    let results: string[] = [];
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of list) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results = results.concat(getFilesRecursively(fullPath));
      } else if (item.name.endsWith('.md') || item.name.endsWith('.mdx')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const db: { resumos: any[]; questoes: Record<string, any> } = {
    resumos: [],
    questoes: {},
  };

  if (fs.existsSync(resumosDir)) {
    const files = getFilesRecursively(resumosDir);
    for (const fullPath of files) {
      const { frontmatter, body } = parseMdx(fullPath);
      db.resumos.push({ frontmatter, body });
    }
  }

  if (fs.existsSync(questoesDir)) {
    const files = getFilesRecursively(questoesDir);
    for (const fullPath of files) {
      const { frontmatter, body } = parseMdx(fullPath);
      const qId = frontmatter.id || path.basename(fullPath).replace(/\.(md|mdx)$/, '');
      db.questoes[qId] = { frontmatter, body };
    }
  }

  const htmlTemplate = `<!DOCTYPE html>
<html lang="pt-BR" class="theme-paper">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${materiaName} - Caderno de Estudos Offline</title>
    <!-- Marked -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <!-- KaTeX -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"></script>
    
    <style>
        /* ============================================================
           1. MODO PAPEL / SÉPIA CLÁSSICO (Padrão)
           ============================================================ */
        :root, html.theme-paper {
            --bg-page: #fbf8f2;
            --bg-surface: #f4eee3;
            --bg-surface-hover: #ede4d5;
            --bg-subtle: #f8f3ea;
            --border-subtle: #e5dccf;
            --border-strong: #cfc2af;
            --text-primary: #24221f;
            --text-secondary: #5e5850;
            --text-muted: #877f74;
            --accent: #8b3a2b; /* Terracota acadêmica */
            --accent-subtle: #f6ebe7;
            --card-shadow: rgba(40, 30, 20, 0.05);
            color-scheme: light;
        }

        /* ============================================================
           2. MODO ESCURO BIBLIOTECA
           ============================================================ */
        html.theme-dark {
            --bg-page: #151619;
            --bg-surface: #1e2025;
            --bg-surface-hover: #262930;
            --bg-subtle: #191b20;
            --border-subtle: #2b2e37;
            --border-strong: #3d424e;
            --text-primary: #e6e3dc;
            --text-secondary: #a39f97;
            --text-muted: #74716a;
            --accent: #d89b65; /* Âmbar */
            --accent-subtle: #2a231b;
            --card-shadow: rgba(0, 0, 0, 0.35);
            color-scheme: dark;
        }

        /* ============================================================
           3. MODO ESCURO OLED (Preto Absoluto #000000)
           ============================================================ */
        html.theme-oled {
            --bg-page: #000000;
            --bg-surface: #0a0a0a;
            --bg-surface-hover: #141414;
            --bg-subtle: #050505;
            --border-subtle: #1c1c1c;
            --border-strong: #2c2c2c;
            --text-primary: #e6e6e6;
            --text-secondary: #949494;
            --text-muted: #666666;
            --accent: #e5b378;
            --accent-subtle: #1a150e;
            --card-shadow: rgba(0, 0, 0, 0.8);
            color-scheme: dark;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-page);
            color: var(--text-primary);
            line-height: 1.68;
            max-width: 860px;
            margin: 0 auto;
            padding: 24px 16px 80px;
            transition: background-color 0.2s, color 0.2s;
        }

        .header-bar {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding-bottom: 20px;
            margin-bottom: 28px;
            border-bottom: 1px solid var(--border-strong);
        }

        .header-top-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
        }

        .materia-badge {
            font-size: 11px;
            font-family: monospace;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--accent);
            font-weight: bold;
            display: block;
            margin-bottom: 4px;
        }

        .materia-title {
            font-size: 1.65rem;
            font-weight: 800;
            margin: 0;
            color: var(--text-primary);
            line-height: 1.25;
        }

        /* Seletor Segmentado de Tema */
        .theme-segmented-control {
            display: inline-flex;
            align-items: center;
            background: var(--bg-subtle);
            border: 1px solid var(--border-subtle);
            border-radius: 8px;
            padding: 3px;
            gap: 2px;
            box-shadow: 0 1px 2px var(--card-shadow);
            flex-shrink: 0;
        }

        .theme-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 11px;
            border-radius: 6px;
            border: 1px solid transparent;
            background: transparent;
            color: var(--text-secondary);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
        }

        .theme-btn:hover {
            color: var(--text-primary);
        }

        .theme-btn.active {
            background: var(--bg-surface);
            color: var(--text-primary);
            border-color: var(--border-strong);
            box-shadow: 0 1px 3px var(--card-shadow);
        }

        .theme-dot {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            display: inline-block;
            flex-shrink: 0;
        }

        .chapter-nav-row {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .nav-label {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
        }

        select {
            width: 100%;
            padding: 12px 14px;
            font-size: 15px;
            font-weight: 600;
            border-radius: 8px;
            border: 1px solid var(--border-strong);
            background-color: var(--bg-surface);
            color: var(--text-primary);
            cursor: pointer;
            box-shadow: 0 1px 3px var(--card-shadow);
            transition: border-color 0.2s;
        }

        select:focus {
            outline: 2px solid var(--accent);
        }

        details {
            background: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 8px;
            transition: border-color 0.2s;
        }

        summary {
            font-weight: bold;
            cursor: pointer;
            outline: none;
            user-select: none;
            font-size: 13px;
        }

        details > div {
            border-top: 1px solid var(--border-subtle);
            padding-top: 10px;
            margin-top: 8px;
            overflow-x: auto;
        }

        .question-card {
            border: 1px solid var(--border-strong);
            border-radius: 8px;
            padding: 14px 16px;
            margin: 12px 0;
            background: var(--bg-surface);
            box-shadow: 0 1px 3px var(--card-shadow);
        }

        .question-card.question-card-preview {
            padding: 12px 14px;
            margin: 10px 0;
            border-color: var(--border-strong);
            background: var(--bg-subtle);
        }

        .question-card.question-card-preview .question-title {
            font-size: 1rem;
            margin-bottom: 6px;
        }

        .question-sequence-toggle-wrap {
            margin: 12px 0 16px 0;
            text-align: center;
        }

        .question-sequence-toggle-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            border-radius: 6px;
            border: 1px solid var(--border-strong);
            background: var(--bg-surface);
            color: var(--accent);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 1px 2px var(--card-shadow);
            transition: all 0.15s ease;
            user-select: none;
        }

        .question-sequence-toggle-btn:hover {
            background: var(--bg-surface-hover);
            border-color: var(--accent);
        }

        .question-badge-bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--accent);
            font-family: monospace;
            font-weight: bold;
            border-bottom: 1px solid var(--border-subtle);
            padding-bottom: 5px;
            margin-bottom: 8px;
        }

        .question-title {
            color: var(--text-primary);
            font-size: 1.1rem;
            font-weight: bold;
            margin-bottom: 8px;
            line-height: 1.35;
        }

        img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 16px auto;
            border-radius: 6px;
            border: 1px solid var(--border-subtle);
        }

        .theory summary { color: #9b59b6; }
        .theory { border-left: 4px solid #9b59b6; }
        .resolution summary { color: #2ecc71; }
        .resolution { border-left: 4px solid #2ecc71; }

        .options {
            list-style: none;
            padding: 0;
            margin: 16px 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .options li {
            padding: 10px 14px;
            background: var(--bg-subtle);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            font-size: 14px;
        }

        blockquote {
            border-left: 4px solid var(--border-strong);
            margin: 16px 0;
            padding-left: 14px;
            color: var(--text-muted);
        }

        /* ============================================================
           Alertas GitHub-Style ([!NOTE], [!TIP], etc.)
           ============================================================ */
        :root, html.theme-paper {
            --alert-note-accent: #0969da;
            --alert-note-bg: #ebf3fc;
            --alert-note-border: rgba(9, 105, 218, 0.22);
            --alert-tip-accent: #1a7f37;
            --alert-tip-bg: #eaf5ed;
            --alert-tip-border: rgba(26, 127, 55, 0.22);
            --alert-important-accent: #8250df;
            --alert-important-bg: #f3eefb;
            --alert-important-border: rgba(130, 80, 223, 0.22);
            --alert-warning-accent: #b45309;
            --alert-warning-bg: #fef3c7;
            --alert-warning-border: rgba(180, 83, 9, 0.3);
            --alert-caution-accent: #cf222e;
            --alert-caution-bg: #fde8e8;
            --alert-caution-border: rgba(207, 34, 46, 0.22);
        }
        html.theme-dark {
            --alert-note-accent: #58a6ff;
            --alert-note-bg: rgba(56, 139, 253, 0.1);
            --alert-note-border: rgba(56, 139, 253, 0.28);
            --alert-tip-accent: #3fb950;
            --alert-tip-bg: rgba(63, 185, 80, 0.1);
            --alert-tip-border: rgba(63, 185, 80, 0.28);
            --alert-important-accent: #a371f7;
            --alert-important-bg: rgba(163, 113, 247, 0.1);
            --alert-important-border: rgba(163, 113, 247, 0.28);
            --alert-warning-accent: #d29922;
            --alert-warning-bg: rgba(210, 153, 34, 0.1);
            --alert-warning-border: rgba(210, 153, 34, 0.28);
            --alert-caution-accent: #f85149;
            --alert-caution-bg: rgba(248, 81, 73, 0.1);
            --alert-caution-border: rgba(248, 81, 73, 0.28);
        }
        html.theme-oled {
            --alert-note-accent: #58a6ff;
            --alert-note-bg: rgba(56, 139, 253, 0.07);
            --alert-note-border: rgba(56, 139, 253, 0.35);
            --alert-tip-accent: #3fb950;
            --alert-tip-bg: rgba(63, 185, 80, 0.07);
            --alert-tip-border: rgba(63, 185, 80, 0.35);
            --alert-important-accent: #a371f7;
            --alert-important-bg: rgba(163, 113, 247, 0.07);
            --alert-important-border: rgba(163, 113, 247, 0.35);
            --alert-warning-accent: #d29922;
            --alert-warning-bg: rgba(210, 153, 34, 0.07);
            --alert-warning-border: rgba(210, 153, 34, 0.35);
            --alert-caution-accent: #f85149;
            --alert-caution-bg: rgba(248, 81, 73, 0.07);
            --alert-caution-border: rgba(248, 81, 73, 0.35);
        }
        .markdown-alert-note { --alert-accent: var(--alert-note-accent); --alert-bg: var(--alert-note-bg); --alert-border: var(--alert-note-border); }
        .markdown-alert-tip { --alert-accent: var(--alert-tip-accent); --alert-bg: var(--alert-tip-bg); --alert-border: var(--alert-tip-border); }
        .markdown-alert-important { --alert-accent: var(--alert-important-accent); --alert-bg: var(--alert-important-bg); --alert-border: var(--alert-important-border); }
        .markdown-alert-warning { --alert-accent: var(--alert-warning-accent); --alert-bg: var(--alert-warning-bg); --alert-border: var(--alert-warning-border); }
        .markdown-alert-caution { --alert-accent: var(--alert-caution-accent); --alert-bg: var(--alert-caution-bg); --alert-border: var(--alert-caution-border); }

        .markdown-alert {
            position: relative;
            margin: 1.5rem 0;
            padding: 1rem 1.25rem;
            border-radius: 8px;
            border: 1px solid var(--alert-border);
            border-left: 4.5px solid var(--alert-accent);
            background-color: var(--alert-bg);
            font-style: normal;
        }
        .markdown-alert-title {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.875rem;
            font-weight: 700;
            line-height: 1.35;
            color: var(--alert-accent);
            margin-bottom: 0.45rem;
        }
        .markdown-alert-icon-wrapper {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            color: var(--alert-accent);
        }
        .markdown-alert-icon {
            width: 1.05rem;
            height: 1.05rem;
            display: block;
        }
        .markdown-alert-content {
            font-style: normal;
            color: var(--text-primary);
            line-height: 1.7;
        }
        .markdown-alert-content p {
            margin: 0.45rem 0;
            font-style: normal;
        }
        .markdown-alert-content p:first-child { margin-top: 0; }
        .markdown-alert-content p:last-child { margin-bottom: 0; }
        .markdown-alert-content ul, .markdown-alert-content ol { margin: 0.5rem 0; padding-left: 1.25rem; }

        pre {
            background: var(--bg-subtle);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
        }

        code {
            background: var(--bg-subtle);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.75em;
            border: 1px solid var(--border-subtle);
            color: var(--accent);
        }

        .banco-header {
            padding: 18px;
            background: var(--bg-surface);
            border-radius: 8px;
            border: 1px solid var(--border-strong);
            margin-bottom: 24px;
            box-shadow: 0 1px 3px var(--card-shadow);
        }

        .banco-search {
            width: 100%;
            padding: 12px 14px;
            margin-top: 12px;
            font-size: 14px;
            border-radius: 6px;
            border: 1px solid var(--border-strong);
            background: var(--bg-subtle);
            color: var(--text-primary);
            box-sizing: border-box;
        }

        .banco-search:focus {
            outline: 2px solid var(--accent);
            background: var(--bg-surface);
        }

        .katex-display {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            -webkit-overflow-scrolling: touch;
            padding: 0.85rem 1rem !important;
            margin: 1.5rem 0 !important;
            border: 1px solid var(--border-subtle);
            background-color: var(--bg-subtle);
            border-radius: 6px;
        }

        .katex-display .katex-display {
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            background: transparent !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
        }

        .katex-display.katex-display-group {
            display: flex !important;
            flex-direction: column !important;
            gap: 0.85rem !important;
            padding: 1.15rem 1rem !important;
        }

        .katex-display-group > .katex-display-item {
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            align-items: center !important;
            width: 100% !important;
            min-width: min-content !important;
            box-sizing: border-box !important;
        }

        .katex-display-group > .katex-display-item > .katex-display {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            text-align: center !important;
        }

        .katex-display-group > .katex-display-item > .katex-display > .katex {
            display: inline-block !important;
            white-space: nowrap !important;
            min-width: min-content;
            text-align: center;
        }

        .katex-display + .katex-display {
            margin-top: -1.5rem !important;
            border-top: none !important;
            border-top-left-radius: 0 !important;
            border-top-right-radius: 0 !important;
            border-bottom-left-radius: 6px !important;
            border-bottom-right-radius: 6px !important;
            padding-top: 0.4rem !important;
        }

        .katex-display:has(+ .katex-display) {
            margin-bottom: 0 !important;
            border-top-left-radius: 6px !important;
            border-top-right-radius: 6px !important;
            border-bottom-left-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
            padding-bottom: 0.4rem !important;
        }
    </style>
</head>
<body>
    <header class="header-bar">
        <div class="header-top-row">
            <div>
                <span class="materia-badge">Caderno de Estudos Offline</span>
                <h1 class="materia-title">${materiaName}</h1>
            </div>

            <!-- Seletor de Tema (Papel, Escuro, OLED) -->
            <div class="theme-segmented-control" role="radiogroup" aria-label="Tema">
                <button type="button" class="theme-btn" data-theme="paper" onclick="setTheme('paper')" title="Tema Papel / Sépia">
                    <span class="theme-dot" style="background:#e8decb; border:1px solid #b8ab96;"></span>
                    <span>Papel</span>
                </button>
                <button type="button" class="theme-btn" data-theme="dark" onclick="setTheme('dark')" title="Tema Escuro">
                    <span class="theme-dot" style="background:#2a2d36; border:1px solid #484e5c;"></span>
                    <span>Escuro</span>
                </button>
                <button type="button" class="theme-btn" data-theme="oled" onclick="setTheme('oled')" title="Tema Preto OLED">
                    <span class="theme-dot" style="background:#000000; border:1px solid #555555;"></span>
                    <span>OLED</span>
                </button>
            </div>
        </div>

        <div class="chapter-nav-row" style="gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <label for="tag-select" class="nav-label">
                    Avaliação:
                </label>
                <select id="tag-select" style="padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg-surface); color: var(--text-primary); font-size: 13px; font-weight: 600; cursor: pointer;"></select>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 260px;">
                <label for="chapter-select" class="nav-label">
                    Capítulo:
                </label>
                <select id="chapter-select" style="flex: 1;"></select>
            </div>
        </div>
    </header>

    <div id="content"></div>

    <script>
        const DB = JSON_DATA_HERE;
        const IMAGES = BASE64_IMAGES_HERE;

        function setTheme(theme) {
            const root = document.documentElement;
            root.classList.remove('theme-paper', 'theme-dark', 'theme-oled');
            root.classList.add('theme-' + theme);
            try {
                localStorage.setItem('study_theme', theme);
            } catch(e) {}
            
            document.querySelectorAll('.theme-btn').forEach(btn => {
                if (btn.getAttribute('data-theme') === theme) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        // Inicializa tema imediatamente
        (function() {
            let saved = 'paper';
            try {
                saved = localStorage.getItem('study_theme') || 'paper';
            } catch(e) {}
            setTheme(saved);
        })();
        
        function groupAdjacentEquations(root = document.body) {
            const displays = Array.from(root.querySelectorAll('.katex-display')).filter(el => {
                if (el.dataset.equationGrouped === 'true') return false;
                if (el.classList.contains('katex-display-group')) return false;
                if (el.parentElement?.closest('.katex-display')) return false;
                return true;
            });

            if (displays.length < 2) return;

            function getEffectiveBlock(el) {
                const parent = el.parentElement;
                if (parent && parent.tagName === 'P') {
                    const remaining = Array.from(parent.childNodes).filter(n => {
                        if (n === el) return false;
                        if (n.nodeType === Node.TEXT_NODE) return (n.textContent || '').trim().length > 0;
                        if (n.nodeType === Node.ELEMENT_NODE) {
                            return n.tagName !== 'BR' && (n.textContent || '').trim().length !== 0;
                        }
                        return true;
                    });
                    if (remaining.length === 0) return parent;
                }
                return el;
            }

            const groups = [];
            let currentGroup = [];

            for (let i = 0; i < displays.length; i++) {
                const el = displays[i];
                if (currentGroup.length === 0) {
                    currentGroup.push(el);
                } else {
                    const prev = currentGroup[currentGroup.length - 1];
                    const prevBlock = getEffectiveBlock(prev);
                    const currBlock = getEffectiveBlock(el);

                    if (prevBlock.parentElement === currBlock.parentElement) {
                        let isAdjacent = false;
                        let sib = prevBlock.nextSibling;
                        while (sib) {
                            if (sib === currBlock) {
                                isAdjacent = true;
                                break;
                            }
                            if (sib.nodeType === Node.TEXT_NODE && !(sib.textContent || '').trim()) {
                                sib = sib.nextSibling;
                            } else if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === 'P' && !(sib.textContent || '').trim()) {
                                sib = sib.nextSibling;
                            } else if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === 'BR') {
                                sib = sib.nextSibling;
                            } else {
                                break;
                            }
                        }

                        if (isAdjacent) {
                            currentGroup.push(el);
                        } else {
                            if (currentGroup.length > 1) groups.push(currentGroup);
                            currentGroup = [el];
                        }
                    } else {
                        if (currentGroup.length > 1) groups.push(currentGroup);
                        currentGroup = [el];
                    }
                }
            }

            if (currentGroup.length > 1) groups.push(currentGroup);

            groups.forEach(group => {
                const firstEl = group[0];
                const firstBlock = getEffectiveBlock(firstEl);
                const parent = firstBlock.parentNode;
                if (!parent) return;

                const groupContainer = document.createElement('div');
                groupContainer.className = 'katex-display katex-display-group my-4 overflow-x-auto';
                groupContainer.dataset.equationGrouped = 'true';

                group.forEach(item => {
                    item.dataset.equationGrouped = 'true';
                    const block = getEffectiveBlock(item);
                    const itemWrapper = document.createElement('div');
                    itemWrapper.className = 'katex-display-item';
                    itemWrapper.appendChild(item);
                    groupContainer.appendChild(itemWrapper);
                    if (block !== item && block.parentNode) {
                        block.parentNode.removeChild(block);
                    }
                });

                parent.insertBefore(groupContainer, firstBlock);
                if (firstBlock.parentNode && firstBlock.parentNode === parent) {
                    if (firstBlock.childNodes.length === 0) {
                        parent.removeChild(firstBlock);
                    }
                }
            });
        }

        function renderMath() {
            renderMathInElement(document.body, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$", right: "$", display: false}
                ],
                throwOnError: false
            });
            groupAdjacentEquations();
        }

        function resolveImage(path) {
            if (!path) return '';
            let cleanPath = path.replace(/^\\/?(public\\/)?images\\/questoes\\//, './');
            if (!cleanPath.startsWith('./')) {
                if (cleanPath.startsWith('/')) cleanPath = '.' + cleanPath;
                else cleanPath = './' + cleanPath;
            }
            if (IMAGES[cleanPath]) {
                return IMAGES[cleanPath];
            }
            const baseName = path.split('/').pop();
            if (baseName && IMAGES[baseName]) {
                return IMAGES[baseName];
            }
            return path;
        }

        const ALERT_ICONS = {
            note: '<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
            tip: '<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.628-.756-1.596-1.92-1.596-3.579C2.5 2.454 4.887 0 8 0s5.5 2.454 5.5 5.25c0 1.659-.968 2.823-1.596 3.58a8.463 8.463 0 0 0-.541.679c-.208.3-.33.565-.371.847a.75.75 0 0 1-1.485-.21c.084-.595.337-1.08.62-1.492.204-.291.451-.583.675-.848.064-.076.134-.16.213-.253.56-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5Zm1 3h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1 0-1.5Z"></path></svg>',
            important: '<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .25.25.25.25.25h3a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h5.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm6.25 2.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
            warning: '<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
            caution: '<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>'
        };

        const DEFAULT_ALERT_TITLES = {
            note: 'Nota',
            tip: 'Dica',
            important: 'Importante',
            warning: 'Atenção',
            caution: 'Cuidado'
        };

        function renderAlerts(html) {
            if (!html || html.indexOf('[!') === -1) return html;
            html = html.replace(/<blockquote>([\\s\\S]*?)<\\/blockquote>/gi, function(match, inner) {
                var pMatch = inner.match(/^\\s*<p>([\\s\\S]*?)<\\/p>([\\s\\S]*)$/i);
                if (!pMatch) return match;
                var firstPara = pMatch[1];
                var remaining = pMatch[2] ? pMatch[2].trim() : '';
                var headerMatch = firstPara.match(/^[^\\S\\r\\n]*\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\][^\\S\\r\\n]*([^\\r\\n<]*)(?:(?:\\r?\\n|<br\\s*\\/?>)([\\s\\S]*))?$/i);
                if (!headerMatch) return match;
                var type = headerMatch[1].toLowerCase();
                var rawTitle = (headerMatch[2] || '').replace(/^[\\s:\\-–—]+/, '').trim();
                var restOfFirstPara = (headerMatch[3] || '').trim();
                var title = rawTitle || DEFAULT_ALERT_TITLES[type] || type.toUpperCase();
                var bodyHtml = '';
                if (restOfFirstPara) bodyHtml += '<p>' + restOfFirstPara + '</p>';
                if (remaining) bodyHtml += (bodyHtml ? '\\n' : '') + remaining;
                var icon = ALERT_ICONS[type] || '';
                return '<div class="markdown-alert markdown-alert-' + type + '" data-alert-type="' + type + '"><div class="markdown-alert-title"><span class="markdown-alert-icon-wrapper">' + icon + '</span><span class="markdown-alert-title-text">' + title + '</span></div>' + (bodyHtml ? '<div class="markdown-alert-content">' + bodyHtml + '</div>' : '') + '</div>';
            });
            html = html.replace(/<p>([^\\S\\r\\n]*\\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\][\\s\\S]*?)<\\/p>/gi, function(match, pInner) {
                var headerMatch = pInner.match(/^[^\\S\\r\\n]*\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\][^\\S\\r\\n]*([^\\r\\n<]*)(?:(?:\\r?\\n|<br\\s*\\/?>)([\\s\\S]*))?$/i);
                if (!headerMatch) return match;
                var type = headerMatch[1].toLowerCase();
                var rawTitle = (headerMatch[2] || '').replace(/^[\\s:\\-–—]+/, '').trim();
                var rest = (headerMatch[3] || '').trim();
                var title = rawTitle || DEFAULT_ALERT_TITLES[type] || type.toUpperCase();
                var bodyHtml = rest ? '<p>' + rest + '</p>' : '';
                var icon = ALERT_ICONS[type] || '';
                return '<div class="markdown-alert markdown-alert-' + type + '" data-alert-type="' + type + '"><div class="markdown-alert-title"><span class="markdown-alert-icon-wrapper">' + icon + '</span><span class="markdown-alert-title-text">' + title + '</span></div>' + (bodyHtml ? '<div class="markdown-alert-content">' + bodyHtml + '</div>' : '') + '</div>';
            });
            return html;
        }

        function preprocessMDX(text) {
            if (!text) return '';
            text = text.replace(/<Theory>/g, '<details class="theory"><summary>[ § ] Explicação Teórica Necessária</summary><div>');
            text = text.replace(/<\\/Theory>/g, '</div></details>');
            text = text.replace(/<Resolution>/g, '<details class="resolution"><summary>[ ¶ ] Resolução Passo a Passo</summary><div>');
            text = text.replace(/<\\/Resolution>/g, '</div></details>');
            
            // Replace image paths in markdown syntax with base64 if exists
            text = text.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, (match, alt, path) => {
                return '![' + alt + '](' + resolveImage(path) + ')';
            });
            
            // Replace image paths in HTML syntax with base64 if exists
            text = text.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/g, (match, path) => {
                return match.replace(path, resolveImage(path));
            });

            // Avoid marked messing up block math
            text = text.replace(/\\$\\$/g, '\\n$$\\n');
            return text;
        }

        function renderQuestion(id, isPreview) {
            const q = DB.questoes[id];
            if (!q) return '<div class="question-card"><i>Questão ' + id + ' não encontrada no banco.</i></div>';
            
            const cardClasses = isPreview ? 'question-card question-card-preview' : 'question-card';
            const qTags = q.frontmatter.tags || (q.frontmatter.tag ? [q.frontmatter.tag] : ['teste-1']);
            let html = '<div class="' + cardClasses + '" id="' + id + '" data-question-id="' + id + '" data-topic="' + (q.frontmatter.topic || '') + '" data-exam="' + (q.frontmatter.exam || '') + '" data-tags="' + qTags.join(',') + '">';
            
            html += '<div class="question-badge-bar">';
            html += '<span>' + (q.frontmatter.exam || 'Exercício') + ' (' + (q.frontmatter.year || '') + ') • ' + (q.frontmatter.topic || '') + '</span>';
            html += '<span>' + (q.frontmatter.type === 'discursiva' ? 'Dissertativa' : 'Múltipla Escolha') + ' • ' + (q.frontmatter.difficulty || 'Médio') + '</span>';
            html += '</div>';

            html += '<div class="question-title">' + (q.frontmatter.title || id) + '</div>';
            
            let statement = q.frontmatter.statement ? q.frontmatter.statement + '\\n\\n' : "";
            
            let image = "";
            if (q.frontmatter.image) {
                image = '\\n<img src="' + resolveImage(q.frontmatter.image) + '" />\\n';
            }
            if (q.frontmatter.images) {
                q.frontmatter.images.forEach(img => {
                    const src = typeof img === 'string' ? img : (img.src || '');
                    image += '\\n<img src="' + resolveImage(src) + '" />\\n';
                });
            }

            let optionsHtml = "";
            if (q.frontmatter.options && q.frontmatter.options.length > 0) {
                optionsHtml = '\\n<ul class="options">\\n';
                q.frontmatter.options.forEach(opt => {
                    optionsHtml += '<li><strong>' + opt.label + ')</strong> ' + opt.text + '</li>\\n';
                });
                optionsHtml += '</ul>\\n';
            }
            
            let bodyParsed = renderAlerts(marked.parse(preprocessMDX(q.body)));
            
            if (q.frontmatter.correctOption) {
                 bodyParsed = bodyParsed.replace('</div></details>', '<br><strong style="color:#27ae60;">Gabarito Oficial: (' + q.frontmatter.correctOption + ')</strong></div></details>');
            } else if (q.frontmatter.expectedAnswer) {
                 bodyParsed = bodyParsed.replace('</div></details>', '<br><strong style="color:#27ae60;">Resposta Esperada: ' + q.frontmatter.expectedAnswer + '</strong></div></details>');
            }
            
            let topPart = renderAlerts(marked.parse(preprocessMDX(statement + optionsHtml)));
            html += topPart + image + bodyParsed;
            html += '</div>';
            return html;
        }

        function applyQuestionSequenceCollapsing(container) {
            const allCards = Array.from(container.querySelectorAll('.question-card-preview'));
            if (allCards.length === 0) return;

            const groups = [];
            let currentGroup = [];

            for (let i = 0; i < allCards.length; i++) {
                const card = allCards[i];
                if (currentGroup.length === 0) {
                    currentGroup.push(card);
                } else {
                    const prevCard = currentGroup[currentGroup.length - 1];
                    let next = prevCard.nextElementSibling;
                    while (next && next !== card && next.tagName === 'P' && !next.textContent.trim()) {
                        next = next.nextElementSibling;
                    }

                    if (next === card) {
                        currentGroup.push(card);
                    } else {
                        if (currentGroup.length > 2) {
                            groups.push(currentGroup);
                        }
                        currentGroup = [card];
                    }
                }
            }

            if (currentGroup.length > 2) {
                groups.push(currentGroup);
            }

            groups.forEach(group => {
                if (group[0].dataset.sequenceGrouped === 'true') return;
                group.forEach(card => card.dataset.sequenceGrouped = 'true');

                const hiddenCards = group.slice(2);
                const hiddenCount = hiddenCards.length;

                hiddenCards.forEach(card => {
                    card.style.display = 'none';
                });

                const toggleWrap = document.createElement('div');
                toggleWrap.className = 'question-sequence-toggle-wrap';

                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.className = 'question-sequence-toggle-btn';

                let isExpanded = false;

                function renderBtn() {
                    if (isExpanded) {
                        toggleBtn.innerHTML = '▲ Recolher questões do bloco (' + hiddenCount + ' ocultadas)';
                    } else {
                        toggleBtn.innerHTML = '▼ Ver mais ' + hiddenCount + ' ' + (hiddenCount === 1 ? 'questão' : 'questões') + ' deste bloco';
                    }
                }

                toggleBtn.onclick = (e) => {
                    e.preventDefault();
                    isExpanded = !isExpanded;
                    hiddenCards.forEach(card => {
                        card.style.display = isExpanded ? '' : 'none';
                    });
                    renderBtn();
                };

                renderBtn();
                toggleWrap.appendChild(toggleBtn);

                const lastCard = group[group.length - 1];
                if (lastCard.parentNode) {
                    lastCard.parentNode.insertBefore(toggleWrap, lastCard.nextSibling);
                }
            });
        }

        function loadChapter(val) {
            const contentEl = document.getElementById('content');
            
            if (val === 'banco-questoes') {
                const questionIds = Object.keys(DB.questoes);
                let html = '<div class="banco-header">';
                html += '<h2 style="margin: 0 0 6px 0;">Banco de Questões Completo</h2>';
                html += '<p style="margin: 0; font-size: 14px; color: var(--text-secondary);">';
                html += 'Total de <strong>' + questionIds.length + ' questões oficiais</strong> extraídas dos testes, todas com resolução detalhada e fundamentação teórica.';
                html += '</p>';
                html += '<input type="text" id="banco-search-input" class="banco-search" placeholder="Filtrar questões por enunciado, prova, ano ou tema..." oninput="filterBanco(this.value)" />';
                html += '</div>';
                
                html += '<div id="banco-questoes-list">';
                questionIds.forEach(id => {
                    html += renderQuestion(id, false);
                });
                html += '</div>';
                
                contentEl.innerHTML = html;
                setTimeout(renderMath, 100);
                return;
            }

            const idx = parseInt(val, 10);
            const cap = DB.resumos[idx];
            if (!cap) return;

            let body = cap.body;
            
            const regex = /<QuestionCard\\s+id="([^"]+)"\\s*\\/>/g;
            body = body.replace(regex, (match, id) => {
                return '\\n\\n' + renderQuestion(id, true) + '\\n\\n';
            });

            const html = renderAlerts(marked.parse(preprocessMDX(body)));
            contentEl.innerHTML = '<h2>' + cap.frontmatter.title + '</h2>' + html;
            
            applyQuestionSequenceCollapsing(contentEl);
            setTimeout(renderMath, 100);
        }

        let currentTag = '';

        function filterBanco(query) {
            const q = query ? query.toLowerCase().trim() : (document.getElementById('banco-search-input')?.value || '').toLowerCase().trim();
            const cards = document.querySelectorAll('#banco-questoes-list .question-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                const cardTags = (card.getAttribute('data-tags') || '').split(',').map(s => s.trim());
                const matchText = !q || text.includes(q);
                const matchTag = !currentTag || cardTags.includes(currentTag);
                if (matchText && matchTag) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        function formatTagLabel(t) {
            if (!t) return 'Todas as Avaliações';
            return t;
        }

        window.onload = () => {
            const tagSelect = document.getElementById('tag-select');
            const chapterSelect = document.getElementById('chapter-select');

            DB.resumos.sort((a,b) => {
                let orderA = a.frontmatter.order !== undefined ? a.frontmatter.order : 999;
                let orderB = b.frontmatter.order !== undefined ? b.frontmatter.order : 999;
                return orderA - orderB;
            });

            // Extrai todas as tags únicas
            const tagsSet = new Set();
            DB.resumos.forEach(r => {
                const tags = r.frontmatter.tags || (r.frontmatter.tag ? [r.frontmatter.tag] : ['teste-1']);
                tags.forEach(t => tagsSet.add(t));
            });
            Object.values(DB.questoes).forEach(q => {
                const tags = q.frontmatter.tags || (q.frontmatter.tag ? [q.frontmatter.tag] : ['teste-1']);
                tags.forEach(t => tagsSet.add(t));
            });

            const allTags = Array.from(tagsSet);
            if (allTags.length > 1) {
                const optAll = document.createElement('option');
                optAll.value = '';
                optAll.textContent = 'Todas as Avaliações';
                tagSelect.appendChild(optAll);
            }

            allTags.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = formatTagLabel(t);
                tagSelect.appendChild(opt);
            });

            currentTag = allTags.includes('teste-1') ? 'teste-1' : (allTags[0] || '');
            tagSelect.value = currentTag;

            function updateChapterOptions() {
                chapterSelect.innerHTML = '';
                let firstVal = null;

                DB.resumos.forEach((cap, idx) => {
                    const capTags = cap.frontmatter.tags || (cap.frontmatter.tag ? [cap.frontmatter.tag] : ['teste-1']);
                    if (!currentTag || capTags.includes(currentTag)) {
                        const opt = document.createElement('option');
                        opt.value = idx.toString();
                        opt.textContent = cap.frontmatter.title;
                        chapterSelect.appendChild(opt);
                        if (firstVal === null) firstVal = idx.toString();
                    }
                });

                // Adiciona o Banco de Questões
                const optBanco = document.createElement('option');
                optBanco.value = 'banco-questoes';
                const countQ = Object.values(DB.questoes).filter(q => {
                    const qTags = q.frontmatter.tags || (q.frontmatter.tag ? [q.frontmatter.tag] : ['teste-1']);
                    return !currentTag || qTags.includes(currentTag);
                }).length;
                optBanco.textContent = 'Banco de Questões (' + countQ + ' Questões)';
                chapterSelect.appendChild(optBanco);

                if (firstVal !== null) {
                    chapterSelect.value = firstVal;
                    loadChapter(firstVal);
                } else {
                    chapterSelect.value = 'banco-questoes';
                    loadChapter('banco-questoes');
                }
            }

            tagSelect.onchange = (e) => {
                currentTag = e.target.value;
                updateChapterOptions();
                if (chapterSelect.value === 'banco-questoes') {
                    filterBanco();
                }
            };

            chapterSelect.onchange = (e) => {
                loadChapter(e.target.value);
                if (e.target.value === 'banco-questoes') {
                    filterBanco();
                }
            };

            updateChapterOptions();
        };
    </script>
</body>
</html>`;

  return htmlTemplate
    .replace('JSON_DATA_HERE', JSON.stringify(db))
    .replace('BASE64_IMAGES_HERE', JSON.stringify(encodedImages));
}
