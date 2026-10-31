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

Use a Node 24+ executable for both `node` paths. The optional integration is not included in the fixed v0.2.4 ZIP; use v0.2.5 or the current repository. `tool_dir` is a separate temporary installation that you can remove after the test.

The script checks that:

1. Two pinned sessions attached to its disposable browser retain their own synthetic `/a` and `/b` tab URLs.
2. A cookie and localStorage value written in tab A are visible in tab B at the same origin.
3. Closing tab A causes its next pinned `get url` to return `tab_gone` in this test.

## A pinned tab is not an action receipt

In [agent-browser issue #2146](https://github.com/vercel-labs/agent-browser/issues/2146), a user reports that some clicks on a background pinned tab returned success without the page handler taking effect. The report covers agent-browser 0.38.2 on Linux; a later commenter describes a related observation on 0.39.4. The issue is open and these are their reports, not our reproduction.

In our separate macOS / Chrome test with agent-browser 0.41.0, the synthetic tabs continued to report `visible`, including after bringing the other tab forward. We therefore did not reproduce or rule out the reported hidden-tab scenario. The storage experiment above checks tab selection and storage, not whether clicks reach a page or complete a save.

For a consequential action, check the expected result for that operation—for example, read back the newly created record. If the result cannot be checked, keep it unknown and reconcile before retrying; a successful click return or tab binding alone is not proof that the write completed.

<a id="independent-sessions"></a>
## Try independent sessions

What if the agents need separate storage? agent-browser already supports independently launched sessions. In the following comparison, the script starts two fresh sessions **without connecting them to the same browser over CDP**. It uses a temporary configuration and a synthetic localhost page; it does not use an existing login. This example was tested on macOS with Chrome and agent-browser 0.41.0.

After the setup above, run this from the current repository with Node 24+:

```bash
node demo/agent-browser-independent.cjs "$(command -v node)" "$tool_dir/node_modules/agent-browser/bin/agent-browser.js" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

The test writes a different fictional cookie and localStorage value in each session. The second starts empty, the first keeps its own values, and the second remains usable after the first closes. The script closes only the sessions it created. This example is in current source; the fixed v0.2.5 ZIP does not include it.

For a comparison with separate Playwright contexts, run `npm run demo:session-isolation` and see [the companion explanation](session-isolation.md). These are small local experiments, not a security audit or a guarantee about every agent-browser command, site, browser adapter, or version. Pinning a tab is not an account-isolation boundary. For separate accounts, select an isolation mechanism appropriate to the browser and verify it with synthetic data before using real accounts.
