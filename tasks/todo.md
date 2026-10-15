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

## Approved RoomDrop postcard flow — 15 October

The user approved the booking-first visual direction and selected-alternative review (option 2), then requested the approved RoomDrop wordmark and key icon. This supersedes the customer-facing invitation, requirements/settings form, chat link and scenario-selector layout; it does not remove the underlying booking constraints, versioned permissions or safety tests. The approved composition is retained in `docs/design/booking-postcard-approved-v1.png`; the selected RoomDrop source assets supply identity and palette. The matching ivory icon uses the selected key geometry. Source `designs/brand/` remains untouched.

### Task 9: Selected-offer approval and simulation

- [x] Three refundable alternatives have version/fingerprint-bound approval intents; explicit confirmation saves one immutable offer-specific approval and operation atomically, without creating standing permission, enrolment or preference changes.
- [x] Equivalent, different-room and different-hotel approvals each complete the shared six-stage simulation with net refunds USD 55, USD 75 and USD 85; replacement promotion and refund completion remain distinct.
- [x] Stale/missing/changed/unknown facts, false confirmation, mixed currencies and missing costs cannot authorize a switch. Lost acknowledgments/concurrent requests replay safely and reserve one source booking version.

Verification: meaningful domain/API tests and actual Firestore concurrency across clients, preserving existing standing-path tests. See `docs/booking-postcard-contract.md`; no real supplier/model/cloud operation is authorized by this local slice.

### Task 10: Simple branded customer display

- [x] Current booking leads; each alternative is a horizontal landscape-photo card with its hotel name, room subline, relationship/refundability pills and saving. RoomDrop logo and key copies match the approved source bytes.
- [x] The selected review shows truthful changed facts and whole-stay prices, `Net saving after fees` with `-USD 55` for the equivalent offer, plus potential-refund/fee wording. The marked Ask link and approval-scope note are removed.
- [x] No opening modal, stay-requirements questionnaire, preferences/settings controls or customer scenario selector is presented. Review/back/keep/reload create no approval or execution.
- [x] Compact persisted progress preserves pending versus completed refund, safe retries and current booking state. Detailed history is collapsed by default; no mutation automatically resumes on reload.

Verification: replace obsolete DOM-specific browser harnesses only after the comprehensive postcard harness passes; retain all existing domain/API safety tests. Check keyboard use, 320/390/768/1440px, honest photo fallback, fresh-session/competing-journey retries and real per-offer simulation.

### Checkpoint: approved postcard scenarios

- [x] Full emulator-enabled suite and local container checks pass with skips/failures accurately recorded.
- [x] New comprehensive browser acceptance and fresh independent review resolve actionable findings; captures visually inspected.
- [x] Local app is available for review; exact evidence/retired-test rationale and remaining deployment/live/supplier gates documented.

Verified RoomDrop checkpoint, 15 October: **102/102** tests passed against the actual Firestore emulator with zero skips/failures. Browser acceptance passed **11 groups**, **21** stage snapshots and **16** responsive checks with zero runtime errors; all three selected offers completed their real local persisted simulation. Approved logo/key copies match original hashes. Fresh independent review passed seven authority/material guards, four stopped-state copy checks and four meaningful safety mutations after repairing literal confirmation and truthful stopped-state reasons. Root and QA inspected mobile/desktop captures. Final local Docker build/emulator smoke and restarted-host different-hotel journey passed; local app is retained in session `79442`.

The three old DOM-specific browser harnesses were retired only after their replacement passed, because the human explicitly removed the modal/questionnaire/settings/chat/scenario UI. Domain/API tests and the standing-path safety scenarios remain intact. See `docs/booking-postcard-verification.md` and `docs/review-booking-postcard.md` for exact run/source boundaries, including copy-only final checks. Source brand files and existing emulator were preserved; owned QA browser/container cleaned up. No Vertex invocation, real transaction, email, source push, cloud deployment or public access change occurred. Non-refundable approval, protected agency view, scheduled checks and notification delivery remain future work; the private cloud still serves its older source.

## Non-refundable consent and protected local agency review — 15 October

