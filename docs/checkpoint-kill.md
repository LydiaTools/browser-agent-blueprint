# Kill a worker while it publishes a checkpoint

The earlier [browser snapshot experiment](crash-boundaries.md) kills a worker
before or after a completed export. A [reader's follow-up](https://x.com/lastbrowser/status/2113390616713593177)
asked about killing during the write. This additional experiment checks the
example host's **checkpoint file publication**, separately from browser storage.

## Run

Use current source on macOS or Linux with Node 20 or newer:

```sh
npm run demo:checkpoint-kill
```

No package installation, browser, model, credentials or service is needed for
this command. It writes its report to `runs/checkpoint-kill.json` and removes
its temporary test files. This is a current-source addition after the fixed
v0.2.2 release; it is not included in that release ZIP.

## What the seven cases check

Each case starts a disposable writer, waits for an observable filesystem
boundary, sends actual `SIGKILL`, verifies that exit signal, and starts a
different Node process to read the published checkpoint. With a prior file,
revision 1 contains `DISPATCHED`; the attempted revision 2 contains `CONFIRMED`.

| Writer stopped at | Prior checkpoint | Expected fresh read |
| --- | --- | --- |
| Halfway through direct overwrite (negative control) | Revision 1 | Invalid JSON rejected |
| Halfway through temporary-file write | Revision 1 | Exact revision 1 retained |
| File fsync completed, rename not started | Revision 1 | Exact revision 1 retained |
| Rename completed | Revision 1 | Exact revision 2 |
| Halfway through temporary-file write | None | Missing checkpoint; no recovery state accepted |
| File fsync completed, rename not started | None | Missing checkpoint; no recovery state accepted |
| Rename completed | None | Exact revision 2 |

The experiment calls the existing `writeCheckpoint` and `readCheckpoint`.
It compares accepted file bytes with the entire expected envelope, including
the checksum, task identity, revision and ledger. An unpromoted `.tmp` file
is counted as an orphan and never selected as the checkpoint.

A fresh reader also tries the same operation with a new action ID. Both the
old `DISPATCHED` and new `CONFIRMED` journal must block the executor, with
zero persistence callbacks and zero target calls. A missing or invalid file
does not authorize a replay. The experiment does not contact a business service.

## Deterministic injection

Only the disposable writer intercepts the named `node:fs` function. For the
partial-write cases, it replaces `fs.writeFileSync` with a real `fs.writeSync`
of the first half of the serialized bytes, signals readiness over a dedicated
pipe, then stops progressing until the parent kills it. The fsync and rename
cases pause immediately after those real filesystem calls return. Production
writer code and its public API are unchanged.

This makes the publication boundaries repeatable. It does not interrupt a
random native write syscall or reproduce every filesystem failure. In
particular, this does not test browser localStorage disk flush, browser death,
remote-service commits, machine power loss or exactly-once delivery. The
writer fsyncs the file, not its parent directory. A killed process can leave
a temporary file; the experiment cleans only its own temporary directory.

## Inspect evidence

`npm test` runs the seven cases as a regression check. The **Checks** workflow
uploads `checkpoint-file-kill-evidence` separately from the browser artifacts.
Inspect its commit SHA and actual report; a green workflow covers the stated
cases, not a general durability rate. The report includes the writer/reader
PIDs, confirmed exit signals, accepted revisions, final file hashes and
unpromoted-file counts.

See [the Chinese guide](checkpoint-kill.zh-CN.md) for the same steps.
