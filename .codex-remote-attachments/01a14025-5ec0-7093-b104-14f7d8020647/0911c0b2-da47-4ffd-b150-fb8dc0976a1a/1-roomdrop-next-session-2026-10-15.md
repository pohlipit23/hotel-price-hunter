# RoomDrop — next-session handoff

Prepared 15 October 2026, Asia/Kuala_Lumpur. The user wants to start the next session manually. No background agent was launched. This handoff authorizes no new cloud mutation or release.

## Start here

Workspace: `C:/Users/pohli/Sites/hotel-price-hunter`.
Branch: `codex/customer-flow`. Verified HEAD: `056288c90dc7267d316a7ab11c0e1fc7c26ade22`.
Working tree: only untracked `designs/brand/`; preserve this user-owned work.

Read `README.md`, the latest section of `tasks/todo.md`, and `docs/agency-cloud-execution.md`. Use `tasks/plan.md` for the broader roadmap, but some historical “Next” paragraphs still describe agency work that is now finished. Do not restart completed slices.

## Next proposed milestone

The last recommendation was a complete private cloud customer demo:

1. Prepare an updated private deployment of the current RoomDrop customer flow. Verify watch consent, simulated switches/refunds and agency case visibility against the cloud data store.
2. Build a production-capable daily price-watch driver and a reviewed Cloud Scheduler → Cloud Run job setup, retaining retry/daily deduplication, consent/version/deadline guards, bounded processing and truthful records.
3. Keep supplier rates simulated and Gemini disabled for this milestone. Real supplier access and real email delivery follow separately.

The user asked for this handoff after that recommendation; the next milestone has not been implemented or separately approved for cloud execution. Begin with a narrow contract/task plan and local implementation/verification. Before deploying, present the concrete source/image, identities, grants, resources and limits for scoped approval.

The existing `scripts/run-price-watch.mjs` deliberately rejects production and requires a demo project/emulator. Reuse its pure engine in `app/domain/price-watch.mjs` and storage transactions; do not merely remove the executable's safety guards. Checks create observations/previews, not execution quotes, switch permission or automatic transactions. Do not add Cloud Tasks without a demonstrated need.

Decide the private customer browser-access path before rollout. IAP protects an entire service; the agency service is deliberately read-only and cannot host customer mutations. Do not silently publish the customer app or repurpose the agency reader as a writer.

## Current verified state

- Current customer UI, four selected-offer simulated journeys, local agency review, price-watch consent/checks and notification previews work locally. Preserve the approved booking-first RoomDrop layout, horizontal photo cards, hotel headings, selected logo/key, category pills and explicit selected-offer approval. No opening modal, questionnaire/settings form, chat or scenario selector. Review savings use minus-prefixed currency, net-after-fees and potential-refund wording. Material UI changes need approval.
- The separate private Google IAP agency service is deployed and its live managed-access/Saved cases screen was confirmed by the user. Source/image/runtime/direct-grant checks and a real attached-reader behavior probe passed; the one-shot verification job was removed. The cloud agency index was empty. Organization IAM inspection remains denied: machine reports explicitly retain `metadata-partial`, `fullAcceptance:false`; do not turn this into an exhaustive audit claim.
- The cloud customer service still runs the older `hotel-price-hunter-00006-hfm`, not the current RoomDrop customer source. Its full service/IAM fingerprint was unchanged by the agency rollout.
- Latest full emulator-enabled Node suite: **176 passed, zero failures/skips**. Agency/customer/watch browser evidence and its mocked-versus-live boundaries are documented; the last sign-in confirmation was human observation, not automated HTTP capture.

Use existing artifacts instead of reproducing them: `docs/booking-postcard-contract.md`, `docs/flexibility-agency-contract.md`, `docs/price-watch-contract.md`, their verification/review records, and `docs/agency-cloud-execution.md`. Setup tooling is `scripts/prepare-agency-cloud.ps1` (offline command generator), `scripts/verify-agency-cloud.mjs` (explicit read-only verification) and `scripts/check-agency-reader.mjs` (guarded one-shot probe).

## Authority and preserved evidence

The previous “approve all” covered only the exact agency scope in `docs/agency-google-setup.md`; it is not blanket approval for a customer deployment, scheduler, writer grants or emails. The corrected operator/account is named there; use it explicitly, not the earlier cached account. No API key or downloaded service-account key is required. Keep tokens/passphrases/raw subject identifiers out of prompts, commands, logs and tracked files; ignored local configuration already exists.

All **five** approved Vertex attempts are consumed. No additional inference without new explicit bounded approval; never reset the ledgers. No external OCR, public access/source push, paid upgrade, real supplier booking/cancellation/refund or email delivery is authorized by this handoff. User-confirmed trial credits were not independently balance-verified.

Retain both release checkouts:
- Agency: `C:/Users/pohli/.codex/worktrees/agency-release-verification/hotel-price-hunter` — exact deployed commit/build bytes and copied safe pins; run its verifier there after later main-checkout changes.
- Historical customer: `C:/Users/pohli/.codex/worktrees/private-cloud-deployment/hotel-price-hunter`.

Do not loosen either verifier's source/digest guards or archive those checkouts casually. Exact cloud identifiers, digest/context pins and reproduction commands are in the execution records.

Local app/emulator/worker were retained; their current process state was not re-probed for this handoff. Verify exact task-owned processes before restart; never kill all Node/browser/container processes. Isolate emulator integration tests from the retained watch worker using `GOOGLE_CLOUD_PROJECT=demo-roomdrop-iap-qa`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8081`, `RUN_FIRESTORE_INTEGRATION=1`, and empty model configuration before `npm test`.

## Working style and suggested skills

Keep the main chat as sole coordinator; use bounded generic workers with explicit file ownership and independent review. Pete applies only when explicitly invoked; never spawn a Pete coordinator. No external OCR is currently authorized.

Suggested skills: using-agent-skills, incremental-implementation, api-and-interface-design, security-and-hardening, test-driven-development, source-driven-development for current Google APIs, code-review-and-quality and shipping-and-launch. Use frontend-ui-engineering only for necessary UI changes. Read the Browser skill before any recovery/fallback: its runtime import failed EPERM here; Computer Use page-state capture hung. Installed isolated Playwright worked for local browser harnesses, not personal Google-session inspection. Never copy browser profiles or extract cookies/tokens to work around sign-in.
