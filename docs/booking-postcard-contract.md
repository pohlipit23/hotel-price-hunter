# Booking postcard and selected-offer simulation

Frozen implementation contract, 15 October 2026. The approved reference is the two-screen postcard concept `exec-b3705b3a-8e00-4728-ab85-33a18a6603b7.png`; use its second screen for review. This extends [simulated-switch-contract.md](simulated-switch-contract.md), superseding its customer scenario selector and standing-permission prerequisite only for the new selected-offer route. Existing standing-flow API and verification remain supported. All effects are fictional; this slice authorizes no live supplier action, model call, cloud change, deployment or Git publication.

Customer product title is **RoomDrop**. Use the approved key-in-wordmark logo `designs/brand/selected/roomdrop-logo.png` and matching `designs/brand/selected/icon-options/roomdrop-icon-ivory.png`. The wordmark selection is recorded in `designs/brand/selected/README.md`; the user approved the matching ivory icon for this implementation after that README was written. UI implementation owns copying only these two approved assets into the public asset directory; leave source brand files intact. Use ink, coral and ivory from that selected brand, with green for monetary savings. The reference supplies composition and hierarchy; the selected RoomDrop brand supplies identity and palette.

## Customer journey

Show the saved booking immediately, followed by three horizontal alternatives: landscape photo left, hotel name as the primary heading, room name, relationship/refundability pills, potential refund after fees, and a review action. Derive existing defaults internally from the booking/fixture; keep preferences and standing permission unchanged. Do not present an invitation/opening modal, requirements questionnaire, preferences/settings controls, scenario dropdown, chat/Ask link or approval-scope note. Images stay labelled illustrative.

| Offer | Pills | Whole-stay price | Potential refund after USD 5 fees |
| --- | --- | --- | --- |
| `DEMO_EQUIVALENT` | Same hotel; Equivalent room; Refundable | USD 540 | USD 55 |
| `DEMO_DIFFERENT_ROOM` | Same hotel; Different room; Refundable | USD 520 | USD 75 |
| `DEMO_DIFFERENT_HOTEL` | Different hotel; Refundable | USD 510 | USD 85 |

The source booking is Example Harbour Hotel, USD 600, 12–15 November, three nights, two adults and one child. The review screen uses the selected hotel's name as its main heading, then pills, landscape photo/room/stay/occupancy summary, current and alternative whole-stay prices, meaningful changed room/hotel facts, and cancellation terms. Never describe a different room/hotel as equivalent. Show `Net saving after fees`, exactly `-USD 55` for the equivalent offer (respectively `-USD 75` / `-USD 85`), and `Potential refund after USD 5 fees`. Before completion this is a potential refund. Tax-inclusive whole-stay prices come from trusted minor-unit amounts; never supplier cost or generated prose.

Actions are `Approve simulated switch`, `Keep my booking`, and a back link `Your booking`. Review, back and keep perform no approval/start/advance. Selection can use existing `POST /api/selection` with `{offerId,bookingVersion}`; selection grants no authority. Re-entering review may restore selected-offer identity, but must never resume a mutation automatically.

## Frozen HTTP seam

`GET /api/bootstrap?scenario=jury-booking` and all existing public fields remain compatible. Add an object keyed by every current offer ID:

```js
simulation.offerApprovalIntents = {
  DEMO_EQUIVALENT: {
    offerId: 'DEMO_EQUIVALENT',
    offerVersion: 1,
    bookingVersion: 1,
    preferenceVersion: 1,
    materialFingerprint: '<server-computed sha256>',
    confirmed: true,
    idempotencyKey: '<server-issued sha256>'
  },
  // Same shape for the two other customer alternatives.
  // Other diagnostic, non-refundable, blocked or claimed offers: null.
};
```

Only `DEMO_EQUIVALENT`, `DEMO_DIFFERENT_ROOM` and `DEMO_DIFFERENT_HOTEL` receive approval intents. Eligibility requires a current refundable offer and original booking, complete known conditions/cancellation/refund facts, acceptable net saving and an unclaimed source booking version. Ordinary `approval-required` is eligible for an intent; hard `blocked` is not. No client eligibility, category, price, scenario or supplier outcome is accepted.

`POST /api/offer-approvals` accepts exactly `{offerId,offerVersion,bookingVersion,preferenceVersion,materialFingerprint,confirmed:true}` with the intent's required `Idempotency-Key` header and existing JSON/origin/session/CSRF protections. Remove `idempotencyKey` from the body. Successful response is HTTP 200, the full public state plus `replayed` and optional `replayedCommand`, consistent with existing simulation commands. The request's `offerId` binds customer selection; record `selectedOfferId` atomically, without requiring a prior selection request.

