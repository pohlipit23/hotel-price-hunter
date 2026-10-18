# Design alternatives

Open any HTML file locally, or serve this directory using `python3 -m http.server 8000`.

| Preview | Direction |
| --- | --- |
| [Travel journal](travel-journal.html) | Cream and terracotta, wide hotel photography; three offers stacked on mobile. |
| [Clean comparison](clean-comparison.html) | White and blue, compact image-and-price comparisons. |
| [Booking changes](booking-changes.html) | Earlier direction: a confirmed reservation branches into three possible changes, with before-and-after review. |

These are standalone design snapshots. They contain illustrative data and no live integrations, transactions or password gate. Authentication for the hosted prototype is implemented in `worker/index.js`.

## Mobile-first light directions

Open [the side-by-side comparison](light-directions.html), [A · The stay journal](savings-mint.html), or [B · The city escape](savings-blue.html). Both combine inspirational hotel and room imagery with savings-first hierarchy and offer comparison. **B was selected and integrated into the application on 13 October 2026.** These files remain standalone visual references; the application uses server data, persisted preferences, selection and advice endpoints.

- **A:** warm ivory, forest green, serif headings, a large booked-room photograph with hotel inset, one featured photographic offer and two compact alternatives.
- **B:** fresh white and blue, bold sans-serif headings, a hotel-and-room collage, and three compact image-led comparison rows.
- **Shared contract:** connect the booked stay with the equivalent-room refund near the top; show all three options in a vertical list; keep refund after fees, cancellation terms and approval differences visible. Mobile is primary, desktop expands into two columns. No horizontal offer carousel or dark theme.
- **Preview interactions:** open the four-image gallery, select a hotel or room photograph, open each offer with its relevant photograph, inspect its price breakdown, expand questions, and explore the price-watch explanation. Native dialogs support Escape and return focus to their trigger. No preferences are saved and no monitoring or transactions occur.
- **Imagery:** locally stored AI-generated JPEG, about 490 KB shared by both versions. Images are labelled illustrative, not verified amenities. See [asset provenance and generation prompt](assets/README.md).
- **Data:** fictional jury scenario, USD 600 booked total, USD 540/520/510 replacement totals, USD 5 switch fee, USD 55/75/85 potential refunds. Cancellation deadline: 10 Nov 2026, 18:00 Asia/Kuala_Lumpur. Both use the same shared CSS and JavaScript and need no external assets or services.
- **Verified:** Chromium at 320, 390, 768, 1024 and 1440px; no horizontal page/dialog overflow; primary action visible within an 844px-high phone viewport; all three offer dialogs and refund figures; four-photo gallery selection at all five widths; keyboard focus containment in the gallery; FAQ expansion; price-watch explanation; Escape dismissal and focus restoration; light theme under a dark device preference; no browser console errors. Mobile, desktop and comparison screenshots were visually inspected. These previews do not implement the application's preference editor or live advice.

## 2026-10 customer-flow UX review directions

Open [the side-by-side comparison](ux-2026-10/index.html), [A · The Statement](ux-2026-10/statement.html), or [B · The Concierge](ux-2026-10/concierge.html). These were produced with [docs/ux-review-2026-10.md](../docs/ux-review-2026-10.md) and respond to the findings recorded there. **Nothing in them is integrated into the application yet.**

- **A · The Statement:** paper white, ink, money green; a sticky booked-stay strip, three flat comparison rows that expand inline, receipt-style review, and blocking feedback shown inside the fixed action bar. Adviser is an inline lane, not a floating button.
- **B · The Concierge:** ivory, serif headings, indigo accents; one hero offer card with a compare-all table, a three-step review, and Gemini as a docked half-sheet.
- **Shared contract:** the ten points in [docs/ux-review-2026-10.md](../docs/ux-review-2026-10.md) — savings as positive amounts, one `h1` per view, three distinct offer roles, blocking reasons surfaced at the control that blocks, no floating launcher over prices, no fabricated price watch, desktop as a secondary two-pane layout.
- **Data:** fictional live-mode scenario, AED 600 paid for The Meridian Kuala Lumpur, 21–23 Jan, 2 adults, 2 nights, three drop options at AED 380/410/570. Illustrative only; no network calls, saved preferences, monitoring or transactions.
- **Verified:** headless Chromium at 320, 390 and 1280px; no horizontal overflow; all three offers visible inside an 844px-high phone fold; blocked-approval message visible inside the action bar; consent and confirmation states reachable; refundable option hides the cancellation-risk panel; adviser sheet docked; no console errors.
