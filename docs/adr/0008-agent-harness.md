# 0008 — OpenCode-only agent harness

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner

## Context

The project is developed with OpenCode only. Agents need project-specific rules,
advisory review roles, and a reproducible set of skills. Global installs and
per-machine prompts make work hard to reproduce and easy to drift.

## Decision

- Use OpenCode V2 as the only agent harness.
- Put project agents in `.opencode/agents/*.md` and project skills in the
  location OpenCode discovers. The `skills@1.7.2` CLI installs the selected packs
  into `.agents/skills/`; that directory is ignored by git.
- Commit `skills-lock.json` with source and hash information. Restore with
  `bun run skills:install`; list with `bun run skills:list`.
- Load `AGENTS.md` automatically. Add `CONSTRAINTS.md` and `docs/GLOSSARY.md`
  through `opencode.jsonc` so every session gets the quality bar and vocabulary.
- Start with four advisory subagents: `code-reviewer`, `security-auditor`,
  `test-engineer`, and `explainer`.
- Subagents report findings. They do not edit files, execute repository
  scripts/tests, launch other agents, or approve changes. Their frontmatter
  denies `edit`, `shell`, and `subagent`; only exact read-only Git commands are
  allowed. Repository scripts are PR-controlled code; a reviewer that runs them
  is not read-only. Preventing a reviewer from launching `general` or `explore`
  matters because the child uses its own permissions. The main session runs the
  gate and provides the output. A human decides.
- Do not install skills or tools globally. If a tool cannot be project-local,
  ask first.

## Alternatives considered

- **Claude Code, Codex, or Cursor** — not allowed for this project.
- **Global skills** — simpler for one machine, but not reproducible and easy to
  forget which version is active.
- **One giant prompt** — no isolation, no tool restrictions, and no way to run a
  focused review.
- **Committing the installed skill files** — reproducible without network, but it
  adds third-party scripts we have not audited. The lockfile is the smaller,
  auditable artifact.

## Consequences

- The skill packs are third-party code. Review a skill before trusting it, and
  review updates rather than auto-accepting them.
- `bun run skills:install` needs network access because it fetches each source.
- Agent permissions are part of the review surface. A read-only reviewer that can
  edit files, run PR-controlled scripts, or launch a writable subagent is a bug.
  `scripts/check-agent-permissions.test.ts` asserts that all four advisory roles
  deny `edit`, `shell`, and `subagent` in their frontmatter.
- Model tiers are inherited from the primary session until a provider is chosen.
  Security and review roles should use a strong model when that choice is made.

## Revisit when

- OpenCode changes skill discovery or agent permissions.
- A skill update changes behavior in a way that matters.
- A review finds that the read-only roles need another tool.
