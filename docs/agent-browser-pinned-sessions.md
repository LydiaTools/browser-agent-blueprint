# When separate tabs still share a login

Two agents can hold different tabs and still see the same account. A tab is a place to work; cookies and `localStorage` belong to the browser's storage context.

We followed [agent-browser issue #1530](https://github.com/vercel-labs/agent-browser/issues/1530), where users reported sessions competing for tabs when attached to the same Chrome over CDP. The issue is closed. [The fix](https://github.com/vercel-labs/agent-browser/pull/1589) introduced pinned tabs; the project's [session documentation](https://github.com/vercel-labs/agent-browser/blob/main/skill-data/core/references/session-management.md) also explains that sessions attached to the same Chrome still share cookies.

## Try the distinction locally

This optional experiment uses **agent-browser 0.41.0**, Node 24+, Playwright and a fresh headless Chromium profile. It starts a localhost fixture with fictional data. It does not connect to your browser, accounts, or a real website. We tested this integration on macOS with Chrome; other environments may need a compatible Chromium installation.

From a checkout of the current repository:

```bash
npm install --ignore-scripts
npx playwright install chromium
tool_dir="$(mktemp -d)"
npm install --prefix "$tool_dir" --ignore-scripts agent-browser@0.41.0
node demo/agent-browser-pinned.cjs "$(command -v node)" "$tool_dir/node_modules/agent-browser/bin/agent-browser.js"
```

Use a Node 24+ executable for both `node` paths. The optional integration is not included in the fixed v0.2.4 ZIP; use the current repository. `tool_dir` is a separate temporary installation that you can remove after the test.

The script checks that:

1. Two pinned sessions attached to its disposable browser retain their own synthetic `/a` and `/b` tab URLs.
2. A cookie and localStorage value written in tab A are visible in tab B at the same origin.
3. Closing tab A causes its next pinned `get url` to return `tab_gone` in this test.

For a comparison with separate Playwright contexts, run `npm run demo:session-isolation` and see [the companion explanation](session-isolation.md). These are small local experiments, not a security audit or a guarantee about every agent-browser command, site, browser adapter, or version. Pinning a tab is not an account-isolation boundary. For separate accounts, select an isolation mechanism appropriate to the browser and verify it with synthetic data before using real accounts.
