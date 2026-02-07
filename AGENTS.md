# AGENTS.md

## Purpose

Concrete rules for AI-assisted development in this repository.

## Rules

1. Preserve current behavior unless asked to change it.

Do: keep existing defaults and side effects unless requirements say otherwise.
Do not: silently change runtime behavior, config defaults, or public interfaces.

2. Add tests for behavior changes.

Do: add or update at least one automated test for each changed behavior.
Do not: ship logic changes without tests unless you clearly document why tests are not possible.

3. Run checks and report exact commands.

Do: run the project checks that apply to your change (tests, lint, typecheck/build).
Do not: say "it works" without listing what command was run and whether it passed.

4. Handle secrets and sensitive data safely.

Do: load secrets from environment/config and redact sensitive values in outputs.
Do not: commit tokens, credentials, private keys, or personal data.

5. Update docs when behavior or setup changes.

Do: update README/config docs when commands, setup steps, APIs, or user-facing behavior change.
Do not: leave changed workflows undocumented.

6. Escalate uncertainty and high-risk work.

Do: stop and ask for human confirmation when requirements conflict, data migration is risky, or intent is ambiguous.
Do not: guess on destructive or high-impact decisions.

## Done Criteria

A task is done when:

- Requested requirements are implemented with no unrelated changes.
- Automated tests/checks were run and commands/results are reported.
- No secrets or sensitive data were added to code, logs, or docs.
- README/docs were updated for any behavior/setup/API changes.
- Any remaining risks or limitations are explicitly listed.
