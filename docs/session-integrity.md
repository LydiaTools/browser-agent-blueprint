# Distinguish an empty result from an expired session

An extraction that returns zero rows can mean the report is empty, the session expired, the page did not finish loading, or the expected content was not found. Do not collapse those states into one success value.

## Check the page before accepting zero

Use a fresh page state and verify three things:

1. The final URL and origin still match the approved report.
2. A site-specific signed-in marker is visible in the same page state.
3. The report is fully loaded and shows an explicit empty-state message.

Classify the observation:

| Status | Evidence | Next action |
|---|---|---|
| `AUTH_REQUIRED` | Login redirect, access-denied page or explicit expiry message | Stop and ask the user to sign in through the normal site flow. |
| `VERIFIED_EMPTY` | Fresh signed-in marker, expected report, and explicit empty-state message | Record zero rows with the report, scope, time and source. |
| `DATA_VERIFIED` | Fresh signed-in marker, expected report and visible records; extraction agrees | Record the observed rows and their provenance. |
| `TOOL_UNHEALTHY` | The page shows records but extraction is blank, and a configured read-only probe fails | Preserve the page state; stop or use an approved alternate read path. |
| `UNKNOWN` | Missing marker, blank page, loading state, no safe probe or conflicting signals | Stop. Do not report zero or retry the same extraction as if it were a new state. |

The marker must be specific to the site and account being checked. A cached name, a successful navigation, a non-empty tool response or an old checkpoint is not enough by itself. If the site has a supported authenticated-status response, include it as a fresh signal; do not invent a vendor endpoint.

An empty tool response does not identify which layer failed. One [Browser Use report](https://github.com/browser-use/browser-use/issues/5803) describes valid page reads alongside a JavaScript evaluation lane returning empty strings without an error. The separate [Playwright MCP report](https://github.com/microsoft/playwright/issues/41617) was later corrected by its author: a subsequent call could recover, while some agents abandoned the original session after the first disconnect error. These reports motivate distinct session, page and tool states; they do not establish how often these failures occur or prove that every browser stack behaves the same way.

## Boundaries

- Let the user complete sign-in, MFA or CAPTCHA through the site's normal flow.
- Do not place passwords, cookies, bearer tokens or storage-state files in prompts, screenshots, logs or public evidence.
- Do not refresh, retry or change accounts until the current page state is classified.
- Treat this as a site-specific check. A generic prompt cannot prove that a marker is valid for every site.

[Open the interactive synthetic demo](../demo/session-integrity.html) or select the optional [data-validation workflow](../workflows/data_validation.txt) in the task-profile builder.

The demo is a static fixture. It does not connect to a browser or account, inspect real cookies, or execute an agent. The check contract is guidance; a host must enforce its own page access and result validation.
