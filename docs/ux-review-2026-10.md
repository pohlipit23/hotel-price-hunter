# RoomDrop front-end UX review · October 2026

**Status:** review only. No application code, markup, styles or data were changed.
**Scope:** the customer-facing booking flow — `app/public/booking.html`, `booking.css`, `booking.js`, `booking-live.js`, `booking-live-data.js`, `stay-advice.css`, `stay-advice.js` — in its current "live booking demo" mode (the mode served by `app/booking-demo-server.mjs` and deployed to Cloud Run).
**Constraints applied to every recommendation:** light theme only; mobile-first (320–430px is the design viewport); desktop (≥1024px) is a secondary viewport that may reflow but must not introduce new components or a separate information model.
**Companion artefacts:** two interactive light-theme design directions live in [`designs/ux-2026-10/`](../designs/ux-2026-10/index.html) — *A · The Statement* and *B · The Concierge* — with a side-by-side comparison page. Evidence screenshots are in [`docs/design/ux-review-2026-10/`](design/ux-review-2026-10/).

---

## 1. Method

The current UI was run locally with an injected (non-live) advice provider via `createBookingDemoServer` and driven end-to-end in headless Chromium at 320, 390, 768 and 1440px: deals list → offer review (refundable and non-refundable) → consent gating → confirmation → price-watch section → Gemini dialog. Full-page and above-the-fold screenshots, computed-layout metrics and DOM text inventories were captured for every screen. The client controller (`booking.js`, `booking-live.js`) and stylesheets were read to attribute each visual finding to its mechanism.

Measured facts that frame everything below:

| Metric | Value |
| --- | --- |
| Deals page height @390px | 2115px (≈5 phone screens) for three options |
| Review page height @390px | 2091px |
| Horizontal overflow | none at any width (good) |
| Tap targets under 44px | one: the brand logo link (34px) |
| Content column @1440px | 752px centred, 344px empty gutter each side |
| Offer cards @≥640px | three columns of ~240px each, inside the 752px column |

---

## 2. Findings

Severity: **P1** blocks or misleads a decision; **P2** materially degrades comprehension or trust; **P3** polish.

### A. Floating controls occlude primary content (P1)

