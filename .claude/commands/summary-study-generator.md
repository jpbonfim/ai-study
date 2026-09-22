---
description: Generate comprehensive theoretical lecture summaries from course materials with selective diagram extraction
---

# /summary-study-generator

You are generating theoretical summaries directly from course materials (lecture slides, notes, textbooks, and handouts) using the rules in `.agents/skills/summary-study-generator/SKILL.md`.

## Execution Steps:
1. Read `.agents/skills/summary-study-generator/SKILL.md`.
2. Check if an evaluation tag is provided (e.g. `teste-1`, `p1`, `teste-2`). If missing, pause and ask the user:
   "Please specify the evaluation tag for this summary (for example: `teste-1`, `teste-2`, or `p1`)."
3. Apply the Golden Writing Guideline:
   - Self-contained and sufficient: Teaches everything needed to solve exam problems.
   - Simple, direct, and rigorous: Correct formal nomenclature without academic pretension.
   - Practical focus: Deliver equations, transform tables, and operational criteria; skip formal proofs.
   - Sequential structure: Present prerequisites and fundamental variables first.
   - No filler introductions: Jump straight to definitions and mathematical formulas.
   - Thorough coverage: Long, exhaustive, and comprehensible explanations are encouraged.
4. Extract only strictly relevant diagrams and charts using the official script:
   `python3 .agents/skills/summary-study-generator/scripts/extract_material_images.py crop <pdf> --page <N> --output site/public/images/resumos/<subject>/<name>.png`
   Do NOT extract purely textual slides, cover pages, decorative illustrations, or logos.
5. Output destination: `archive/<subject>/resumos/<slug>.mdx` with `type: "materia"` in the frontmatter.
6. Does NOT require linking question IDs or embedding `<QuestionCard />`.
7. Appears under the "Resumo da matéria" collapsible tab in the site's sidebar.
8. Validate compilation with `npm run build` in `site/`.
