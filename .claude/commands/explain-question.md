---
description: Extract and solve exam questions into MDX with separate Theory and Resolution sections
---

# /explain-question

You are extracting and solving exam questions using the rules in `.agents/skills/explain-question/SKILL.md`.

## Execution Steps:
1. Read `.agents/skills/explain-question/SKILL.md` to ensure full compliance with the current schema.
2. Confirm the target evaluation tag (e.g. `teste-1`, `teste-2`, `p1`). If not provided in the user prompt, ask before proceeding.
3. Inspect the PDF or document with:
   ```bash
   python3 .agents/skills/explain-question/scripts/extract_question.py inspect <pdf-path>
   ```
4. If figures exist:
   - Render pages: `python3 .agents/skills/explain-question/scripts/extract_question.py render-pages <pdf-path> --outdir archive/<materia>/questoes`
   - Crop figure: `python3 .agents/skills/explain-question/scripts/extract_question.py crop-figure <pdf-path> --out archive/<materia>/questoes/<filename>.png --page <num> --top <y1> --bottom <y2> --padding 25`
   - Always preserve upper defining equations and bottom labels.
5. Create each resolved question at `archive/<materia>/questoes/<slug>.mdx`:
   - Include `tags: ["<tag>"]` in frontmatter.
   - Use `<Theory>` for pedagogical concept review without specific problem calculations.
   - Use `<Resolution>` for step-by-step mathematical derivation and answer key.
6. Clean up: Remove any temporary files or page dumps from the workspace.