The Gemini launcher is `position: fixed; right: 24px; bottom: 24px` ([stay-advice.css:15](../app/public/stay-advice.css#L15)), lifted above the approval bar on mobile ([stay-advice.css:41-42](../app/public/stay-advice.css#L41)). Because it never yields to content, it lands on top of the things a user most needs to read or tap:

- @390px, scroll 0: it covers the right half of the **primary CTA of the first offer card** — the label renders as "Peek at this" with the white pill on top of it ([deals-390-fold.png](design/ux-review-2026-10/deals-390-fold.png)).
- @320px: it covers the **price line** ("AED 380") of the first card ([deals-320-fold.png](design/ux-review-2026-10/deals-320-fold.png)).
- @390px review: it covers the **right column of the price receipt**, hiding the "Current booking" figure ([review-390-fold.png](design/ux-review-2026-10/review-390-fold.png)).
- @768px: it covers the third card's CTA.

A floating action button that can sit on a price or a primary button is a layout-contract failure, not a styling nit. Any direction must give the launcher a reserved lane (docked bar, inline row, or scroll-aware avoidance) and must never let it overlap interactive or numeric content.

### B. Savings are displayed as negative numbers (P1)

Every saving appears as a rotated stamp reading **"-220 AED"**, **"-30 AED"**, **"-190 AED"**, and the confirmation repeats "Estimated savings −220 AED". A minus sign on the product's core promise reads as a loss at a glance, and the sign convention contradicts the adjacent struck-price arrow ("AED 600 → AED 380"), which reads as a reduction. Users must perform a sign inversion to understand the value proposition. Savings must be positive and verbal ("Save AED 220"), with the delta direction stated once, consistently.

### C. Three offers that look identical (P1)

All three cards show the **same hotel name** and the **same illustrative photograph**; the only differentiator is a 13–14px grey room-name line ([deals-390-full.png](design/ux-review-2026-10/deals-390-full.png)). The cards are ~500px tall each, so comparing three options means scrolling five screens and holding the differences in memory. There is no at-a-glance comparison affordance. When the differentiator is the *room*, the room must be the headline of each card, and the list must be scannable in one viewport (compact rows, or a comparison view), not three stacked marketing cards.

### D. Inconsistent option taxonomy and hedged copy (P2)

Card labels mix a rank, a property and a non-label: "Best drop", "More flexibility", "Another drop" ([booking-live-data.js:34](../app/public/booking-live-data.js#L34)). Every card repeats the trust-eroding hedge "Estimated saving · final pricing and fees to be checked", and the refundable card says "Free cancellation flag · check terms" — internal vocabulary ("flag") addressed to the user. State the estimate basis **once** at list level, and name options by what they are to the traveller (biggest saving / keeps free cancellation / third alternative).

### E. Colour semantics are crossed (P2)

Coral red simultaneously means "recommended" (the solid "Best drop" band), "your saving" (the stamp) and, by association, danger; amber means risk; ink navy is the default CTA while the recommended card's CTA is red. Red-as-recommendation fights every learnt convention and makes the risk warnings harder to see, because red is already spent. Reserve one hue for money saved, one for risk, and keep recommendation as weight/position rather than alarm colour.

### F. Internal identifiers leak into customer copy (P2)

The booking header reads "YOUR BOOKING · **SYNTHETIC-DEMO**" — the quotation code rendered as a customer-facing reference ([booking-live-data.js:6](../app/public/booking-live-data.js#L6)). Either show a human reference or nothing.

### G. The fold spends itself on chrome (P2)

At 390×844 the first viewport contains the logo, the step indicator, the existing-booking card and the section heading; the first *saving* appears below the fold ([deals-390-fold.png](design/ux-review-2026-10/deals-390-fold.png)). The product's reason to exist — "you could pay less" — should be the first thing on screen. The existing booking belongs in a slim, compressible summary, not a full card.

### H. Blocking feedback appears far from both its cause and its trigger (P1)

On a non-refundable offer, tapping "Choose this drop" with the acknowledgement unticked writes "Please confirm the cancellation flexibility before choosing this room." at the **bottom of a 2000px page**, below the hollow confirmation card and near the footer — out of view of both the pressed button and the checkbox ([review-390-blocked.png](design/ux-review-2026-10/review-390-blocked.png)). Validation feedback must appear at the point of decision: in or beside the persistent action bar, and adjacent to the control that resolves it.

### I. A hollow card occupies the decision path (P2)

"Confirm your room choice / Review the room and its cancellation terms / Confirm your choice" is three headings with no content ([booking-live.js:140-142](../app/public/booking-live.js#L140)). It adds ~250px of scroll between the risk panel and the action bar and teaches the user to skip cards. Delete it or make it carry the actual pre-approval checklist.

### J. Price watch is a visible dead end (P2)

In live mode the section renders a dashed coral-bordered panel, a bell, "Automatic checks are not running for this demo." and a permanently disabled "Automatic checks coming next" button ([booking-live.js:143-145](../app/public/booking-live.js#L143)). The dashed coral border reads as an error state. An unavailable feature should either be absent or presented as a clearly-labelled "coming next" note — not occupy the page's closing slot in error styling.

### K. Desktop is a squeezed mobile layout (P2)

At 1440px the content stays in a 752px centred column and the offer grid switches to three columns at the 640px breakpoint ([booking.css:381](../app/public/booking.css#L381)), so each desktop card is *narrower* than its mobile counterpart, with hotel and room names wrapping to two or three lines, while ~46% of the viewport is empty ([deals-1440-fold.png](design/ux-review-2026-10/deals-1440-fold.png)). The same 3-up also fires at 768px portrait tablet, where it is too tight. Desktop as a secondary viewport should reuse mobile components at comfortable widths (wider column, 2-up or list+summary-rail) rather than compressing cards.

### L. Brand mark is a cropped raster hack (P3)

The logo is a 182px PNG shifted `top:-29px; left:-16px` with `mix-blend-mode: multiply` ([booking.css:54](../app/public/booking.css#L54)), leaving a visible pale rectangle on the page background and consuming ~90px of the fold. A clean inline SVG wordmark would fix fidelity, fold budget and the 34px tap target at once.

### M. Gemini dialog opens onto an empty void (P3)

The full-screen sheet shows a title, one line of placeholder text and ~600px of blank space before the composer. There is no summary of what the adviser can see, no example exchange, no visible suggested prompts until you look down. The empty state should do the teaching: show the comparison the model is grounded on and two or three tappable openings.

### N. Accessibility observations carried forward (P2/P3)

Verified good: focus moves to the review heading on entry and returns to the triggering card on exit; native `<dialog>` for Gemini; 44–48px targets; no horizontal overflow; `role="status"` messaging throughout. Remaining issues, confirmed in code: three `<h1>` elements in the DOM ([booking.html:37,57,154](../app/public/booking.html#L37)); switch-trail glyphs "✓ ! • ·" are announced because they lack `aria-hidden`; `scrollIntoView({behavior:'smooth'})` ignores `prefers-reduced-motion` ([booking.js:751](../app/public/booking.js#L751)); re-rendering the offer grid while busy destroys the focused trigger and the error path leaves focus on `<body>`; disabled gating (approve, watch) removes focusability so keyboard users can reach a dead end without explanation; `setupStayGallery` in [stay-photos.js:37-66](../app/public/stay-photos.js#L37) is dead code with a hand-rolled tab trap.

### O. What works — keep it (do not regress)

- The **confirmation screen** is the best screen in the app: one headline, from/to tickets, a plain-language reassurance panel ("No reservation, cancellation, payment or refund was made"), and a single next action ([confirmed-390-full.png](design/ux-review-2026-10/confirmed-390-full.png)).
- The **persistent mobile approval bar** with the running delta is correct in principle; only its feedback placement (H) and the launcher lane (A) need fixing.
- The **"What changes" 2×2 fact grid** (hotel / room / meals / cancellation with per-fact status chips) is an excellent comprehension device.
- **Explicit consent gating** for non-refundable drops, reset per offer fingerprint, is the right safety model.
- **Idempotent retry semantics** surfaced as "Retry the same approval" is honest and rare; keep the vocabulary.

---

## 3. Shared contract for both directions

Both directions below honour the same non-negotiables, derived from the findings and from the product's safety model:

1. Light theme only; `color-scheme: light`; legible under a dark device preference.
2. Mobile-first at 320px with no horizontal overflow; primary action and at least one saving visible in an 844px fold.
3. Savings are always positive and verbal; one hue for money, one for risk, never crossed.
4. The room — not the hotel or a photo — is the unit of comparison when offers share a hotel.
5. Estimate basis stated once per screen, not per card.
6. Validation and consent feedback render at the point of decision (action bar + adjacent control), never at page bottom.
7. No floating control may overlap numeric or interactive content; the adviser gets a reserved lane.
8. Desktop reflows the same components (rail or two-pane); no desktop-only information model.
9. Confirmation keeps its current clarity: plain-language reassurance + one next action.
10. All existing safety semantics preserved: explicit approval, per-offer consent reset, idempotent retry labels, no standing permission implied by UI.

---

## 4. Direction A · The Statement

**Idea.** A price drop is a financial event. Present it the way a good bank or airline change notice does: a calm, dense, numerically honest statement. Trust comes from clarity and restraint, not photography.

**Preview:** [`designs/ux-2026-10/statement.html`](../designs/ux-2026-10/statement.html)

- **Palette / type.** Paper white `#F6F8FA` page, white cards, ink `#152838`. One money hue: deep green `#0B6B45` on tint `#E4F2EA`. Risk amber `#7A5200` on `#FFF4D6` only. Recommendation is expressed by order and weight, never by alarm colour. System sans with tabular numerals for every figure; a single 28px display line per screen.
- **Deals screen.** A slim sticky **booking strip** (hotel · dates · paid total) replaces the booking card — one line, 48px, compressing on scroll. Below it, the headline saving of the day in one sentence: "3 ways to pay less for the same nights." The three drops render as **comparison rows**, not cards: room name as the row headline, board + cancellation as chips, price and a green "Save AED 220" figure right-aligned in tabular figures. Rows are ~110px, so all three fit one fold. A row expands inline (accordion) to a thumbnail, the struck price and the estimate basis. No photography in the list; a single small thumbnail appears on expansion and in review.
- **Review screen.** Two-column **receipt** at the top of the fold: paid / new / fees / your drop, with the drop row in green and positive. The "What changes" fact grid is retained. The risk panel sits **immediately above the action bar**, so the acknowledgement checkbox and the button that depends on it are always co-visible; a blocked attempt shows its message inside the bar.
- **Adviser lane.** No floating pill. Each comparison row carries a quiet "Ask about this room" text action; review carries an inline adviser block. The adviser never overlays content.
- **Price watch.** Absent while unavailable; a one-line "Automatic checks are coming next" footnote under the list, no panel, no error styling.
- **Desktop (secondary).** The 752px column widens to ~980px; rows stay single-column and gain a **sticky right rail** repeating the booking strip and the selected row's delta. No new components.
- **Best for:** travellers who compare numerically and want to feel the product is precise and honest. Lowest visual risk; smallest delta from current code (mostly list markup + tokens).
- **Risk:** less emotional pull; relies on copy and numbers to carry value. Mitigated by the headline saving sentence and the green delta.

## 5. Direction B · The Concierge

**Idea.** Choice overload is the real enemy. Lead with one well-argued recommendation, keep the alternatives one tap away, and walk the approval through three short steps so consent can never be far from the button.

**Preview:** [`designs/ux-2026-10/concierge.html`](../designs/ux-2026-10/concierge.html)

- **Palette / type.** Warm light ivory `#FBF7EF` page, white surfaces, deep ink `#23201B`. Accent: editorial indigo `#33418F` for actions; money green `#1E6B4F` for savings; risk amber as in A. A serif display face for screen headlines (one per screen), humanist sans for everything else.
- **Deals screen.** Opens with the **recommended drop as a single hero**: one photograph, the room name as headline, and three plain-language reasons ("Same hotel, bigger room", "Keeps your dates", "AED 220 back after fees"). Below, the other drops live in a **segmented switcher** ("2 more options") that swaps the hero in place — one option on screen at a time, zero scroll-comparison. A compact "compare all three" link opens a full-screen summary table for users who want it.
- **Review screen.** A **three-step sheet**: 1 Price, 2 What changes, 3 Risk & consent. Steps are progressive disclosure with a progress dot row; the persistent bottom bar shows the running positive delta and the step's action. Because consent lives in step 3 *with* the approve button, a blocked attempt is impossible to miss. Back returns to the previous step, not the top of the page.
- **Adviser lane.** A **docked bottom sheet** (half-height, drag handle, scrim) instead of a full-screen void; its empty state shows the grounded comparison ("Gemini can see: your booking, 3 rooms, prices, cancellation terms") plus the suggested prompts as chips. The launcher is a tab docked to the sheet's edge, never floating over content.
- **Price watch.** A quiet inline row at the end of the list with a "notify me when this is live" note; no disabled button.
- **Desktop (secondary).** Two-pane master–detail: options list left (rows), review right, both reusing mobile components; the adviser sheet becomes a right-hand column.
- **Best for:** travellers who want guidance and reassurance; strongest emotional pull and the shortest path to a confident first decision.
- **Risk:** hides alternatives behind a switcher (mitigated by the always-available compare-all table); more interaction states to build and test; step flow must preserve the current back/refresh/idempotency semantics.

---

## 6. Choosing between them

| Criterion | Current | A · Statement | B · Concierge |
| --- | --- | --- | --- |
| All three options in one fold @390 | no (5 screens) | yes | hero + switcher; table on demand |
| Saving sign reads correctly | no | yes | yes |
| Launcher occlusion | yes | eliminated | eliminated |
| Consent feedback at point of decision | no | yes | yes (by construction) |
| Desktop uses the viewport | no | rail | two-pane |
| Build delta vs today | — | small–medium | medium–large |
| Emotional / brand pull | medium | low–medium | high |
| Risk to safety semantics | — | none if contract kept | none if contract kept |

Recommendation: prototype **A first** as the baseline fix (it resolves every P1 with the least churn and de-risks the numeric trust problem), then layer **B's** guided hero and stepped consent on top of A's tokens if user testing shows comparison fatigue remains. The two are compatible: A supplies the visual language, B supplies the flow.

## 7. Open questions

1. When offers share a hotel, is photography worth its fold cost at all, or should it be opt-in per row? (Both directions currently assume small/opt-in.)
2. Should the estimate basis ("final pricing and fees to be checked") be a footnote, a disclosure, or a per-row chip? Testing needed; both directions currently state it once per screen.
3. Is the step indicator ("Deals / Review / Confirmed") earning its fold space, or should the booking strip replace it on mobile?
4. Does the jury/legacy mode still need to share markup with live mode? Several findings (hollow card, watch stub) exist only because one template serves both modes.

---

*Evidence: headless Chromium captures at 320/390/768/1440px against `createBookingDemoServer` with an injected adviser (no live model calls), 2026-10-18. Screenshots in [`docs/design/ux-review-2026-10/`](design/ux-review-2026-10/); full capture set and metrics in the local scratch directory `.local/ux-review/`.*
