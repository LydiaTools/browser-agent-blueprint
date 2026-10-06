# Prompt contracts and host controls

The model proposes an action. The host validates scope and parameters, records
the intended dispatch, executes through a fixed adapter, reads the postcondition
and stores the result. Page observations cannot authorize another action.

```text
Trusted task scope + selected .txt modules
                 |
             Model proposal
                 |
  Host scope / account / budget / unknown-write gate
                 |
        Browser adapter -> observation
                 |
        Independent saved-state read
                 |
  Ledger -> external checkpoint -> host wake / manual resume
```

## Responsibility boundary

| Capability | Prompt responsibility | Host responsibility |
|---|---|---|
| Concise narration | Suppress filler in agent narration | Optional renderer/linter; preserve user content |
| Per-call risk | Identify effects and report material risk | Allowlist, budgets, scoped approval and dispatch checks |
| Retries | Classify and choose safe next step | Enforce persisted budgets and scheduling |
| Long tasks | Summarize verified state and request pause | Atomic storage, locks, telemetry, fresh-session resume |
| Modules | Request relevant trusted modules | Assemble, version and constrain loading |
| Evidence | Demand matching postconditions | Actual browser reads and evidence retention |

## Implemented in the demo

A deterministic controller checks exact local origin/account, action allowlist,
cumulative write counts, expired scope and unknown writes. It writes and reads
a hashed checkpoint, denies action-ID replay, and retries classified reads.
A real browser runs a local synthetic fixture. Separate prepare/resume commands
terminate the first process and restore the synthetic record in a second one.

## Deliberately outside the demo

No model is called. No scheduler, context telemetry, distributed lease, full
failure-classification engine, production database, arbitrary browser adapter,
login/session manager or vendor connector is implemented. The controller keeps
its ledger in memory until explicit checkpointing; it is **not crash-safe between
a write and the next checkpoint**. A production dispatcher must durably record
DISPATCHED before the request, handle crash windows, use scoped idempotency,
check actual browser account/origin and enforce locks. The digest detects
accidental corruption; someone who can rewrite the file can recompute it.

This small demo cannot prove prompt injection resistance or model compliance.
It proves that fixed host controls do not accept page text as authorization.
All browser state exported by this demo is synthetic localStorage. Real cookies
and authenticated state need separate protected host storage, never public files.
