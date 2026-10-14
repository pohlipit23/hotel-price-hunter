# RoomDrop price watch and notification previews

Frozen implementation contract, 15 October 2026; coordinator decisions incorporated below. This extends [booking-postcard-contract.md](booking-postcard-contract.md) and [flexibility-agency-contract.md](flexibility-agency-contract.md). The approved slice is one opt-in for daily checks and alerts, persisted check evidence, safe retries, and notification records/previews. Existing selected-offer approval and manual simulated recovery remain separate authority. No additional model calls, live provider calls, email, cloud scheduler/resources, deployment, publication or OCR are authorised.

## Capabilities and customer scope

| Capability | Responsibility | Dependency |
| --- | --- | --- |
| price-watch | Explicit watch consent and baseline eligibility | Current booking; existing customer session |
| recorded-checks | Local daily search, bound evidence and replay | Active watch; trusted simulated provider; Firestore |
| notification-previews | Durable deduplicated event previews and frequency reasons | Check or existing manual operation event |

Keep the approved RoomDrop postcard, three opening cards, collapsed non-refundable alternative, selected-offer confirmation and collapsed operation history. Add a compact `Watch for better rates` action beside the current booking, saved watching/stopped/ended status and a small-text `Stop watching` action after opt-in. The first opt-in performs one pure simulated fixture check and persists its preview in that same customer action/transaction; no additional Check now control. The next daily check comes from the local worker. No opening modal, questionnaire, settings, standing-permission grant, automatic switch or customer diagnostic selector. Offer comparisons and existing manual advances continue to require their existing explicit actions. Preserve DOM hooks `price-watch`, `watch-button`, `watch-status`, `watch-last-check`, `notification-previews-details` and `notification-previews`; preview details start collapsed.

Watch opt-in changes only watch consent and its private discovery index. It does not change `enrolled`, `preferences`, `permissionRecord`, existing approvals, booking version or operations. A legacy standing record must not cause the check engine to invoke `startSwitch`, `approveOffer` or `advanceSwitch`. Stopping the watch prevents future checks and alerts; existing deliberate cancellation reconciliation and refund settlement remain available through their current guarded routes.

## Frozen HTTP and bootstrap seam

Keep existing JSON/error envelope, 16 KiB body limit, no-store headers, exact origin, customer session and CSRF protections. Customer watch commands accept no provider outcome, date, supplier identifier, scenario, locator, notification frequency or authority field.

| Route | Exact input and output |
| --- | --- |
| `POST /api/price-watch` | Exactly `{bookingVersion,watchVersion,enabled}`; positive current booking version, non-negative watch version, Boolean enabled. Existing `X-CSRF-Token` and required server-issued `Idempotency-Key` headers. HTTP 200 returns full public state plus `replayed`. |
| `GET /api/notifications?limit=20` | Current customer session required; no bootstrap/session creation. Only `limit`, integer 1–50; returns latest safe records from the retained latest-100 preview view in stable creation order, `{notifications:[preview],deliveryMode:'preview-only'}`. No recipient, visitor ID, private locator or cross-customer lookup. |

Bootstrap adds the following allowlisted object. Existing `monitoring` remains the legacy simulation field; this independent watch status must not be recomputed from enrolment or standing permission.

```js
priceWatch: {
  enabled: false,
  version: 0, epoch: 0,
  scope: 'checks-and-alerts-only',
  bookingVersion: 1,
  status: 'stopped', // active | paused | ended | stopped
  reason: 'NOT_OPTED_IN',
  timeZone: 'Asia/Kuala_Lumpur',
  nextCheckAt: null,
  lastCheck: null, // safe recorded-check projection below
  consentIntents: {
    enable: { body: {bookingVersion:1,watchVersion:0,enabled:true},
              idempotencyKey:'<server-issued sha256>' },
    disable: { body: {bookingVersion:1,watchVersion:0,enabled:false},
               idempotencyKey:'<server-issued sha256>' }
  }
}
```

`enabled` is saved consent; effective status also checks current baseline and operation guards. Non-refundable baseline or reached actual cancellation deadline means ended even when enabled remains true. Unknown cancellation facts mean paused. An unresolved operation means paused, never an implicit advance. Disabled means stopped. Enrolment and `continueMonitoring` are not prerequisites for this explicit checks-only watch. UI uses actual `priceWatch` status for this new feature; legacy simulated monitoring labels must be explicitly identified where promotion/legacy flags differ and must not contradict or overwrite watch status.