Approved continuation of the remaining plan after the RoomDrop postcard slice. See `docs/flexibility-agency-contract.md`. Earlier evidence above remains historical; this slice adds the previously excluded non-refundable approval and agency inspection locally.

### Task 11: Reduced-flexibility approval

- [x] The optional fourth offer stays collapsed; normal three-card layout and approved logo/key are preserved. Review explains lost free cancellation and monitoring ending after successful replacement promotion.
- [x] A separate initially unchecked acknowledgement plus explicit offer approval binds literal reduced-flexibility acceptance to current versions/material terms; invalid/missing acknowledgement and stale facts cannot authorize execution.
- [x] USD 480 / USD 115 after fees follows the shared six stages; promotion ends monitoring regardless of enrolment/continuation preference, and refund/recovery remain distinct and can continue after monitoring ends.

Verification: canonical decision/domain/API acknowledgement negatives, selected-offer replay and emulator concurrency, plus three actual browser monitoring modes and passive-action/reset/keyboard checks. No new standing permission, model request or real transaction.

### Task 12: Protected read-only agency inspection

- [x] Operator access is denied by default; explicitly configured local review requires loopback bind/origin, a demo emulator namespace and a separately generated credential. Production/cloud enablement is rejected.
- [x] Operator sessions enforce hard expiry, rotation, logout and CSRF; protected storage reads recheck the original session after asynchronous work. Customer cookies and role/header spoofing grant no access.
- [x] New fictional operations receive atomic private index entries with independent opaque case IDs. Bounded pagination and detail use safe projections, excluding visitor/session IDs, initiating keys, raw proof IDs, private locators and source data. Historical cases have no backfill claim.
- [x] Agency pages show actual cancellation/proof/authority/saving/refund and monitoring states, with no action buttons for booking, cancellation, refund or approval. Expired/logged-out access clears protected UI.

Verification: actual emulator index/persistence and rollback coverage; default/unsafe configuration denial; authentication, expiry/rotation/logout and six invalidation-during-storage races; session-bound cursor limits; genuine browser exception cases and read-only inspection. The credential remains only in ignored local configuration or process memory, never test source/arguments/evidence.

### Checkpoint: flexibility and agency review

- [x] Emulator-enabled Node suite passed **113/113**, zero failures/skips; current `/agency` routing was independently verified after its alias was added. Independent copied-source review passed **13/13** and detected **6/6** deliberate regressions.
- [x] New browser acceptance passed five groups, three non-refundable journeys, 24 indexed cases and 27 geometry checks; original postcard regression passed all eleven groups unchanged. No browser runtime errors or Vertex requests. Root and QA inspected review, login and case detail captures.
- [x] Local Docker/default-denial/emulator smoke passed; owned QA containers and browsers were cleaned up, existing emulator preserved. Retained host app session `53012` serves `http://localhost:8080` and `/agency`, Gemini unconfigured.
- [x] Exact boundaries documented in `docs/flexibility-agency-verification.md` and `docs/review-flexibility-agency.md`: local fixture operator authentication only, no deployed identity, no historical index completeness, actual expiry/injected proof failures remain domain/API evidence, intercepted browser 401 is UI-clearing proof only.

Next: scheduled checks and retry-safe monitoring, notification records/previews, production operator identity and separately approved deployment/submission. No real supplier action, email, source push, cloud change, public access or additional Vertex generation occurred.

## Price watch and preview records — 15 October

The user approved the next slice: one `Watch for better rates` opt-in, recorded daily checks and notification previews. Exact seam and limits are in `docs/price-watch-contract.md`. Existing price comparisons, permissions, operations, frozen demo clock and operator boundaries remain separate.

### Task 13: Explicit watch and recorded daily checks

- [x] One versioned/idempotent opt-in saves consent plus the first pure simulated check atomically. Stopping remains possible at capacity; exact replay cannot restore revoked consent or apply an old visitor's action.
- [x] Actual-time fresh simulated identities and bound quote snapshots record offers found, verified no saving, failed or skipped outcomes. Deadline/session/day/quote expiry and consent/baseline/preference races are rechecked at commit.
- [x] A private discovery index and bounded shared local worker run daily checks without granting standing authority or starting/advancing switches. Unsupported promoted source is failed, not a false successful no-saving search.
- [x] Local `--once` process restarts replay the saved check without duplicate previews or changed operation facts; packaged CLI and retained `--loop` process operate only with explicit demo/emulator configuration.

