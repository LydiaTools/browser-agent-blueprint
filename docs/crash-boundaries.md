# What survives when the worker is killed?

The ordinary `demo:prepare` / `demo:resume` run exits normally after exporting
its synthetic browser state. That is useful, but a different experiment from
killing the worker before it finishes exporting.

This experiment follows a [community test suggestion](https://x.com/i/status/2111485872872804750).
It uses the existing fixture, a known record ID (`fixture-001`), an actual
`SIGKILL`, and a fresh Node process for each readback. No account or model is used.

## Run it

Use current repository source after the normal dependency/browser setup:

```sh
npm run demo:crash-boundaries
```

On macOS/Linux with a compatible installed Chrome:

```sh
BLUEPRINT_BROWSER_CHANNEL=chrome npm run demo:crash-boundaries
```

The experiment requires macOS or Linux. It saves a fresh report to ignored
`runs/crash-boundaries.json`. The fixed v0.1.1 ZIP predates this addition;
use current source. CI also runs the command and uploads its actual report.

## Two boundaries, two expected results

| First worker | What the fresh process imports | Expected restored record |
|---|---|---|
| Save, reload and verify; killed **before** exporting storage | No snapshot; new isolated context | **0** records; no Save replay |
| Save, reload and verify; export storage; then killed | The completed synthetic snapshot | **1** matching record; save count **1**; no Save replay |

Both first workers read back one saved record before being killed. The parent
checks that they actually exit with `SIGKILL`, rather than a normal exit code.
The reader has a different PID, never clicks Save, and reads localStorage and
the fixture's displayed count. The after-export case also compares the full
record's ID, title, body and count with the first worker's readback.

The before-export result is deliberately **zero**: without a snapshot, this
fresh context has no state to restore. An acknowledgement in one process
does not supply a recoverable copy to another.

## What this experiment measures

The parent owns a temporary browser server and loopback fixture. A Node worker
connects to it with a fresh isolated browser context. After the worker is
killed, another worker opens another isolated context, importing a snapshot
only when one was exported. Temporary snapshots and browser profiles are
cleaned up at the end.

This isolates the explicit export boundary. It does **not** kill the browser
process, measure when the browser flushes localStorage to disk, simulate a
power failure, or test the original runner's checkpoint-ledger transaction.
The file write is not an `fsync`/power-loss durability guarantee. There is no
claim that a missing snapshot proves the original browser lost its record.

For a live service, recovery must read the actual target record by a stable
identity. An absent local snapshot cannot establish whether a remote write
committed, and it is not a reason to submit the write again.

## Recorded run

[Actual macOS report](examples/crash-boundaries-macos.json), 2026-10-20:
Node 22.23.0, Chrome 155.0.8059.85. Restored counts were **0 / 1**;
both replacement workers performed **0** Save calls. This is one synthetic
local run, not an external trial or a reliability rate. Inspect the latest
GitHub Actions artifact separately for its Linux result.
