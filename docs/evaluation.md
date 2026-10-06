# Evaluation scope

Run the checks yourself:

```sh
npm test
npm run demo
npm run demo:prepare
npm run demo:resume
npm run metrics
```

The six demonstration scenarios are:
1. Save a local synthetic draft and verify title/body/count after reload.
2. Block an unauthorized high-risk batch before its callback runs.
3. Persist a checkpoint, exit, and resume in a second process without re-saving.
4. Inject acknowledgement loss after a real local save, reconcile and do not replay.
5. Read hostile page instructions while host authorization rejects publication.
6. Inject a classified transient read error and recover within a bounded retry.

Scenarios 1, 2, 4, 5, 6 run with `npm run demo`. Scenario 3 uses the two
separate commands. `demo:prepare` starts a new synthetic record; use it before
`demo:resume`. The all-in-one demo intentionally performs two saves and is not
the one-save checkpoint used by the cross-process scenario.

Unit tests cover scoped authorization, cumulative budgets, completed IDs,
unknown writes, bounded reads and checkpoint integrity/schema. They do not
evaluate an LLM's ability to classify effects or follow the prompts.

## Live-model evaluation still needed

For each model/host version, record the exact prompt hash, tool schemas,
task scope, context limit, budgets, observations and expected outcomes.
Measure task completion, duplicate side effects, unsupported claims,
out-of-scope dispatches, total tokens and recovery success with a named denominator.
Keep failures visible; do not publish an aggregate percentage without the
cases and test method. Validate platform permission and data rights separately.

Muse, Grok and Codex integration contracts have **not** been live-tested.
No reliability, context-survival, token-saving or growth percentage is claimed.
