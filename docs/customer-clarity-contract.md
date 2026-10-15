# Customer flow clarity

15 October 2026. The user confirmed the live functional check, then reported many
UI issues, too much text and unclear customer steps. This authorises a bounded local
UX improvement; it does not approve deployment of a new image. The earlier cloud
rollout/job uses its frozen `c9a7d7f` source and remains separate.

## Customer outcome

Each state should answer: what is happening, what happens next, and what the main
button will do. Shorten default copy and move secondary evidence into clearly named
collapsed details. Preserve the RoomDrop brand, palette, booking-first layout,
horizontal photo cards, hotel-name headings and relationship/category pills.

Existing RoomDrop screens and browser evidence are the design reference. A new
visual identity, hero/layout replacement or third-party design imitation is outside
this slice. No opening modal, questionnaire/settings, chat or scenario selector.

## Bounded changes

- Add one compact customer step cue for choosing, reviewing and changing the stay.
  Keep the current step distinct, with one concise next-action explanation.
- Shorten the watch summary. Place clock/preference/history detail in collapsed
  **Watch details**; retain clear watching/stopped status and the stop control.
  Consent still grants checks and preview records only, never switch permission.
- Give each manually advanced stage a useful customer heading and action label,
  replacing a repeated generic continue label. Keep the active operation near the
  booking and ahead of secondary watch detail. Avoid duplicate success chatter.
- Clearly separate new booking confirmation, original cancellation and refund.
  A pending refund cannot look completed. Unknown cancellation still means the
  original remains active with no secured saving/refund claim.
- Reduce visible initial/review wording by at least 30% where practical, measured
  against the same saved state. Preserve hotel/room/terms, money, fees, explicit
  selected-offer approval and non-refundable acknowledgement at decision time.
- Keep a concise visible demo disclosure and preview-only notification language.
  Technical IDs, version numbers and diagnostic prose belong in existing details.

## Authority and verification

No domain/API/storage/agency change, automatic advancement, mutation on render or
reload, new transaction authority, live supplier/model/email call or cloud release.
Keep approval fingerprints and required acknowledgements unchanged. Details use
native accessible controls; status/focus and mobile touch behavior remain usable.

Verify the actual local browser at mobile 375px and desktop 1280px, including initial
selection, review, approval, manual stages, pending/completed refund, blocked/unknown
states and saved reload. Preserve the original postcard, non-refundable and watch
browser regressions with only justified visible-label assertion updates. Inspect
before/after screenshots and word counts; no clipping, overflow, overlapping actions
or hidden material approval terms. Root and an independent reviewer inspect results.

The Browser runtime import still fails with EPERM, and Computer Use app access timed
out. Isolated local Playwright is permitted for local fixture QA only; no personal
profile/session/cookie access or sign-in workaround. Preserve retained local services
and use separately owned QA processes. A new exact candidate and cloud approval follow
only after local evidence and review.