Derive each consent intent key from a fixed watch protocol, server visitor scope, booking version, watch version and enabled value. Never expose private watch/visitor identity. The key is session-specific, so a command retained by a former browser visitor cannot enable a fresh visitor with the same version numbers. Persist the exact body hash and replay receipt atomically. After checking the current session, look up an existing command receipt before fresh eligibility/version checks: exact replay returns current state with `replayed:true` and performs no second consent transition/index write/check/preview. Changed payload under the same key is `422 IDEMPOTENCY_PAYLOAD_MISMATCH`; missing/wrong key is `422 INVALID_IDEMPOTENCY_KEY`. Fresh valid consent changes increment watch version once; each stopped-to-enabled transition starts a new subscription epoch. Sending the already current enabled value creates no new version/epoch, resets nothing and performs no extra check. Different commands with stale watch version return `409 WATCH_VERSION_CHANGED`; stale booking returns `409 BOOKING_VERSION_CHANGED`. An old opt-in replay cannot restore consent after a newer stop. Missing/extra fields, noninteger versions and nonboolean enabled reject with 422. Storage failure returns 503; never synthesize watching success. Watch version/epoch must not become part of the existing non-refundable acknowledgement key; looking consent is independent of approved offer terms/fingerprint/preferences.

## Clock, provider and checked-offer seam

Actual UTC instants govern recorded checks, session expiry, baseline free-cancellation deadline and preview due times. The daily calendar in this slice is Asia/Kuala_Lumpur. `state.demoNow` remains the explicit fictional `2026-10-12T03:00:00Z` simulation clock and is never silently advanced by a daily check. Keep both clocks labelled wherever evidence includes them.

The checked-in offers expire on 13 October. Reading them on 15 October does not constitute a fresh search. The pure local provider may use fictional templates to construct a new explicitly simulated observation, with new full offer/rate identity, checked-at instant, bounded expiry and a refund quote calculated against the captured trusted original booking version 1. Provider support is restricted to that original source; a promoted version 2 returns `failed` with `SOURCE_UNAVAILABLE`, not no-saving or an invented replacement quote. It must not reuse an expired supplier/rate identity, merely extend an old expiry or carry a USD 600 refund quote to a USD 540 replacement baseline. Keep stay, occupancy, known essential conditions, retail total/currency, cancellation coverage, fees and refundable customer amount bound. Unknown or mismatched currency/conditions cannot establish an eligible saving. All prices and effects are labelled simulated fixture observations, never live hotel rates.

The approved seam is separate `checkOffers` inside the safe check projection. These facts carry no `simulation.offerApprovalIntents` and cannot enter the existing offer-approval allowlist. Existing four demo offers and operation source snapshots remain untouched. An approval-request preview asks for deliberate review but grants no authority and promises no executable current offer. There is no execution click for a newly checked price. Integrating new identities into current actionable offers requires explicit approval of the wider actual-time approval/revalidation seam first.

## Recorded daily checks and safe retries

Use one shared pure engine from the first-enable customer action, tests and a local worker; no public scheduler/run HTTP route. A stable private daily intent binds watch index identity, subscription epoch, booking version and Asia/Kuala_Lumpur calendar day. Capture watch/preference versions, current booking snapshot, baseline deadline, timezone, provider protocol and the first actual request instant once. Do not key by attempt timestamp, random request ID or selected-offer identity. The current preference version is a bound snapshot/commit guard, not authority to switch. Provider protocol is frozen for this slice and recorded as evidence; a protocol migration cannot erase daily dedupe.

The fixture provider is synchronous, deterministic and side-effect-free, so the bound check, run snapshot and previews can be committed inside the existing visitor transaction without external calls or a lease protocol. Capture actual time and independent aliases once outside retryable callbacks; derive rate identities from the stable daily intent. Transaction callback repetition may recompute pure facts but cannot repeat any external effect. Concurrent duplicate commits converge on one recorded run and its saved snapshot. Failed terminal results replay unchanged; the next daily intent can try again. A future asynchronous/live provider requires a separately approved durable claim/lease and proven idempotency/unknown-response protocol before activation.

At the transaction callback, validate consent, expected watch version/epoch, booking/preference versions, session expiry, actual baseline deadline and unresolved operation state. A stale discovered locator cannot check after revoke/re-enable. Guarded skips record their reason and publish no saving or approval-request preview. Any active unresolved switch returns `skipped` with `SWITCH_IN_PROGRESS`; no operation advance, clock mutation or new offer publication. Search must never overwrite a newer baseline, approval, operation or consent. The final run snapshot, eligible checked facts and associated notification outbox records are saved once in the same transaction. Failure leaves no false published check or orphan notification. A completed intent replays its exact saved result snapshot, including a failed result, even after later booking/consent changes; it cannot silently become a fresh search. The next calendar day is a new intent.

