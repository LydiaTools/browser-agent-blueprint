# Task-profile builder · v0.1.1

Target user: a browser-agent builder who wants to inspect and reuse a complete task profile before installing a local test environment. The page's job is to make original source text immediately available, not to simulate an agent or promise host compatibility.

## Reading and visual order

The existing project's slate paper (`#eef3f6`), navy ink (`#173247`), blue action (`#1766a8`), amber focus (`#c78117`) and white reading surface (`#f8fafb`) remain. System sans-serif controls and actual monospaced instruction text preserve the established visual direction. Task selection sits on the left; the corresponding output and Copy/Download actions sit on the right. Source files are visible beside the output. On a phone this becomes task choices, bounded source list, then output/actions. Long source lines wrap visually without changing copied bytes.

## Source and output

`node scripts/build-builder.cjs` bundles 19 original tracked text files: 12 modules, 3 integration contracts and 4 workflows. It reads only the explicit source allowlist. Regenerate and commit `builder/source-data.js` after changing an original text file. CI checks that the generated file matches the source tree.

The six base profiles preserve the CLI's source order and `join('\n')` semantics. Selecting an integration contract appends its text; selecting a workflow appends that after the integration. No translated prompt content or hidden instructions are added. The UI language affects controls only. SHA-256 and UTF-8 bytes refer to the assembled text, not the HTML page, a token estimate or a model evaluation.

`builder/index.html` runs on HTTPS, loopback HTTP or directly as a local file in the exercised Chrome environment. Clipboard availability depends on browser policy; failure selects the visible text for manual copying and leaves Download available. The page does not write project guidance, install a connector, call a model, upload reports, persist user data or load analytics. Existing site's optional-consent analytics are unchanged on their existing pages.

## Validation

Four source/assembly cases check all six CLI profiles, exact bundled files, optional-contract order and rejection of inherited/unknown selection keys. Six real-browser workflow groups check actual clipboard contents, selected-contract downloads, language preservation, denied clipboard fallback, a 390px layout and direct `file://` output. Initial local browser: Chrome 155.0.8059.84. See current CI artifacts for its separately executed browser version and results.

This validates assembly and browser operations. It does not establish live Muse/Grok/Codex model behavior, independent use or improved Star conversion. Original recovery/runtime policies are unchanged.
