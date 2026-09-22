# Academic Study Platform and Digital Signal Processing Notebook

A unified academic study and exam preparation system developed with Astro, KaTeX, and Tailwind CSS, orchestrated by Antigravity agentic skills. The platform pairs rigorous theoretical course notes with step-by-step resolved university exam problems, featuring a textbook-inspired reading experience, responsive split-screen problem solving, tag-based syllabus filtering, and self-contained offline exports.

---

## 1. Overview

This repository provides an end-to-end environment for university-level engineering courses, primarily configured for Digital Signal Processing (PDS - Processamento Digital de Sinais).

Key goals of the project:
- Provide self-contained theoretical notebooks structured logically from first principles to exam-level problems, without skipping intermediate steps.
- Offer an active learning question bank where students can inspect required theoretical background without spoiler calculations, attempt problems independently, and review verified step-by-step derivations.
- Maintain a distraction-free, publication-grade reading environment across paper, dark, and OLED display modes with reader-customizable typography.
- Support complete offline study through standalone single-file HTML distributions that embed all styles, mathematical fonts, assets, and client-side functionality.
- Automate curriculum generation, PDF exam extraction, figure cropping, and vector block diagram rendering using specialized agentic skills.

---

## 2. Architecture and Core Mechanics

The platform combines static site generation with a curated content archive and automated agent workflows.

### 2.1 Technology Stack
- Framework: Astro 5 using static site generation (SSG) and island architecture.
- Content Format: MDX (Markdown with JSX components) parsed with `remark-math` and `rehype-katex`.
- Styling: Tailwind CSS v4 with semantic CSS variables for multi-theme contrast containment.
- Mathematical Typesetting: KaTeX 0.16 with horizontal scroll protection containers (`.katex-display`) ensuring long formulas do not break mobile viewports.
- Diagram Engine: Native SVG with compile-time KaTeX labels via `<BlockDiagram />`, including full-screen pan and zoom capabilities.
- Automation & Agent Skills: Antigravity CLI skills (`question-study-generator`, `explain-question`, `block-diagram-generator`) with Python utilities.

### 2.2 Content Storage Model
The content is decoupled from the web application and organized under the `archive/` directory:
- `archive/<subject>/materia.json`: Course manifest defining metadata, course codes, institution, and topic syllabi.
- `archive/<subject>/resumos/*.mdx`: Theoretical chapters rendered in sequence. Frontmatter defines title, chapter index, topic anchors, related question IDs, and evaluation tags.
- `archive/<subject>/questoes/*.mdx`: Individual exam exercises classified as multiple-choice (`multipla_escolha`) or open-ended analytical (`discursiva`). Contains separate `<Theory>` and `<Resolution>` MDX sections.
- `archive/<subject>/questoes/*.png`: High-resolution figures and schematics cropped from primary source exam PDFs.

### 2.3 Evaluation Tag System
All course materials and exam problems are categorized by evaluation tags (e.g., `teste-1`, `teste-2`, `p1`, `p2`).
- The sidebar provides a custom dropdown filter allowing students to scope the entire curriculum to a specific examination.
- When a tag is selected, the sidebar table of contents, chapter cards, and question lists update immediately to display only content tagged for that assessment.
- Selections persist across sessions through browser `localStorage` and sync with the URL parameter (`?tag=<tag-name>`).

### 2.4 Standalone Offline Bundling
The project includes a generator (`site/src/pages/downloads/[materia].html.ts`) that compiles all chapters, solved exercises, KaTeX CSS/fonts, and theme scripts into a single self-contained HTML file (`export/processamento-digital-de-sinais/main.html`). This file operates completely offline in any modern web browser without internet access or an active web server.

---

## 3. Project Structure

```
.
├── .agents/
│   └── skills/
│       ├── block-diagram-generator/    # Vector SVG and KaTeX block diagram generator
│       ├── explain-question/           # Problem extraction, cropping, and pedagogical solver
│       └── question-study-generator/   # Syllabus orchestrator and theory notebook generator
├── archive/
│   └── pds/
│       ├── materia.json                # Course metadata manifest
│       ├── questoes/                   # Solved exam questions and cropped figures (MDX + PNG)
│       └── resumos/                    # Theoretical chapters in continuous reading flow (MDX)
├── export/
│   └── processamento-digital-de-sinais/
│       ├── main.html                   # Standalone single-file offline distribution
│       └── images/                     # Static diagrams and cropped illustrations
├── material/
│   ├── provas/                         # Raw university exam PDFs (P1, P2, P3, Sub)
│   └── testes/                         # Raw university quiz PDFs (Testes 2019-2024)
├── site/
│   ├── astro.config.mjs                # Astro configuration with MDX, KaTeX, and Tailwind
│   ├── package.json                    # Dependencies and scripts
│   ├── public/                         # Public static assets and images
│   └── src/
│       ├── components/                 # Astro components (Header, Theme, Cards, Diagrams)
│       ├── layouts/                    # AcademicLayout and BaseLayout
│       ├── pages/                      # File-based routes (Home, Reader, Questions, Settings)
│       └── styles/                     # Tailwind CSS and semantic theme variables
└── README.md
```

