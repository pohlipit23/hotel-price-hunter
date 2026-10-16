# Quotation demo verification

The owner-selected quotation was retrieved read-only, its appended hotel/room and
original search context were mapped, and direct gateway observations were bound
to its actual hotel, dates and occupancy. The finished preparer was then executed
successfully against those two services and produced three observed choices.
The selected quotation code and commercial values are retained only in ignored
private snapshots/chat, not a new public fixture.

## Verified outcome

- Actual quotation source status remains `quote`; no confirmed/vouchered status
  was fabricated. The user explicitly approved using a quotation as the demo
  starting record and stopping before rebooking.
- The gateway read for that exact stay returned source options. Original retail
  currency and gateway currency differ; the UI uses the quotation's saved FX
  only for labelled source-price estimates. No final retail/refund amount was
  calculated or presented as verified.
- The UI completes Options → Review → demo confirmation for both an option with
  a free-cancellation flag and a non-refundable option. Missing acknowledgement
  prevents confirmation. The final screen explicitly says no reservation was
  created and the original quotation is unchanged.
- The local server has no upstream provider implementation or transaction route.
  Confirmation writes only its in-memory demo session. Reload restores the same
  receipt without another source call; no provider token/private reference enters
  the browser response. A different snapshot/option cannot reuse an old binding.

## Tests

The focused preparation/domain/server checks pass **12/12**. They cover default
and cloud denial, exact read-call sequence, privacy, one-room/source binding,
missing child ages, exact rational FX estimates, preference for lower observations,
session/origin/CSRF checks, snapshot mismatch, idempotent receipt and a separate
reduced-flexibility acknowledgement. The operator-detail extension is separately
covered by its new GET/boolean-schema regression.

The complete shared-checkout Node suite passes **244**, zero failures, with
**six existing emulator integration checks skipped** (250 total). Its retained
output is `.local/quotation-demo/regression-final.tap`. Unrelated dirty customer
UI/branding/release edits were preserved and are included in that shared-checkout
regression baseline, not authored as part of this slice.

The exact final prepared private snapshot passed real Chromium acceptance at
**320, 768 and 1440 pixels**, including both flexibility paths, consent rejection,
refresh, source-token exclusion, no horizontal overflow and 44px controls. The
320px review/confirmation path was also completed using Tab/Space/Enter. Nine
screenshots and `.local/quotation-demo/browser/result.json` record these checks.
No browser console/page errors or external page requests occurred. Browser tests
serve the real captured facts locally; they do not call providers or create bookings.
Mobile options and desktop confirmation screenshots were visually inspected.

The supported browser connection failed before connection with a runtime-import
permission error. An isolated headless Chromium harness was used instead, with
all non-local requests blocked and no personal browser profile.

## Runtime and boundaries

The prepared bundle is
`.local/quotation-demo/quotation-demo-868434b1-6df3-4e61-9155-bcf02af50720.json`.
The working local preview is `http://127.0.0.1:8094/`; its task-owned Node server
is intentionally left running for review. Port 8093 did not bind; no existing
process was stopped, and the next configured loopback port worked. The app-panel
open request was queued, not claimed as a human visual confirmation.

The quotation read audit, guest-free source projection, direct source snapshot
and screenshot artifacts remain under ignored `.local/`. No access token, guest
name/contact, credential value or real quotation record was added to tracked
fixtures. The public jury scenario is unchanged. No prebook/hold, booking,
cancellation, refund, payment, email, model generation, cloud mutation, deployment
or public exposure occurred.

The observed source flags/naive cancellation timestamps do not establish full
refundable equivalence, and the converted estimates do not establish an all-in
replacement retail price. Real execution still needs its separate source/pricing,
authority, final-check and fulfilment contracts. This demo intentionally ends at
the local selection receipt.
