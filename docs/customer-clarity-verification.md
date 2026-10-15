# Customer clarity verification

15 October 2026. Local UI improvement requested after the user completed the live
functional customer/watch/switch/refund/agency check. The deployed customer and watch
job remain the frozen `c9a7d7f` image; no new UI image has been uploaded or deployed.
Scope and authority are in [the contract](customer-clarity-contract.md).

## Customer-facing changes

- One **Choose → Review → Switch & refund** guide, without a second numbered
  sequence inside the operation card.
- Compact **Price watch**, with timing/preferences in collapsed **Watch details**.
  Stop remains available; unsupported demo rates are stated as a failed check.
- Active operation placed immediately after the booking, before secondary watch
  details. Its next action is reachable within the 375×900 mobile screen.
- Predictive manual actions: check final price, reserve, verify, request cancellation,
  check cancellation and complete the simulated refund. No automatic advancement.
- Pending and completed refund states are distinct. Explicit offer approval,
  non-refundable acknowledgement, prices/fees/terms and original-active-until-cancelled
  remain intact. Secondary history remains collapsed.
- Completion shows the receipt/result without a large disabled next-action button
  or repeated completion sentences. The completed control remains disabled and
  hidden; running states retain their explicit actions.

Brand, palette, hotel headings, relationship pills and horizontal offer photo cards
are preserved. No backend/storage/agency/permission change. The active booking photo
is compact while a switch is in progress; initial booking-first structure remains.

## Real browser and visual evidence

The implementation worker used a task-owned localhost server with explicit in-memory
fixture storage and isolated Chromium contexts; no retained process or personal
browser/profile/session was used. External requests were blocked and the run recorded
zero external/model requests and zero browser runtime errors.

Eight clarity acceptance groups cover choose/review, exact money, keyboard behavior,
all six manual advances, read-only reload, pending/completed refunds, unavailable
replacement demo rates, non-refundable consent and unknown-cancellation recovery.
The final affected browser regression retained **11 postcard + 17 price-watch**
groups after the accessibility and terminal-state cleanups. Only three watch-harness assertions changed from visible `innerText` to
`textContent` because their unchanged secondary evidence is now deliberately collapsed.
Those assertions still verify actual saved evidence; they do not claim it is visible.
The final browser run passed **8+11+17** groups with no errors or external requests.
The complete emulator-enabled Node suite passed **195/195**, zero failures/skips,
after the accessibility fix. The final terminal-only copy/control adjustment was
then verified by the repeated full customer/watch browser regression; backend and
storage code did not change. Outputs are `.local/customer-clarity-final-test.log`
and `.local/customer-clarity/result.json`.

Geometry checks passed 320, 375, 768, 1024, 1280 and 1440 pixels. Before/after captures
at 375 and 1280 pixels and the worker report are under `.local/customer-clarity/`.
Root inspected initial, review, active operation, pending/completed refund and desktop review captures; the
independent reviewer inspected those plus completion, non-refundable, unknown and
changed-offer states. Pointer flows show no erroneous heading focus rectangles;
intentional keyboard focus remains visible. Clean presentation screenshots blur
focus only after keyboard assertions; no pointer defect was hidden.

| Visible main-content words | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Initial, both widths | 159 | 129 | 19% |
| Review, both widths | 85 | 76 | 11% |

The initial aspiration of 30% where practical was not reached. Required booking/card
facts, net fee/refund wording and decision terms were retained, and the useful step
guide adds words. These are measured reductions, not a claimed 30% result. Clarity
also comes from hierarchy, collapsed secondary detail and action labels.
The last terminal cleanup reduced the previously revised completed view from 92 to
83 words, without removing refund or booking facts; that is a comparison within
this revision, not an original-cloud baseline percentage.

## Independent review and accessibility correction

A fresh read-only reviewer ran **26 captured browser states** at mobile/desktop,
checking all stages, exact promotion/refund boundaries, unknown cancellation,
changed-offer stops, non-refundable consent and read-only reload. A copied-source
mutation enabling unchecked non-refundable approval was caught; live source was not
mutated. No unresolved actionable findings remain.

The reviewer caught a P2 regression: removing repeated visible success chatter had
also removed meaningful step announcements, while disabling the busy action dropped
keyboard focus. A new real-browser reproduction failed before the fix. Newly committed
continuing advances now announce the stage through one visually hidden polite region
and focus the next enabled action. Final/blocked results focus the heading with an
empty live region, avoiding duplicate speech or a disabled target. Approval, render,
reload, same-state watch updates and exact replay announce no new advance.

The independent **nine-entry** accessibility recheck passed, including lost-response/
exact-replay behavior. This establishes DOM live-region/focus semantics in Chromium;
no screen-reader audio session is claimed. Its report and probe evidence are under
`.local/customer-clarity-review-ui/`.
The subsequent four-check terminal recheck passed at both widths: running actions
remain visible, the final action is hidden/disabled, refund facts remain truthful,
and final-heading focus plus silent/read-only reload are preserved.

## Release boundary

The retained `http://localhost:8080/` serves the new markup with Firestore emulator
storage and Gemini `unconfigured`; it was checked read-only without restarting it.
This is the local preview, distinct from the unchanged live customer image.

The packaged candidate pins are recorded after completion in the ignored local
result/pin files. A new private-customer release requires approval
of its exact source/image, upload and customer update. Existing IAP, identities,
agency service, watch job/ledger and absent Scheduler are preserved. No further job
execution, model call, supplier action, email or publication is included.

Packaging is complete: the network-disabled container passed page/bootstrap checks,
Gemini was unconfigured and all four changed frontend files match the clean source
bytes. The exact source/image and narrow approval scope are in
[customer-clarity-release.md](customer-clarity-release.md). The candidate checkout
is retained separately so this final evidence update does not change its source pin.
