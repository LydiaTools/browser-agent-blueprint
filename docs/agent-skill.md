# Browser Task Recovery · portable Agent Skill

This repository now includes [`skills/browser-task-recovery`](../skills/browser-task-recovery). It packages original browser-task recovery guidance and source references in a self-contained skill folder. It adds no browser connector, permissions, automatic scheduler or live model evaluation.

## Install for a project

With Node **22.20+**, run the optional third-party [Vercel skills CLI](https://github.com/vercel-labs/skills) from the project where you want the skill:

```bash
npx skills@1.7.4 add LydiaTools/browser-agent-blueprint --skill browser-task-recovery --agent codex
```

The upstream CLI supports project/global scopes and different agents; the example targets one project and Codex. Review its installation choices and [telemetry documentation](https://github.com/vercel-labs/skills/blob/main/docs/troubleshooting.md#telemetry). No global flag is included. Other agents' actual invocation and behavior have not been validated here.

To preview discovery without installing:

```bash
npx skills@1.7.4 add LydiaTools/browser-agent-blueprint --list
```

Manual alternative: copy the **whole** `skills/browser-task-recovery` folder into the project's `.agents/skills/` directory. Keep its scripts, references and MIT notice together. Copying `SKILL.md` alone loses the supporting files. [Official OpenAI skill guidance](https://learn.chatgpt.com/docs/customization/overview#skills) describes project skill folders and progressive discovery; the Vercel CLI is a separate third-party installer, not an OpenAI endorsement.

The skill is distributed from the **current repository source** and the v0.2.0 bundle. The fixed v0.1.1 ZIP predates it and contains the online/offline profile builder; that ZIP is not silently replaced.

## Ask for the workflow

For a compatible host that has discovered the installed skill:

```text
Use $browser-task-recovery to resume this browser task from its checkpoint.
Reconcile the pending Save before another submission; report what you verified.
```

The skill keeps source reads separate from writes, retains unresolved outcomes and budgets across resumes, and routes to only the relevant original reference files. Actual browser tools, account access, durable storage and any wake-up mechanism must come from the host. Existing user instructions and authorization remain in force.

The optional self-contained helper needs Node **20+** and writes instructions to stdout:

```bash
node .agents/skills/browser-task-recovery/scripts/assemble.cjs --list
node .agents/skills/browser-task-recovery/scripts/assemble.cjs content --integration codex --workflow content_entry
```

It does not modify an `AGENTS.md`, call a model or perform browser actions. Its six base profiles match the repository CLI exactly; original module text remains v0.1.0. The interface metadata leaves normal implicit discovery enabled, but discovery or model behavior in a host is not proved by a file-format check.

## Validation and maintenance

- The skill-creator validator checks frontmatter, naming and unfinished placeholders.
- Source tests compare all 19 copied references, the manifest and license with the original files. A copied skill outside the source repository must assemble all six base profiles and explicit additions without depending on the checkout.
- A real skills@1.7.4 installation into an isolated project's Codex directory checks all copied files and runs the installed helper. Validation disables installer telemetry; no test installation is counted as adoption, a directory ranking or an external install.
- Automatic skill choice, live browser-model recovery and other agents remain unverified. This is reusable guidance, not an enforcement sandbox.

After editing original `.txt` files, run `npm run build:skill`, commit the generated reference copies and run `npm test`. CI checks generated-source parity. The browser builder remains a separate no-install way to inspect the same instruction text.

To run the real local installer check, install the reviewed CLI in a temporary directory and set `BLUEPRINT_SKILLS_CLI` to its `node_modules/skills/bin/cli.mjs`, then run `npm run test:skill-install`. The test uses only an isolated project and removes that test directory afterward; it does not install into the user's global skill folder or launch another agent.
