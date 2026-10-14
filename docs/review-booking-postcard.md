# Booking postcard independent review

Reviewed 15 October 2026 against fixed base `b6ad65ac8f7ef3e463670dfaed21ba37aa518989` and `docs/booking-postcard-contract.md`. This report covers the local fictional selected-offer simulation. It is not a public release, live supplier, deployment or production-persistence approval.

## Findings

1. **P2, repaired and independently verified — explicit confirmation in the shared domain.** `approveOffer` originally accepted `confirmed:false` with an otherwise current intent and created an approval whose persisted confirmation was `true`. The HTTP endpoint rejected that input, so the exposed HTTP path was protected; the exported domain function violated its own consent invariant. The new domain guard rejects false, missing, string, numeric and null confirmation before creating authority. Existing initiating-key lookup and payload mismatch checks still precede fresh approval gates.
2. **P2, repaired and independently verified — distinguish a proof/authority stop from unknown cancellation and explain the recorded reason.** `booking.js` originally labelled every `agency-exception` as “Cancellation uncertain” and omitted the actual reason. Revoking selected approval after securing or verifying the replacement produces `agency-exception` with `cancellation:null`; no original cancellation has been requested. The repair distinguishes actual unknown cancellation from other agency pauses and presents recorded reasons across failed, renewed-approval and agency-review states. Four independent status checks pass: no fabricated cancellation, actual unknown cancellation, early changed-material stop and essential-requirement mismatch. The two early-stop checks failed before the final repair and passed afterward.

No P1 finding identified in the reviewed backend changes.

## Evidence and coverage

Independent guard tests are isolated under ignored `.local/review-postcard/`; no application or repository test source was edited by this reviewer. Seven guards passed after the consent repair:

- Direct domain confirmation rejects false, undefined, string, number and null without changing the original state.
- Current trusted offer material changes stop a cached approved source before securing replacement.
- Revocation after fulfilment stops before requesting original cancellation.
- Consent cannot cross from the selected different room to a different hotel.
- Exact approval/offer expiry blocks execution; an expired fresh offer cannot create authority.
- Mixed refund currency and missing switch fees receive no approval intent.
- Public approval receipts omit injected private fields, request hashes, session IDs and command maps; public operations omit private command and source snapshots.

Four meaningful mutations were performed only on copied domain files. All were caught by the independent assertions:

| Copied mutation | Observed failure |
| --- | --- |
| Remove explicit consent check | Direct-domain false/missing/string/number/null confirmation guard fails |
| Use the cached source instead of the current trusted offer during authority checks | Changed-current-material guard fails |
| Bypass execution authority checks before securing replacement/cancelling original | Material-change, revocation and expiry guards fail |
| Remove approval material fingerprint binding | Changed-current-material guard fails |

Additional source review covered atomic selected-offer selection/approval/source reservation/start; the three supported refundable offer IDs; current booking, preference and offer versions; exact initiating replay before fresh eligibility gates; changed-payload mismatch; versioned manual advances; fulfilment before cancellation; promotion only after cancellation proof; separately completed refund; and selected-offer approval not carrying into the replacement booking.

Reviewed HTTP tests cover JSON shape, true confirmation, fingerprint format, origin, CSRF, session expiry, unsupported IDs, concurrent competing offers, lost approval/advance acknowledgments, failed storage commits and visitor operation isolation. These are source-reviewed here; their execution totals belong to the coordinator's test run.

The Firestore transaction callback calls synchronous domain transformation, with no supplier/model/network effect inside the callback. Installed Firestore 9.3.1 source confirms a bounded default of five transaction attempts. Durable contention, restart and independent-server execution evidence is attributed separately in the verdict below.

Static UI review confirms the current booking and three hotel-first alternatives, approved review identity/pills, trusted whole-stay prices and potential refund language, explicit approval, no automatic load/render mutation, exact pending-command retries, native collapsed history and safe text rendering. Actual browser acceptance is owned by the QA worker and is not claimed by this source review.

Public logo SHA-256 `FBF3DEBCA23AEB003805A4D513593933CAB5178246287EC18163BC5CD6224084` matches the approved source logo. Public key icon SHA-256 `7069932965E19938362E72642C121189359BDBA508925D7A37A2AE843D1E9E79` matches the approved ivory source icon. Source brand files were not modified by this reviewer.

## Bounded verdict

**Approve the reviewed local fictional selected-offer implementation.** Both P2 findings are resolved. Independent evidence is seven domain guards, four actual-source status-copy checks and four caught copied-domain mutations. No unresolved P1/P2 finding remains in this bounded source review.

The coordinator separately reports a full Node/emulator run of 102 passed, zero failed and zero skipped, including environment-dependent persistence gates. QA separately reports 11 browser groups covering all three choices, 21 saved stage snapshots, 16 responsive width checks, no runtime errors and zero Vertex calls. Those reported results are not this reviewer's independent executions. Final Docker/restart smoke and the live browser retest of corrected stopped-state copy were still pending when the coordinator sent that report.

Reviewed final application SHA-256 snapshots. The coordinator removed one extra EOF blank line from `booking.js` after review; its hash below reflects the final bytes. This whitespace-only cleanup does not change the approval verdict or require another behavioral test run.

| File | SHA-256 |
| --- | --- |
| `app/domain/simulation.mjs` | `653D93B5C6277A2D6E2B428F81BC79FE4E8699C94327A4B9B868D71FB8DC8238` |
| `app/server.mjs` | `C40E39256EADA693488F53E47D5F1BBF7B4C16AD7ACE760DE34F7F2C1BA082BB` |
| `app/public/booking.js` | `ECA7C701FCB0F1B18B0534AE4AF8D5199B70A18A531C790875BA1FEF772B6B79` |
| `app/public/booking.html` | `677EF5621284126D3FB791DD683084C2D29554B950663C37E604F1B7FE027DFF` |
| `app/public/booking.css` | `757EC7CBE634BC4E15C02FF2589886476C4298B3B4E5DD270D898105E2E2EB11` |
