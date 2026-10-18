# Hotel Price Hunter: implementation plan

## Curated RoomDrop judge flow and Firestore persistence - 18 October

Source of truth: `docs\public-demo-firestore-spec.md`, updated with the approved
judge-flow decisions in `docs\roomdrop-booking-setup-handoff.md`, and `GLOSSARY.md`.
Status: approved by the user on 18 October 2026, with one modification: delivery
is split into Part 1 (sample preparation and judge setup through Drop Watch armed)
and Part 2 (RoomDrop app after watch activation). Sample preparation is an explicit
tracked task (S0). Do not ask for this approval again. Live capture/import,
deployment and access changes keep their separate approval boundaries.
The user explicitly requested the spec update and this plan together.
Earlier unchecked intake tasks are superseded for this tranche; historical
completed work and other open project tasks remain below.

Concurrent application changes appeared during planning: file-backed catalogue
routes, per-code memory state, hosted packaging, `app\public\drop-watch.js` and
`scripts\serve-booking-demo.mjs`. They were not authored or modified by this task.
F0 must reconcile the actual current tree and reuse compatible work before any
new implementation. New filenames below are proposed, not ownership claims or
instructions to overwrite another writer's changes.

### Approved behavior and superseded assumptions

- Owner-created air1 staging quotations enter through guarded admin capture/import.
  Judges select imported catalogue cards; there is no public share-link intake,
  arbitrary-code lookup, customer login or generated invitation in this tranche.
- Shared Original Booking facts and Drops are immutable. Store judge choices,
  consent, minimum saving, first-check replay and confirmation only under
  `session.byCode[code]`. One judge cannot overwrite another judge's Drop Watch.
- Preserve the latest spec's agency minimum of 10.00 in the booking currency.
  Arming performs a pure immediate replay of that booking's captured Drops,
  filtered by `isDisplayedDrop` and the chosen minimum, with visible capture/replay
  labels. There is no pending scheduled first check or runtime supplier request.
- Add the start-page card grid and RoomDrop Original Booking confirmation page,
  then setup/armed/replay screens feeding the existing Deals/Review/Confirmed flow.
  The factual staging note remains visible beside "Your agency booked this".
- Confirming a Drop requires that session's armed watch and current qualifying
  membership. It remains a selection receipt, with no Altovo quotation creation,
  supplier booking, money movement or change to the Current Booking.

### Data and runtime design

1. Review existing `app\domain\altovo-quotation.mjs` and
   `scripts\prepare-altovo-catalogue.mjs` before modifying them. The actual share
   payload needs a dedicated adapter, not `quotationBaseline()`. Capture provenance
   and exact price/currency bindings; validate `non_refundable` and UTC schedules,
   never the 1970 sentinel or a guessed deadline timezone. Keep absent guest-age
   facts absent and mark my/my/adults-only Gateway search as agency defaults.
2. Prepare one complete sanitised bundle per curated code, with photo/card/scenario
   metadata and captured Drops. Two quotation projections currently exist; no
   complete six-entry catalogue or per-booking Gateway results are assumed.
   Additional owner-created entries and bounded captures are separate prerequisites.
3. Create immutable `roomdropBookingsV1/{code}` records and append-only
   `drops/{dropId}` documents through `scripts\import-altovo-catalogue.mjs`, dry-run
   by default. Validate complete bundles and publish only a complete reviewed set.
   Identical replay is safe; changed Original Booking facts fail `BOOKING_CHANGED`.
   Distinguish a valid empty result from a missing/failed capture.
4. Pin a bounded reviewed catalogue manifest of allowed codes and content/Drop-set
   versions in the release. Read display records from Firestore; the manifest
   contains no private quotation payload or credentials. Public APIs validate
   membership before document access and cannot import or refresh records.
5. Persist SHA-256 cookie-keyed anonymous sessions, fixed one-hour expiry, CSRF,
   session-wide advice counters and per-code watch/receipt/context. Use explicit
   versioned commands so identical retries replay while stale retries cannot undo
   newer setup. Changed Drop bindings invalidate only the affected entry.
6. Arming evaluates current cancellation eligibility and saves consent, threshold,
   armed time and one completed captured-replay result atomically. Rearming with a
   deliberate new minimum creates a new watch revision in that entry only.
   Confirmation requires the current armed qualifying set and acknowledgements.