Verification: actual Firestore cross-server/index/consent/outbox concurrency; delayed discovery/preparation and expiry tests; guarded local driver and executable fixture modes. Cloud scheduler/resources and live suppliers are not implemented by these laboratory checks.

### Task 14: Truthful notification previews

- [x] Deduplicated prepared, weekly-pending and offers-only-suppressed records preserve check and saved manual-operation evidence, distinguishing pending/completed refunds and unknown cancellation from authority/proof stops.
- [x] Preview cap/alias guards preserve all dedupe identities; full preview storage cannot block cancellation reconciliation or refund recovery. Nine due digest groups have distinct aliases within one transaction.
- [x] Read-only own-session updates exclude private watch/index/credential/rate identifiers, recipients and executable checked-rate actions. Saved new check facts do not replace frozen approval offers.
- [x] The original postcard remains simple, with one opt-in/stop row and collapsed Updates; current versus previous booking labels and Kuala Lumpur timestamps avoid internal version numbers. No real email is sent.

Verification: currency-minor-unit/large-integer tests, notification policy and stage/replay tests, actual browser keyboard/reload/lost-response/identity/suppression and visual geometry. Existing postcard and operator regression harnesses are preserved.

### Checkpoint: local watch and updates

- [x] Final emulator-enabled suite passed **142/142**, zero failures/skips. Fresh copied-source review passed **14/14** and detected **11/11** targeted regressions; clock, privacy, event-truth and digest capacity issues are resolved.
- [x] Price-watch browser acceptance passed **17 groups/15** geometry rows. Original postcard **11** groups and flexibility/agency **5** groups remained green, for **58** total geometry checks with zero browser runtime/model errors.
- [x] Root and QA inspected clean customer captures; actual host `--once`/restart and at least three local loop passes were observed. Final Docker app and packaged worker smoke passed without mounts, published ports or credentials.
- [x] Local app session `57889`, local worker session `84005` and existing emulator remain for review. Owned QA browsers/container are cleaned; access credentials remain ignored and never enter evidence.

See `docs/price-watch-verification.md` and `docs/review-price-watch.md` for exact source/run boundaries. This completes checks and previews locally; production scheduler/task provisioning, delivery provider/real email, production operator identity, fresh supplier access and separately approved deployment/submission remain. No Vertex generation, real transaction, email, source push or cloud access change occurred.

## Google IAP operator identity preparation — 15 October

The user selected Google IAP sign-in as the next bounded development slice. The separate agency-only service, application allowlist, Google-managed session display and offline deployment proposal are specified in `docs/agency-iap-contract.md`. No deployment or access change is authorized by this selection.

### Task 15: Verify operator assertions on an agency-only surface

- [x] Explicit production configuration binds IAP audience to the agency service and exact operator subjects; invalid/default/mixed local or customer configuration fails closed.
- [x] Actual pinned Google verifier plus strict algorithm/claims/time checks rejects forged or stale assertions, and hides credential-bearing library errors. Bounded key refresh coalesces concurrent requests and fails closed on expired/unavailable keys.
- [x] Read-only case routes recheck access after storage waits; cursors bind verified access and expiry. Customer bootstrap/mutations/advice cannot execute on the agency surface.
- [x] Google-managed UI never falls back to a passphrase, clears protected data after denial/expiry and ignores stale delayed responses. Existing local-review and customer behavior remain verified.
- [x] Fresh independent review, regression suite, browser checks and local packaging checks have recorded proof; the private deployment proposal names remaining operator/OAuth/IAM/source verification gates.

