# Branch protection

Apply these settings after the first push to GitHub. The repository must have a
remote and the CI workflow must have run at least once, otherwise the required
checks cannot be selected.

## Required settings

- Protect `main`.
- Require a pull request before merging.
- Require at least **1 approval**.
- Dismiss stale approvals when new commits are pushed.
- If a `CODEOWNERS` file is added, require review from Code Owners.
- Require status checks: `check`, `e2e`, `build`.
- Require branches to be up to date before merging.
- Require conversation resolution.
- Require linear history.
- Block force pushes.
- Block branch deletion.
- Include administrators. The payload below enforces this. Remove that setting
  only through a documented solo-maintainer exception, never to bypass review.

## Apply with GitHub CLI

Replace `OWNER/REPO` first. This needs admin access and a GitHub remote.

```sh
gh api -X PUT repos/OWNER/REPO/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["check", "e2e", "build"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "required_linear_history": true
}
JSON
```

## Solo-maintainer note

If you are the only maintainer, GitHub will not let you approve your own pull
request. Do not disable review permanently to work around this. Use a second
account or a trusted reviewer. If neither exists, document a one-time admin
bypass in the PR and restore the protection rule immediately. Reading your own
diff is not the same as a review.

## Verify

```sh
gh api repos/OWNER/REPO/branches/main/protection | jq
```

The `check` job includes the guardrails and the deleted-test check. If a required
check is renamed, update both the workflow and this protection rule in the same
change.
