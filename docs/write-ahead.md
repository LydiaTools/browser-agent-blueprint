# Save once. Recover by reading.

[中文](write-ahead.zh-CN.md) · [Runnable source](../demo/write-ahead.cjs)

A browser can finish Save while its worker dies before recording success.
The new worker must first discover what happened at the destination.
This demo keeps the local destination running while it kills the browser
worker. **Every Save adds a row**: the destination has no deduplication.

## Run it

Current source or the v0.2.2 bundle, Node 20+, macOS/Linux:

```sh
npm install
npx playwright install chromium
npm test
npm run demo:write-ahead
```

On Linux, use `npx playwright install --with-deps chromium` when needed.
The runner selects an available loopback port, creates synthetic records and
fresh browser contexts, and exits when finished. It never uses an existing
profile. Windows SIGKILL execution is not supported by this runner.

## Check the evidence

| Case | Intervention | Expected readback |
|---|---|---|
| `before-write` | Kill after DISPATCHED is flushed, before Save | Fresh read records `absent`; a reviewer marks `not_landed` before a separate retry |
| Explicit ABSENT retry | Separate worker, same operation/hash, new attempt ID | 1; another reservation is consumed |
| `after-write` | Kill after target saved, before confirmation | Fresh read records `present`; a reviewer marks `landed`, without saving again |
| Failed recovery read | Target returns HTTP 503 | Remain DISPATCHED; failure is not absence |
| `completed` | Fresh worker from confirmed state | Still 1; a new action ID cannot replay the operation |
| `unguarded-control` | Deliberately bypass controller for two Save clicks | 2; the target does not deduplicate |

Read `runs/write-ahead-report.json`. The corresponding
`runs/write-ahead-<time>-<id>/` directory retains initial, after-kill and
after-resume checkpoints, destination snapshots and screenshots. The after-write
case also preserves state after its failed recovery read. ABSENT does not
automatically trigger a retry: that is a separate caller-selected phase. The
recovery runner writes the readback as `PENDING_REVIEW` before applying a
fixture-supplied review decision; its reviewer label is synthetic, not authenticated.

![Fresh recovery browser reads one saved synthetic record.](../assets/write-ahead-desktop.png)

Unedited desktop and [mobile captures](../assets/write-ahead-mobile.png) are from
[CI 39502435888](https://github.com/LydiaTools/browser-agent-blueprint/actions/runs/39502435888),
commit `ada2f4d461538e0ccd8cc51b9975da780f0d0aca`. That run passed the three protected
cases and read-failure injection. Later additions (negative control and retained
intermediate snapshots) must be checked in the [current CI](https://github.com/LydiaTools/browser-agent-blueprint/actions/workflows/ci.yml);
they are not results from the earlier capture. No model or social account was used.

## Host contract

`new Controller(scope, savedLedger, { persist, requireHumanReview: true })` enables strict recovery.
It requires durable persistence and an operation ID, payload SHA-256 and durable payload reference on each write.
The controller awaits `persist(clonedLedger)` with **DISPATCHED before execute**,
then awaits persistence of CONFIRMED, UNKNOWN or FAILED. The callback must
complete storage before resolving. The demo uses `writeCheckpoint`: file fsync,
atomic rename and checksum readback. Without the callback, behavior stays in memory.

Supply `operation_id`, `payload_sha256` and `payload_ref` on every write attempt.
Generate the operation ID before the first attempt; reload it on recovery. Hash
the exact trusted payload with the same serialization each time. The reference
must resolve to the same immutable approved payload after restart. The demo stores
its non-sensitive synthetic payload snapshot in the checkpoint and binds a
business record reference. Keep production secrets out of checkpoints; use a
protected host store and persist only its opaque payload reference and hash.

The ledger binds payload hash, origin, account, action kind and affected count.
Changed bindings are rejected. A new action ID cannot bypass a recorded
operation; only prior ABSENT attempts permit a caller-selected new attempt.
Reservations remain consumed. Legacy actions without the metadata do not gain
operation-level replay protection. This depends on the host consistently reusing
the same operation and ledger; a new unrelated journal cannot provide this protection.

In strict mode, save the independent read before deciding:

```js
await controller.recordRecoveryObservation(actionId, {
  outcome: 'present', // or 'absent' / 'inconclusive'
  source: 'destination-read',
  reference: '/records?reference=draft-1',
  observed_at: new Date().toISOString(),
  evidence_sha256: sha256OfTheReadback,
});
await controller.reviewAndReconcile(actionId, {
  decision: 'landed', // or 'not_landed' / 'unresolved'
  reviewer: authenticatedReviewerId,
  reason: 'Matched the destination record to the approved draft.',
  reviewed_at: new Date().toISOString(),
});
```

Writes remain blocked in `PENDING_REVIEW`. `landed` must match a `present` read;
`not_landed` must match `absent`; `unresolved` stays blocked. Strict mode rejects
the older boolean reconciliation methods. Failed reads, incomplete pagination,
ambiguous identity or mismatched content are not evidence of absence. The host
must authenticate the reviewer and call the method only from its human-review
flow; this library records the supplied reviewer value but cannot authenticate
a person by itself. The demo checks successful reads, counts and exact synthetic
titles.

Persistence failure freezes the instance: inspect storage and reload verified
state before further dispatch. Persisted calls must be sequential; overlap is rejected.

## Boundaries

This is host logging and human-review gating, **not server-side idempotency or
exactly-once delivery**. One parent owns the task and starts sequential workers.
The destination lives in that parent: it survives worker death, not its own death.
There is no concurrent-host lock, lease, real account check, production adapter,
distributed transaction or power-loss test. The file is fsynced; its parent
directory is not. A checksum detects corruption, not malicious rewriting.
Use a destination read that can establish business-record presence or absence,
plus destination-supported idempotency and host locking where available.
The original snapshot demos remain separate. Passing synthetic CI proves only
the cases it executes, not model behavior or production reliability.
