# Claude Code Configuration for Academic Study Platform

This repository contains an academic study platform (theory notebooks and solved exam questions) built as an npm workspaces monorepo: a React + Vite SPA (`apps/web`), a Hono API server on Node.js with SQLite (`apps/server`), and a shared content pipeline with marked, KaTeX and Shiki (`packages/content`).

## Primary Commands

```bash
# Install dependencies (from the repository root)
npm install

# Run local development servers (API on :3000, web app on http://localhost:5173)
npm run dev

# Validate the frontmatter of every document in archive/ (after generating content)
npm run validate:archive

# Typecheck, lint and unit/integration tests
npm run check

# Production build (apps/web/dist + apps/server/dist/server.mjs)
npm run build
```

Deployment builds a release locally and activates it on the VPS (`scripts/deploy.sh`); see `docs/deploy.md`.

## Agentic Skills Reference

Specialized agent workflows and instructions are located in `.agents/skills/`. When performing tasks related to these domains, always read and follow the instructions in the corresponding `SKILL.md`:

1. **Theoretical Study Notebooks (`question-study-generator`)**:
   - Location: `.agents/skills/question-study-generator/SKILL.md`
   - Output destination: `archive/<subject>/resumos/<slug>.mdx`
   - Section: Classified under the "Estudo por questões" collapsible tab in the sidebar.
   - Rule: Always ensure an evaluation tag is specified (e.g., `teste-1`, `p1`). If the user did not provide one, ask for it before generating files. Follow the Golden Writing Guideline (self-contained, practical results without proofs, logical order, no filler introductions). Links question IDs with `<QuestionCard />`.

2. **Course Material Summaries (`summary-study-generator`)**:
   - Location: `.agents/skills/summary-study-generator/SKILL.md`
   - CLI utility: `python3 .agents/skills/summary-study-generator/scripts/extract_material_images.py`
   - Output destination: `archive/<subject>/resumos/<slug>.mdx` with `type: "materia"` in the frontmatter.
   - Section: Classified under the "Resumo da matéria" collapsible tab in the sidebar.
   - Focus: Purely theoretical lecture summaries derived from lecture slides, textbooks, and notes; does NOT link questions.
   - Diagram extraction: Extract only strictly relevant visual diagrams and graphs directly to `archive/<subject>/resumos/materia/` (or `archive/<subject>/resumos/`), referenced via relative paths (`./<image>.png`) in MDX.

3. **Exam Question Extraction and Resolution (`explain-question`)**:
   - Location: `.agents/skills/explain-question/SKILL.md`
   - CLI utility: `python3 .agents/skills/explain-question/scripts/extract_question.py`
   - Output destination: `archive/<subject>/questoes/<slug>.mdx`
   - Format: Must use `<Theory>` for pedagogical background (no spoilers) and `<Resolution>` for step-by-step algebra and answer keys.
   - Figure cropping: Use `crop-figure` command with `--padding 25` and preserve upper mathematical definitions and equations. Save cropped figures directly to `archive/<subject>/questoes/<figure>.png` and reference via `image: "./<figure>.png"` (never save inside `apps/` or `packages/`).

4. **Vector Block Diagrams (`block-diagram-generator`)**:
   - Location: `.agents/skills/block-diagram-generator/SKILL.md`
   - Component: `<BlockDiagram />` in MDX with presets (`feedback`, `feedback-disturbance`, `cascade`, `parallel`, `direct-form-1`, `direct-form-2`, `fir`, `state-space`, `custom`).

## Workspace Hygiene and Rules

- Prohibited files in root: Never create temporary scripts (`.py`, `.sh`), scratch images (`.png`), or intermediate JSON dumps in the project root (`.`).
- Use official scripts: Use `.agents/skills/explain-question/scripts/extract_question.py` for extraction and cropping.
- Mandatory cleanup: Delete any temporary debugging or cropping artifacts with `rm` before concluding the turn.
- Process termination: Terminate all commands and dev servers before finishing execution. Do not leave background tasks running.
