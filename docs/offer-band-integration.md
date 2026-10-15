# Selected savings cards: option B

16 October 2026, Asia/Kuala_Lumpur. The user selected **B — full-width category
band**, then requested a commit and a prompt for a separate UX reviewer.
The original three-option prototype is preserved on `codex/offer-labels-prototype`
at `c3d7ef7`; its switcher and losing variants are not part of the customer source.

## Implemented

- Full-width, text-labelled bands distinguish **Same hotel · Matches your room**,
  **Same hotel · Different room** and **Different hotel**. Hotel identity and
  category/verified equivalence determine the label; an unverified match instead
  says **Review room details**. Color supplements the words.
- **Compare your savings**, **Save USD 55 / 75 / 85** and whole-stay potential
  refund wording distinguish net savings from the replacement booking price.
- Refundability stays visible. Review still shows the exact negative-prefixed net
  saving, fee breakdown, cancellation terms and explicit selected-offer approval.
- The established landscape photographs, horizontal cards, hotel headings and
  RoomDrop identity are preserved. Prototype photo proportions were not promoted.

No domain, API, storage, agency, permission, worker or transaction change. The
demo's check/reserve/verify/cancel/refund stages remain manual. A production flow
with background orchestration after approval is a recommendation, not implemented
behavior. Pending refunds and uncertain cancellation remain distinct from success.

## Verification

The new browser assertions failed against the previous source because the bands
were absent, then passed after integration. A regression caught prototype photo
dimensions overriding the existing landscape contract; those overrides were
removed, retaining the original geometry assertion.

The final isolated Chromium run passed **8 customer clarity + 11 postcard +
17 watch** groups, with no browser errors or external requests. It includes exact
bands/savings, review/keyboard behavior, explicit non-refundable acknowledgement,
all manual stages, pending/completed refund, unknown cancellation, saved reload and
responsive geometry from 320 to 1440 pixels. Mobile 375px and desktop 1280px
initial screenshots were visually inspected. Evidence is `.local/offer-band/`;
use `node tests/customer-clarity.browser.mjs --offer-band --regression` to reproduce
against isolated local memory fixtures, without touching cloud services.

The complete emulator-enabled Node regression passed **195/195**, zero failures
or skips, in 121.7 seconds. Output is `.local/offer-band-node-test.log`. The run
used the separate `demo-roomdrop-iap-qa` namespace on the local emulator with
empty model configuration; this is not production Firestore evidence.

## Delivery boundary

The temporary phone preview is refreshed from a retained checkout of the committed
source, without the prototype switcher. It uses isolated fictional memory data,
Gemini is unconfigured and agency access is unavailable. A restart resets only
that demo data. Existing customer/agency Cloud Run services, IAM, watch job and
absent Scheduler are unchanged. No cloud release, external OCR or source push is
part of the selected-design implementation. Independent UX review is deliberately
left for the separate agent requested by the user.
