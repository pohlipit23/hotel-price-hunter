# Selected design B: The city escape

Implemented 13 October 2026 in the local application. The approved light design adds a hotel/room collage, a four-image gallery, photographic offer rows, struck-through original totals, lower replacement totals, and compact minus-amount badges labelled `back after fees`. Shared preference forms and the sticky comparison retain their existing behavior and adopt the blue palette.

The featured equivalent offer is derived from current server decisions. Refund badges use evaluated net refunds, never the gross price difference or an unverified fixture fallback. Blocked, unknown, zero and negative refunds are unavailable. A blocked equivalent offer replaces the featured action with an explanation. Numeric strikethrough is restricted to a lower total in the same currency. Images are illustrative and labelled accordingly; source and generation prompt remain in `designs/assets/README.md`. The application serves its own local JPEG copy.

## Verification

- Full `npm test` run with `RUN_FIRESTORE_INTEGRATION=1`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8081` and `GOOGLE_CLOUD_PROJECT=demo-hotel-price-hunter`: **58 passed, zero skipped**.
- `tests/ui.browser.mjs` passed against the actual local app and Firestore emulator: invitation focus and dismissal, essential requirement editing, minimum refund, explicit standing permission, refresh persistence, stale two-tab conflict, non-refundable opt-in, saved selection, real unconfigured Gemini 503, HTML-as-text handling and unknown-fact blocking.
- `tests/ui-city.browser.mjs` passed: all four photo choices, gallery focus containment/return, featured-offer selection, blocked-refund suppression and restoration after correcting requirements, light-only appearance and missing-image fallback.
- Both browser runs checked widths 320, 390, 768, 1024 and 1440px. No horizontal page overflow or client JavaScript exceptions. Selected identity, original/proposed totals, refund and cancellation terms remain visible while typing in the conversation.
- Visually inspected mobile booking, gallery, enrolment, conversation and desktop comparison. Screenshots are ignored local artifacts in `.playwright-cli/`: `city-mobile.png`, `city-gallery.png`, `city-desktop.png`, `hph-mobile-enrolment.png`, `hph-mobile-conversation.png`.
- JavaScript syntax and Git whitespace checks passed.

The local test server uses the Firestore emulator and deliberately unconfigured Gemini. These checks establish the UI and persistence behavior; they do not establish live Gemini responses, supplier search, transaction execution or deployment.
