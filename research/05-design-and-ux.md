# 05. Design and UX: how we earn "better look and feel"

Honest framing: "better looking than n8n" is not won by a nicer colour palette. It is won by a faster, clearer editing loop and a small number of details done with care. Labels: **[S]** sourced, **[R]** recommended, **[V]** verify.

## 1. Where n8n-style tools are weakest (our openings)

From the research (competitor claims, so check them against real use) **[S]**: debugging means opening node after node and reading raw JSON. So our design priorities, in order:

1. **Data is visible.** Every node shows its last input and output on the canvas or in a pinned bottom panel, as a readable table, JSON tree or schema view, with the ability to pin test data.
2. **Errors are readable.** "Node `Send email` failed on item 3: field `to` is empty. It came from `Set` item 3." Our `meta.sourceNode` and `sourceItemIndex` make this possible.
3. **Runs are comparable.** Pick two runs, see which nodes differ.
4. **Editing is keyboard-first.** Add node, connect, rename, run, undo, all without a mouse.
5. **The canvas stays calm.** Few colours, strong alignment, clear state.

## 2. Design tokens (Tailwind 4 `@theme`, OKLCH, CSS variables)

Define tokens first, components second. One file, `packages/ui/tokens.css`, **[R]**:

- **Colour**: neutral scale (background, surface, raised, border, text, muted), one brand hue, semantic states (success, running, error, warning, paused), all in OKLCH with light and dark values. Node states must differ by more than colour (icon + label + motion) so colour-blind users can read them.
- **Type**: one sans for UI, one mono for data and code. Fixed scale, tabular numbers for counts and timings.
- **Space and radius**: a 4px grid; two radii (control, card); one shadow for floating elements.
- **Motion tokens**: three durations and two easings (see §4).
- Support light and dark from day one. Test contrast (WCAG 2.1 AA) in both.

The Tailwind v4 design-system skill, the shadcn skill, and `shadcn init --preset` give agents the vocabulary. Lock tokens in an ADR so agents stop inventing new greys.

## 3. The canvas

Built on React Flow with React Flow UI components, then restyled **[S]**.

**Node design**
- A node is a small card: icon, name, one-line summary of its config, a status dot, ports. Keep it under ~200px wide so graphs breathe.
- Status states: idle, queued, running (subtle animated progress, not a spinner), succeeded (item count), failed (error chip), skipped, pinned.
- Ports labelled on hover. Branching nodes show their branch names.
- Selected node reveals a floating toolbar (run this node, disable, duplicate, delete) near the node, not far away in a menu.

**Edges**
- Smooth step or bezier, consistent routing, an item-count label while or after running, animated dash only on the edge currently carrying data.

**Interaction**
- Command palette (`/` or `Cmd+K`) to add nodes by name and run actions. Drag from a handle into empty space opens the palette filtered to compatible nodes.
- Multi-select, copy and paste, undo and redo across the whole graph, snap to grid, tidy-up with an auto-layout button **[V elkjs]**.
- Minimap and zoom controls, and a "fit to selection".
- Right panel for the selected node's config, resizable. Bottom panel for input, output, logs. Resizable panels come from shadcn **[S]**.
- Autosave with visible state ("Saved", "Saving", "Offline, retrying") and versioned publish.

**Config forms** are generated from each node's Zod schema, with field types for expression, credential picker, code, key-value list, and a live preview of the resolved expression value using the last run's data.

## 4. Motion rules (use Emil Kowalski's skill for the details)

Principles that apply broadly **[R]**, to be refined by his skill:
- Motion explains state change. If it does not help the user understand what happened, remove it.
- Fast: UI feedback under about 200ms, larger transitions under about 300ms. Ease-out for entering, ease-in-out for moving. No bounce on utility screens.
- Animate transform and opacity, not layout properties (GSAP's performance skill says the same).
- Respect `prefers-reduced-motion`: swap movement for fades or nothing.
- No animation inside the canvas hot path that re-renders many nodes. Prefer CSS on individual nodes.
- Tools: CSS transitions first; Motion for presence and layout in React **[V]**; GSAP for the marketing site and onboarding timelines **[S]**.

## 5. States people forget (budget time for them)

Empty workflow, empty node list, first run, loading a large workflow, offline, save conflict, permission denied, long error, huge payload (virtualised, truncated with "show more"), unknown node type (workflow saved with a node we no longer ship), version mismatch.

## 6. Accessibility

Keyboard reachability for every canvas action, visible focus, roles and labels on custom nodes, screen-reader text for statuses, no colour-only meaning, reduced motion. Use Addy's `accessibility-checklist` reference and axe checks in Playwright **[V]**. Canvas accessibility is hard; ship a list view ("outline mode") of the same workflow as a fallback that is fully accessible.

## 7. Look and feel checklist for Stage 6

- [ ] One distinct node icon set and a recognisable node silhouette
- [ ] Tokens only; zero hard-coded colours (a lint rule can enforce this)
- [ ] Light and dark pass contrast checks
- [ ] Every interactive element has hover, focus, active, disabled states
- [ ] Skeletons instead of spinners for page loads
- [ ] Empty states with one clear next action
- [ ] Reduced-motion mode tested
- [ ] Pointer, touch and keyboard all work on the canvas basics
- [ ] A short onboarding flow that builds a first workflow in under two minutes

## 8. Performance budgets (targets to measure, not facts) **[V]**

| Metric | Target |
|---|---|
| Drag a node on a 300-node graph | Holds 60fps on a mid-range laptop |
| Open a 500-node workflow | Interactive in under 2s |
| Editor JS on first load | Under about 300KB gzipped, code-split by route |
| Keystroke to canvas update | Under 50ms |
| Run status event to visible node change | Under 100ms |

Measure with the Playwright FPS harness and React Profiler in Stage 3 and set real numbers then.