---

## 4. Getting Started

### 4.1 Prerequisites
- Node.js 18.17+ or 20.0+
- npm 9.0+
- Python 3.10+ (required only if running the question extraction and PDF cropping scripts)
  - Recommended Python packages: `pypdf`, `pdf2image`, `pillow`, `pymupdf`

### 4.2 Installation
Clone the repository and install site dependencies:

```bash
cd site
npm install
```

### 4.3 Running the Development Server
Start the local Astro development server:

```bash
cd site
npm run dev
```

The site will be available at `http://localhost:4321`.

### 4.4 Building for Production
To compile the static production site:

```bash
cd site
npm run build
```

The compiled output will be generated in `site/dist/`.

### 4.5 Synchronizing the Offline Standalone Export
When running `npm run build`, Astro automatically generates the standalone offline page at `site/dist/downloads/pds.html`. To synchronize it with the repository export folder:

```bash
cp site/dist/downloads/pds.html export/processamento-digital-de-sinais/main.html
cp site/dist/downloads/pds.html export/processamento-digital-de-sinais/processamento-digital-de-sinais.html
```

---

## 5. Using the Website

### 5.1 Navigation and Sidebar
- Left Sidebar: Displays the course header, offline download shortcut, evaluation tag dropdown, hierarchical table of contents, and quick access to the resolved question bank.
- Toggle Controls: On desktop, click the close button `[x]` next to the settings gear to collapse the sidebar for full-width focus reading; click the floating menu icon in the upper left to reopen it. On mobile, the sidebar acts as an accessible drawer.

### 5.2 Reading Modes and Themes
The theme selector is located in the sidebar header and supports three palettes:
- Paper / Sepia (`theme-paper`): Warm parchment background (`#fbf8f2`) with terracotta accents (`#8b3a2b`). Default textbook mode.
- Dark Library (`theme-dark`): Low-contrast charcoal background (`#151619`) with warm amber accents (`#d89b65`).
- OLED Black (`theme-oled`): Pure black (`#000000`) background with muted gold accents (`#e5b378`) for high-contrast reading and OLED power savings.

### 5.3 Reader Typography Settings (`/configuracoes`)
Navigate to the gear icon in the header to customize:
- Font Family: Choose between Newsreader / Garamond (Classic Textbook), Lora / Charter, Inter / System Sans, or JetBrains Mono.
- Font Size: Four steps ranging from 16px to 22px.
- Reading Width: Adjustable text container constraints from compact (672px) to wide (1088px).
- Settings persist automatically across page reloads via `localStorage`.

### 5.4 Solved Question Page Layout (`/pds/questoes/[slug]`)
- Split-Screen Workspace (Desktop): When screen width permits, the question statement and diagram remain sticky on the left half of the screen, while the theoretical review and step-by-step solution scroll independently on the right half.
- Independent Toggles:
  - Theoretical Foundation: Click `[ § ] Explicação Teórica Necessária` to review theorems, variable definitions, and conditions without revealing problem steps or answers.
  - Step-by-Step Resolution: Click `[ ¶ ] Resolução Passo a Passo` to view full algebraic steps and the highlighted answer key.
- Diagram Viewer: Click on any question diagram to open a full-screen modal with pan, zoom, and mouse-wheel navigation.

### 5.5 In-Text Question Cards (`<QuestionCard id="..." />`)
Theoretical chapters embed compact preview cards for exercises directly relevant to the discussed topic.
- Clean Previews: Preview cards show the problem prompt and multiple-choice alternatives without disclosing the answer key.
- Overflow Collapse: When three or more questions appear sequentially in a chapter, excess cards are automatically collapsed behind an interactive toggle button to maintain reading momentum.

---

## 6. Using the Agentic Skills

The project includes specialized skills under `.agents/skills/` designed for the Antigravity agentic assistant.

### 6.1 `question-study-generator`
Orchestrates high-level syllabus structuring, continuous theoretical notebooks, and concurrent exam resolution across subagents.

#### Operational Workflow:
1. Tag Requirement: When instructed to generate study notebooks or solve an exam, the agent must check if an evaluation tag was specified (e.g., `teste-1`, `p1`). If not provided, it must prompt the user before creating files.
2. The Golden Writing Guideline:
   - Self-Contained: Explain concepts thoroughly so the student can solve exam problems without outside resources.
   - Practical Results: Present definitive equations, transform tables, and operational criteria; omit tedious derivations.
   - Sequential Order: Introduce prerequisite variables and definitions before dependent concepts.
   - Direct Execution: Avoid filler introductory sentences; begin directly with definitions and equations.
3. Subagent Orchestration: Distributes PDF exams across concurrent subagents using `invoke_subagent`. Each subagent extracts questions and generates solutions using `explain-question`.
4. Synthesis: Upon subagent completion, the orchestrator compiles all covered topics, drafts the theoretical chapters (`archive/<materia>/resumos/*.mdx`), links `relatedQuestions`, and embeds `<QuestionCard />` components.

### 6.2 `explain-question`
Handles per-problem extraction from exam PDFs, figure cropping, and dual-section (`<Theory>` and `<Resolution>`) pedagogical authoring.

