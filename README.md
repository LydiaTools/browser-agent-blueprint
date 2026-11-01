# Browser Agent Blueprint

**A lost response should not create a second post.**

Original, copyable browser-agent prompts for verified writes, bounded retries
and resumable tasks — with a real local browser demo.

**12 prompt modules · 4 workflow templates · reproducible recovery demos**

**[Try the interactive lost-reply simulation](https://lydiatools.github.io/browser-agent-blueprint/demo/lost-reply.html)**: save once, then compare retrying with reading the saved state. No setup needed.

[![Checks](https://github.com/LydiaTools/browser-agent-blueprint/actions/workflows/ci.yml/badge.svg)](https://github.com/LydiaTools/browser-agent-blueprint/actions/workflows/ci.yml)

**Try the browser-task-recovery Skill** in a Codex project (Node 22.20+):

```sh
npx skills@1.7.4 add LydiaTools/browser-agent-blueprint --skill browser-task-recovery --agent codex
```

The optional third-party installer adds guidance, not a browser or background scheduler. [Manual installation and validation](docs/agent-skill.md).

[Install the Agent Skill](docs/agent-skill.md) · [Build a task profile online](https://lydiatools.github.io/browser-agent-blueprint/builder/) · [Quick start](#quick-start) · [Browser crash experiment](docs/browser-profile-kill.md) · [Copy a module](#copy-a-module) ·
[Project overview](https://lydiatools.github.io/browser-agent-blueprint/?utm_source=github&utm_medium=referral&utm_campaign=browser_agent_blueprint&utm_content=repository_readme_overview) ·
[Demo guide](https://lydiatools.github.io/browser-agent-blueprint/demo/?utm_source=github&utm_medium=referral&utm_campaign=browser_agent_blueprint&utm_content=repository_readme_en) ·
[Download the v0.2.6 preview bundle](https://github.com/LydiaTools/browser-agent-blueprint/releases/download/v0.2.6/browser-agent-blueprint-v0.2.6.zip) ·
[See the boundaries](#limits-and-disclaimer) · [中文](README.zh-CN.md)

Built and maintained by [@LydiaTools](https://github.com/LydiaTools).
Follow the account for small, reproducible Agent tools; star this repository
if you want to keep the modules and recovery cases handy.

Listed in [Awesome-AI-Agents](https://github.com/Jenqyang/Awesome-AI-Agents) under Reference Repo.

**Want a recovery guard and a readable receipt in one run?** An [optional StepReceipt example](https://github.com/LydiaTools/stepreceipt/blob/main/docs/BLUEPRINT-INTEGRATION.md) combines a pinned Blueprint controller with a browser action, a separate readback, and an HTML report. Explore the [saved-after-timeout](https://lydiatools.github.io/stepreceipt/cases/blueprint-saved-timeout.html), [unavailable-readback](https://lydiatools.github.io/stepreceipt/cases/blueprint-unknown-readback.html), and [unguarded-retry](https://lydiatools.github.io/stepreceipt/cases/blueprint-unguarded-retry.html) cases.

The example runs against a synthetic local service and reloads the journal into a fresh controller in the same process. StepReceipt is separate; checks are supplied by the integration, not automatically connected to this repository's demos.

## The problem

Your browser agent clicks **Save**. The response times out. A new session starts.
Should it click again?

An action ledger gives the host a better question: **what actually happened?**
This project makes that distinction explicit in prompts and executable examples.

[See one lost reply with real browser tools](docs/agent-browser-lost-reply.md): on a fictional local page, agent-browser 0.38.2 sent five clicks after the reply was dropped; 0.41.0 sent one and reported `outcome_unknown`. The underlying retry bug was fixed upstream. This is a reproducible local experiment, not a claim about all sites or versions.

**What if the first read finds nothing?** The original request may still be in flight. The [recovery guide](docs/write-ahead.md) explains why an early zero is inconclusive, with a synthetic delayed-write test in current source. The fixed v0.2.6 ZIP predates this guidance and test; the controller relies on the host to classify the read.

Want to understand the decision first? [Try the interactive lost-reply simulation](https://lydiatools.github.io/browser-agent-blueprint/demo/lost-reply.html) without installation. It is a fictional browser-only illustration, separate from the real local CLI experiment.

To use the simulation offline, extract the v0.2.6 preview ZIP and open `demo/lost-reply.html` in Chrome. No server or Node is needed for this page.

![Actual simulation after the first reply is lost, showing the choice between retrying and reading the saved state](assets/lost-reply-simulation.png)

*Actual browser screenshot of the interactive simulation; no real account or browser agent is involved.*

When several agents browse in parallel, there is another question: **are their sessions actually separate?** The [local session-isolation experiment](docs/session-isolation.md) shows what two tabs can share, and what a separate Playwright context changes, using only synthetic data.

**What if context is compacted after a save times out?** [Run the synthetic checkpoint handoff](docs/compact-handoff.md) with wcf778's Codex Checkpoint: a manually supplied reminder returns, while this project's separate ledger blocks a duplicate. It does not run a real Codex session or prove agent behavior; the v0.2.6 ZIP predates this example.

Using agent-browser? [Try pinned tabs against shared storage](docs/agent-browser-pinned-sessions.md), then [compare independently launched sessions](docs/agent-browser-pinned-sessions.md#independent-sessions) with the same synthetic data. The independent-session example is in current source; the v0.2.5 ZIP predates it.

When a browser test ends, which server should stop? [Run two cooperative test servers](docs/owned-test-servers.md), close one through its own child-process channel, and verify the other still responds. This local example is included in v0.2.5; it is not a general process cleanup tool. The fixed v0.2.4 ZIP predates it.

| Failure | Included contract |
|---|---|
| The agent says “done” after a click | Define and read the actual postcondition |
| A timeout causes a duplicate submission | Persist the readback as PENDING_REVIEW; require a recorded review before replay |
| A long task loses its place | Checkpoint verified work; resume from state |
| A small loop becomes a large batch | Count cumulative writes across resumes |
| A webpage tells the agent to change its task | Keep observations outside trusted authority |
| A disabled control is bypassed through script | Use visible prerequisites or stop; do not alter page state |
| Every task loads a giant instruction dump | Assemble only the necessary modules |
| Status messages fill with boilerplate | Apply a narration blacklist without altering user copy |

## Watch the boundary, not a benchmark

The demo runs a **real browser against a synthetic local page**. Its decisions
are deterministic: no model API key, social account or cloud-browser account is
needed. It exercises host-side controls; it is not an LLM behavior benchmark.
The local allowlist rejects an `evaluate` action before its executor runs. That
test covers this example controller only; a real host must also withhold
unapproved browser tools and other direct action paths.

![Two separate local processes resume one synthetic draft and verify one saved record](assets/recovery-proof.png)

The graphic combines the [unaltered fixture capture](assets/recovery-fixture.png)
with the local run's save-count readback. It shows a deterministic recovery test,
not a live model or production deployment. [See how it was made](docs/recovery-proof.md),
then run the two commands below to check the result on your machine.

## Quick start

### Install as an Agent Skill

For a project using Codex, use the installation command above to add the self-contained `browser-task-recovery` skill.

This optional third-party installer needs Node 22.20+. The skill routes uncertain writes and resumed tasks to the relevant original references; its bundled helper can export all six profiles after installation. [Installation, manual copy and validation scope](docs/agent-skill.md). Project-scope installation and exact resource/helper output are tested; live agent selection and other hosts are not. Test installs are excluded from adoption claims. The v0.2.3 bundle includes the skill; fixed older ZIPs remain unchanged.

### Assemble a profile without installing anything

[Open the task-profile builder](https://lydiatools.github.io/browser-agent-blueprint/builder/). Choose a task, optionally add an integration contract and a workflow, then **copy or download the exact text**. Included files, UTF-8 bytes and SHA-256 are shown. The six base profiles match the CLI byte for byte. [中文界面](https://lydiatools.github.io/browser-agent-blueprint/builder/?lang=zh).

The builder uses the original English source text; changing its interface language does not translate the prompts. Review the output, map it to your actual tools and merge compatible guidance. It does not install a connector or run an agent. No model calls, uploads or analytics run on this page.

![Actual task-profile builder: website content entry, optional Codex contract and workflow, included files and the original assembled text.](assets/profile-builder.png)

For an offline copy, extract the v0.2.3 source bundle and open `builder/index.html` inside its `browser-agent-blueprint` folder. Node is not needed for this page. The original v0.1.0 ZIP remains a fixed older snapshot without the builder. The current prompt modules are v0.1.1.

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

Without Git, download the [v0.2.6 preview bundle](https://github.com/LydiaTools/browser-agent-blueprint/releases/download/v0.2.6/browser-agent-blueprint-v0.2.6.zip),
extract it, and run the commands from its `browser-agent-blueprint` folder. The
ZIP is a fixed release snapshot; the online synthetic page follows the current
repository version.

### Run the browser demo

Start with the [demo guide](https://lydiatools.github.io/browser-agent-blueprint/demo/?utm_source=github&utm_medium=referral&utm_campaign=browser_agent_blueprint&utm_content=repository_readme_demo_section)
to choose between the online fixture and the local recovery runner. For a quick
look at the page used by the tests, [open the browser-only synthetic
fixture](https://lydiatools.github.io/browser-agent-blueprint/demo/fixture.html?utm_source=github&utm_medium=referral&utm_campaign=browser_agent_blueprint&utm_content=repository_readme_fixture_en).
Save a draft, reload, and inspect the persisted record and save count. The
fixture is a synthetic test page; it does not run an agent or the recovery
checks. Run the commands below to exercise the host-side controls.

```sh
npm install
npx playwright install chromium
npm test
npm run test:browser
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

### Kill the worker around snapshot export

```sh
npm run demo:crash-boundaries
```

Two actual `SIGKILL` cases: the fresh process restores **0** records before
the export, and **1** after it, without replaying Save. This macOS/Linux
experiment tests explicit snapshot recovery; it does not kill the browser or
prove disk-flush durability. [Method, actual report and limits](docs/crash-boundaries.md).
Use current source or v0.2.3; the fixed v0.1.1 ZIP predates this experiment.

### Kill a worker during checkpoint publication

```sh
npm run demo:checkpoint-kill
```

Seven deterministic process-kill cases compare direct overwrite with the
existing temporary-file/fsync/rename writer. A fresh process must read the
complete old checkpoint, the complete new one, or reject missing/invalid state;
it must never replay the recorded operation. No browser, model or dependency
installation is needed. [English method](docs/checkpoint-kill.md) · [中文](docs/checkpoint-kill.zh-CN.md).
Use current source or v0.2.3; the fixed v0.2.2 ZIP predates this addition.

### Kill the browser after Save

```sh
npm run demo:browser-kill
```

Reopen the same disposable browser profile after an actual browser-process
`SIGKILL`, without importing a snapshot. The included macOS run restored old
or missing data after four acknowledged writes. Read the controls, raw report
and scope in the [English method](docs/browser-profile-kill.md) or
[中文](docs/browser-profile-kill.zh-CN.md). Use current source or v0.2.3; the fixed v0.2.2
ZIP predates this experiment.

### Kill a worker before or after a destination write

```sh
npm run demo:write-ahead
```

The destination stays running while the worker is killed. A fresh process reads
**0** before the write or **1** after it, then persists the observation as
`PENDING_REVIEW`. Strict mode blocks new writes until a review decision records
whether it landed; a failed recovery read stays unresolved. An unguarded two-click
control produces **2** records on the same target. The host binds a stable
operation ID, payload reference and hash; changing the attempt ID cannot replay
an unresolved or confirmed operation. [Run it and inspect the evidence](docs/write-ahead.md).

![Actual recovery browser reads one saved record after the worker was killed.](assets/write-ahead-desktop.png)

Use current source or v0.2.3, macOS/Linux. This is a synthetic host-control test;
the destination has no server-side deduplication. It is not a production
exactly-once guarantee.

Ran the demo or mapped a module to your own browser host? [Share one integration
observation](https://github.com/LydiaTools/browser-agent-blueprint/issues/new?template=integration_observation.yml)
with the module version, synthetic or live-host scope, and expected versus
observed result. One report is evidence for that run, not a reliability claim.

## Six original scenarios

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

## Website analytics

The project guide, demo guide, and synthetic fixture offer optional Google Analytics 4 measurement only after you allow it. It records page paths, allow-listed campaign tags, the referrer origin, LydiaTools GitHub destination paths, and a generic event after a fixture save is verified. It never sends the fixture title, body, saved record, or save count. Rejecting or postponing consent keeps analytics off; change a saved choice from **Privacy settings** in the footer.

## Modules

| File | Purpose |
|---|---|
| [00_core.txt](prompts/00_core.txt) | Outcome, scope, execution loop |
| [01_output.txt](prompts/01_output.txt) | Narration blacklist and compact status |
| [02_authority.txt](prompts/02_authority.txt) | Trusted authorization and page-content boundary |
| [03_browser.txt](prompts/03_browser.txt) | Pre-call checks, fresh targets and saved-state reads |
| [04_risk.txt](prompts/04_risk.txt) | Four risk levels, batch bounds and page-enforced control state |
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
The disabled-control rule is prompt guidance, not a fix for a vendor agent: the
upstream [Browser Use reproduction](docs/verification.md#disabled-control-boundary-2026-10-21)
reported one model bypassing a rule added through `extend_system_message`.
This repository's `evaluate` check applies only to actions routed through its
example allowlist.
Without a persistence callback, action state stays in memory until explicit
checkpointing; the original snapshot runner has a pre-checkpoint crash gap.
The optional [write-ahead runner](docs/write-ahead.md) flushes DISPATCHED before
execution and reads the destination after worker death. It does not provide
server-side idempotency or exactly-once delivery. Production hosts still need
schema validation, scoped authority, locking and protected secret storage.

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
concurrent-host locking, live-model evaluations and tested adapter mappings.

## License

MIT for this repository's original work. Dependencies retain their licenses.
See [LICENSE](LICENSE). Built by
[@LydiaTools](https://github.com/LydiaTools).