Verified locally: **159/159** emulator-enabled Node tests with zero skips, seven mocked-IAP browser groups plus the preserved **11+5+17** integrated groups, **82** total geometry checks, actual-library offline signature verification, independent **24/24** probes and an allowlist mutation detected by existing tests. A production-mode local container with no network/credentials/mounts verified packaging and default denial; it made no database or identity call. Only the exact task-owned app was restarted; retained session **58369** serves the local demo with Gemini unconfigured. See `docs/agency-iap-verification.md`, `docs/review-agency-iap.md` and `docs/agency-iap-deployment.md`.

Actual cloud sign-in, IAM verification and deployment remain separate unchecked release gates even after these local criteria pass. Scheduled trigger/task provisioning, delivery, supplier access and public submission are subsequent work.

## Google setup and private agency rollout — 15 October

The user requested Google setup, completed browser sign-in as the corrected account `pete@altovo.com`, and confirmed trial credits. See `docs/agency-google-setup.md` for observed account/project state, the exact proposed scope and the automatic approval boundary.

- [x] Verify the actual CLI account, target project/organization/billing metadata and independent Google operator identity without saving or printing credentials.
- [x] Prepare a default-offline concrete setup bundle, separately pinned read-only agency verifier, and a guarded one-shot reader behavior probe; retain the old verifier unchanged.
- [x] Resolve the inherited Node entrypoint and unavailable beta SDK assumptions; independent 17-test review and two isolated guard mutations pass.
- [x] Full local regression passes **176/176**, zero skips, in the isolated demo emulator namespace; application Docker allowlist and historical verifier remain unchanged.
- [x] Obtain explicit approval for enabling IAP, creating the reader/service agent, project-wide Firestore viewer access, image upload, private agency service, exact IAP invocation/operator grants and one temporary verification job. After initial automatic rejection, the human explicitly replied **approve all** to this exact scope.
- [x] Execute only the approved scope, establish digest/source/config/customer-preservation proof and run the guarded reader behavior probe. Final ready revision `hotel-price-hunter-agency-00002-c6v` uses the exact uploaded digest; actual query/read and update/delete denial proof passed. The one-task zero-retry verification job was removed and independently confirmed absent.
- [x] Complete genuine Google IAP browser sign-in and protected read-only availability at the UI level; record organization-policy audit limits separately. The user confirmed **Google-managed agency access and Saved cases** at the deployed URL after the sign-in instruction for `pete@altovo.com`. This is human-observed live acceptance; automated page capture, raw authenticated HTTP capture and nonempty case privacy are not claimed. Earlier automation failures and machine-verifier reports remain preserved separately.

Organization IAM reads are denied to the user. This is not hidden by the verifier or solved with a broad new grant: live reports remain `metadata-partial`, `fullAcceptance:false`, with actual selected reader behavior recorded separately. See `docs/agency-cloud-execution.md`. The existing customer service/IAM remained unchanged. No model generation, real supplier transaction or email occurred.

## Private customer and daily watch preparation — 15 October

Resumed from `.local/roomdrop-next-session-2026-10-15.md`. The local contract is
`docs/daily-watch-cloud-contract.md`; execution scope and pending release gates are
in `docs/roomdrop-cloud-setup.md` and `docs/daily-watch-cloud-verification.md`.

### Task 16: Bounded production job and offline rollout bundle

- [x] Separate guarded Cloud Run job entrypoint shares the pure check engine and
  leaves local worker production/emulator guards intact. It records only simulated
  observations and previews, with sanitized aggregate diagnostics.
- [x] Private Firestore checkpoint uses revision comparisons and advances only
  after whole completed pages; failed or interrupted pages replay safely. Processing
  is capped at 500 locators and preserves all existing consent/authority guards.
- [x] Default-offline rollout generator prepares exact source/context/digest checks,
  separate customer IAP, dedicated writer/trigger identities, bounded job settings,
  and separately gated one-shot/recurring activation commands. Historical verifiers
  remain unchanged; Scheduler stays absent through acceptance.
- [ ] Complete full regression, independent review and packaging proof; record exact
  source and local image before requesting any cloud execution approval.
- [ ] Obtain separately scoped cloud approval, deploy privately and verify genuine
  signed customer/agency data flow and one-shot job execution. Recurring activation
  remains an additional gate after acceptance.