#### Official Utility Script:
Use `.agents/skills/explain-question/scripts/extract_question.py` for all extraction tasks:

```bash
# 1. Inspect an exam PDF and auto-detect multiple-choice vs discursive questions
python3 .agents/skills/explain-question/scripts/extract_question.py inspect material/testes/teste-1-2024.pdf

# 2. Render exam pages to PNG for diagram inspection
python3 .agents/skills/explain-question/scripts/extract_question.py render-pages material/testes/teste-1-2024.pdf --outdir archive/pds/questoes

# 3. Crop a schematic figure while preserving upper equations and context
python3 .agents/skills/explain-question/scripts/extract_question.py crop-figure material/testes/teste-1-2024.pdf \
  --out archive/pds/questoes/sistema-amostragem-figura1.png \
  --page 1 --top 770 --bottom 1540 --padding 25

# 4. Dump question structure to JSON
python3 .agents/skills/explain-question/scripts/extract_question.py dump-json material/testes/teste-1-2024.pdf -o questoes.json

# 5. Scaffold ready-to-solve MDX files
python3 .agents/skills/explain-question/scripts/extract_question.py scaffold material/testes/teste-1-2024.pdf --materia pds
```

#### Cropping Guidelines:
- Preserve Mathematical Context: Never crop flush to diagram borders. Always capture upper defining formulas (e.g., impulse train definitions, signal equations) and bottom figure labels.
- Safety Padding: Always maintain at least 25px vertical padding (`--padding 25`) to prevent clipping superscripts, subscripts, or mathematical accents.

#### Problem Frontmatter Format:

Multiple-Choice Problem:
```yaml
---
materia: "pds"
tags:
  - "teste-1"
id: "teste-1-2024-q1"
title: "Amostragem com Aliasing e Reconstrução"
exam: "Teste 1"
year: 2024
topic: "Amostragem e Aliasing"
topicSlug: "cap-2-amostragem"
difficulty: "Médio"
type: "multipla_escolha"
statement: "No sistema da Figura 1, suponha que $x_c(t) = 2\\cos(30\\pi t)$..."
image: "/images/questoes/diagrama.png"
options:
  - label: "A"
    text: "$2\\cos(30\\pi t)$"
  - label: "B"
    text: "$2\\cos(40\\pi t)$"
correctOption: "B"
---
```

Open-Ended Discursive Problem:
```yaml
---
materia: "pds"
tags:
  - "teste-2"
id: "teste-2-2024-q2"
title: "Função de Transferência, ROC e Resposta ao Impulso"
exam: "Teste 2"
year: 2024
topic: "Transformada Z e Estabilidade"
topicSlug: "cap-3-slits-convolucao"
difficulty: "Médio"
type: "discursiva"
statement: "Considere um sistema SLIT causal... Obtenha: (a) H(z); (b) ROC; (c) h[n]."
expectedAnswer: "H(z) = (1 + (1/3)z^-1)/(1 - (1/2)z^-1); ROC: |z| > 1/2"
---
```

### 6.3 `block-diagram-generator`
Generates clean vector SVG block diagrams with KaTeX labels for signals and systems, feedback control, and digital filter structures.

#### Available Presets:
- `feedback`: Canonical closed-loop system with controller $C(s)$, plant $G(s)$, and feedback $H(s)$.
- `feedback-disturbance`: Closed-loop system with load disturbance $D(s)$ injected at plant input.
- `cascade`: Series subsystem connection $H_1(z) \cdot H_2(z)$.
- `parallel`: Parallel subsystem connection $H_1(s) + H_2(s)$.
- `direct-form-1`: IIR filter Direct Form I structure with separate zeros and poles.
- `direct-form-2`: IIR filter Direct Form II canonical structure sharing state delay elements.
- `fir`: Transversal FIR filter tapped-delay line.
- `state-space`: Continuous or discrete dynamic state-space representation ($A, B, C, D$).
- `custom`: Arbitrary topology using custom SVG child elements.

#### Example Usage in MDX:
```mdx
<BlockDiagram
  preset="direct-form-2"
  title="Filtro IIR em Forma Direta II Canônica"
  input="x[n]"
  output="y[n]"
  zeros={["b_0", "b_1", "b_2"]}
  poles={["-a_1", "-a_2"]}
  delayLabel="z^{-1}"
/>
```

---

## 7. Development and Workspace Hygiene

When working on this repository, all contributors and agents must adhere to the rules defined in `AGENTS.md`:
1. No Loose Files in Root: Temporary scripts (`.py`, `.sh`), intermediate dumps (`.json`), or scratch images must never be placed in the workspace root.
2. Mandatory Cleanup: Any temporary file or debug script created during a session must be removed before completing the task.
3. Official Script Locations: Use `.agents/skills/explain-question/scripts/extract_question.py` for extraction and cropping workflows.
4. Process Termination: No background dev servers, watch tasks, or background processes may be left running at the end of an execution turn.

---

## 8. License

Educational material and codebase developed for university engineering studies. All rights reserved to original exam and course authors.
