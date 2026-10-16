# RoomDrop B1 customer flow verification

Verified locally on 16 October 2026 against `.local/ux-review-option-b/HANDOFF.md` and its chosen B1 artboards. The customer flow uses fictional bookings, supplier effects and refunds.

## Implementation

The five customer frontend files now apply the light B1 ticket design to deals, all selected-offer reviews, non-refundable consent, switch progress, cancellation attention, refund pending/completed, watch consent, empty results and load/retry states. Large illustrative photos, tear lines, category icons, negative saving stamps, Bricolage Grotesque headings and DM Sans body copy carry across the flow. Desktop expands the offer grid and booking comparison while mobile remains a single column.

Review shows whole-stay prices and fees with the after-fee saving. From/To tickets preserve the chosen stay during progress. Stage advancement is inside a separate Demo only disclosure. Each review history entry stores its offer ID. Pending approval retries remain reachable after native Back and reload, preserving their exact request body and idempotency key. Price watch requires deliberate consent and distinguishes daily checks from the saved update-preview cadence.

The app does not claim mockup-only card digits, refund arrival estimates, held-price deadlines, distance, booking references, support channels or payment guarantees. The backend has no cancel-switch action or renewed-approval action for a stopped material-change operation, so the UI describes those limits without exposing inert controls. Garden Hotel has an illustrative exterior only; it is not presented as a verified room photo or multi-photo gallery.

## Automated verification

- `npm test`: 195 total, 189 passed, zero failures, six Firestore integration tests skipped by the default local configuration. This run does not establish Firestore persistence.
- `node tests/b1.browser.mjs --allow-fonts`: passed against a task-owned loopback server, test-memory storage and an explicitly unavailable model. No personal browser profile, cloud service, live supplier or payment API was used.
- Browser suite: 12 acceptance groups, 96 geometry checks across 16 views at 320, 375, 390, 768, 1024 and 1440 pixels; 32 screenshots; zero browser runtime errors. Google Fonts were allowed; other external page requests were blocked.
- JavaScript syntax checks and `git diff --check` passed.

The browser suite verifies all three review price/room/hotel relationships, keyboard selection and focus, filters, Back/Forward/reload, non-refundable consent, watch consent/stop/reload, one offer-specific approval followed by six deliberate demo advances, original cancellation before refund, and separate pending/completed refund states. Both committed and uncommitted lost approval responses retain exact-command retry through Back/reload without automatic approval. Light rendering under dark preference, reduced motion and photo-load fallback are covered.

Nine explicitly synthetic presentation fixtures cover unknown cancellation, pause, failure, changed terms, no offers, promoted-baseline watch failure, non-refundable watch ending, unknown cancellation terms and bootstrap failure/retry. These use response substitution and do not prove provider outcomes or backend execution of those edge states. Domain/API tests cover the existing backend safety contracts separately.

## Review and evidence

An independent source review found no unresolved findings after fixing pending-approval navigation, visible watch failures, the biggest-saving label, confetti overflow and nested photo sizing. The final visual pass inspected mobile deals, review, progress, attention and completion, plus desktop deals/review. A flattened raster status icon was replaced by a decorative inline ticket icon, followed by another passing full browser run. The watch control was also checked directly in the rendered viewport and by element screenshot.

Reusable browser harness: `tests/b1.browser.mjs`. Ignored result and screenshots: `.local/ux-review-option-b/validation/b1-result.json` and `b1-*.png`. The ignored `safe-server.mjs` in that folder starts an isolated preview without loading `.env` or live models.

Earlier postcard/customer-clarity browser harnesses retain their historical design-specific assertions; `tests/b1.browser.mjs` is the current B1 acceptance harness. The repository build script regenerates the unrelated pitch Worker, so it was not used as customer-flow verification. No commit, push or Cloud Run deployment was performed for this change.

## User refinement and tunnel preview

The follow-up on 16 October removes every image-top striped bar, including the smaller switch tickets, and uses Same room for verified equivalent rooms throughout. Review facts now use luggage-tag, perforated room-stub, cafe-receipt and cancellation-seal details. The price receipt and approval steps share the dashed edges and stamp details. Actual hotel/room facts and full cancellation deadlines remain available; decorative icons are hidden from assistive technology.

The updated full browser run passed with stripe-removal checks on visible surfaces and pseudo-elements at every width, consistent room wording, decorative fact icons and exact current/alternative cancellation deadlines. The Node suite again passed 189 with six integration skips. Independent source review found no unresolved findings. Public review fact cards were also visually inspected at 320, 390 and 1440 pixels.

At the user's request an isolated fictional server is exposed through a temporary Cloudflare Tunnel. Its HTTPS origin is explicitly bound for cookie and CSRF checks; models remain unavailable and all effects remain simulated. The public response bytes match all five current frontend files, health reports test-memory/unconfigured, and public selection, approval and six advances complete the fictional USD 85 refund journey. Ignored `.local/b1-tunnel-state.json` holds the current URL and owned process identities. The URL exists only while those host processes remain running. Follow-up screenshots are in `.local/ux-review-option-b/validation/refined-*.png`.

## Release preparation, 16 October 2026

The user authorized proceeding with release preparation. The full Node suite passed **195/195**, with zero failures or skips, against the existing loopback Firestore emulator in the separate `demo-roomdrop-iap-qa` namespace. This closes the six integration skips above and verifies emulator persistence, independent-server transactions, consent and worker replay. It is not a live-cloud test. Log: `.local/b1-release-node-test.log`.

The current B1 browser harness passed again with **12 acceptance groups, 96 geometry checks and 32 screenshots**, with zero browser runtime errors. The browser ran in an isolated test profile with Google Fonts allowed and other external page requests blocked. The sandbox's redirected browser-cache path was unavailable, so the same harness ran successfully in normal host PowerShell using installed Chromium. Mobile deals and desktop review screenshots were visually inspected. Log: `.local/b1-release-browser.log`.

JavaScript syntax checks and `git diff --check` passed. `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities; its retained result is `.local/b1-release-audit.json`. The existing independent source review above remains the review evidence; this release pass additionally inspected navigation, approval retries, watch consent and the scoped diff. No fresh external OCR was requested or run.

Release scope is the five customer frontend files, the B1 browser harness, this verification record and the README update. Brand design sources and remote attachments remain separate. Image packaging and the exact proposed private deployment scope will be recorded in `roomdrop-b1-release.md`; cloud upload/deployment and recurring watch activation remain separate approval steps.

## Highest-drop hero follow-up, 16 October 2026

The deals hero now uses the same highest verified net saving among the main
refundable offers as its Best drop stamp. Photo, hotel, room, trip and price come
from that offer; a small current-booking reference preserves the original hotel
and total. With no eligible offer it falls back to the current booking. The
existing simulated-switch view and approval authority are unchanged.

The browser regression first reproduced the Harbour/Garden mismatch, then passed
13 acceptance groups, 96 layout checks and 32 screenshots with zero runtime
errors. It covers the default USD 85 Garden offer, a synthetic changed ranking,
and the no-offer fallback. Mobile and desktop hero screenshots were visually
inspected. The existing reduced-motion assertion now waits up to one second for
its .01ms animations to settle after reload, avoiding a paint-timing race.

Node tests passed 189 with six emulator integration skips and zero failures.
Syntax and whitespace checks passed. Logs: `.local/b1-hero-{red,green}.log` and
`.local/b1-hero-node-test.log`. This follow-up is local and has not been deployed;
the preceding deployment record remains pinned to its original image.
