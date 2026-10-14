# First milestone tasks

Approved tasks; first milestone implementation is in progress. Checkboxes record verified completion only. Product requirements remain in the agreed prototype plan. Later simulation and submission milestones are ordered in `tasks/plan.md` and will be sliced when the first contract is established.

## Task 1: Establish the booking and decision contract

Define the canonical booking, offer, preference and approval facts. Inspect the located scraper research as read-only reference and obtain the missing booking documentation. Separate verified facts from unknowns. Define net saving as the agreed customer refund amount after relevant costs, with explicit currency and provenance.

- [x] A compact contract includes booking versions, full offer identity, retail/cost distinction, taxes/fees, dates, occupancy/child ages, essential conditions, cancellation schedules with timezone, checked time and approval scope.
- [x] One anonymised fixture supplies the baseline and three offer categories; examples show equivalent eligibility, offer-specific approval and unknown-condition blocking. Fixture threshold is explicitly a demo setting.
- [x] Every field identifies its source or an unresolved mapping; `confirmed`/`vouchered` remains unresolved unless evidence verifies it.

Verification: manually trace fields to documented/captured evidence; check examples against sections 2, 5, 6 and 8 of the agreed plan. No invented API endpoints or statuses.

Dependencies: none. Likely files: `docs/data-contract.md`, `docs/decision-examples.md`, `fixtures/jury-booking.json`. Scope: medium.

## Task 2: Verify read-only integration feasibility

Check authorised Altovo retrieval/search/revalidation access and Google Cloud/Vertex prerequisites without booking, cancellation, refunds, resource creation or secret exposure.

- [ ] A sanitised timestamped report records successful or failed retrieval, rate and final-check probes; preserves complete identifiers and amount/currency/condition mappings; distinguishes observed behaviour from historical documentation.
- [x] GCP project, billing, region and Vertex access have evidence or named blockers. No secrets or personal data enter tracked fixtures or logs.
- [x] The report explicitly permits fixture-based work where live access is blocked and lists which live gates remain unverified.

Verification: reproduce only read-only probes within established access; inspect the report for credentials and personal data before retaining it. Verify fulfilment semantics by documentation and existing booking status observation only; do not create a booking to test it.

Dependencies: Task 1. Likely files: `docs/integration-feasibility.md`, `scripts/probe-altovo.mjs`, `scripts/check-gcp.ps1`. Scope: medium.

## Checkpoint: Evidence and contract

- [x] Contract and feasibility results reviewed; unresolved mappings have conservative behaviour.
- [x] Public fixtures contain no real customer identity or retrievable booking identifiers.
- [x] Chosen demo threshold/currency and GCP prerequisites are explicit. Live-access blockers do not disappear into simulated success.

## Task 3: Add the tested decision core

Implement deterministic validation and saving/permission decisions independent of the UI, Gemini and suppliers. Use integer minor currency units and explicit currency metadata.

- [x] Verified equivalent refundable offers can qualify only with standing permission and the agency/customer minimum; changed rooms/hotels or flexibility require offer approval.
- [x] Unknown conditions, unsupported booking scope, currency mismatch, missing costs and an expired cancellation window produce explicit reasons preventing automation.
- [x] Approval applies to a specific offer/booking version; changed material facts require renewed approval. Silence creates no permission.

Verification: add and run `npm test` with focused examples covering permission, threshold boundaries, money/currency, essential-condition unknowns and deadline/timezone behaviour. Choose the lightweight existing Node test runner unless the established implementation needs something else.

Dependencies: Task 1 and the evidence checkpoint; Task 2 live blockers may remain documented. Likely files: `app/domain/decision.mjs`, `app/domain/money.mjs`, `tests/decision.test.mjs`, `tests/money.test.mjs`, `package.json`. Scope: medium.

## Task 4: Deliver persistent enrolment in the new runtime

Serve the reused mobile booking layout from a Cloud Run-compatible Node application. Add the invitation and enrolment backed by Firestore, using its emulator locally. Keep private research retrieval out of the public route set.

- [x] The automatic modal is dismissible; Not now leaves the booking intact. Enrolment allows correction of essentials and separately confirms equivalent-switch permission, minimum saving, update frequency and continued monitoring.
- [x] Validated preferences survive refresh; the threshold cannot undercut the agency minimum; no transaction is performed during enrolment.
- [x] Public mode loads only allowlisted anonymised scenarios and exposes no real-booking lookup. Existing design snapshots remain available as reference.

Verification: focused persistence/validation tests and a real browser check at mobile and desktop widths, including keyboard dismissal, validation errors and refresh. Add documented local run/emulator commands; verify the container starts locally. Deployment is a later authorised step.

