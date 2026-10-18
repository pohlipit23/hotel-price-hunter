# RoomDrop mobile usability refinement

The later [three-option refinement](three-drop-options-verification.md) replaces
this record's featured hero and filters. Its current-booking, final-drop and
room-key CTA behavior is the current local design.

Verified locally on 16 October 2026. Scope is the customer UI in this checkout,
using the fictional jury booking and isolated test-memory storage. No deployment,
live supplier, payment, email, model request, or authenticated agency acceptance
is part of this verification.

## Design contract and behavior

Retain the existing light ticket design, photographic stays, coral stamps,
negative saving labels, explicit consent, and offer-specific approval authority.
The screen's job is to let someone find a relevant saving, understand its terms,
and deliberately approve or return to their previous offer position.

- The featured drop has its own review button. It fits in the initial 320x568
  and 390x844 viewports, with smaller mobile hero photography and a price/action
  row. It opens review without approving anything.
- As confirmed by the user, the feature follows the selected relationship filter.
  All drops uses the highest eligible refundable saving; Same room, Other room,
  and New hotel each feature their own eligible offer. No eligible offer retains
  the current-booking fallback with the review action hidden.
- Below 640px, one fixed action bar displays the net saving, approval control and
  Keep my booking action. Desktop actions remain in the document flow. Page-end
  spacing and scroll margins leave terms and the footer reachable above the bar.
- Non-refundable approval remains disabled until deliberate acknowledgement.
  Review cancellation terms to approve moves focus to the checkbox without
  checking it. Reload still clears an unsaved acknowledgement; pending approval
  retries retain their original exact command under the existing contract.
- Keep my booking and native Back restore visible focus and the prior offer
  position. The source filter and non-refundable disclosure state are retained
  in the navigation entry. Forward and reload remain read-only navigation.
- The review shows the new free-cancellation deadline and a bound old/new late
  penalty comparison when the dates, interval and currency are comparable.
  Expanded details show both full penalty schedules. Missing or incomparable
  facts are described without inventing a penalty comparison.
- The calculation uses a positive saving result, for example USD 600 minus
  USD 540 minus USD 5 fees = USD 55 saving. Stamps and action labels retain -55 USD.
- Decision badges and fact labels are larger. Expandable sections have visible
  chevrons. Watch copy is shorter while retaining daily simulated checks, dates
  and guests, minimum saving, preview cadence, no email delivery and separate
  switch approval, with an unchecked consent box and a separate enable action.

## Verification evidence

- The extended `tests/b1.browser.mjs --allow-fonts` initially failed on the missing
  featured review action, before implementation. The final run passes 13 journey
  groups, 96 geometry checks and 32 screenshots across 320, 375, 390, 768, 1024
  and 1440px, with zero page JavaScript errors. Existing exact approval retry,
  Back/Forward/reload, watch consent, six manual simulation stages, cancellation
  proof, refund pending/completed, unavailable photo and synthetic error/empty
  scenarios remain covered.
- Supplemental phone checks captured 14 viewport screenshots, including the
  320x568 first screen, the fixed bar, review terms, consent and the page footer.
  All fixed controls fit the phone viewport and the consent checkbox can be
  brought above the bar. Desktop actions were checked to remain in flow.
- A browser-response-only mutation removed the hero filter condition. The suite
  failed specifically because the feature no longer followed the relationship.
  No application file was mutated for this experiment. The normal suite passed
  again afterward.
- The original tracked Node suite passes 195 tests, zero failures, with six
  Firestore integration tests skipped. This does not establish Firestore
  persistence. Normal host PowerShell was necessary because the sandbox denied
  the tests' loopback HTTP connections.
- A broader `npm test` rerun also picked up concurrently created, untracked
  `live-comparison.test.mjs` and `live-engine-cli.test.mjs`. At that run it reported
  202 passes, three failures and six skips. Two failures were in the new live
  comparison work; the CLI test could not load its then-missing runner module.
  Those files and their implementation were left untouched. This is not a claim
  that the combined, changing checkout has a green full suite.
- JavaScript syntax checks and `git diff --check` pass. No dependency changed.
  The pitch Worker build was not used because these are directly served customer
  assets. Physical iOS/Android, screen-reader and axe audits remain unverified.

Ignored evidence is under `.local/mobile-usability/`: `baseline/`, `browser.log`,
`baseline-node-tests.log`, `node-tests.log`, `visual-result.json`, and viewport
PNGs. The browser suite's full result and screenshots are under
`.local/ux-review-option-b/validation/`.

Existing branding, release work and the pre-existing Drop stamp wording were
preserved. No commit, push, cloud mutation or release was performed.
