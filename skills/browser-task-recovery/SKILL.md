---
name: browser-task-recovery
description: Resume interrupted browser tasks and reconcile uncertain form or content submissions with saved-state readback, bounded retries and checkpoints. Use when a browser write times out, its outcome is unclear, or a paused task must continue without replaying completed work.
license: MIT
---

# Browser task recovery

Use the browser tools already available in the host. This skill supplies task guidance and original reference modules; it does not install a browser, grant permissions, run a scheduler or enforce a sandbox. Retain the user's actual task and existing authorization.

## When an action's result is uncertain

- Keep the intended write and the observation separate. A timeout or a clicked button is not a saved-state result. Record the action as `UNKNOWN` while the outcome is unresolved.
- Read the target's persisted postcondition before another write: identify the intended record, compare the relevant fields and look for an existing submission using the available host tools. Use a fresh page state and verify the actual account/origin.
- If readback confirms the intended result, mark it verified and do not replay that action ID. If readback is unavailable or inconclusive, preserve `UNKNOWN` and stop dependent mutations. A failed read is not evidence that the write failed.
- Retry only an eligible read within the task's finite budget. Do not turn an uncertain external write into an automatic retry.

Read [browser observations](references/prompts/03_browser.txt), [failure classes](references/prompts/05_retries.txt), or [completion evidence](references/prompts/08_evidence.txt) when the corresponding decision needs more detail.

## When resuming a task

Read the latest permitted checkpoint before acting. Keep completed action IDs, unresolved writes, remaining work and cumulative write/retry budgets. Reconcile unresolved writes before later mutations. A checkpoint from another account, origin or task is not authority for the current task.

For an actual long-task handoff, use [external-memory requirements](references/prompts/06_memory.txt) and [lifecycle boundaries](references/prompts/07_lifecycle.txt). The host must provide durable storage and any wake-up mechanism; do not invent a tool, background process or successful write/readback. Keep credentials and real account state out of public artifacts.

For repeated or batch work, read [cumulative risk limits](references/prompts/04_risk.txt) and keep limits across resumes, rather than treating each click as a new independent budget.

## Task-specific references

Read only the matching workflow when it helps the task:

- [Website content entry](references/workflows/content_entry.txt): field mapping and per-record readback.
- [Page data validation](references/workflows/data_validation.txt): report discrepancies without silently changing data.
- [Social operations](references/workflows/social_ops.txt): distinguish drafts, schedules and actual publication.
- [Cloud browser session](references/workflows/cloud_browser.txt): reconnect and session-reference boundaries.

Muse, Grok and Codex [integration contracts](references/integrations/) are optional host-mapping guidance, not verified connectors. Do not load every contract for an unrelated host.

## Optional full profile export

When the user wants a reusable instruction profile, the bundled Node 20+ helper writes the selected original text to stdout. Use the actual installed skill folder; it does not depend on a source checkout or write an `AGENTS.md` file.

```sh
node /path/to/browser-task-recovery/scripts/assemble.cjs --list
node /path/to/browser-task-recovery/scripts/assemble.cjs content --integration codex --workflow content_entry
```

Profiles: `minimal`, `long`, `content`, `validation`, `social`, `full`. Integration and workflow additions are optional and explicit. Base profiles match the repository CLI exactly; the current risk module is v0.1.1. Review and map the output before merging compatible guidance into a host.