7. Add path-based routes such as `/api/booking-demo/catalogue` and
   `/api/booking-demo/q/<code>` with explicit action suffixes. Change exact URL
   rewrites/static allowlists deliberately; keep no query lookup, canonical Host,
   Origin/CSRF, request bounds and production emulator/credential guards.
8. Keep Gemini outside retryable transactions. Reserve the session allowance,
   then merge context for the exact code/watch/Drop versions without overwriting
   newer confirmations. Preserve four requests/minute/session, existing twenty
   requests/minute/instance and two concurrent calls/instance.
9. Use the existing Firestore dependency and runtime identity. Keep session capacity
   bounded at 64 live sessions with shared transactional accounting; reads and
   per-session code maps are catalogue-bounded. No memory/file fallback in hosted
   mode. Session TTL alone is proposed; shared bookings/Drops survive sessions
   and source-link expiry. Existing simulation/agency/watch data remains separate.

### Implementation order and checkpoints

Detailed acceptance and file ownership are in `tasks\todo.md`. The seam, receipt
and file-ownership rules are in the spec section "Delivery split, seam and
ownership". Original order (historical reference):

- F0-F2: audit captures/scaffolding, validate the adapter, then import/read one
  complete booking/Drops bundle through the emulator.
- F3-F5: durable per-code sessions, catalogue HTTP bootstrap, then atomic arming,
  replay and selection guards.
- F6-F8: start/Original Booking screens, setup-to-Deals flow, then durable Gemini
  context. Check both judges on one booking and one judge across two bookings.
- F9-F11: hosted entrypoints, frozen release export, browser/restart acceptance and a
  concrete release bundle for a separate deployment/import decision.

Approved two-part delivery (18 October 2026). Mixed F tasks are split into `a`
(Part 1) and `b` (Part 2) sub-tasks:

- Part 1 (Claude, `.local\roomdrop-part1`, branch `claude/roomdrop-part1-armed`):
  S0 sample preparation; F0; F1; F2; F3a session core and watch entry; F4a
  catalogue/per-code bootstrap; F5a atomic arm and first-check replay receipt;
  F6 start grid and Original Booking confirmation; F7a consent/minimum setup,
  cannot-start and armed state; F9a minimum hosted Firestore wiring for setup;
  F10a minimum packaging closure; F11a Part 1 emulator/browser/restart evidence.
  Part 1 ends at the committed arm receipt.
- Part 2 (Codex, `.local\roomdrop-part2`, branch `codex/roomdrop-part2-app`):
  F3b confirmation/context session fields; F4b confirm/advice/chat routes on
  durable sessions; F5b membership, safe rearming, stale rejection and idempotent
  selection receipts; F7b replay presentation and Deals/Review/Confirmed; F8
  durable Gemini context; F9b complete hosted entrypoints; F10b frozen release
  export; F11b integrated acceptance and release bundle.
  Implementation record: receipt/UI and contract-v1 action/startup wiring are
  implemented on this branch. Real-emulator tests exercise Part 2 transactions
  and HTTP restart recovery through injected contract adapters. Part 1 modules
  are not integrated here, so whole-journey persistence and a production release
  candidate remain open. See the Part 2 verification section.
  File splits for isolated ownership: F3b uses `quotation-session-actions.mjs`
  and its test instead of creating Part 1's session-core file; F4b uses
  `quotation-post-watch.mjs` and `quotation-durable-actions.test.mjs` for its
  bounded durable handler; F7b has a separate `booking-after-watch.browser.mjs`
  for memory-receipt evidence. F11b's `booking-firestore.browser.mjs` refuses to
  substitute those doubles for the actual Part 1 dependencies.
- Both parts branch from `roomdrop/judge-flow-base`, a snapshot of pre-existing
  shared-checkout work authored by neither part. Part 2 may start against the
  current memory-backed `/watch` receipt and switches to the Firestore-backed
  receipt once F5a lands; the receipt contract changes only by coordination.

No task is marked complete by this plan. All proposed tasks are small or medium
and name at most five likely files. Extra files require an explicit task split.

### Verification commands

Use PowerShell and the existing loopback emulator; never flush shared state.
The proposed new harnesses below are not existing verification evidence.