In one visitor transaction, verify the current trusted offer and all versions/fingerprint, persist immutable per-offer approval, reserve the source booking version and create the operation at `ready`, revision 0. The approval has `type:'offer'`, `scope:'selected-offer'`, exact booking/offer/preference versions, current material fingerprint, `confirmed:true`, confirmed/expiry times and no standing continuation scope. Expiry must not outlast the trusted offer. No `enrolled`, preferences or standing-permission record changes occur. Persist operation `authority:'offer-approval'`, internal fixed `scenarioId:'selected-offer'`, trusted source snapshots and the approval snapshot. Any exposed `operation.offerApproval` contains only the safe audit receipt; never expose dedupe/request hashes, internal command maps, session IDs or private supplier facts.

Lookup an existing initiating key before fresh version/eligibility checks: exact replay returns current state without a second approval or operation, even after promotion; changed body under the same key is `422 IDEMPOTENCY_PAYLOAD_MISMATCH`. A new command cannot claim an already reserved source version, including concurrent attempts for another offer. Wrong/missing key is `422 INVALID_IDEMPOTENCY_KEY`; malformed/missing/extra fields or false confirmation are validation errors. Preserve existing error envelope/status protections; stale booking/preferences/offer/material bindings reject with 409 and current reason codes. A store failure returns 503 without synthetic success.

## Shared progress and recovery

Use the existing shared domain runner and `POST /api/switches/:operationId/advances` body `{expectedOperationRevision}`. Recheck authority using the operation's actual standing or selected-offer approval; keep `evaluateOffer`/`isApprovalValid` as the safety source. Different-room/hotel offers require their exact approval; they never inherit standing equivalent-only permission. Material changes invalidate the old approval and stop before further irreversible effects. Unknown facts remain blocked despite confirmation.

| Saved stage | Customer status and permitted next action |
| --- | --- |
| `ready` | Approval saved; no replacement/cancellation/refund. `Continue simulation` performs final revalidation. |
| `revalidated` | Final price and terms checked. Next advance secures replacement. |
| `replacement-secured` | Replacement secured (simulated); original stays active. Next advance verifies fulfilment. |
| `fulfilment-verified` | Replacement fulfilment verified (simulated). Next advance requests original cancellation. |
| `cancellation-requested` | Cancellation requested (simulated); result pending. Next advance observes cancellation. |
| `cancellation-verified` | Original cancellation verified; promote replacement booking/version atomically, clear old current offers, saving secured, refund pending. Next advance settles refund. |
| `refund-completed` | Refund completed (simulated); operation `complete`. No further advance. |

Show compact authoritative status, separate saving/refund status, and one manual `Continue simulation` button (the latest approved button copy; retain the stable `advance-demo` ID). Detailed history uses collapsed native `details`; never open it automatically on a new operation. Disable mutation controls during a request; never initiate an approval or stage from load/render/reload. Reload restores the current operation, stage and refund. Before cancellation proof do not claim secured saving, promote the booking or start refund. Refund completion and recorded cancellation reconciliation remain allowed after cancellation proof even if ordinary monitoring authority later changes. Offer-specific approval never carries to the replacement booking.

An uncertain response preserves the exact initiating body/key or advance operation/revision for an explicit retry. Refresh may read current state, but sends no mutation. A retry can replay only that command; it cannot skip into the next stage. A 409 refreshes current state and requires another deliberate action after review. Other blocked/paused outcomes show their reason and disable advance unless the existing fixed unknown-cancellation reconciliation is supported. Keep the prior material-change and uncertain-cancellation scripts as backend/test fixtures; no new customer scenario UI or `/demo-lab` is required. Non-refundable offers receive no approval intent; if exposed in any future UI, reduced flexibility and monitoring end must be explicit before confirmation.

## Minimal DOM acceptance seam

Preserve these stable IDs for browser verification; implementation may add others: `booking-summary`, `offers`, `comparison`, `comparison-title`, `comparison-saving`, `approve-offer`, `keep-booking`, `simulated-switch`, `switch-stage`, `switch-explanation`, `switch-money`, `advance-demo`, `switch-history-details`, `switch-history`, `switch-message`. Alternative review controls carry `data-offer-id`. `comparison` is the selected review region, its title is focusable after navigation, and `simulated-switch` sets `aria-busy` during mutations. `switch-message` announces result/error updates; keyboard-accessible buttons and collapsed history must work at mobile and desktop widths. Hidden obsolete forms/modal/scripts must not throw or generate requests.

## Acceptance evidence

Verify all three clean-session customer choices through six manual advances, persisted reload, exact prices/pills/fee/refund copy, collapsed history, responsive cards and keyboard navigation. Domain/server coverage proves atomic approval/start, same-command replay, changed payload rejection, concurrent different-offer claims, stale versions/fingerprint, unsupported/non-refundable/unknown blocked offers, selected approval expiry/revocation, changed final facts, fulfilment-before-cancellation, promotion-before-refund completion, and no approval continuation. Existing standing-path material-change stop and uncertain-cancellation same-intent recovery remain covered. Any environment-dependent persistence/browser verification that cannot run must be reported separately, never counted as passing.
