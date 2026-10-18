# Drop details UI correction

Published 18 October 2026, Asia/Kuala_Lumpur, as the requested follow-up to the shared Gemini chat release.

Live: https://hotel-price-hunter-2qbcpylngq-as.a.run.app/.

- Source: `ac9f09d2bf5898e20d31dc15746c5b8690fc451b`.
- Customer revision receiving 100% traffic: `hotel-price-hunter-00017-8td`.
- Image index: `sha256:3fd88b52117ed600483fa5b0236110f07732a947a941fc28e01d1ba2e08fdab0`.
- Runtime image: `sha256:eee5da57a2fae4f14bd0501bff0dc25dad4062e6b1dc172b01b8c49e890d160a`.
- Frozen context: `d1b59343360c6033c30272e9839ae82100a98db6706756f950e9fc5c3b1d04fc`.
- Display snapshot bytes remain `8fe12f79f9910d9ca9123ff2069d349f3e11909c1e1f36d9708539663fb5f6f4`.

## Changes

The floating Ask Gemini control sizes to its content and gives the icon and label explicit, non-shrinking boxes. Drop-button labels have a block layout, a bounded width and consistent wrapping/line height.

The live details CTA sits in page flow at the end of the page on every screen size. The sticky-bar observer and its launcher offsets were removed. Bottom space keeps the floating Gemini control clear of the final actions.

Comparison badges use only Same or Different. Room and meal labels are compared against the starting option after trimming and case normalisation; cancellation compares the source flags. The prepared single-hotel snapshot keeps Hotel as Same. These comparisons do not certify physical room equivalence or a complete cancellation policy; that qualification remains below the tiles.

The Confirm your room choice explainer box is removed from the live page. The explicit cancellation acknowledgement and room-choice control remain separate. Shared legacy demo styling is preserved through live-mode scoping.

## Verification and scope

- Complete Node suite: **292 passed, zero failures; six existing emulator-dependent tests skipped**, 298 total.
- Comparison-label regression failed before the helper was added and passes for changed/same labels, case/whitespace variants and cancellation changes.
- Local browser: **31 assertions and 14 samples**, including actual button/child bounds and scroll dimensions at 320, 375, 390, 430, 768, 1024 and 1440 pixels; all three drop comparisons; in-flow CTA placement; floating-control clearance; no explainer; untouched consent. Chat opening was checked with an injected provider. No warnings/errors.
- Production browser: **14 checks**, covering the seven button-containment widths, binary badges, explainer removal, in-flow/page-end actions, launcher clearance and unchecked consent. No warnings/errors.
- Exact-image network-disabled smoke and independent uploaded manifest/config verification passed. The service spec differs only by image and revision nonce. Runtime settings, environment, public/private policies, private services, Scheduler state and sampled saved-data fingerprints are unchanged.

Gemini backend code and prompts match the earlier verified release. **No additional real Gemini generation was used** for this UI-only update; prior call allowances remain exhausted.

Evidence: `.local/detail-ui-fix/`. Frozen release: `.local/booking-release-457de657-b5b9-467a-ad35-7db636d0a344/`. Rollback target: revision `hotel-price-hunter-00016-5b2` and its saved prior image, applied with a fresh resource version and nonce. Unrelated dirty files were preserved.
