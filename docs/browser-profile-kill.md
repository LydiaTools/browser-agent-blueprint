# Kill the browser after Save

A Save acknowledgement is not a crash-durability receipt. In the included
macOS run, four immediate post-acknowledgement browser kills restored either
the previous record or no record. A clean-close control retained the new one.

This follows a [reader's question about killing during a write](https://x.com/lastbrowser/status/2113390616713593177).
The earlier experiments kill a Node worker around an explicit browser-state
export or checkpoint-file publication. This one kills the Chromium browser
process and reopens its actual disposable profile, without `storageState`.
The boundary is **after the Save handler returns**, not inside native `setItem`.

## Run it

Use current source, Node 20+, and macOS or Linux:

```sh
npm install --ignore-scripts
npx playwright install chromium
npm run demo:browser-kill
```

To measure an installed Chrome instead of Playwright's Chromium:

```sh
BLUEPRINT_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run demo:browser-kill
```

The script creates its own loopback server and disposable browser profiles.
It never opens your daily browser, account or profile. Output goes to ignored
`runs/browser-profile-kill.json` and `runs/browser-profile-kill-recovered.png`.
Profiles are removed after their owned processes exit. A cleanup error stops
the run and is recorded instead of claiming successful cleanup. This command
was added after the fixed v0.2.2 ZIP; it is in current source and v0.2.3.

## What is measured

1. Start a detached browser on a new temporary profile. Verify its process
   group and profile argument before performing any operation.
2. For update cases, Save version 1 and close normally, then reopen that profile.
3. Invoke the fixture's real Save button handler synchronously. It writes and
   reads back localStorage; the driver receives that value as the acknowledgement.
4. Immediately send `SIGKILL` to that known browser PID. Confirm its exit signal
   and wait for its own non-zombie helpers to exit before profile reuse.
5. Start a different browser PID on the same profile and origin. Read the record,
   its hash and displayed save count. The reader never clicks Save.

The Node driver and loopback server stay alive. No snapshot is exported,
imported or manually written into the profile. Page requests outside the
fixture origin are blocked. The browser uses disposable headless test flags.

## Actual macOS observation

[Raw report](examples/browser-profile-kill-macos.json), Chrome 156.0.8078.47,
Node v22.23.0, completed 2026-10-24T14:48:15.150Z.

| Case | Fresh-browser result | Save count |
| --- | --- | ---: |
| Save, clean close | Acknowledged version 2 | 1 |
| Kill before Save | Missing | 0 |
| Save to a new profile, kill after acknowledgement | Missing | 0 |
| Update a cleanly saved version 1, kill — trial 1 | Version 1 | 1 |
| Update a cleanly saved version 1, kill — trial 2 | Version 1 | 1 |
| Update a cleanly saved version 1, kill — trial 3 | Version 1 | 1 |

For the four post-acknowledgement kills, the measured interval from driver
receipt to the kill request was 0.012–0.181 ms. This excludes the time inside
the browser and the CDP return trip. All five crash cases recorded `SIGKILL`;
all readers had a different PID and made zero Save calls.

The actual trial-1 reader below shows version 1 after the writer acknowledged
version 2. It is an unretouched screenshot of the synthetic fixture, not a
customer account or a reconstructed UI.

![Fresh browser displaying Seed version 1 and save count 1 after the acknowledged update was killed.](../assets/browser-profile-kill-macos.png)

## Independent Linux CI observation

[Raw Linux report](examples/browser-profile-kill-linux.json) from
[Checks 40104681290](https://github.com/LydiaTools/browser-agent-blueprint/actions/runs/40104681290),
Chromium 151.0.7922.34, completed 2026-10-24T14:57:11.615Z.
The downloaded browser artifact's SHA-256 matched GitHub's digest before inspection.

This run recorded the same six outcomes: new version after clean close,
missing before Save, missing after the new-profile acknowledgement, and the
prior version in all three update trials. The five killed browser exits,
different reader PIDs, zero reader Save calls and profile cleanup were checked
in the actual report. These are two small observed runs, not a measured
population failure rate.

## Interpret the report

`status: observed` means the harness completed, its two controls matched,
and each crash read was missing or an exact known version. It does **not** mean
the acknowledged write survived. Missing, previous-version and new-version
outcomes remain observations; unexpected or invalid JSON fails the command.

This small run does not estimate a failure rate or guarantee any result on
another browser, OS or timing. It does not interrupt the native storage write,
simulate power loss, test a target server, or prove exactly-once execution.
Waiting an arbitrary number of milliseconds is not established as a fix here.
Read and reconcile destination state before deciding whether a write landed.

[中文步骤](browser-profile-kill.zh-CN.md) ·
[Worker/export boundary](crash-boundaries.md) ·
[Checkpoint-file publication](checkpoint-kill.md) ·
[Write-ahead recovery](write-ahead.md)

Implementation references: [Node detached child processes](https://nodejs.org/api/child_process.html#optionsdetached),
[Playwright CDP connection](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp),
[Storage.setItem](https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem).
