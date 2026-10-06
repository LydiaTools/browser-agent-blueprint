Demos are deterministic host-control scripts against a local browser, not a model-driven agent. Muse/Grok/Codex integration contracts are not live-tested.

Browser Agent Blueprint v0.1.0 includes:
- 12 original copyable .txt prompt modules.
- 4 browser workflow templates.
- 6 reproducible demo scenarios, including separate-process resume.
- 22 host-control unit tests.
- English and Chinese quick-start documentation.
- MIT license and explicit provenance.

Start with `npm run assemble -- content`, or run the local browser demo.
Use `demo:prepare` followed by `demo:resume` to verify the save count stays at 1.

Known limits: no model invocation, no automatic scheduler, no production crash-consistent dispatch, and no live vendor integration benchmark.

Which side effect does your browser adapter classify incorrectly — autosave, redirects or a timed-out submission? Share a synthetic reproducer.

Maintainer: https://github.com/lydiahub19921013
