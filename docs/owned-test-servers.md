# A test server is not every process named Node

An agent starts a preview server. The test ends. It sees another process with the same name and decides to clean up. Which one belongs to this run?

In a [Hacker News discussion](https://news.ycombinator.com/item?id=50239041), one developer described an agent stopping an application engine while cleaning up a similarly named UI process. Another described a process-matching command accidentally matching itself. These are individual reports, not a measurement of how often the problem happens.

This example explores one narrower design: **start two cooperative localhost servers from one controller; close one through the private channel created with that child; check that the other still responds.**

```sh
npm run demo:owned-servers
```

Requires Node 20+. No browser, packages, account, or model is needed. The controller starts two new copies of the included Node server on operating-system-assigned loopback ports, checks both responses, asks the first child to close, waits for its normal exit, checks that its port no longer responds, and reads the second server again. It then closes the second. The JSON output reports those checks; actual ports and PIDs vary.

```json
{
  "before": { "a": "responding", "b": "responding" },
  "after_closing_a": { "a": "not responding", "b": "responding" },
  "cleanup": "both cooperative test servers exited normally"
}
```

The controller uses the `ChildProcess` IPC channel it created and sends a shutdown request. The child closes its own HTTP server. No process is selected or signaled by name, port, PID, or path; an IPC disconnect also asks the child to close. Only the two synthetic servers started by this example are involved.

## Where this ends

This is **not** a general cleanup tool or an OS security boundary. A real server needs to implement a compatible shutdown protocol; an arbitrary existing process will not. A child may ignore the request, retain open connections, spawn detached descendants, or exit unexpectedly. If a controller loses its handle, this example does not identify or recover previously started processes. It does not prevent an agent with separate shell access from killing an unrelated process. Adapt, test, and enforce lifecycle controls in the actual host rather than treating this example as a guarantee.

For broader process inspection, [proc](https://github.com/yazeed/proc) documents port/process lookup and dry runs. [AgentDust](https://github.com/hamzahamidi/agentdust) documents session-based cleanup for supported environments. These are separate projects; we have not benchmarked or integrated them.

The current source contains this example. The fixed v0.2.4 ZIP predates it.
