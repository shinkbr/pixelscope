# AGENTS.md

## Purpose

Concrete rules for AI-assisted development in this repository.

## Rules

1. Preserve current behavior unless asked to change it.

- DO: keep existing defaults and side effects unless requirements say otherwise.
- DO NOT: silently change runtime behavior, config defaults, or public interfaces.

2. Add tests for behavior changes.

- DO: add or update at least one automated test for each changed behavior.
- DO NOT: ship logic changes without tests unless you clearly document why tests are not possible.

3. Run checks and report exact commands.

- DO: run `npm run format`, `npm run lint`, `npm run test`, and `npm run build` for changes, and report exact commands/results.
- DO NOT: say "it works" without listing what command was run and whether it passed.

4. Handle secrets and sensitive data safely.

- DO: load secrets from environment/config and redact sensitive values in outputs.
- DO NOT: commit tokens, credentials, private keys, or personal data.

5. Update docs when behavior or setup changes.

- DO: update README/config docs when commands, setup steps, APIs, or user-facing behavior change.
- DO NOT: leave changed workflows undocumented.

6. Escalate uncertainty and high-risk work.

- DO: stop and ask for human confirmation when requirements conflict, data migration is risky, or intent is ambiguous.
- DO NOT: guess on destructive or high-impact decisions.

## Done Criteria

A task is done when:

- Requested requirements are implemented with no unrelated changes.
- `npm run format`, `npm run lint`, `npm run test`, and `npm run build` were run and commands/results are reported.
- No secrets or sensitive data were added to code, logs, or docs.
- README/docs were updated for any behavior/setup/API changes.
- Any remaining risks or limitations are explicitly listed.
