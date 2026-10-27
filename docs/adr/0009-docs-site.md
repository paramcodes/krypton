# 0009 — Documentation site: Starlight

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner

## Context

Krypton needs public docs that a self-hoster can navigate without a build step,
plus a guided tour and generated node reference. The site must support search,
dark mode, code samples, and eventually versioning. The editor is planned to use
Vite and React; adding a second application framework has a cost.

## Decision

Use **Starlight** (Astro) for the documentation site.

- Authored content lives in `docs/` so it is readable on GitHub and reusable by
  agents.
- The site app lives in `apps/docs/` and is installed in Stage 9.
- Organise content with Diátaxis: tutorials, how-to, reference, explanation.
- Add a `learn-by-reading/` guided tour and a generated node reference later.
- Keep the docs build independent of the product runtime. Docs must be buildable
  without starting the API or database.

## Alternatives considered

- **Docusaurus** — React-based and mature, but heavy and opinionated about its
  own routing and build. It would add more surface than the docs need.
- **Fumadocs** — excellent Next.js documentation primitives, but it adds Next.js
  as a second application framework alongside the planned Vite editor.
- **Plain Markdown on GitHub** — zero build, but no search, no versioned site,
  and a weaker learning path for non-developers.
- **A custom docs page in the product app** — tempting, but couples docs deploys
  to the product and makes offline reading worse.

## Consequences

- Astro is a docs-only dependency. It does not enter the API, worker, or editor
  bundles.
- Content can be written and reviewed before the site exists. Stage 0 starts with
  Markdown in `docs/`.
- Versioned docs and generated reference remain open work for Stage 9.
- If Starlight cannot support the generated reference cleanly, the content is
  still portable to another Markdown-based generator.

## Revisit when

- The generated node reference needs behavior Starlight cannot provide.
- Docs build time or dependency weight becomes a problem.
- The product adopts a framework that makes another generator clearly cheaper.
