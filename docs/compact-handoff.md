# After compaction: restore the reminder and check the ledger

[中文](compact-handoff.zh-CN.md)

An agent sends a save. The destination changes, but the reply is lost. If the conversation is compacted now, what stops the next attempt from saving twice?

This **synthetic Node example** combines two separate pieces:

- [Codex Checkpoint](https://github.com/wcf778/codex-checkpoint), by **wcf778**, carries a manually supplied task reminder through simulated hook events.
- This repository's example controller reloads a separate action ledger, refuses a new write while the earlier one is `UNKNOWN`, and reconciles it after reading the synthetic destination.

The reminder is text, not enforcement. The no-replay behavior comes from the controller **only when the host routes the write through it and restores the correct ledger**. With an empty ledger, the synthetic control saves twice. A real host must separately protect its tools, identify the right task and account, persist its own ledger and verify the actual destination.

## Run the example

Use current source on macOS or Linux with Node 20+ and `curl`. Download the external hook from the exact upstream commit into a new temporary directory:

```sh
CHECKPOINT_DEMO_DIR=$(mktemp -d)
curl -fsSL 'https://raw.githubusercontent.com/wcf778/codex-checkpoint/162883999177bc9112cd75f648967eccdea2d768/plugins/context-checkpoint/hooks/context-checkpoint.cjs' -o "$CHECKPOINT_DEMO_DIR/context-checkpoint.cjs"
CONTEXT_CHECKPOINT_HOOK="$CHECKPOINT_DEMO_DIR/context-checkpoint.cjs" npm run demo:compact-handoff
```

Before loading the downloaded file, the example checks SHA-256 `1f19bfef7786e0231c3285153fc2da3d63c4bdb3c62d7dbc77d350389dd98dd9` and stops on mismatch. The external project is [MIT licensed](https://github.com/wcf778/codex-checkpoint/blob/162883999177bc9112cd75f648967eccdea2d768/LICENSE); its code is not bundled here. Inspect third-party code before running it. The temporary directory can be removed after use.

Expected output includes `manualSemanticRestore: true`, `unknownRetryBlocked: true`, `afterReadback: "CONFIRMED"`, `effectsWithLedger: 1`, and `emptyLedgerControlEffects: 2`.

## What was—and was not—tested

The test writes a fictional transcript, manually supplies fictional semantic state, invokes the external hook functions, and reloads this project's checkpoint in the **same Node process**. A fake in-memory destination provides the readback. It does not launch Codex or a browser, install a plugin, register hooks, read real sessions, access a business account, or prove behavior across actual compaction or process loss. The sidecar is disabled for this test. This is not exactly-once delivery or a guarantee about another host.

The example is in current source after the v0.2.6 release; the fixed v0.2.6 ZIP does not contain it.
