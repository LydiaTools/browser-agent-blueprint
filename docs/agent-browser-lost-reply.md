# The click happened. The reply got lost.

A browser tool can report an error after the page has already saved. Should the agent click again?

This example follows a real report in [agent-browser #2032](https://github.com/vercel-labs/agent-browser/issues/2032). Before [the upstream fix](https://github.com/vercel-labs/agent-browser/pull/2085), a lost daemon response could cause the CLI to resend an action. The fix distinguishes actions whose outcome is unknown from safe-to-retry reads. Credit to the upstream reporter and maintainers: their issue, patch and fix identified and addressed the underlying behavior.

We built a separate local experiment to make the difference visible. On macOS, using a fresh Chrome session and a fictional local page:

| agent-browser | Click commands received by the daemon | Saves received by the local page's server | CLI result |
| --- | ---: | ---: | --- |
| 0.38.2 | 5 | 5 | Error after retries |
| 0.41.0 | 1 | 1 | `outcome_unknown` |

The script clicks once. A local proxy lets each click reach the daemon and drops its reply after the daemon responds. The server counts the resulting fictional saves. It does not simulate a slow server or a real timeout; it tests this deliberately injected lost-reply path. This is an observation of these two versions on one macOS setup, not a comparison of all versions or sites.

**A safer next step is to check the result, not repeat the click.** The newer CLI reports that it cannot establish the outcome; it does not tell you whether the save occurred. Here, the test server's counter shows one save. In your own workflow, use an appropriate independent readback and record the evidence before deciding what to do. A missing or ambiguous record may still need review. Neither this demo nor the upstream fix guarantees exactly-once delivery.

## Run the experiment

Tested on macOS with Node 24.22.1, Google Chrome and the two specified CLI versions. It starts its own server, browser sessions, socket proxy and temporary configuration. It does not connect to your logged-in browser, a real account or a model API. Other operating systems and browsers have not been checked.

From this repository, with Node 24+ available as `node`:

```sh
old_tool=$(mktemp -d /tmp/blueprint-ab-old-XXXXXX)
new_tool=$(mktemp -d /tmp/blueprint-ab-new-XXXXXX)
npm install --prefix "$old_tool" --ignore-scripts --no-audit --no-fund agent-browser@0.38.2
npm install --prefix "$new_tool" --ignore-scripts --no-audit --no-fund agent-browser@0.41.0
node demo/agent-browser-lost-reply.cjs \
  "$(command -v node)" \
  "$old_tool/node_modules/agent-browser/bin/agent-browser.js" \
  "$new_tool/node_modules/agent-browser/bin/agent-browser.js" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Both versions are downloaded from npm; review third-party dependencies before use. The script checks the CLI versions and expected counts, then closes the sessions it created. It reports a retained temporary path if setup or cleanup fails. The two package folders created by `mktemp` remain for you to remove after inspection. Use a separate disposable environment for an old version; do not use it with real accounts.

Expected output:

```json
{"version":"0.38.2","click_requests":5,"synthetic_saves":5,"error_code":null}
{"version":"0.41.0","click_requests":1,"synthetic_saves":1,"error_code":"outcome_unknown"}
```

The upstream project already has the retry fix. Browser Agent Blueprint adds a concrete experiment and an action/readback workflow; it is not an integration that automatically controls agent-browser. The demo is in current source; the older v0.2.5 ZIP does not include it.

[中文](agent-browser-lost-reply.zh-CN.md) · [Back to the project](../README.md)
