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

Counts are inventory/test facts, not reliability or token-saving percentages.
Screenshots in `assets/` show the one-save synthetic prepare run.
