## Summary

<!-- What changed, and why? Link the issue or decision if there is one. -->

## Test plan

<!-- Show the commands you ran and the evidence they passed. -->

- [ ] `bun run check`
- [ ] `bun run e2e` (if this touches the browser or the smoke path)
- [ ] New behaviour has a failing-first test, or the PR explains why not
- [ ] Snapshot changes were inspected, not accepted blindly

## Risk and rollback

<!-- What could break? How would we notice? How do we undo it? -->

## Reviewer walkthrough

<!-- Point the reviewer at the files that matter, in reading order. -->

1.
2.
3.

## Checklist

- [ ] Boundaries and engine purity are respected.
- [ ] No `any`, non-null assertions, or unjustified casts.
- [ ] No skipped/deleted tests or weakened assertions.
- [ ] No `@ts-ignore`, `eslint-disable`, or `oxlint-disable`; exceptions are in
      `scripts/guardrails-allowlist.json` with a reviewed reason.
- [ ] No secrets, credentials, or personal data in code, logs, fixtures, or
      screenshots.
- [ ] Docs, glossary, or ADR updated when behaviour or a decision changed.
- [ ] New dependencies are pinned, licence-compatible, and at least two weeks old.
- [ ] Container changes work with Podman locally and Docker in CI.
- [ ] A human has read the diff and approves the merge.

## Agent disclosure

<!-- Which agents or skills were used? What did they review, and what did you verify yourself? -->
