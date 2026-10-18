# Gemini 3.8 production release

18 October 2026, Asia/Kuala_Lumpur. Authority: the owner requested **deploy to prod.** The release adds the validated Gemini 3.8 adviser to the currently deployed booking interface, preserving its compact ticket, saving stamps, drop buttons and removal of the unverified photo badge. It does not return customers to the earlier quotation UI.

## Scope and release gates

`app/booking-cloud.mjs` constructs the real Vertex adviser with the attached runtime identity. The booking API adds `/api/booking-demo/advice`, delegating to the tested session/origin/CSRF/snapshot/rate-limited comparison route. A scoped component in the existing review shows price/flexibility questions and grounded, plain-text answers. Navigation aborts and clears stale answers. Cancellation consent and confirmation remain separate. No startup, card-selection or page-load model request is made.

Configuration adds exactly `QUOTATION_ADVICE_ENABLED=true`, `GEMINI_MODEL=gemini-3.8-flash` and `GOOGLE_CLOUD_LOCATION=global` to the four existing literal environment values. The image packages the pinned SDK with installation scripts disabled. Existing public customer access, runtime identity, resource/scaling limits, private agency, watch job, Scheduler absence and production data remain unchanged. The prediction role already exists; no IAM or API enablement is included.

Current baseline: `hotel-price-hunter-00014-p9g`, image index `sha256:107c79148e2482bda21d411c4592aba0db0c7e8890f4244cc36773ada591bd36`, region `asia-southeast1`, project `sincere-apex-511418-p0`. The exact rollback service body and previous image/environment are retained in `.local/gemini-prod/before.json`. Restore that previous image and four environment values with an optimistic resource-version check and a fresh revision nonce if acceptance fails; do not change public access or other services.

## Local verification

The complete emulator-backed suite passed **270/270 with zero skips**, including the new booking advice alias/authority test and existing Gemini grounding, session, concurrency, selection and money tests. Evidence: `.local/gemini-38/production-suite.tap`.

The actual booking screens were checked in the supported browser with an explicitly labelled injected provider. Advice/follow-up, failure, unchecked cancellation consent and responsive geometry passed at 320, 768 and 1440 pixels. No removed photo badges or earlier quotation screens were introduced. A frozen-source browser pass and network-disabled container smoke complete packaging checks. The prior three real 3.8 evaluations remain in `docs/gemini-38-evaluation.md`; their ledger remains untouched.

## Publication and acceptance

The production deployment request includes a fresh allowance of at most **three** verification generations on the new revision (price, uncertain dates and room differences), with no retries. Record attempts before sending and stop after the allowance or a technical failure. This is separate from both earlier exhausted ledgers. Use only the existing public display snapshot and synthetic questions; preserve complete safe responses and model-version evidence. UI and cloud acceptance must be recorded separately; direct project/resource IAM comparison does not establish inherited organization IAM visibility.

Pending publication evidence is retained under `.local/gemini-prod/`, including frozen source/context/image pins, uploaded registry byte verification, the exclusive single-use deployment request, after-state comparisons and live browser/model results. Deployment updates only the customer image, those three environment values and the revision nonce, with the existing full-traffic policy retained. No booking, cancellation, payment, refund, email or watch execution is authorized by this release.