Dependencies: Task 3. Likely files: `app/server.mjs`, `app/storage.mjs`, `app/public/booking.html`, `Dockerfile`, `package.json`. Scope: medium.

## Task 5: Add grounded Gemini advice to the selected comparison

Connect Vertex AI through a server-side adapter. Supply validated booking, preference and offer facts while retaining the selected comparison in the customer view.

- [x] Live Gemini explains the selected offer and its tradeoffs; uncertain travel plans can lead it to recommend retained flexibility. It does not predict future prices or calculate/authorise switches itself. Evidence covers the original equivalent case and two repaired-case retests; the equivalent case was not regenerated on the repaired revision.
- [x] Any suggested preference changes require explicit customer confirmation. Advice and offer selection do not create standing permission.
- [x] Model failure produces an honest unavailable state without losing enrolment or changing the booking. Private personal data and server credentials never reach the public client.

Verification: focused adapter/failure tests plus live model evidence, subject to available credentials, for equivalent saving, uncertain plans/non-refundable offer, and unknown terms. Browser-check that the comparison stays visible. A mock alone cannot satisfy the live-Gemini criterion.

Dependencies: Tasks 3-4; verified Vertex prerequisites from Task 2 for live validation. Likely files: `app/gemini.mjs`, `app/prompts/advice.txt`, `app/server.mjs`, `app/public/booking.html`, `tests/gemini.test.mjs`. Scope: medium.

## Checkpoint: First complete customer path

- [x] Tests pass and the local Cloud Run-compatible application starts.
- [ ] Mobile enrolment, persisted preferences and a live grounded conversation work end-to-end.
- [x] Public/private boundaries are verified; no live booking/cancellation/refund calls exist in jury mode.

- [x] Review this milestone before slicing the simulated switching workflow, background jobs and submission work. Independent reviews approve the verified local scope and the two repaired live advice responses. Deployed browser end-to-end acceptance remains open.

## Current evidence and limits

Current execution checkpoint, 14 October: private deployment revision `hotel-price-hunter-00006-hfm` passed 31/31 cloud baseline checks and independent review. After the first three live calls exposed two content failures, the human approved exactly two failed-case retests. Both returned live Vertex advice and passed full-response independent review; all 32 technical checks passed. Non-refundable monitoring ends only after successful approved replacement, and unknown essential bed conditions block switching with USD 95.00 explicitly hypothetical. The original three-call failure history is SHA-verified unchanged; separate budgets are exhausted at 3/3 and 2/2, five total, and generation is stopped. The equivalent case has historical live success and current offline tests, without a new live call on this revision.

Offline repair tests passed 29 with one explicit emulator skip; deployed Firestore persistence is separately verified. The unchecked mobile/live checkpoint above requires a deployed browser end-to-end check; local browser evidence and private HTTP/model evidence are separate. Source is reviewed `9c98ede` plus health/capture/advice repairs; subsequent City Escape UI commits are preserved in the main checkout and are not part of this private release. See `docs/cloud-execution.md`, `docs/private-cloud-verification.md`, `docs/advice-grounding-repair.md` and `docs/review-live-advice.md`. No public access, paid account upgrade, source push or real booking/refund/email operation occurred. Trial balance remains independently unobserved. Live Altovo probes and later simulation/submission milestones remain outstanding.

Historical 13 October pre-execution checkpoint: project `977401667230` resolves to `sincere-apex-511418-p0`; billing enabled, trial credit status unverified. The cloud preparation bundle passed independent review with 29/29 offline fixtures. See `docs/cloud-prerequisites.md`, `docs/deployment-plan.md` and `docs/review-cloud.md`. At that checkpoint no API enablement, resource/IAM creation, image upload, deployment or model call had occurred; execution awaited credit confirmation and explicit scoped approval. Later authorised execution is recorded above.

Final status: core, runtime and UI independent reviews approve the verified local scope; all original findings are resolved. Readable essentials preserve canonical values. The final Docker build and isolated production-mode liveness/HTML/JS/CSS smoke checks passed without a cloud database/model request. See `docs/review-ui.md` for final UI approval.

The complete local suite passed **53/53 with zero skips** using the real Firestore emulator. Core, runtime and UI independent reviews resolved their original findings and approved their bounded scopes. Browser checks verified enrolment, refresh, separate permission confirmation, stale two-tab rejection, honest model-unavailable handling and selected comparison visibility at 320–1440px. See `docs/review-core.md`, `docs/review-runtime.md` `docs/review-ui.md` and `docs/ui-verification.md`; final UI review approved the readable essential choices and compact selected comparison.

