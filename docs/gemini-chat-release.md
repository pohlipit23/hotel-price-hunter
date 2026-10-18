# Gemini support chat publication

Published 18 October 2026, Asia/Kuala_Lumpur, following the owner's request to commit and publish.

Live: https://hotel-price-hunter-2qbcpylngq-as.a.run.app/.

- Customer revision receiving 100% traffic: `hotel-price-hunter-00016-5b2`.
- Application source: `a589a2bb7c1c053015dceeb49afe83dd167b126d`, following feature commit `d47f129b58bb80ac365bc87e422e445457bee7d6`.
- Image index: `sha256:ab3a24125d0248e0568c56c292e9b899640244b334830eeab1ffb21b25660266`.
- Runtime image: `sha256:1ef6ac15eafb90f7925d5a9155c9c4e1a988d9a33b1953d03de13441e1febcb8`.
- Frozen context: `7e36a46b7eaa3e2194fc9a6dbb5c2fcf50399bef7545820a7e7f0dafa55ce1df`.
- Unchanged display snapshot bytes: `8fe12f79f9910d9ca9123ff2069d349f3e11909c1e1f36d9708539663fb5f6f4`.

## Published behaviour

The existing ticket cards and saving stamps use lighter typography and shorter confirmation copy. Ask Gemini opens a corner dialog on desktop and full-screen chat on mobile. The compact inline widget and dialog share their draft and conversation.

Overview guidance compares the displayed drops; individual review focuses on the selected drop. The approved short support prompts produce relevant pros and cons. Successful openings are cached, navigation discards stale replies, and chat does not select a room or accept cancellation terms. [The implementation contract](gemini-chat-ui.md) describes request guards and response boundaries.

The reply schema uses short statement IDs and exact contextual drop/reason enums. An initial preflight candidate failed before deployment; offline review identified schema/parser mismatches and the corrected candidate passed both overview and production detail checks. The customer-facing prompt templates were retained.

## Verification

- Complete corrected-source Node suite: **291 passed, zero failures; six existing emulator-dependent tests skipped**, 297 total.
- Focused chat and booking-advice checks: **28 passed**; independent review completed.
- Frozen image startup, customer entry, required assets and stale-snapshot rejection passed with container networking disabled and zero model calls. Actual registry manifest and config bytes independently matched the source, context, snapshot and booking entrypoint.
- Real Gemini overview guidance on the frozen corrected source compared the price and flexibility choices and asked one relevant priority question. The provider reported `gemini-3.8-flash`.
- Real production browser guidance for the non-refundable selected drop rendered a 48-word reply. AED 217.55 remained an indicative difference before final pricing and fees; the reply weighed firm dates against cancellation flexibility. Consent stayed unchecked and confirmation stayed hidden.
- Production chat geometry passed at 320, 390, 768, 1024 and 1440 pixels, including full-screen mobile presentation. Browser warnings/errors were empty. Earlier local injected-provider UI evidence records 36 assertions and 15 geometry samples.

This release capped model verification at three attempts: the initial candidate failed, then the corrected candidate passed two checks. The allowance is exhausted; there were no automatic provider retries. Earlier model-call ledgers were not reused.

## Preserved configuration and rollback

The customer specification changed only by image and revision nonce. Runtime identity, all environment values, resource/scaling settings and existing public access were preserved. Private agency and watch-job configurations/policies, direct project policies and Scheduler state matched the baseline. Sampled fingerprints were unchanged for eleven visitor documents, one agency case and the watch checkpoint. Inherited organisation IAM visibility remains outside that verification.

The rollback baseline is revision `hotel-price-hunter-00015-b8d`, image `sha256:6184ac50e88e38441b46fff63d9c5a31eda89ef452f3f9e864205e0ddc2dbd1c`. The saved rollback plan restores the previous image using a fresh resource version and revision nonce while preserving the current settings and policies.

Private evidence is retained in `.local/gemini-chat-publish/`: before/after metadata, deployment request/result, registry and container proofs, bounded model ledger, browser results and live screenshots. The frozen release context is `.local/booking-release-82294de8-1ac1-4996-a3b7-20f155ad9601/`. Unrelated dirty files were preserved outside the release.
