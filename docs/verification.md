# Recorded local verification

Date: 2026-10-06 (Asia/Shanghai). Release candidate: v0.1.0.

Environment: macOS arm64, Node.js 22.23.0, bundled Playwright 1.62.1,
an installed Chrome launched headlessly with a new isolated context.
No logged-in browser profile or external account was used.

| Check | Observed result |
|---|---|
| `node --test tests/*.test.cjs` | 22 passed, 0 failed |
| `node demo/run.cjs` | Five browser scenarios plus checkpoint write/readback passed |
| `node demo/run.cjs --phase prepare` | Saved one record, read it after reload, wrote checkpoint, exited |
| `node demo/run.cjs --phase resume` | New process restored state; save count remained 1; duplicate action ID denied |
| `node scripts/assemble.cjs content` | 11 modules, 16,431 UTF-8 bytes; assembled successfully |
| `node scripts/metrics.cjs` | 12 prompt files, 4 workflow templates, 3 integration contracts, 280 prompt lines |
| Visual inspection | Desktop and phone fixture screenshots reviewed; synthetic content clearly labeled |

The local checks used an existing bundled dependency via `NODE_PATH`.
A clean local `npm install` was **not verified**: this machine's registry
connection failed certificate validation. Certificate checks were not disabled.
The committed GitHub Actions workflow performs a fresh install and reruns
the checks; inspect its actual result rather than treating the workflow file
as a successful run. No model API or vendor browser integration was evaluated.

## Clean cloud installation

[GitHub Actions run 37391838981](https://github.com/LydiaTools/browser-agent-blueprint/actions/runs/37391838981)
completed successfully on 2026-10-06 against commit
`83596980d52a7c81a2fdea4f9ffff7a3405c3ef1`.
Both jobs passed in fresh Ubuntu environments with Node.js 22:
`npm install --ignore-scripts`, 22 unit tests, inventory and assembly checks,
fresh Chromium installation, the all-in-one demo, prepare, and separate-process
resume. This verifies the documented install path in that environment.
It does not verify any LLM or named cloud-browser service.

Counts are inventory/test facts, not reliability or token-saving percentages.
Screenshots in `assets/` show the one-save synthetic prepare run.

## Worker-kill boundaries, 2026-10-20

`BLUEPRINT_BROWSER_CHANNEL=chrome npm run demo:crash-boundaries` passed on
macOS arm64 / Node 22.23.0 / Chrome 155.0.8059.85. Actual worker exits were
SIGKILL; distinct fresh-process readbacks were 0 before export and 1 after
export, with 0 replayed saves in both. [Method and raw report](crash-boundaries.md).
This checks explicit synthetic snapshot restoration, not the original runner's
checkpoint transaction, browser disk flush, browser death or power-loss durability.

## Write-ahead destination experiment, 2026-10-21

[CI 39502435888](https://github.com/LydiaTools/browser-agent-blueprint/actions/runs/39502435888)
passed both contracts and real-browser jobs at
`ada2f4d461538e0ccd8cc51b9975da780f0d0aca`, Ubuntu / Node 22 / Playwright 1.62.1.
It passed 40 unit/contract checks and the three protected write-ahead cases:
worker SIGKILL before dispatch read back 0; SIGKILL after the target saved read
back 1; confirmed recovery kept 1. Read-failure injection stayed unresolved.
A distinct explicit ABSENT retry produced 1 with the same operation/hash and
another reservation. Actual desktop/mobile captures were inspected, with no
pointer overlays. [Method and integration contract](write-ahead.md).

Subsequent source adds an unguarded two-Save control, intermediate checkpoint
and target snapshots, and an action-kind/count binding check (41 local tests
passed). Check the corresponding current CI result for those additions rather
than attributing them to the earlier run. Source-bundle release notes retain
the final run URL and raw report when published. These tests use synthetic data
and one task owner; no model, real account, concurrent host or power loss is tested.

## Disabled-control boundary, 2026-10-21

The [Browser Use issue #6068](https://github.com/browser-use/browser-use/issues/6068)
reports an agent using `evaluate` to remove a disabled-control constraint. Its
author scoped the reported 8/8 prompt-rule result to one model and a rule added
through `extend_system_message`; it is not evidence about all prompts or models.
The issue also reports that a warning reached the agent in 10/10 runs while the
agent still placed the order in all 10, reinforcing that a prompt or warning is
not enforcement. Related [PR #6106](https://github.com/browser-use/browser-use/pull/6106)
and [PR #6110](https://github.com/browser-use/browser-use/pull/6110) remain open
at the time of this check.

This repository adds a prompt contract for disabled/read-only controls and a
regression test that its local controller rejects an `evaluate` action before
the executor callback. `npm test` passed 42 tests; the new test confirms that
the executor was not called and no action was recorded. The first default
`npm run test:browser` attempt could not find this Mac's Playwright Chromium
headless shell; rerunning with `BLUEPRINT_BROWSER_CHANNEL=chrome` passed both
browser tests. `BLUEPRINT_BROWSER_CHANNEL=chrome npm run test:builder` passed
six browser workflow checks on Chrome 155.0.8059.85, with no page errors or
external HTTP requests. Generated builder and skill-source parity is included
in the passing test suite.

No Browser Use runtime, model, production page or account was tested. The
prompt language cannot block a tool that the host exposes outside the local
allowlist, and this change does not claim to fix the upstream behavior.