```js
// Safe customer projection; internal request hashes/locators omitted.
{
  runId: '<independent opaque public alias>',
  day: '2026-10-15', timeZone: 'Asia/Kuala_Lumpur',
  bookingVersion: 1, epoch: 1,
  status: 'offers-found', // no-saving | failed | skipped
  reasonCodes: [],
  checkedAt: '<actual ISO instant>', recordedAt: '<actual ISO instant>',
  clockMode: 'actual-check', providerMode: 'simulated-fixture',
  isSimulated: true, attemptCount: 1,
  searched: true, checkOffers: []
}
```

`offers-found` requires a completed validated search and at least one valid net saving at/above the bound existing minimum. `no-saving` requires a completed validated search with no eligible saving. `failed` cannot assert a completed search or an empty successful result; show failure and exact retry-safe saved result. This pure slice records one provider preparation attempt per daily intent; transaction callback retries are not customer-visible provider attempts. `skipped` means the provider was not searched, or its facts were suppressed at commit; include the actual reason such as watch stopped/version changed, session expired, baseline changed, cancellation window ended, non-refundable baseline, unknown facts or unresolved operation. Never relabel failure/skip as no saving. New rate facts cannot validate an old approval: immutable operation facts and approved fingerprints stay untouched.

The first enable action records its current calendar day's result. A terminal completed daily intent makes the next ordinary due instant the following local day boundary. A refundable promoted baseline can attempt a check under its new booking version once existing recovery is terminal, but this provider records `failed SOURCE_UNAVAILABLE` for that unsupported source. A non-refundable promoted baseline ends ordinary watch checks. All historical snapshots retain their own baseline version and clock labels.

## Notification records and previews

Create records for `offers-found`, `approval-request`, check updates, and existing manual-operation refund progress/agency attention only when subscribed at that saved stage event. First enable/re-enable also creates one prepared `check-update` with `kind:'watch-confirmed'`, independent of routine frequency: it proves activity consent/result only and truthfully says if the initial check failed or was skipped. It grants no actor permission. An approval-request preview means a saving needs deliberate review; it is never saved approval. Refund previews derive from actual persisted simulated stages: `cancellation-verified` gives pending only after cancellation proof/promotion, `refund-completed` gives completed only after saved settlement; uncertain cancellation produces agency-attention evidence and cannot produce either refund claim. Watching/checking never advances an operation to create an event. Save immutable pending/completed/agency-attention snapshots with the originating manual stage transaction, not retrospectively from whichever state exists when a preview is read.

Use stable private event identities (run + event kind, or operation + revision + event kind) for deduplication. Public notification IDs are independent random aliases. Construct fixed application text from safe money/fact fields and render as text. No recipient PII, email address, credentials, session ID, supplier token, raw source snapshot, initiating key or material/request hash appears in public previews or logs.

```js
{
  notificationId: '<independent opaque alias>',
  type: 'offers-found', // approval-request | check-update | refund-progress | agency-attention
  kind: 'offers-found', // watch-confirmed for the explicit first-action receipt
  status: 'prepared', // pending-digest | suppressed; never sent/delivered
  deliveryMode: 'preview-only', isSimulated: true,
  bookingVersion: 1,
  createdAt: '<actual ISO instant>', dueAt: null,
  frequency: 'weekly', reason: '<recorded policy reason>',
  title: '<fixed application title>', message: '<safe factual preview>'
}
```

Use existing confirmed `preferences.notificationFrequency`; opt-in does not rewrite it or infer a real-email subscription. Offers/review requests and subscribed refund progress/agency attention prepare immediately regardless of routine frequency; their recorded reason distinguishes actionable/operational evidence from periodic check updates. Daily prepares routine no-saving/failed update previews. Offers-only suppresses routine no-saving/failed updates with an explicit frequency reason while preserving the check record. Weekly saves routine check updates as `pending-digest` with a saved next weekly due instant (seven-day cadence anchored to watch opt-in); at the due worker pass, a separate prepared digest receipt may be saved once. Preserve original immutable event snapshots/status/reason; do not claim delivery. The single explicit `watch-confirmed` activity receipt is always prepared, including truthful initial failure/skipped outcome. Revoked watch consent suppresses future check alerts; already recorded previews remain historical and are never sent. No transport, recipient, SMTP/API configuration, email send button, cloud queue or external destination is introduced.

## Private storage discovery and local worker

Maintain a private watch index for newly opted-in watches; no all-visitor scan or historical backfill. Its independently random `watchId` maps internally to one visitor document. Save index membership and consent atomically; preserve a stable watch identity through stop/re-enable and verify current state when following the locator. The memory test double mirrors atomic semantics. Index entries must not grant authority or resurrect expired/deleted sessions.

Storage exposes bounded index iteration, stable private `watchId` order, limit 1–50 and an internal `after` position. Filter current eligibility after lookup rather than depending on stale indexed flags. Cap each worker pass at ten pages of at most 50 entries; retain a private resume position for periodic passes. Never expose private cursor, watch ID or visitor locator in HTTP, browser JavaScript, command output or evidence. Session deletion removes its watch locator and records; ordinary worker replays retain dedupe evidence through the existing 30-day session lifetime.

