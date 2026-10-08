# Recovery visual provenance

The README graphic `assets/recovery-proof.png` is a layout of two kinds of evidence from the included deterministic, local demo:

- The left panel displays `assets/recovery-fixture.png`, scaled to fit the layout. The source screenshot was not retouched. It shows the synthetic browser fixture captured on 6 October 2026. SHA-256: `75e0da017111979a20e75d80df8d6466f3dc0c773520ed97c3c918fd7f3dc315`.
- The right panel typesets the local run's readback: two separate processes, one saved synthetic record, and a completed checkpoint. It is explanatory layout text, not a second screenshot.

The graphic originally used the author's former GitHub username in its footer. On 8 October 2026 the footer alone was updated to `github.com/LydiaTools/browser-agent-blueprint`; the embedded fixture capture and result text were retained. Current graphic SHA-256: `477e84c432d323691c255ffa961aa91c13780ae37871e9072adafdf022989468`.

To reproduce the two-process result, run `npm run demo:prepare` and `npm run demo:resume` in separate commands. The all-in-one `npm run demo` intentionally exercises more scenarios and performs two saves, so it is not the one-save demonstration. The local runner uses a synthetic page and deterministic code; no model or production account is involved.
