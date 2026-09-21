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

  const db: { resumos: any[]; questoes: Record<string, any> } = {
    resumos: [],
    questoes: {},
  };

  if (fs.existsSync(resumosDir)) {
    const files = fs.readdirSync(resumosDir);
    for (const f of files) {
      if (f.endsWith('.md') || f.endsWith('.mdx')) {
        const { frontmatter, body } = parseMdx(path.join(resumosDir, f));
        db.resumos.push({ frontmatter, body });
      }
    }
  }

  if (fs.existsSync(questoesDir)) {
    const files = fs.readdirSync(questoesDir);
    for (const f of files) {
      if (f.endsWith('.md') || f.endsWith('.mdx')) {
        const { frontmatter, body } = parseMdx(path.join(questoesDir, f));
        const qId = frontmatter.id || f.replace(/\.(md|mdx)$/, '');
        db.questoes[qId] = { frontmatter, body };
      }
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
            padding: 12px 16px;
            margin-bottom: 12px;
            transition: border-color 0.2s;
        }

        summary {
            font-weight: bold;
            cursor: pointer;
            outline: none;
            user-select: none;
        }

        details > div {
            border-top: 1px solid var(--border-subtle);
            padding-top: 14px;
            margin-top: 12px;
            overflow-x: auto;
        }

        .question-card {
            border: 1px solid var(--border-strong);
            border-radius: 8px;
            padding: 20px;
            margin: 28px 0;
            background: var(--bg-surface);
            box-shadow: 0 2px 5px var(--card-shadow);
        }

        .question-badge-bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--accent);
            font-family: monospace;
            font-weight: bold;
            border-bottom: 1px solid var(--border-subtle);
            padding-bottom: 8px;
            margin-bottom: 12px;
        }

        .question-title {
            color: var(--text-primary);
            font-size: 1.2rem;
            font-weight: bold;
            margin-bottom: 12px;
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

        pre {
            background: var(--bg-subtle);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
        }

        code {
            background: var(--bg-subtle);
            padding: 2px 5px;
            border-radius: 4px;
            font-family: monospace;
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
            <div class="theme-segmented-control" role="radiogroup" aria-label="Modo de Leitura">
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

        <div class="chapter-nav-row">
            <label for="chapter-select" class="nav-label">
                Navegação por Capítulos e Banco de Questões:
            </label>
            <select id="chapter-select"></select>
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
        
        function renderMath() {
            renderMathInElement(document.body, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$", right: "$", display: false}
                ],
                throwOnError: false
            });
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

        function renderQuestion(id) {
            const q = DB.questoes[id];
            if (!q) return '<div class="question-card"><i>Questão ' + id + ' não encontrada no banco.</i></div>';
            
            let html = '<div class="question-card" id="' + id + '" data-question-id="' + id + '" data-topic="' + (q.frontmatter.topic || '') + '" data-exam="' + (q.frontmatter.exam || '') + '">';
            
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
            
            let bodyParsed = marked.parse(preprocessMDX(q.body));
            
            if (q.frontmatter.correctOption) {
                 bodyParsed = bodyParsed.replace('</div></details>', '<br><strong style="color:#27ae60;">Gabarito Oficial: (' + q.frontmatter.correctOption + ')</strong></div></details>');
            } else if (q.frontmatter.expectedAnswer) {
                 bodyParsed = bodyParsed.replace('</div></details>', '<br><strong style="color:#27ae60;">Resposta Esperada: ' + q.frontmatter.expectedAnswer + '</strong></div></details>');
            }
            
            let topPart = marked.parse(preprocessMDX(statement + optionsHtml));
            html += topPart + image + bodyParsed;
            html += '</div>';
            return html;
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
                    html += renderQuestion(id);
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
                return renderQuestion(id);
            });

            const html = marked.parse(preprocessMDX(body));
            contentEl.innerHTML = '<h2>' + cap.frontmatter.title + '</h2>' + html;
            
            setTimeout(renderMath, 100);
        }

        function filterBanco(query) {
            const q = query.toLowerCase().trim();
            const cards = document.querySelectorAll('#banco-questoes-list .question-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                if (!q || text.includes(q)) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        window.onload = () => {
            const select = document.getElementById('chapter-select');
            DB.resumos.sort((a,b) => {
                let orderA = a.frontmatter.order !== undefined ? a.frontmatter.order : 999;
                let orderB = b.frontmatter.order !== undefined ? b.frontmatter.order : 999;
                return orderA - orderB;
            });
            
            DB.resumos.forEach((cap, idx) => {
                const opt = document.createElement('option');
                opt.value = idx.toString();
                opt.textContent = cap.frontmatter.title;
                select.appendChild(opt);
            });
            
            // Adiciona a página especial do Banco de Questões
            const optBanco = document.createElement('option');
            optBanco.value = 'banco-questoes';
            optBanco.textContent = '★ Banco de Questões (Todas as ' + Object.keys(DB.questoes).length + ' Questões Expandidas)';
            select.appendChild(optBanco);

            select.onchange = (e) => loadChapter(e.target.value);
            
            if (DB.resumos.length > 0) {
                loadChapter('0');
            }
        };
    </script>
</body>
</html>`;

  return htmlTemplate
    .replace('JSON_DATA_HERE', JSON.stringify(db))
    .replace('BASE64_IMAGES_HERE', JSON.stringify(encodedImages));
}