Cap unique watch command receipts, unique daily check records and unique notification event records at 256 each per visitor. Ordinary enable commands use at most 255 command slots; reserve the final slot for a stop transition. Stopping must always remain possible independently of run/notification capacity; an already-disabled no-op adds no receipt. At full command capacity, future enables reject with `409 WATCH_CAPACITY_REACHED` and the last stop still replays safely. Never evict a receipt/run/event dedupe identity while that visitor session exists. Before a new check/enable would exceed a run/event cap or lack space for its required records, reject it atomically with the same capacity code; leave consent, run, preview and index unchanged and show the explicit capacity reason. Exact existing replays still succeed at capacity.

Manual cancellation reconciliation/refund recovery must never roll back or become blocked by notification capacity. If its new preview cannot fit, complete the guarded operation normally and save only a bounded aggregate omission counter and `CAPACITY` reason; do not invent an event, claim delivery or evict a prior event identity. The counter/reason uses constant storage and contains no private IDs. The customer preview view retains only the latest 100 event aliases and GET returns at most 50 of them; older view entries may disappear, but their immutable event snapshots/dedupe records remain in the private capped ledger. Do not represent the bounded preview view as a complete audit archive. The usual 30-day, one-per-day watch fits comfortably; repeated re-enable actions cannot grow storage without bound or defeat deduplication.

The executable local daily worker requires explicit loopback Firestore emulator configuration in a `demo-` project and rejects production, Cloud Run or missing emulator configuration. Provide `--once` and optionally `--loop` with a fixed poll timer no shorter than 60 seconds using the same pure engine; a process with its timer is sufficient. This creates no operating-system cron/task, Codex automation, Cloud Scheduler resource or unrestricted HTTP scheduler endpoint. Page/attempt counts are bounded; terminate cleanly on SIGINT/SIGTERM. The worker only runs checks/records/previews. It cannot call transaction APIs, Gemini, private live booking retrieval or email.

Tests inject offers-found/no-saving/failure providers. A separate explicit local worker fixture configuration may select deterministic failures for operator verification, with strict allowlisting and no secrets. No customer UI/query/API outcome selector. Logs contain only independent run aliases, stage/result/reason and aggregate counts; no cookies, visitor IDs, keys, credential-bearing exception text or raw provider payloads. Existing protected read-only agency APIs and credential-free projections remain unchanged.

## Acceptance and evidence

- Verify opt-in/first-check atomicity, refresh and stop without changes to preferences/enrolment/standing permission; exact replay after later stop, payload mismatch, cross-visitor pending-key rejection, same-value no reset/check and non-refundable acknowledgement unchanged by watch consent; stale versions, false types/extra fields, origin/CSRF/session/default denial and cross-customer isolation.
- Prove actual-time baseline eligibility, timezone/day boundaries, expired historical quotes, new simulated identities, correct current-baseline quote/currency/fees, unknown conditions and non-refundable ending.
- Prove concurrent daily transactions, restart replay, terminal failures, exact saved-snapshot replay, same-day deduplication, next-day new intent and lost acknowledgement. Race consent/re-enable/booking/preferences/operation changes against discovered worker entries and verify guards. Version 2 provider unavailability must record failed rather than no-saving.
- Prove the engine never starts/advances switches even with legacy standing permission; in-flight cancellation/recovery suppression; manually initiated recovery/refund still works after watch stop/deadline/monitoring end.
- Verify atomic check/outbox writes and bounded private index discovery against the actual Firestore emulator; memory tests alone are insufficient. Verify no orphan run/notification/index on injected storage failures.
- Verify 256-entry capacity rejection is atomic, the reserved stop slot keeps revocation possible, known replays still succeed at capacity, manual recovery/refund continues with truthful bounded omission evidence at event capacity, the latest-100 preview view is bounded, and disappearing old preview entries do not delete their session-lifetime dedupe ledger.
- Verify weekly/daily/offers-only reasons and deduplication, read-only own-session previews, safe projection/no recipients and truthful pending/completed refund preview stages.
- Verify local worker run-once/periodic restart using one preserved process/session; production/default rejection; bounded pages and sanitized logs. No model/provider/email/cloud job is required.
- Browser-check one unobtrusive opt-in, persisted check result and collapsed safe previews at mobile/desktop, keyboard/status announcements, original three-card/non-refundable/selected-switch/agency regressions and no automatic mutation on render/reload. Name any unavailable coverage explicitly.

Verification records must distinguish source facts, simulated provider observations, actual-time check records, frozen fictional operation clock and existing cloud/historical evidence. None proves a live price, real email, deployed scheduler or production operator identity.
