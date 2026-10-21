# Changelog

## 0.2.2 — 2026-10-21

- Added an opt-in strict recovery mode that records destination-read evidence as `PENDING_REVIEW` and blocks further writes until a matching review decision is persisted.
- Bound strict writes to an operation ID, payload SHA-256 and durable payload reference; changed payload references are rejected on retry.
- Recorded review identity, decision, reason, timestamp and referenced observation. The host must authenticate that identity; the sample uses a synthetic reviewer and does not implement authentication.
- Extended the real SIGKILL/Playwright demo to exercise `present` and `absent` recovery, the pending-review write block, and explicit review decisions.
- Updated the original retry and checkpoint prompts and the self-contained Agent Skill. No model or live-service trial was run.

## Current source — 2026-10-21

- Self-contained `browser-task-recovery` Agent Skill with selective original references, Codex UI metadata, an isolated-install helper and the MIT notice.
- Three resource/isolation/failure cases and a real project-scope skills@1.7.4 installer check. This verifies packaging and output, not model behavior, directory ranking or adoption.
- Risk module v0.1.1 treats disabled/read-only page controls as constraints and documents the normal-UI prerequisite path and stop condition, prompted by [Browser Use #6068](https://github.com/browser-use/browser-use/issues/6068).
- The example controller now has an explicit pre-dispatch test rejecting an `evaluate` action; this does not prove another host withholds direct browser tools or that a model follows the prompt.
- Existing release snapshots remain fixed; v0.2.2 adds the human-reviewed recovery flow described above.

## 0.2.1 — 2026-10-21

- Updated the risk prompt with a concrete disabled/read-only control boundary, visible-prerequisite path and stop condition.
- Added a regression test that the local host allowlist rejects `evaluate` before the executor is called.
- Regenerated the browser builder and portable Agent Skill from the tracked prompt source. No LLM or live browser-agent behavior benchmark was run.

## 0.1.1 — 2026-10-20

- English/Chinese task-profile builder: preview, copy and download original instructions without Node or a model API.
- Six base profiles match the CLI exactly; integration contracts and workflows are explicit optional additions. Prompt module text remains v0.1.0 and live-host integration remains unverified.
- Included-source list, UTF-8 bytes and output SHA-256, manual clipboard fallback, and direct offline file support. No uploads or analytics in the builder.
- Four assembly/source parity cases and six actual browser workflow groups added. Original v0.1.0 release remains unchanged.

## 0.1.0 — 2026-10-06

- Twelve original plain-text prompt modules and six static assembly profiles.
- Four workflow templates and three explicitly untested integration contracts.
- Local browser demonstrations of verified saves, batch gates, unknown writes,
  read recovery and manual cross-process checkpoints.
- Twenty-two host-control unit tests, explicit evaluation boundaries and MIT license.
- English/Chinese onboarding, launch drafts and a first-week distribution plan.
