# Quotation Gemini restoration: local verification

**Subsequent 3.8 update:** [Gemini 3.8 Flash evaluation](gemini-38-evaluation.md) records the user's model decision, current settings and three successful real requests. Historical zero-generation checks below describe the initial local restoration. The public service is still unchanged.

17 October 2026. Implements [the restored hackathon contract](quotation-gemini-contract.md). No live model, supplier, cloud deployment, source publication or agency/watch change occurred. Existing unrelated booking/brand work was preserved. The new code remains a local candidate; the public service still runs the previous quotation release.

## Implemented customer behavior

Selected-room review now contains a Gemini stay adviser, suggested price/flexibility questions and a 1,200-character question box. The selected comparison remains visible. The server supplies only anonymised display facts to Vertex AI; Gemini selects a recommendation, understood priority and one to three grounded factors. Application code renders the financial limits and transaction wording. Two previous exchanges are retained per option in the existing one-hour visitor session; model calls and advice do not confirm a selection or check consent boxes. Advice history is temporary, disappears on server restart and is not a durable preference record.

The quotation path has its own prompt because source-rate estimates and an unbooked quotation cannot use the earlier fictional booking/refund adapter's assumptions. That older adapter and its inference ledgers are unchanged. There is no model invocation on startup, page load or option selection, and no fallback text is presented as an AI response.

## Automated verification

The six new adapter tests cover anonymised projections, model-selected price/flexibility/room factors, unknown cancellation, output enums and exact keys, duplicate/unsupported factors, financial role/currency validation, malformed output, provider failure and timeout without retry. Six new HTTP tests cover genuine adapter use with injected transport, per-option and per-visitor context, session/origin/CSRF/snapshot binding, forged facts, unchanged confirmation, rate limits, global concurrency and post-generation expiry. The cloud-profile test requires explicit opt-in and complete model configuration.

The complete regression suite passed **266/266, zero failures/cancellations/skips**, in 119.3 seconds against a task-owned Firestore emulator with its required `demo-roomdrop-iap-qa` namespace and `127.0.0.1:8081` endpoint. Final results are retained in `.local/gemini-review/final-suite.tap`. Earlier attempts passed 265 checks and failed only the existing watch test's fixed namespace/port setup guards; those were configuration failures and were not bypassed or changed. Sandbox filesystem restrictions on older CLI tests were resolved by using normal host PowerShell. No live API was used.

A separate source-copy mutation removed the model reason-code allowlist. The untrusted-output regression test detected it. Original application source was unchanged; evidence is in `.local/gemini-review/mutation/result.txt`. Syntax and whitespace checks pass.

## Browser verification

The supported in-app browser exercised the actual local quotation UI with the real adapter and an injected provider. The screen explicitly labels these responses **Test response - no live Gemini call**. Verified flexibility advice, price follow-up, provider failure, leaving a pending request for another option, cleared question/answer state, untouched acknowledgements, keyboard access, confirmation guard and confirmed-state persistence after reload. Browser logs contained no warnings/errors. At 320, 768, 1024 and 1440 pixels, review had no horizontal overflow or buttons below 44 pixels high. Representative mobile and desktop captures were visually inspected.

Evidence: `.local/gemini-review/browser-result.json`, `flexibility-{320,768,1024,1440}.png` and `review-desktop.png`. The existing isolated quotation browser harness also passed options/review/confirmation/reload and non-refundable acknowledgement checks at 320, 768 and 1440, including the unavailable-advice and revised keyboard order; zero page/console errors or external requests. Its report is `.local/quotation-demo/browser/result.json`.

## Container verification and release boundary

`Dockerfile.quotation` now installs the existing pinned dependencies with `npm ci --omit=dev --ignore-scripts`; release preparation includes the package files, advisor and prompt. Local image `roomdrop-gemini-review:local` built successfully. The local candidate context is a working-tree packaging smoke check, not an approved immutable cloud release.

A read-only, capability-restricted container with **network disabled**, no credentials or mounts, the production customer profile and explicit Gemini configuration started the actual cloud entrypoint. Internal HTTP health returned status `ok`, surface `quotation-demo`, three options, model `available:true/status:configured-unverified`. This proves packaged SDK/prompt startup, not Vertex connectivity or semantic correctness. It cannot establish current cloud IAM, model access or pricing. Task-owned test containers are removed after verification.

## Initial live acceptance proposal (superseded by the 3.8 evaluation above)

The historical five live attempts stay exhausted. Request a fresh allowance of **three sequential Vertex AI requests, no retries**, in existing project `sincere-apex-511418-p0`, location `global`, model `gemini-3.1-flash-lite`:

1. Explain the selected refundable option's price difference without claiming a verified saving/refund.
2. For a non-refundable option and uncertain dates, recommend retaining flexibility and identify the cancellation trade-off.
3. Explain room/meal label differences without inventing equivalence or an upgrade.

Use only the already-public display snapshot and synthetic questions. Save complete safe replies for semantic review; do not log credentials. Deployment remains separate: review a clean source/digest, preserve public customer/agency/watch boundaries, retain the existing attached service identity, explicitly enable the feature/model configuration and verify the live public journey. No new IAM authority is assumed. Only after live model and deployment acceptance can the submission claim that the public demonstration uses Gemini.
