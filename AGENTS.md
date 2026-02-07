# AGENTS.md

## Purpose

This document defines standards for AI-driven software development in this repository. It applies to both human contributors and AI agents.

## Core Principles

- Prioritize correctness, security, and maintainability over speed.
- Make small, reversible, well-scoped changes.
- Prefer explicit assumptions over implicit guesses.
- Keep behavior stable unless a change is intentionally requested.
- Treat production data, credentials, and user privacy as high-risk assets.

## Standard Workflow

1. Understand the task and constraints before editing code.
2. Inspect relevant code paths, configs, and tests.
3. Propose or follow a concrete implementation plan.
4. Implement minimal changes needed to satisfy requirements.
5. Validate with automated checks and targeted manual verification.
6. Document decisions, tradeoffs, and follow-up work.

## Planning and Scope

- Define acceptance criteria before implementation.
- Identify impacted components and potential regressions.
- Call out unknowns and risks early.
- Avoid opportunistic refactors unless directly justified.

## Coding Standards

- Follow existing repository conventions (naming, architecture, formatting).
- Prefer readability and explicitness over cleverness.
- Keep functions/modules focused on a single responsibility.
- Add comments only where intent is non-obvious.
- Do not introduce dead code, placeholder logic, or hidden side effects.

## Testing and Validation

- Add or update tests for every behavior change.
- Run the narrowest useful test set during iteration; run broader suites before completion.
- Verify edge cases, failure paths, and error handling.
- Do not claim success without test evidence.
- If tests cannot run, state why and provide exact commands for maintainers.

## Security and Privacy

- Never hardcode secrets, tokens, or credentials.
- Validate and sanitize untrusted inputs.
- Use least-privilege access for integrations and tooling.
- Prefer parameterized queries and safe defaults.
- Redact sensitive information from logs, traces, and outputs.

## Dependency and Supply Chain Hygiene

- Minimize new dependencies; justify each addition.
- Pin or constrain versions according to project policy.
- Prefer well-maintained, reputable packages.
- Note licensing and security implications for new dependencies.

## Git and Change Management

- Keep commits focused and atomic.
- Write clear commit messages explaining what changed and why.
- Do not rewrite history on shared branches without explicit approval.
- Avoid unrelated file churn in the same change set.

## Code Review Expectations

- Review for correctness, regressions, security, performance, and maintainability.
- Include file/line references for findings.
- Mark severity and required follow-up clearly.
- Block merges for unresolved high-severity issues.

## Documentation Requirements

- Update relevant docs when behavior, API, config, or operations change.
- Document assumptions, limitations, and migration steps.
- Keep runbooks and setup instructions executable and current.

## Observability and Operations

- Ensure new features emit useful logs/metrics/traces where appropriate.
- Keep alerts actionable with clear ownership and remediation steps.
- Design for safe rollback and graceful degradation.

## Performance and Reliability

- Define performance expectations for critical paths.
- Avoid unnecessary allocations, network calls, or blocking operations.
- Consider concurrency, retries, idempotency, and timeout behavior.

## AI-Specific Guardrails

- Do not fabricate APIs, files, commands, or test results.
- Verify generated code against local repository reality.
- State assumptions and confidence when uncertainty exists.
- Prefer deterministic, auditable steps over opaque automation.
- Escalate to a human when requirements conflict, risk is high, or intent is ambiguous.

## Definition of Done

A task is complete only when:

- Requirements are implemented and scoped correctly.
- Relevant tests pass (or limitations are explicitly documented).
- Security/privacy implications are addressed.
- Documentation is updated.
- Outstanding risks and follow-ups are clearly listed.