```powershell
Set-Location 'C:\Users\pohli\Sites\hotel-price-hunter'
$env:GOOGLE_CLOUD_PROJECT='demo-roomdrop-iap-qa'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8081'
$env:RUN_FIRESTORE_INTEGRATION='1'
$env:NODE_ENV='test'
Remove-Item Env:K_SERVICE,Env:CLOUD_RUN_JOB,Env:STORAGE_MODE,Env:GEMINI_MODEL,Env:GOOGLE_CLOUD_LOCATION,Env:QUOTATION_ADVICE_ENABLED -ErrorAction SilentlyContinue
node --test .\tests\altovo-catalogue.test.mjs .\tests\booking-storage.test.mjs
node --test .\tests\quotation-session-storage.test.mjs .\tests\booking-catalogue-server.test.mjs
node --test .\tests\booking-drop-watch.test.mjs .\tests\booking-live.test.mjs
node --test .\tests\quotation-advice-server.test.mjs .\tests\booking-advice.test.mjs
node --test .\tests\quotation-cloud.test.mjs .\tests\public-demo-release.test.mjs
node .\tests\booking-firestore.browser.mjs
npm test
git diff --check
```

The importer command proposed for local dry-run is
`node .\scripts\import-altovo-catalogue.mjs --catalogue=.local\altovo-catalogue\REVIEWED-CATALOGUE.json`.
An emulator write additionally requires `--execute --project=demo-roomdrop-iap-qa
--database="(default)" --emulator=127.0.0.1:8081`. Implement explicit guards and
canonical workspace path checks before executing it; the actual input path and
manifest are chosen from inspected captures, not hard-coded private evidence.
Do not execute the existing capture script with `--execute` during offline tests.

Build the exact emitted context with `docker build --tag roomdrop-firestore-review
CONTEXT_DIRECTORY`. Startup failure smoke uses `docker run --rm --network=none
roomdrop-firestore-review`; a successful production-mode smoke must use the
packaged app with explicit emulator/test dependency injection without weakening
hosted production guards. Record the final executable harness/build/start commands
in the verification report. The pitch Worker build/deploy is a separate product.

### Content and acceptance prerequisites

The handoff records AIRB000179 as non-refundable and AIRB000180 as refundable.
Verify their allowlisted projections and cancellation schedules locally. Use
injected responses and test-only clocks for boundary cases; do not change real
capture dates/deadlines to manufacture a closing-soon or armable public scenario.
A missing child-age/nationality field, supplier-net field or legacy token must
never leak into a public projection or become invented source evidence.

Keep the desired six-card scenario matrix separate from implementation acceptance:
two samples can verify storage mechanics, while complete catalogue content needs
owner-created quotations and corresponding reviewed captures. Card photo/city and
scenario descriptions must be supplied as curated facts, not invented metadata.
This content work is the explicit Part 1 task S0 in `tasks\todo.md`, tracked as
separate steps: inspect the two existing projections, owner quotation creation,
sanitised projection capture, matching per-quotation Gateway Drop capture,
photo/scenario metadata and guarded Firestore import. Each live step needs its
own user approval; plan approval grants no new live-call allowance.

### Release and approval boundaries

