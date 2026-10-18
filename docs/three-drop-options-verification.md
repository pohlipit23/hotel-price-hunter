# Current booking and three drop options

Verified locally on 16 October 2026. This refinement supersedes the featured-offer
hero and filters described in `mobile-usability-verification.md`.

## Confirmed product choices

- Keep the existing booking visible above the alternatives, including its hotel,
  room, dates, guests and original whole-stay total.
- Show exactly three slots: Best drop, Best in the same hotel, and Best in the
  same room. Rank each by the verified saving after fees.
- Keep all three slots when one offer wins multiple groups. Explain overlaps
  with Same offer as Best drop rather than removing a slot or implying different
  underlying offers.
- Include non-refundable offers. Clearly describe one as Final drop and
  Non-refundable, explain the loss of free cancellation, and state that price
  watch ends when that booking becomes active.
- Use the RoomDrop room-key motif for playful review and approval controls.

The demo's non-refundable USD 480 stay has a USD 115 saving after its USD 5 fee
and wins all three groups. A refundable-only candidate set yields USD 85 overall,
USD 75 in the same hotel and USD 55 in the same room. Same room requires the same
hotel plus verified equivalent-room evidence; matching room names alone do not
qualify. A missing group has an unavailable slot with no review action.

## UI behavior

The current booking is a slim text summary with hotel, dates and original total
visible, and keyboard-accessible Room & guests details. Three photographic
options stack on phones and form three columns on larger screens. There are no
filter buttons or fourth non-refundable disclosure. Overlapping cards use unique
element IDs and independently restore focus to the originating card.

Each review CTA is a standard rounded rectangular native button with a small
decorative room-key SVG beside its label. Peek at this drop opens review only.
The approval button remains a separate
explicit command. Light backgrounds, coral/ink colors, negative saving stamps,
keyboard focus rings and reduced-motion behavior are retained.

Non-refundable cards and review disclose Final drop, no free cancellation and
watch ending. The separate acknowledgement remains unchecked and approval stays
disabled until checked. Once the non-refundable replacement is active, the watch
UI cannot invite new checks, even when saved watch consent is off. Existing
saved consent can still be stopped. These are presentation changes; supplier,
booking, cancellation, payment and job adapters are unchanged.

## Verification

- Presentation tests first failed because the new ranking helper was absent,
  then passed all eight cases. They cover per-group ranking, a non-refundable
  winner in all three groups, missing groups, stale versions, blocked decisions
  and unverified room equivalence.
- The updated B1 browser suite passes 13 journey groups, 108 geometry checks and
  36 screenshots across 320, 375, 390, 768, 1024 and 1440px, with zero page
  JavaScript errors. It checks the actual default overlapping non-refundable
  choices, visible original booking, unique IDs, key controls, disclosure and
  focus restoration. A completed non-refundable journey starts with deliberate
  watch consent, passes the separate rate acknowledgement, advances all six
  fictional stages, verifies the watch's ended status, then stops saved consent
  and verifies no new enable control is available.
- Refundable review and retry regressions use an explicitly labelled synthetic
  candidate set which excludes the optional non-refundable offer from state
  responses. Actual in-memory server commands and the existing idempotency,
  cancellation-proof, refund pending/completed and consent checks are retained.
  Other unknown, failed, empty, photo-fallback and HTTP retry presentation
  fixtures remain explicitly synthetic.
- Ten additional viewport screenshots check phone and desktop landing layouts,
  key-button proportions, disabled and enabled approval, visible acknowledgement
  at 320x568 and 390x844, and source focus after returning.
- The last full `npm test` run for the three-option slice passed 231 tests with zero failures and six
  Firestore integration skips. This is not Firestore persistence acceptance.
- Syntax and whitespace checks pass. No dependency changed. The customer assets
  are served directly, so the unrelated pitch Worker build was not run.
- The existing temporary preview serves matching local bytes for booking.html,
  booking.js, booking.css, pricing.js and watch.js. It remains a fictional,
  isolated test-memory preview with live advice and supplier effects unavailable.

Ignored evidence is under `.local/three-options/`: baseline copies, browser.log,
node-tests.log, visual-result.json and viewport PNGs. The B1 result and its full
screenshots remain in `.local/ux-review-option-b/validation/`.

Physical iOS/Android, screen-reader and axe acceptance remain unverified. No
commit, push or cloud deployment was performed. Unrelated concurrent live-engine
and branding work was preserved.

## Compact summary and button refinement

The subsequent visual refinement removes the original booking photo and reduces
its collapsed summary from 237px to 153px at 320px wide, and from 200px to 132px
at 390px wide. Hotel, dates and price stay visible; room, breakfast and guest
facts remain available in Room & guests. The disclosure opens with Enter and
does not mutate saved state.

The full key-shaped controls have been replaced with standard buttons, retaining
the key only as a small decorative icon. Both review and approval retain visible
labels, accessible names, touch targets and existing consent/retry behavior.

The updated browser suite passes the same 13 groups, 108 geometry checks and 36
screenshots, with zero page JavaScript errors. Fifteen supplemental screenshots
compare the before/after summary at 320, 390, 768 and 1440px and check expanded
details, review buttons and disabled/enabled approval. The acknowledgement remains
reachable above the mobile bar. Evidence is under `.local/compact-booking/`.
