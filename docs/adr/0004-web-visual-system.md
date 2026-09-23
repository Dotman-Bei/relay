# ADR 0004 — Visual system

**Status:** accepted · 2026-09-22 · DECISIONS D-017

**Context.** `frontend.md` specifies the Bareng soft-neobrutalism grammar and lists where its reference implementation drifts (§10), and asks reusers to make the visual layer specific to their own product (§12).

**Decision.**
- Keep: the twelve tokens, the seven neo classes, three lift levels, the two-stage press, rising inputs, ink text on every fill, ink-opacity hierarchy, radius stepped by size, one highlight per headline with `box-decoration-break: clone`, at most two opposite 1° tilts per page, system font at weight 900, emoji icons, → / ↗ wayfinding, labels that turn into the reason an action can't happen.
- Fix the drift: Tailwind's default palette is removed in `@theme`, so off-system colours can't be written; errors are red fills with ink text; 3px borders everywhere; focus ring includes `textarea`, `select`, `summary`; reduced motion zeroes delays; staggers start on intersection; one brand mark (icon.svg uses the logo tile's grammar).
- Make it Relay's: one fixed colour map for lifecycle states (colour encodes state, always with words); the postmark ornament for release dates; the chain-time line under every human date, in the place Bareng puts rupiah.

**Verification.** axe-core WCAG 2.1 AA over all 17 routes at 1280 px and 390 px (`evidence/e2e/a11y.txt`); no horizontal overflow at 390 px.
