# Design alternatives

Open any HTML file locally, or serve this directory using `python3 -m http.server 8000`.

| Preview | Direction |
| --- | --- |
| [Travel journal](travel-journal.html) | Cream and terracotta, wide hotel photography; three offers stacked on mobile. |
| [Clean comparison](clean-comparison.html) | White and blue, compact image-and-price comparisons. |
| [Booking changes](booking-changes.html) | A confirmed reservation branches into three possible changes, with before-and-after review. Current direction. |

These are standalone design snapshots. They contain illustrative data and no live integrations, transactions or password gate. Authentication for the hosted prototype is implemented in `worker/index.js`.

## Mobile-first light directions

Open [the side-by-side comparison](light-directions.html), [A · The stay journal](savings-mint.html), or [B · The city escape](savings-blue.html). Both combine inspirational hotel and room imagery with savings-first hierarchy and offer comparison. They do not replace the current application.

- **A:** warm ivory, forest green, serif headings, a large booked-room photograph with hotel inset, one featured photographic offer and two compact alternatives.
- **B:** fresh white and blue, bold sans-serif headings, a hotel-and-room collage, and three compact image-led comparison rows.
- **Shared contract:** connect the booked stay with the equivalent-room refund near the top; show all three options in a vertical list; keep refund after fees, cancellation terms and approval differences visible. Mobile is primary, desktop expands into two columns. No horizontal offer carousel or dark theme.
- **Preview interactions:** open the four-image gallery, select a hotel or room photograph, open each offer with its relevant photograph, inspect its price breakdown, expand questions, and explore the price-watch explanation. Native dialogs support Escape and return focus to their trigger. No preferences are saved and no monitoring or transactions occur.
- **Imagery:** locally stored AI-generated JPEG, about 490 KB shared by both versions. Images are labelled illustrative, not verified amenities. See [asset provenance and generation prompt](assets/README.md).
- **Data:** fictional jury scenario, USD 600 booked total, USD 540/520/510 replacement totals, USD 5 switch fee, USD 55/75/85 potential refunds. Cancellation deadline: 10 Nov 2026, 18:00 Asia/Kuala_Lumpur. Both use the same shared CSS and JavaScript and need no external assets or services.
- **Verified:** Chromium at 320, 390, 768, 1024 and 1440px; no horizontal page/dialog overflow; primary action visible within an 844px-high phone viewport; all three offer dialogs and refund figures; four-photo gallery selection at all five widths; keyboard focus containment in the gallery; FAQ expansion; price-watch explanation; Escape dismissal and focus restoration; light theme under a dark device preference; no browser console errors. Mobile, desktop and comparison screenshots were visually inspected. These previews do not implement the application's preference editor or live advice.
