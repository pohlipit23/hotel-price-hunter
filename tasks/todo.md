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

- [ ] Live Gemini explains the selected offer and its tradeoffs; uncertain travel plans can lead it to recommend retained flexibility. It does not predict future prices or calculate/authorise switches itself.
- [x] Any suggested preference changes require explicit customer confirmation. Advice and offer selection do not create standing permission.
- [x] Model failure produces an honest unavailable state without losing enrolment or changing the booking. Private personal data and server credentials never reach the public client.

Verification: focused adapter/failure tests plus live model evidence, subject to available credentials, for equivalent saving, uncertain plans/non-refundable offer, and unknown terms. Browser-check that the comparison stays visible. A mock alone cannot satisfy the live-Gemini criterion.

Dependencies: Tasks 3-4; verified Vertex prerequisites from Task 2 for live validation. Likely files: `app/gemini.mjs`, `app/prompts/advice.txt`, `app/server.mjs`, `app/public/booking.html`, `tests/gemini.test.mjs`. Scope: medium.

## Checkpoint: First complete customer path

- [x] Tests pass and the local Cloud Run-compatible application starts.
- [ ] Mobile enrolment, persisted preferences and a live grounded conversation work end-to-end.
- [x] Public/private boundaries are verified; no live booking/cancellation/refund calls exist in jury mode.

- [x] Review this milestone before slicing the simulated switching workflow, background jobs and submission work. Three independent reviews approve the verified local scope; live acceptance remains open.

## Current evidence and limits

Final status: core, runtime and UI independent reviews approve the verified local scope; all original findings are resolved. Readable essentials preserve canonical values. The final Docker build and isolated production-mode liveness/HTML/JS/CSS smoke checks passed without a cloud database/model request. See `docs/review-ui.md` for final UI approval.

The complete local suite passed **53/53 with zero skips** using the real Firestore emulator. Core, runtime and UI independent reviews resolved their original findings and approved their bounded scopes. Browser checks verified enrolment, refresh, separate permission confirmation, stale two-tab rejection, honest model-unavailable handling and selected comparison visibility at 320–1440px. See `docs/review-core.md`, `docs/review-runtime.md` `docs/review-ui.md` and `docs/ui-verification.md`; final UI review approved the readable essential choices and compact selected comparison.

Task 2's live probes and Task 5's live-Gemini acceptance remain unchecked. The user requests a fresh GCP project with free credits; visible account metadata cannot establish trial eligibility. Trial/signup verification and an intended project ID are required before cloud setup or live model validation. No real Altovo transaction, cloud deployment, repository publication, notification delivery or submission occurred. The later simulated switching and operational/submission milestones in `tasks/plan.md` remain future work.
