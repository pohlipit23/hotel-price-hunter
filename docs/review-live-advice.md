# Independent live advice retest review

**Verdict: PASS for the two authorised failed-case retests on private revision `hotel-price-hunter-00006-hfm`.** The full customer-facing advice and decision bodies satisfy the bounded semantic criteria. This is not approval of public release or completion of every first-milestone acceptance row.

Reviewed 14 October 2026, Asia/Kuala_Lumpur. Evidence: `.local/private-cloud-retest-result.json`, captured 20:37–20:40 Kuala Lumpur, and preserved `.local/private-cloud-model-result.json`. The reviewer made **zero model calls, HTTP/cloud requests, application mutations or git-state changes** in this retest review; only this report was written. The integration worker alone executed the two newly authorised calls.

## Actual response assessment

| Retest | Full-body semantic verdict | Decision and authority |
| --- | --- | --- |
| Non-refundable offer, uncertain plans; global attempt 4 | **PASS.** Recommends keeping the existing arrangement and explicitly explains retaining refundable cancellation flexibility. USD 115.00 is a potential refund: USD 120.00 price difference minus USD 5.00 fee, with zero original-cancellation/refund-processing costs. Normal monitoring ends regardless of preference **only if an approved non-refundable replacement becomes active after successful execution**. Recovery continues; comparing or approving alone changes nothing. No switch/refund has occurred. | `approval-required`, `OFFER_APPROVAL_REQUIRED`, `netSavingMinor:11500`, `authority:null`, `permissionsChanged:false`. |
| Unknown essential bed; global attempt 5 | **PASS.** Recommends keeping the booking, explicitly says the offered bed type is unknown and the essential requirement cannot be confirmed. It states **USD 95.00 hypothetical arithmetic**, blocked, no saving secured and no switch/refund. It never claims a verified king bed or USD 9500. The refundable monitoring sentence is conditional on a future approved active replacement; it does not say the blocked offer executed or changed current monitoring. | `blocked`, `UNKNOWN_ESSENTIAL_CONDITION` and `UNKNOWN_EQUIVALENCE`, `netSavingMinor:9500`, `authority:null`, `permissionsChanged:false`. |

Both responses retain `summary`, `recommendation`, `tradeoffs`, `uncertainties`; future prices remain unknown and comparison creates no approval/permission. Persistent revocation remains recorded in the accompanying check ledger: preference version 3, automatic switches false and permission record null. The recorded advice checks do not restore permission.

The current design limits Gemini to selecting validated recommendation/factor codes. The application renders monetary, lifecycle and authority statements plus trusted qualitative phrases. The displayed flexibility/unknown-condition rationales match that reviewed mapping. **This review validates the actual Vertex-backed customer responses under that design; it does not claim arbitrary raw generative English was semantically validated.** Raw provider code objects were not separately retained in this HTTP result ledger.

## Budget, provenance and historical evidence

- Retest ledger contains **exactly two** success/HTTP 200 records, numbered local 1–2 and global **4–5**. `previousGlobalAttempts:3` and `totalGlobalReservedAttempts:5` agree. There is no retry entry; the reviewed provider configuration remains one attempt with no automatic regeneration. This is the task ledger accounting, not an account-wide provider-usage audit. **All five authorised attempts are now consumed; further generation needs new explicit approval.**
- All **32** accompanying technical checks are passed. They pin project `sincere-apex-511418-p0`/Singapore, private invocation, current Ready revision, reviewed identity/environment/limits, unchanged source UI and actual persistence/authority checks. The already independent private baseline was not repeated by this reviewer.
- Canonical URL: `https://hotel-price-hunter-2qbcpylngq-as.a.run.app`. Current service input index: `sha256:f6cf23de9be7c44cb419263441c29761efa71c5f923a9bea8aed33c3a5f2433d`; resolved Linux/amd64 child: `sha256:d033885504ac7493d0c3d1f65c06e23f1184a390d19925b3e61e61c05d66375c`. Model is `gemini-3.1-flash-lite` at `global`.
- Original ledger still has attempts **1–3** on `hotel-price-hunter-00004-gn5`, retaining the original equivalent pass, monitoring failure and minor-unit failure. All three original advice bodies deep-match the frozen pre-retest replay snapshot at `.local/review-advice-grounding/mutation/tests/gemini.test.mjs`. Its original last-write time, 13 October 15:37 UTC, predates the new ledger, 14 October 12:40 UTC. Historical failures were not rewritten into passes by this review.

## Exact coverage limits

The two failed scenarios now pass on the repaired release. The equivalent USD 55/5/60 scenario passed the original release and has current offline rendering coverage, but **was not newly generated on revision `00006-hfm`**. Do not describe this two-call retest as a fresh three-scenario live run.

These are anonymised frozen demo booking/rate facts with live Google model invocation, not a live supplier search or transaction. No public access, live Altovo booking/cancellation/refund, email delivery, scheduler, public mobile/browser acceptance, or whole-milestone completion is established here. Active trial classification, remaining usable credit balance/expiry and no-charge coverage remain independently unobserved; inherited/resource-level IAM was not exhaustively audited. Those separate gates remain explicit.
