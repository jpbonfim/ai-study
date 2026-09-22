# Claude Code Configuration for Academic Study Platform

This repository contains an academic study platform for Digital Signal Processing (PDS) built with Astro, KaTeX, Tailwind CSS, and MDX.

## Primary Commands

```bash
# Install dependencies
cd site && npm install

# Run local development server (http://localhost:4321)
cd site && npm run dev

# Build production static site
cd site && npm run build

# Synchronize standalone offline export (after build)
cp site/dist/downloads/pds.html export/processamento-digital-de-sinais/main.html
cp site/dist/downloads/pds.html export/processamento-digital-de-sinais/processamento-digital-de-sinais.html
```

## Agentic Skills Reference

Specialized agent workflows and instructions are located in `.agents/skills/`. When performing tasks related to these domains, always read and follow the instructions in the corresponding `SKILL.md`:

1. **Theoretical Study Notebooks (`question-study-generator`)**:
   - Location: `.agents/skills/question-study-generator/SKILL.md`
   - Output destination: `archive/<subject>/resumos/<slug>.mdx`
   - Rule: Always ensure an evaluation tag is specified (e.g., `teste-1`, `p1`). If the user did not provide one, ask for it before generating files. Follow the Golden Writing Guideline (self-contained, practical results without proofs, logical order, no filler introductions).

2. **Exam Question Extraction and Resolution (`explain-question`)**:
   - Location: `.agents/skills/explain-question/SKILL.md`
   - CLI utility: `python3 .agents/skills/explain-question/scripts/extract_question.py`
   - Output destination: `archive/<subject>/questoes/<slug>.mdx`
   - Format: Must use `<Theory>` for pedagogical background (no spoilers) and `<Resolution>` for step-by-step algebra and answer keys.
   - Figure cropping: Use `crop-figure` command with `--padding 25` and preserve upper mathematical definitions and equations.

3. **Vector Block Diagrams (`block-diagram-generator`)**:
   - Location: `.agents/skills/block-diagram-generator/SKILL.md`
   - Component: `<BlockDiagram />` in MDX with presets (`feedback`, `feedback-disturbance`, `cascade`, `parallel`, `direct-form-1`, `direct-form-2`, `fir`, `state-space`, `custom`).

## Workspace Hygiene and Rules

- Prohibited files in root: Never create temporary scripts (`.py`, `.sh`), scratch images (`.png`), or intermediate JSON dumps in the project root (`.`).
- Use official scripts: Use `.agents/skills/explain-question/scripts/extract_question.py` for extraction and cropping.
- Mandatory cleanup: Delete any temporary debugging or cropping artifacts with `rm` before concluding the turn.
- Process termination: Terminate all commands and dev servers before finishing execution. Do not leave background tasks running.
