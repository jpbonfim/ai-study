---
description: Generate vector SVG and KaTeX block diagrams for control and signal processing systems
---

# /block-diagram

You are generating vector block diagrams using the rules in `.agents/skills/block-diagram-generator/SKILL.md`.

## Execution Steps:
1. Read `.agents/skills/block-diagram-generator/SKILL.md`.
2. Select appropriate preset:
   - `feedback`: Standard closed-loop system.
   - `feedback-disturbance`: Closed loop with plant disturbance input.
   - `cascade`: Series subsystems.
   - `parallel`: Parallel subsystems.
   - `direct-form-1`: IIR filter Direct Form I (zeros then poles).
   - `direct-form-2`: IIR filter Direct Form II canonical structure.
   - `fir`: Transversal tapped delay line filter.
   - `state-space`: Dynamic state space representation (A, B, C, D).
   - `custom`: Arbitrary SVG with standard CSS classes.
3. Configure KaTeX labels and mathematical expressions for inputs, blocks, and outputs.
4. Integrate the `<BlockDiagram />` component into the target MDX file.
