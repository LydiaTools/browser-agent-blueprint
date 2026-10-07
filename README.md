# Browser Agent Blueprint

**A lost response should not create a second post.**

Original, copyable browser-agent prompts for verified writes, bounded retries
and resumable tasks — with a real local browser demo.

**12 prompt modules · 4 workflow templates · 6 reproducible demo scenarios**

[![Checks](https://github.com/LydiaTools/browser-agent-blueprint/actions/workflows/ci.yml/badge.svg)](https://github.com/LydiaTools/browser-agent-blueprint/actions/workflows/ci.yml)

[Quick start](#quick-start) · [Copy a module](#copy-a-module) ·
[Try the synthetic page](https://lydiatools.github.io/browser-agent-blueprint/demo/fixture.html) ·
[See the boundaries](#limits-and-disclaimer) · [中文](README.zh-CN.md)

Built and maintained by [@LydiaTools](https://github.com/LydiaTools).
Follow the account for small, reproducible Agent tools; star this repository
if you want to keep the modules and recovery cases handy.

## The problem

Your browser agent clicks **Save**. The response times out. A new session starts.
Should it click again?

An action ledger gives the host a better question: **what actually happened?**
This project makes that distinction explicit in prompts and executable examples.

| Failure | Included contract |
|---|---|
| The agent says “done” after a click | Define and read the actual postcondition |
| A timeout causes a duplicate submission | Mark UNKNOWN, reconcile, then decide |
| A long task loses its place | Checkpoint verified work; resume from state |
| A small loop becomes a large batch | Count cumulative writes across resumes |
| A webpage tells the agent to change its task | Keep observations outside trusted authority |
| Every task loads a giant instruction dump | Assemble only the necessary modules |
| Status messages fill with boilerplate | Apply a narration blacklist without altering user copy |

## Watch the boundary, not a benchmark

The demo runs a **real browser against a synthetic local page**. Its decisions
are deterministic: no model API key, social account or cloud-browser account is
needed. It exercises host-side controls; it is not an LLM behavior benchmark.

![Local synthetic draft, verified after reload](assets/demo-desktop.png)

This screenshot comes from the included fixture. It is not a screenshot of Muse,
Grok, Codex, a customer system or a production deployment.

## Quick start

### Copy a module

Start with [risk checks](prompts/04_risk.txt),
[uncertain writes and retries](prompts/05_retries.txt), or
[external memory](prompts/06_memory.txt). Each file is plain text.

For a complete task profile, install Node.js 20+ and run:

```sh
git clone https://github.com/LydiaTools/browser-agent-blueprint.git
cd browser-agent-blueprint
npm run assemble -- content
```

The output is `dist/content.txt`. Review it, map conceptual tools to your actual
host schemas, and place it in a supported trusted instruction surface.
Assembly has no npm dependencies. It reports bytes and a hash, **not token savings**.

### Run the browser demo

For a quick look at the page used by the tests, [open the synthetic fixture in
your browser](https://lydiatools.github.io/browser-agent-blueprint/demo/fixture.html).
Save a draft, reload, and inspect the persisted record and save count. This
page alone does not run an agent or the recovery checks; run the commands below
to exercise the host-side controls.

```sh
npm install
npx playwright install chromium
npm test
npm run demo
```

On Linux, install the browser system dependencies when needed:

```sh
npx playwright install --with-deps chromium
```

If you already have a compatible Chrome installation, you may use
`BLUEPRINT_BROWSER_CHANNEL=chrome npm run demo` instead of downloading Chromium.
Compatibility depends on your installation.

### Prove resume happens in a new process

```sh
npm run demo:prepare
npm run demo:resume
```

The first command saves one synthetic draft, verifies it, writes a checkpoint,
exports synthetic localStorage and exits. The second starts a new process,
validates the checkpoint, restores the fixture and verifies that the save count
is still **1**. It refuses to dispatch the completed action ID again.

The local runner uses loopback port 4179; an occupied port causes a visible error.
Output goes to ignored `runs/`: checkpoint, synthetic browser state and screenshots.
No existing browser profile is used. The all-in-one demo intentionally performs
two saves to exercise lost-acknowledgement recovery; run `demo:prepare` before
`demo:resume` for the one-save cross-process case.

## Six executable scenarios

| Scenario | What the example demonstrates |
|---|---|
| Saved draft verification | Title, body and save count match after reload |
| Batch risk gate | A high-risk batch is rejected before dispatch |
| Cross-process resume | A new process reads the checkpoint without re-saving |
| Lost acknowledgement | An actual local save is reconciled without automatic replay |
| Hostile page instruction | Page text does not grant host permission to publish |
| Transient read recovery | A classified read retries within a finite budget |

See [evaluation scope](docs/evaluation.md), [architecture](docs/architecture.md)
and [recorded local verification](docs/verification.md). Passing these examples
does not establish model obedience or production safety.

## Modules

| File | Purpose |
|---|---|
| [00_core.txt](prompts/00_core.txt) | Outcome, scope, execution loop |
| [01_output.txt](prompts/01_output.txt) | Narration blacklist and compact status |
| [02_authority.txt](prompts/02_authority.txt) | Trusted authorization and page-content boundary |
| [03_browser.txt](prompts/03_browser.txt) | Pre-call checks, fresh targets and saved-state reads |
| [04_risk.txt](prompts/04_risk.txt) | Four risk levels and cumulative batch bounds |
| [05_retries.txt](prompts/05_retries.txt) | Six failure classes; reconcile uncertain writes |
| [06_memory.txt](prompts/06_memory.txt) | External checkpoint and readback requirements |
| [07_lifecycle.txt](prompts/07_lifecycle.txt) | Pause, rollover, host wake and manual resume |
| [08_evidence.txt](prompts/08_evidence.txt) | Verification rules and honest completion claims |
| [09_modules.txt](prompts/09_modules.txt) | Optional loading and context budget rules |
| [10_content.txt](prompts/10_content.txt) | Approved content entry and per-record validation |
| [11_social.txt](prompts/11_social.txt) | Draft/schedule/publication distinctions |

Profiles: `minimal`, `long`, `content`, `validation`, `social`, `full`.
The minimal profile keeps eight mandatory policies. Optional loading is a host
responsibility; the assembler supports static selection.

## Four workflows

- [Cloud browser session](workflows/cloud_browser.txt): reconnect boundaries and session references.
- [Website content entry](workflows/content_entry.txt): approved field mapping and fresh saved reads.
- [Page data validation](workflows/data_validation.txt): discrepancy reports without silent repairs.
- [Social operations](workflows/social_ops.txt): bounded account actions and verified publication states.

## Muse, Grok and Codex

The repository includes [three integration contracts](integrations/), not
vendor plugins or verified connectors.

| Target | Included | Live-tested status |
|---|---|---|
| Muse | Operator mapping and capability checklist | Not tested |
| Grok | Model/tool-loop and dispatcher responsibilities | Not tested |
| Codex | Project-guidance mapping and browser-tool requirements | Not tested |

No vendor endorsement or compatibility guarantee is implied. The host must
provide actual browser tools, durable memory, permissions, context telemetry
and scheduling where required. A prompt alone cannot keep a process alive,
increase its context window, or schedule a wake.

## Limits and disclaimer

**This is independently authored, AI-assisted work based on public model
capabilities and engineering patterns. It is not any vendor's leaked internal
system prompt.** No CL4R1T4S prompt text is reused. See [provenance](docs/provenance.md).

These templates guide behavior; they are not a security sandbox or a substitute
for runtime checks. The local controller is intentionally small and fixture-specific.
It keeps action state in memory until explicit checkpointing and is **not
crash-safe between a dispatched write and its next checkpoint**. Production
hosts need durable pre-dispatch logging, schema validation, scoped authority,
locks, idempotency and protected secret storage.

The repository provides manual cross-process resume, not an automatic scheduler.
Context-threshold handling and the full failure taxonomy are prompt contracts,
not implemented provider integrations. The digest detects corruption, not
malicious rewriting by someone with file access. The injection fixture tests a
fixed host policy, not an LLM's resistance to adversarial content.

Use authorized accounts and data, respect platform automation rules, and keep
credentials and private material out of prompts, checkpoints and public issues.
No CAPTCHA bypass, rate-limit evasion, mass unsolicited messaging or fabricated
engagement is provided. Screenshots and exported state contain synthetic data.

There are no claims of industrial readiness, guaranteed completion, measured
token reduction, virality or Star growth. Those require their own evidence.

## Contribute a reproducible failure

A small failure case is more useful than a broad claim. Share a synthetic
reproduction, expected/observed behavior and exact environment through
[Issues](https://github.com/LydiaTools/browser-agent-blueprint/issues).

See [contributing](CONTRIBUTING.md). Useful next contributions include
crash-consistent dispatch, live-model evaluations and tested adapter mappings.

## License

MIT for this repository's original work. Dependencies retain their licenses.
See [LICENSE](LICENSE). Built by
[@LydiaTools](https://github.com/LydiaTools).
