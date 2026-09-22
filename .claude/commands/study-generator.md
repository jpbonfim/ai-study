---
description: Generate complete theoretical study notebooks organized by evaluation tag
---

# /study-generator

You are generating theoretical study notebooks using the rules in `.agents/skills/question-study-generator/SKILL.md`.

## Execution Steps:
1. Read `.agents/skills/question-study-generator/SKILL.md`.
2. Check if an evaluation tag is provided (e.g. `teste-1`, `p1`, `teste-2`). If missing, pause and ask the user:
   "Please specify the evaluation tag for this study notebook (for example: `teste-1`, `teste-2`, or `p1`)."
3. Apply the Golden Writing Guideline:
   - Self-contained and sufficient: Teaches everything needed to solve exam problems.
   - Simple, direct, and rigorous: Correct formal nomenclature without academic pretension.
   - Practical focus: Deliver equations, transform tables, and operational criteria; skip formal proofs.
   - Sequential structure: Present prerequisites and fundamental variables first.
   - No filler introductions: Jump straight to definitions and mathematical formulas.
   - Thorough coverage: Long, exhaustive, and comprehensible explanations are encouraged.
4. Output destination: `archive/<subject>/resumos/<slug>.mdx`.
5. Ensure frontmatter includes `tags: ["<tag>"]` and links relevant question IDs in `relatedQuestions`.
6. Embed `<QuestionCard id="..." />` and `<BlockDiagram />` at strategic points.
7. Validate compilation with `npm run build` in `site/`.
