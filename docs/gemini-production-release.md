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

Publication evidence is retained under `.local/gemini-prod/`, including frozen source/context/image pins, uploaded registry byte verification, the exclusive single-use deployment request, after-state comparisons and live browser/model results. Deployment updates only the customer image, those three environment values and the revision nonce, with the existing full-traffic policy retained. No booking, cancellation, payment, refund, email or watch execution is authorized by this release.

## Published and verified

Live: https://hotel-price-hunter-2qbcpylngq-as.a.run.app/.

- Ready revision receiving 100% traffic: `hotel-price-hunter-00015-b8d`.
- Source commit: `75c6b5de249b641d03784ac06be7ee00c9aaed4d`.
- Image index: `sha256:6184ac50e88e38441b46fff63d9c5a31eda89ef452f3f9e864205e0ddc2dbd1c`.
- Runtime child: `sha256:53c519cb194b26604a6ff4da4e8bd36e39bc78085c64ea1e4d2a4bcdc398497b`.
- Build context: `cb0776cbbdb3023fe2ace9f098f00db163409435ded2a1ca99eb4bb16e0eb35d`.
- Unchanged display snapshot: `8fe12f79f9910d9ca9123ff2069d349f3e11909c1e1f36d9708539663fb5f6f4`.

The exact frozen source passed 20 focused tests and the original booking browser journey at 320/768/1440 pixels, including confirmation, reload and return focus. The packaged image passed a network-disabled HTTP smoke. Actual registry manifest/config bytes independently matched source/context/snapshot labels and the booking entrypoint before deployment. Temporary upload credentials were removed and global Docker configuration was unchanged.

The real production browser successfully asked about uncertain dates on the non-refundable drop and received Gemini's recommendation to retain flexibility. The cancellation checkbox remained unchecked. Live geometry and screenshots passed at 320/768/1440 with no overflow or browser warnings/errors. Two further real API checks passed for price and room/meal differences, both reporting provider model version `gemini-3.8-flash`. Complete customer replies were semantically reviewed: AED 7.82 stayed indicative, room/meal labels were distinguished, no equivalence/upgrade or refund was invented, and confirmation remained null. The separate production allowance is exhausted at **3/3, zero retries**; earlier evaluation ledgers are untouched.

After-state verification passed. The service specification differs only by the image, three named Gemini environment values and revision nonce. Customer public access, service identity, concurrency/resources/scaling, private agency configuration/policies, watch job/configuration/status, direct project IAM, Scheduler list and all sampled saved-data fingerprints are unchanged. The data sample contains 11 visitor documents, one agency-case entry and the same watch checkpoint. Runtime image digest and full traffic match the verified registry result. No cloud IAM, database, supplier or real transaction mutation occurred. The retained inherited-organization IAM visibility limit remains a separate coverage limitation.

The exact release context is `.local/booking-release-d3ce2de9-0a4f-4051-a122-76c6e89740b6/`. The main evidence files are `.local/gemini-prod/{before,after,deployment-request,deployment-result,registry-result,model-acceptance,live-browser}.json` and `live-adviser.png`. Source commits were kept local; no source push was part of this deployment.
