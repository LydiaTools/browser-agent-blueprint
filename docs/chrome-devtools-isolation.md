# Two DevTools MCP servers, two browser profiles

Two coding agents need browsers at the same time. If both MCP servers launch Chrome with the same user-data directory, does a second tab give them a second session?

This local example uses **actual chrome-devtools-mcp 1.12.0 servers**, not an agent simulation. On macOS with Chrome 156.0.8078.74, the second server's attempt to launch the same disposable profile was rejected as already running. With two separate disposable profiles, both servers opened the same synthetic local site and kept their storage separate.

| Check | Observed |
| --- | --- |
| Server A writes `agent_a` | A reads `agent_a` from localStorage; local server receives `role=agent_a` |
| Second server launches with A's profile | Rejected: browser already running |
| Server B opens with a different profile | No role in localStorage or the request cookie |
| B writes `agent_b`; then A reads again | B sees `agent_b`; A still sees `agent_a` |

## Run it

Requires Node 22.12+ and an installed Chrome executable. The package installation needs network access; the example itself points its browser to a loopback fixture. It starts its own temporary profiles and does not attach to your existing browser or account. It opts out of MCP usage statistics and disables CrUX lookups; Chrome background traffic was not audited.

```bash
DEVTOOLS_DEPS_DIR="$(mktemp -d)"
export DEVTOOLS_DEPS_DIR
npm install --prefix "$DEVTOOLS_DEPS_DIR" --ignore-scripts --no-audit --no-fund --save-exact \
  chrome-devtools-mcp@1.12.0 @modelcontextprotocol/sdk@1.32.2

# macOS example; replace with the absolute path to your Chrome executable
export DEVTOOLS_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run demo:devtools-isolation
```

The command exits nonzero if the expected lock, cookie, or localStorage checks fail. It closes the clients and local server and removes the temporary test profiles. To choose where those profiles are created, set `DEVTOOLS_TEST_DIR` to an existing absolute directory. The separately installed dependency directory remains for you to remove or reuse.

## What this does and does not establish

This tests three independent MCP server processes, two explicitly chosen temporary user-data directories, one local origin, cookies and localStorage. It does **not** run Codex, Claude, or any AI model; test real logins; test a shared MCP server's page-ID routing; or prove isolation for every browser, network, or operating system. It does not fix the request for easier concurrent session management.

The [upstream concurrent-session guide](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md#concurrent-sessions) also describes `--isolated` for separate temporary profiles. That option is **not** what this example tests: the example explicitly supplies two different `--userDataDir` values so it can contrast them with a same-directory launch.

Related public sources: [Chrome DevTools MCP issue #3070](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/3070), open when checked; and [a Stack Overflow question by Chad von Nau](https://stackoverflow.com/questions/79979832/how-do-i-use-chrome-devtools-mcp-with-multiple-agents-simultaneously) about concurrent instances ([CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)). Neither source is a measurement of market size or endorsement of this project.

This example is in current source; the fixed v0.2.6 ZIP predates it. [中文版](chrome-devtools-isolation.zh-CN.md) · [Project README](../README.md)
