# 0004 — Semantic design tokens and Phosphor icons

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner

## Context

The editor is the product. It should look deliberate, work in light and dark
themes, and meet accessibility requirements. The default look of a component
library or a stock Tailwind palette would make Krypton feel like every other
AI-generated dashboard. The icon set is part of that identity.

## Decision

- One semantic token file is the source of truth for colour, spacing, radius,
  typography, motion, and elevation.
- Colours use OKLCH and are named by role (`surface`, `text-muted`,
  `danger-strong`), not by hue.
- Light and dark themes exist from the first component. Density is a token, not a
  per-component override.
- Components must not hard-code colours. They consume semantic tokens.
- Use **Phosphor** for product icons. Do not mix icon families.
- Radix and shadcn-style primitives are implementation details. They do not
  dictate the theme.

## Alternatives considered

- **Lucide** — the safest, most familiar choice, but extremely common in
  AI-generated apps. It would work, but it does not help the product stand apart.
- **Material Symbols** — comprehensive, but visually tied to Material and heavier
  to make distinctive.
- **Tailwind's default palette** — fast to start, but it produces generic
  blue-grey dashboards and encourages colour names instead of roles.
- **Per-component colours** — flexible in the short term, impossible to audit
  for contrast or theme consistency.

## Consequences

- Stage 3 starts with tokens and a contrast check, not a canvas.
- Token names are a public contract for the UI code. Renaming one is a migration.
- Phosphor adds an icon dependency; import icons individually to avoid a large
  bundle.
- We own the visual identity, which is more work than accepting a template.

## Revisit when

- Accessibility testing finds a token pair that cannot meet WCAG 2.2 AA.
- User testing shows the interface is distinctive but hard to scan.
- A future brand direction requires a different icon family; migrate all at once.