The approved judge-flow decisions settle this tranche's anonymous access,
per-session ownership, immediate replay, start/confirmation pages and Deals
handoff. Broader invitation identity (#7), general booking contracts (#6), setup
prototype (#8) and future Drop-to-quotation behavior (#9) remain tracker references;
this plan neither closes them remotely nor authorizes deferred capabilities.
Research branches remain read-only and are never merged.

Before a separately approved release, verify database and runtime permissions,
reviewed catalogue manifest/import set, current scenario eligibility, exact image/
configuration changes, session TTL, rollback and preservation of private services
and data. The first persistent release may require fresh anonymous sessions.
Do not import production Firestore data, deploy, change IAM/TTL, capture more live
quotations/Gateway rates, make extra model calls, push source or commit `.local\`
without the relevant authority. Plan approval was given on 18 October 2026 with
the Part 1/Part 2 split; these release boundaries are unchanged by it.

## Gemini restored and deployed, 18 October

Model decision and execution: Gemini 3.8 Flash (`gemini-3.8-flash` / `global`) is
deployed in the existing booking review on revision `hotel-price-hunter-00015-b8d`.
The earlier three-request evaluation and three additional production acceptance
checks passed. Both allowances are exhausted. See `docs/gemini-production-release.md`.

The original hackathon plan explicitly requires live Gemini preference understanding
and grounded comparisons. The published booking-backed demo now has a live model
path. The restoration adds a Gemini stay adviser to selected-room
review, with follow-up questions, a server-side Vertex AI adapter and deterministic
financial/transaction boundaries. See `docs/quotation-gemini-contract.md`.
The current room-selection UI remains; the historical opening questionnaire/chat
modal is not reintroduced. The original five-call allowance stays exhausted and
unchanged. The newly authorised 3.8 semantic tests and customer release have passed.
Historical Gemini-disabled checkpoints below describe
earlier releases and do not replace this restored AI requirement.

Current cloud checkpoint, 15 October: RoomDrop customer revision
`hotel-price-hunter-00007-lrm` is privately deployed behind its own operator-only IAP
gate. Independent registry and **44+4** supported metadata/direct-access checks passed
with the known inherited IAM limit. The user confirmed the live customer/agency
functional checks; exactly one approved job execution then passed **20/20** independent
checks, preserving the truthful unsupported-replacement fixture result. Scheduler
remains absent. Signed browser acceptance is human-reported, without automated capture.
Customer-clarity improvements requested afterwards remain local. See
`docs/roomdrop-cloud-execution.md`. This supersedes historical deployment/next-step
statements below.

Status: approved; RoomDrop postcard, four selected-offer simulations, protected local agency review, explicit price-watch checks and notification previews are verified locally on `codex/customer-flow`. The separate Google IAP agency service is now privately deployed, with source/configuration/direct-access and actual reader behavior proof; signed browser acceptance is recorded in `docs/agency-cloud-execution.md`. Earlier customer enrolment/advice remains deployed privately with bounded live Gemini evidence. Organization-policy audit coverage, scheduling/delivery, updated customer deployment/browser acceptance, live Altovo probes and submission remain outstanding.
Reviewed: 12 October 2026, Asia/Kuala_Lumpur.

Latest development checkpoint, 15 October: bounded production watch executable and
offline private-customer/job/Scheduler setup are implemented and independently
reviewed locally. The complete emulator suite passes 194/194 with zero skips. See
`docs/daily-watch-cloud-contract.md`, `docs/roomdrop-cloud-setup.md` and
`docs/daily-watch-cloud-verification.md` for current scope and pending cloud gates.
Scheduler stays absent through rollout acceptance; no new deployment or cloud
execution has occurred. Historical next-step paragraphs below are not the current
implementation queue.

## Recommendation

Start by defining the booking/offer contract and checking Altovo read-only feasibility. Then deliver one complete public demo path: an anonymised refundable booking, enrolment, one grounded Gemini comparison, and persisted preferences. Add the simulated switching lifecycle next. Preserve the current Booking changes visual direction.

The agreed prototype plan supplies the product requirements. This document orders implementation; it does not replace those requirements or authorise deployment, publication, live transactions, or sending email.

## Evidence reviewed

- Agreed plan: `C:/Users/pohli/.codex/.chatgpt-projects/g-p-6acc4eb559288191a742ed7b1ec78751/hotel-price-hunter-plan.md`.
- Current repository: `README.md`, `package.json`, `wrangler.toml`, `scripts/build.mjs`, `src/pitch.html`, `worker/index.js`, and the design index.
- The checkout was clean on `main`. The current implementation is a static Cloudflare Worker with shared authentication and fictional offers. There are no live Altovo/Gemini integrations, persistent enrolment, monitoring jobs, or transaction workflow. There is a build command but no test command.
- The mirrored project `sources/` directory is empty. The plan mentions linked booking documentation without supplying a link. Local scraper room-matching research files were located, but their contents and API behaviour have not been validated in this review.
- Current official requirements: [Themes](https://aibuildercup.com/themes.html) and [FAQ](https://aibuildercup.com/Faqs.html). Google AI and Google Cloud deployment are required; the FAQ excludes solutions built primarily on other clouds and requires a public repository, deployed prototype, deck and video under three minutes. The new application should visibly distinguish its own implementation from existing Altovo dependencies.
- The dated participation capture records submission closing at **19 October 2026, 02:29 Kuala Lumpur time**. That is a local 12 October snapshot, not a fresh authenticated dashboard verification. Plan to finish on 18 October and recheck the dashboard before relying on the cutoff.

## Findings that affect the first build

1. **Runtime gap.** Cloudflare hosts the existing pitch UI; the planned application belongs on Google Cloud. Reuse the visual assets in a Cloud Run application. Avoid adding the application backend to the Worker and moving it later.
2. **Permission gap.** The UI currently says customers approve every change and never changes the active booking. The agreed plan requires separately confirmed standing permission for equivalent automatic switches, while alternatives need individual approval.
3. **Price contract gap.** The UI calculates savings as a subtraction from a fixed USD 600 baseline. Define customer total price, currency, fees, cancellation costs and the agency refund calculation before claiming a net saving. Supplier cost savings alone do not prove a traveller refund. No mixed-currency comparison without an agreed conversion policy.
4. **Integration evidence gap.** Verify retrieval, complete rate identifiers, occupancy including child ages, cancellation schedules and final offer checking. Historical `confirmed` versus terminal `vouchered` semantics remain unverified. Unknown essential conditions must prevent automatic switching.
5. **Demonstration gap.** The present selection acknowledgement does not demonstrate replacement, cancellation or refund states. Build a persisted simulation whose decisions and transitions are shared by scheduled checks and the labelled advance-demo control.

## Initial architecture and boundaries

- One Cloud Run application serves the mobile UI and server endpoints. Firestore stores booking versions, preferences, approval records, offers and operation history. Keep this as one application initially.
- Gemini through Vertex AI receives validated booking/offer facts and explains tradeoffs. Application rules calculate money, classify eligibility and enforce permissions. Gemini cannot create transaction authority or invent missing conditions.
- Define separate booking-read, offer-search/revalidate and transaction interfaces. Public jury mode uses allowlisted anonymised fixtures and simulated transactions. Private research mode uses authorised read-only Altovo access and separate protected routes/data. Never offer arbitrary real-booking lookup publicly or pass raw personal data into public scenarios.
- Standalone single-room bookings only. Preserve dates, occupancy, essential conditions, complete supplier identifiers and timezone-aware cancellation schedules.
- Equivalent automatic switches require affirmative standing permission, sufficient net saving, verified equivalence and unchanged flexibility. Unknown facts block automation. Different rooms/hotels and reduced flexibility require explicit offer-specific approval.
- Transaction sequence: revalidate, secure replacement, verify fulfilment, cancel original, verify cancellation, process refund. A changed offer invalidates the relevant approval. Cancellation uncertainty enters an agency exception state; it does not imply savings secured or refund completed.
- Continued monitoring uses the replacement's baseline and deadline. A non-refundable replacement ends price monitoring after explicit approval; unresolved recovery operations continue.
- Introduce Cloud Scheduler and Cloud Tasks after the first complete simulation works. Repeated invocations must be idempotent. Real email delivery can follow the notification record/outbox implementation.

## Delivery order

Detailed tasks for the first milestone are in `tasks/todo.md`.

1. **Contract and feasibility:** inspect the missing references, define canonical data and decision examples, perform authorised read-only API probes and verify GCP/Vertex prerequisites. If Altovo access is unavailable, document the limitation and continue the public flow with fixtures; private retrieval remains incomplete.
2. **First working customer path:** confirmation page -> dismissible invitation -> enrolment -> persisted preferences -> grounded Gemini comparison retaining the selected offer in view. All three offer categories have representation; no transaction claims yet.
3. **Simulated equivalent saving:** one daily-check decision produces an eligible offer and executes the full simulated operation with distinct saving/refund states. Repeating the trigger cannot create a second replacement or refund. The replacement becomes the monitored booking when permitted.
4. **Remaining jury scenarios:** non-refundable advice/approval, material revalidation change requiring new approval, uncertain cancellation in the agency view. Include failure/no-saving updates without presenting a failed check as a successful search.
5. **Operational and submission proof:** scheduled trigger, controlled task retries, notification preferences and records, protected private read-only retrieval, authorised Cloud Run deployment, public-repository sanitisation, deck and a roughly 2:45 demo video. Verify the deployed version and submission fields; do not infer that a submission was received.

## First milestone acceptance

- A user can decline or complete enrolment against an anonymised single-room booking. Essential requirements are editable; automatic-switch permission is explicitly confirmed; saving threshold cannot drop below the agency minimum; notification frequency is stored; continued monitoring defaults on.
- Refresh preserves enrolment and the selected comparison. Gemini answers from the booking, preferences and checked offer facts, can recommend keeping flexibility, and never predicts future prices. Model failure leaves the booking and preferences intact.
- Money/permission rules are tested independently of Gemini. Public routes expose no private booking retrieval or real transaction calls. Mobile runtime checks cover the invitation, enrolment and comparison flow.

## Risks and prerequisites

| Unknown | Required evidence | What can proceed without it |
| --- | --- | --- |
| Altovo access and response contracts | Authorised booking, search and final-check captures, sanitised and timestamped | Fixture-based public customer flow |
| Equivalent-room proof | Explicit essential-condition mapping; unknown/mismatch examples | Advice-only comparisons |
| Fulfilment status semantics | Current documentation plus live read-only status evidence | Simulated fulfilment with an explicit unverified live gate |
| Customer price/refund accounting | Agency mapping of retail total, costs and refund amount | Explicit fixture prices and simulated settlement |
| GCP project, billing, region, Vertex access | Read-only prerequisite check; any provisioning separately authorised | Local implementation with a model adapter |
| Email delivery | Provider/configuration plus authorised test delivery | Notification records and preview |

Proposed demonstration assumption: use one explicit currency and an agency minimum represented in the fixture. The minimum value and anonymised booking must be chosen before money examples are treated as accepted behaviour. Do not invent a production threshold.

## Next concrete action

Execution update, 14 October: approved Singapore resources and the private Cloud Run app are deployed at `https://hotel-price-hunter-2qbcpylngq-as.a.run.app`, revision `hotel-price-hunter-00006-hfm`. The repaired release passed 31/31 zero-generation cloud checks and fresh independent review. After three original live Gemini calls exposed two content failures, the human approved two failed-case retests. Both passed full-response independent review and all 32 technical checks. The original three-call evidence remains SHA-verified unchanged; all five approved attempts are exhausted and generation is stopped. Gemini selects grounded reasons while application code renders currency, monitoring and state facts. The repair passed 29 focused tests (one emulator case explicitly skipped, with real deployed persistence independently verified). The equivalent case has original live evidence and current offline coverage; it was not regenerated on this revision. See `docs/private-cloud-verification.md` and `docs/review-live-advice.md`.

Subsequent local implementation, 14 October: the persisted simulated equivalent-switch workflow is now implemented. The final emulator suite passed **87/87 with zero skips**; **15 real-browser checks** passed, including six separate happy-path advances, refund-pending refresh, current baseline USD 540, material-change stop with proposed USD 50, unknown cancellation reconciliation, lost acknowledgments, duplicate/stale-tab requests and fresh-session/competing-journey retries. Backend and UI source reviews resolved their findings and independently tested guard mutations. The existing City Escape design is preserved. See `docs/simulated-switch-contract.md`, `docs/review-simulation.md`, `docs/review-simulation-ui.md` and `docs/simulation-verification.md` for exact final coverage.

Approved redesign update, 15 October: the human selected the simpler booking-postcard composition and option 2's selected-alternative review, then requested the approved RoomDrop logo/key. The customer now sees three horizontal landscape-photo alternatives with hotel-name headings and category pills, no opening modal, requirements/settings form, chat link or scenario selector. Net saving is explicitly `-USD 55` after fees in the equivalent review. One explicit offer-specific confirmation starts a simulated workflow without creating enrolment, preference edits or standing permission. All three refundable choices complete with USD 55/75/85 net refunds. Domain/API verification passed **102/102 with zero skips**, browser acceptance passed **11 groups/21 snapshots/16 responsive checks**, and final local image/host journey checks passed. Independent review resolved consent and truthful stopped-state copy findings. The old three DOM-specific browser harnesses were replaced after new acceptance passed; all domain/API guards remain. See `docs/booking-postcard-contract.md`, `docs/booking-postcard-verification.md` and `docs/review-booking-postcard.md`.

Subsequent local slice, 15 October: non-refundable approval now requires explicit reduced-flexibility acknowledgement bound to the selected terms; USD 480 replacement / USD 115 net refund follows the shared ordered simulation. Promotion ends normal monitoring regardless of enrolment/continuation while recovery/refund can continue. A separate authenticated, read-only local agency view shows new fictional cases through an atomic private index, bounded session-bound pagination and credential-free projections. Default/production/cloud operator access remains closed. The emulator-enabled suite passed **113/113 with zero skips**, independent copied-source checks **13/13** detected **6/6** guard regressions, new browser checks covered three monitoring modes and 24 cases with 27 responsive rows, and the eleven postcard regression groups remained green. Local Docker/default-denial/emulator smoke passed. See `docs/flexibility-agency-contract.md`, `docs/flexibility-agency-verification.md` and `docs/review-flexibility-agency.md` for precise source/run and coverage boundaries.

Subsequent local watch slice, 15 October: one explicit checks-and-alerts opt-in now saves a first actual-time simulated observation without switch authority. Private indexed daily worker, immutable outcomes and preview records handle replay, consent/deadline/quote/source guards and saved manual refund/exception events. New watch rates remain read-only and distinct from frozen demo approval snapshots; weekly/daily/offers-only records do not deliver real email. Final verification passed **142/142** emulator tests, **17** new browser groups, the preserved **11+5** regressions and **58** total geometry rows. Independent review passed **14/14** probes and detected **11/11** guard mutations, including the nine-digest alias collision. Host worker restart/loop and packaged worker/container checks passed. Local app/worker are retained; see `docs/price-watch-contract.md`, `docs/price-watch-verification.md` and `docs/review-price-watch.md`.

Subsequent identity preparation, 15 October: the user selected Google IAP sign-in. An explicit agency-only service verifies signed Google assertions, exact operator subjects and hard expiry on every protected request; customer mutations/advice are unavailable there. The managed-access UI preserves local passphrase review separately and clears protected data on denied/expired access. Verification passed **159/159** emulator-enabled tests with zero skips, seven new mocked-IAP browser groups plus the **11+5+17** integrated regressions and **82** geometry checks. Fresh independent review passed **24/24** probes and detected an isolated allowlist mutation. A local network-disabled production container passed packaging/default-denial checks without database/identity calls. See `docs/agency-iap-contract.md`, `docs/agency-iap-verification.md`, `docs/review-agency-iap.md` and the concrete private-deployment proposal `docs/agency-iap-deployment.md`. No actual Google sign-in or deployed IAM is established by local tests.

Next: resolve verified operator principals/OAuth and approve the separately prepared agency rollout; prepare verified real supplier access and scheduler/task/delivery configuration, then an approved updated customer deployment and public submission proof. The new RoomDrop source remains local; the unchanged private cloud release above does not contain it. Public invocation remains closed; trial balance remains independently unobserved. No Vertex invocation or actual email occurred during this local implementation.

Historical pre-execution update, 13 October: the user supplied project number `977401667230`, verified as `sincere-apex-511418-p0` with billing enabled. Application APIs were disabled; existing local ADC lacked target access. `docs/deployment-plan.md` and `scripts/prepare-cloud.ps1` provided a reviewed offline bundle for Singapore resources, an attached runtime identity, private deployment and up to three separately authorised fixture-only Gemini checks. The cloud preparation review passed 29/29 offline fixtures. At that checkpoint trial credit status and explicit execution approval remained outstanding; no provisioning or deployment had occurred. Later authorised execution is recorded above.

Earlier local checkpoint: the contract, decision core, Firestore-backed runtime and customer UI were implemented. The full local suite passed 53/53 with zero skips against the Firestore emulator; three independent reviews resolved their findings, and the mobile/browser flow passed. The container built and served its liveness endpoint and UI in production mode; that local checkpoint did not establish deployed database/model reachability. Subsequent private cloud evidence is recorded above.

The supplied Google project and bounded private deployment/model checks are verified as described above; billing metadata still cannot prove trial eligibility or credit balance. Establish authorised Altovo tenant/booking access before live retrieval/search probes; stateful prebook remains outside read-only scope. Deployed browser acceptance, production operator identity, scheduled monitoring/notifications, private retrieval, public release and submission artifacts remain outstanding. See `tasks/todo.md` and the independent `docs/review-*.md` reports for exact coverage.
