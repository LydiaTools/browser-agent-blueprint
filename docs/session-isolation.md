# Two tabs are not necessarily two sessions

Two agents can appear to have different tabs while those tabs still share cookies and local storage. For a multi-role test, that can mean the second tab silently acts as the first role.

This [public Shuttle issue](https://github.com/shuttle-browser/shuttle/issues/12) reports a specific case: pages created via one CDP path shared state, while the reporter's `allocate-tab` control did not. The issue was open when checked on 31 October 2026. We did not reproduce it in Shuttle, and the report is not evidence that all Shuttle tabs or all browser adapters share state.

## Try the local experiment

This experiment is included in the v0.2.4 source bundle and current source; the fixed v0.2.3 ZIP does not contain it. From the repository root, with Node 20+ and dependencies installed:

```sh
npm install
npx playwright install chromium
npm run demo:session-isolation
```

The demo starts a temporary loopback HTTP server and a new headless Playwright Chromium browser. It writes a fictional role into a cookie and localStorage, then asks the server and each page what they see:

| Observation | Expected synthetic value |
| --- | --- |
| A second tab in the same browser context | Both localStorage and the server see `agent_a` |
| A tab in a separate context, before its own write | Both are `null` |
| Original context after the separate context writes | Both remain `agent_a` |
| Separate context after its write | Both see `agent_c` |

The command exits nonzero if an assertion fails. It uses no existing browser profile or account, and closes its browser and server after the run. It demonstrates one browser/context boundary on a single local origin; it does not test Shuttle, CDP session adapters, remote browsers, third-party sign-ins, permissions, or every storage mechanism. The issue's author tested different paths in their environment; a separate actual adapter test is needed before making any claim about that adapter.

## Apply the lesson to a real test

Use a disposable test service and synthetic accounts. Have each session write a distinct marker, then read it from every other session through both the page and the service. Record the exact browser, adapter, tab creation path, origin and result. A different named session or tab is a label; only an observed check can show what happened in that test. Never use production credentials as markers.

[Back to the project](../README.md) · [中文版](session-isolation.zh-CN.md)