Task 2's live Altovo probes remain unchecked. The supplied GCP project is deployed privately and live model response evidence is recorded above; visible billing metadata still cannot establish trial eligibility or remaining credits. No real Altovo transaction, public repository publication, notification delivery or submission occurred. Subsequent simulated-switch implementation is recorded below; operational/submission milestones remain future work.

## Next milestone: persisted simulated equivalent switch

Approved by the human's 14 October “go ahead” after the coordinator proposed the next workflow. Root remains coordinator; bounded workers own contract, backend, customer display and verification. Existing City Escape design is preserved. No additional model calls or cloud publication are part of this local implementation slice.

### Task 6: Agree the simulation contract

- [x] Record the existing booking/offer/preference authority bindings, deterministic operation identity, request/replay rules and stage transitions in `docs/simulated-switch-contract.md`.
- [x] Define unchanged final-check receipts separately from materially changed offer versions, preserving the conservative renewed-approval gate.
- [x] Document exactly when the active booking changes, saving becomes secured, refund becomes pending/completed, and monitoring rebases or ends.

Verification: coordinator trace against agreed plan §5–7 and current deterministic decision core; inspect the contract before backend/UI parallel implementation. No invented live fulfilment predicate. Depends on the reviewed first customer path contract.

### Task 7: Persist an atomic simulation and recovery history

- [x] The fictional equivalent offer executes only with current separately confirmed standing permission, valid complete revalidation and sufficient net refund; missing authority or changed material facts do not execute.
- [x] Replacement and fulfilment precede original cancellation; verified cancellation secures the saving and leaves refund pending; only a separate simulated settlement marks refund completed.
- [x] Same intent/stage retries and simultaneous requests cannot duplicate the replacement, cancellation, refund or history events. Mismatched intent payload fails; stale booking/preference requests cannot restore authority.
- [x] State survives a new client/server instance through the real Firestore emulator. Active booking/version and monitoring deadline rebase atomically; old offers cannot be used against the new baseline.
- [x] Unknown cancellation creates an unresolved agency exception without secured saving or completed refund; recovery observes the recorded intent before progressing. Ordinary monitoring stops without suppressing required recovery.

Verification: meaningful unit/HTTP concurrency and authority tests plus real emulator persistence tests; no paid model or live supplier requests. Owned backend files are `app/domain/simulation.mjs`, `app/server.mjs`, and relevant tests; reuse `app/storage.mjs` transactions unless a demonstrated need requires an additive change. Depends on Task 6.

### Task 8: Show the simulated switch and refund history

- [x] A clearly labelled advance-demo control uses the backend transition process and displays persisted progress, distinct saving/refund states and the active booking.
- [x] Refresh, repeated clicks and stale tabs preserve the operation and cannot skip stages or execute another switch. Customer wording identifies simulated settlement throughout.
- [x] The existing responsive layout, comparison and separate permission confirmation remain usable; errors restore current state and permit safe retry of the same intent.

Verification: real browser at mobile/desktop sizes, keyboard use, refresh at refund-pending, final settlement, no-authority block and cancellation-unknown outcome; capture safe screenshots/evidence. Depends on Task 6 for parallel UI work, Task 7 for integrated acceptance.

### Checkpoint: simulated saving path

- [x] Full local suite passes against Firestore emulator with no unreported skips; build/container checks appropriate to the changed app pass.
- [x] Fresh independent code/contract review resolves actionable findings; browser evidence verifies the implemented scope.
- [x] Documentation reports exact simulated coverage and remaining private-deployment/browser, supplier, non-refundable execution, scheduled-job, notification and submission gates.

Verified local simulation checkpoint, 14 October: **87/87** emulator-enabled tests with zero skips, **15** new browser checks with zero runtime errors, both existing browser regressions unchanged and passing, nine new responsive rows at 320/390/1440px, and a successful local Docker build/emulator smoke. Independent backend and UI reviews approved their bounded scopes after fixing monitoring continuation, stale changed-price refund, and fresh-session/competing-journey pending commands. See `docs/simulation-verification.md`, `docs/review-simulation.md` and `docs/review-simulation-ui.md`. The isolated QA browser/container were cleaned up; the local app remains available for review. The pre-existing emulator and unrelated `designs/brand/` are preserved.

This completes the first local simulated equivalent-switch slice, including changed-material stopping and unknown-cancellation reconciliation. Offer-specific approval/non-refundable execution and a separate protected agency view remain next capabilities. No scheduler, email, private supplier retrieval, deployment, public access or additional live inference occurred; the existing cloud revision still contains the earlier customer path. Its deployed browser/live-Gemini checkpoint above remains unchecked rather than being closed by local or API-only proof.
