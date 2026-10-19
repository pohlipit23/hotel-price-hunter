# First milestone tasks

## Curated RoomDrop judge flow and Firestore persistence - 18 October

Contract: `docs\public-demo-firestore-spec.md`. Approved judge decisions:
`docs\roomdrop-booking-setup-handoff.md`. Plan: `tasks\plan.md`.
Status: plan approved by the user on 18 October 2026, with the modification that
delivery is split into Part 1 (sample preparation and judge setup through Drop
Watch armed) and Part 2 (RoomDrop app after watch activation). No implementation
is claimed. Live capture/import, deployment and access changes keep separate
approval boundaries. These S0 and F0-F11 tasks replace the earlier unimplemented
public-intake/shared-watch schedule. All historical project tasks below remain preserved.

The original F0-F11 tasks are redistributed below without changing their
acceptance. Tasks that mixed both parts are split into `a` (Part 1) and `b`
(Part 2). All tasks remain open: the base snapshot's memory-backed catalogue,
`/watch` route and judge UI are unreviewed existing work, not proof of completion.

Seam: Part 1 ends at the atomic arm operation (valid consent + minimum saved +
armed state committed + the approved immediate captured first-check replay in the
same transaction), which returns the receipt defined in the spec section
"Delivery split, seam and ownership". Part 2 consumes that receipt and must not
change the arm transaction contract without coordinating.

Ownership: Part 1 is owned by Claude in worktree `.local\roomdrop-part1` (branch
`claude/roomdrop-part1-armed`); Part 2 by Codex in `.local\roomdrop-part2`
(branch `codex/roomdrop-part2-app`). Both branch from `roomdrop/judge-flow-base`,
a snapshot of pre-existing uncommitted shared-checkout work authored by neither.
Primary file ownership is listed in the spec. In this file each part appends or
updates only its own Part section to minimise merge conflicts.

## Part 1 - Sample preparation and judge setup through Drop Watch armed

Owner: Claude. Append Part 1 notes and evidence only within this section.

### S0: Prepare the curated sample quotations

Goal: about six curated real quotations in the unchanged air1 Altovo staging B2B
app: refundable/armable, non-refundable/cannot-start (AIRB000179), free
cancellation closing soon, and variety in city, currency or board. Plan approval
grants no new live-call allowance; each step marked LIVE needs separate explicit
user approval before it runs. Never change Altovo code/settings, call
confirm-quote, create supplier bookings or commit `.local\`.

- [x] S0.1 Inspect the two existing projections first (AIRB000179, AIRB000180
  under ignored `.local\altovo-sample\`): allowlisted keys, cancellation schedule,
  provenance and which scenario slots they fill. Record the remaining scenario
  gaps before requesting any creation or capture. Local only, no live call.
  Done 18 Oct: AIRB000180 fills refundable/armable (Drops still missing),
  AIRB000179 fills non-refundable/cannot-start; closing-soon and currency/board
  variety remain gaps. Needs for S0.2 recorded in the verification doc, Part 1 S0.1.
- [x] S0.2 Quotation creation by the owner (OWNER, LIVE staging UI): the owner
  creates the missing air1 quotations to fill the recorded gaps; quotations stay
  `status='quote'`. Record the approved air1 code list as tenant provenance.
  Done 18 Oct (user-approved): AIRB000181 to AIRB000184 created; approved code
  list AIRB000179 to AIRB000184. Verification doc, Part 1 S0.2 to S0.4.
- [x] S0.3 Sanitised projection capture (LIVE, separate approval): owner-run,
  dry-run by default, through `scripts\prepare-altovo-catalogue.mjs`; keep only
  allowlisted fields, never tokens or raw responses. Evidence stays in `.local\`.
  Done 18 Oct: projections for 181 to 184 captured in the owner's browser with
  in-page allowlisting; no token or raw body left the page. Hashes recorded.
- [x] S0.4 Matching per-quotation Gateway Drop capture (LIVE, separate approval):
  one bounded Gateway search per refundable quotation with a baseline built from
  its projection and `my`/`my` adults-only agency defaults recorded as such.
  Distinguish a valid zero-result capture from a missing/failed one.
  Done 18 Oct: one run, 5 calls (login + 4 searches, all 200, no retries);
  180 to 183 observed with 3 Drops each; 179 and 184 not-searched
  (NON_REFUNDABLE). Still missing: closing soon within days, a non-MYR currency,
  more than one night, more than one adult. 181's best Drops are room only
  against a breakfast baseline.
- [x] S0.5 Photo/scenario metadata: reviewed local photo assets, card ordering,
  city and scenario labels supplied as curated facts, not invented metadata.
  Done 18 Oct: labels, city names and order owner-approved (`.local\cards-draft.json`).
  Eight owner-approved photos committed (f386e57; six hotel, booked room for 181
  and 182; 184 room rejected), from the air1 share-link JSON because Gateway
  search-by-id had no image fields. Exact asset routes (633faac), `card.roomPhoto`
  (add2bd1), rendering with hotel and room labels (dacf89a). Each Drop reuses its
  hotel photo, alt suffixed " - hotel photo"; Part 2 still has to render it.
  Verification doc, Part 1 "S0.5 photos".
- [x] S0.6 Guarded Firestore import: emulator import through the F2 importer
  (local, test-owned data); a production Firestore import is a separate LIVE step
  requiring explicit approval and is not part of Part 1 acceptance.
  Done 18 Oct: all six real captures, with the provisional cards, imported into
  the Part 1 emulator (dry run, then execute, then an identical retry that
  returned `unchanged`). Read back with `loadHostedCatalogue` and `getDrops`.
  The import must be redone if the S0.5 review changes a card.
  Redone 18 Oct with the reviewed image manifest: the photo cards gave
  `BOOKING_CHANGED` over the old records, so the six bookings were cleared from
  the Part 1 emulator only, then imported (`created` x6, retry `unchanged` x6)
  and read back with photos and no remote URL.
- Verify: per-code bundle validation via F1/F2, coverage matrix of scenario slots
  versus captured evidence, `.local\` ignore checks. Two samples prove mechanics
  only; the six-entry matrix stays open until supplied and captured.
- Depends on: F0 for S0.1; F1 before S0.3/S0.4 execution; F2 for S0.6.

### F0: Audit available captures and existing scaffolding

- [x] Acceptance: inventory the two ignored air1 projections, any captured Gateway
  results, concurrent catalogue/runtime/UI changes and their ownership, and the remaining
  six-card scenario needs. Record source/tenant provenance and missing evidence
  without printing private payloads or changing current application behavior.
- Verify: local schema/key/provenance inspection, `.local\` ignore checks and
  capture integrity hashes. No live call or Firestore write.
- Evidence: verification doc, Part 1 F0 (18 Oct): key/provenance inventory,
  SHA-256 of both projections and the unrelated 16 Oct Gateway files, ignore
  checks, scaffolding gaps; no Gateway capture exists for either curated code.
- Depends on: plan approval (given 18 October 2026). Small, two documentation files:
  `docs\public-demo-firestore-verification.md`, `tasks\todo.md`.

### F1: Validate the Altovo catalogue adapter and capture preparation

- [x] Acceptance: review/extend existing scaffolding for the actual projection
  shape, UTC cancellation schedules and explicit agency search defaults. Prepare
  display-safe per-code bundles/card metadata; private supplier/raw fields remain
  private. Dry-run performs no upstream calls; live capture remains separately gated.
- Verify: `node --test .\tests\altovo-catalogue.test.mjs` with sanitised fixtures
  and injected Gateway responses, covering sentinel/naive/conflicting deadlines,
  missing facts, money/currency bindings, cannot-start and valid-empty captures.
- Evidence: commit 4393134; 15 tests in the new file pass (28 with the adapter
  and catalogue suites). Preparation now needs `--approved-codes`, dry-runs by
  default with no upstream call or write, and records per-code capture status.
- Depends on: F0. Medium, three files: `app\domain\altovo-quotation.mjs`,
  `scripts\prepare-altovo-catalogue.mjs`, `tests\altovo-catalogue.test.mjs`.

### F2: Import and read immutable catalogue bookings and Drops

Shared storage foundation: Part 2 reads Drops through this module and does not
write shared booking/Drop records.

- [x] Acceptance: default-dry-run importer creates reviewed air1 booking records
  and captured Drops, with explicit manifest/card metadata. Identical concurrent
  import replays safely; changed facts return `BOOKING_CHANGED`. Publish no partial
  bundle, duplicate Drop or missing-capture-as-empty result. No visitor choices
  appear on shared records; no other data is changed.
- Evidence: commit a9f42d9; verification doc, Part 1 F2. 11 tests in the new file
  pass against the emulator with two clients. The read API is documented in the
  spec seam section. Only the synthetic fixture has been imported so far; real
  reviewed captures stay with S0.3 to S0.6.
- Verify: `node --test .\tests\booking-storage.test.mjs` against two emulator
  clients; include private-field rejection, interrupted import, conflict, content
  versions and code/capture mismatch. Confirm only test-owned documents change.
- Depends on: F1 and a valid captured bundle (injected for automated tests).
  Medium, four files: `app\booking-storage.mjs`,
  `scripts\import-altovo-catalogue.mjs`, `tests\booking-storage.test.mjs`,
  `tests\fixtures\curated-bookings.json` (synthetic and sanitised only).

### Checkpoint F0-F2: Validated catalogue storage

- [x] Adapter/import tests pass with the emulator. Raw responses, source tokens,
  supplier references and `.local\` captures are absent from tracked fixtures.
  (18 Oct: 41/41 pass against the emulator; the fixtures hold only synthetic
  placeholder references.)
- [x] Coverage reports distinguish two source projections, actual captured Drops
  and remaining owner-created catalogue entries. No additional live calls implied.
  (18 Oct: verification doc, Part 1 S0.2 to S0.4 coverage table: six projections,
  Drops captured for 180 to 183, and the scenario slots still missing.)

### F3a: Persist isolated sessions and the per-code watch entry (Part 1 of F3)

- [x] Acceptance: hashed cookie-keyed sessions retain one-hour expiry, CSRF and
  `byCode[code].watch` (setup and replay receipt). Two judges sharing a code and
  one judge visiting two codes remain isolated. Maintain the transactional
  64-session cap; no code outside the bounded catalogue may allocate state.
  Shared storage foundation for Part 2: the module exposes a transaction helper
  that F3b extends with confirmation/context fields.
- Evidence: commit 5535935; verification doc, Part 1 F3a. 15 tests pass against
  the emulator. `transact` and `codeScope` are documented in the spec seam
  section. The HTTP server still uses its in-process Map until F4a and F5a.
- Verify: `node --test .\tests\quotation-session-storage.test.mjs` using separate
  emulator clients; cover restart, expiry, capacity contention, per-code version
  invalidation of the watch entry, failed writes and no production memory fallback.
- Depends on: F2. Small, two files: `app\quotation-session-storage.mjs`,
  `tests\quotation-session-storage.test.mjs`.

### F4a: Serve catalogue and per-code bootstrap APIs (Part 1 of F4)

- [x] Acceptance: expose bounded path-based catalogue/per-code reads backed by
  Firestore and the reviewed manifest, returning shared facts plus only this
  session's `byCode[code].watch`. Create/restore private sessions; preserve
  canonical Host/Origin/CSRF and query rejection. No public import/share-link input,
  arbitrary-code lookup, capture-file access or Altovo/Gateway call exists.
- Evidence: commit 70f9547; verification doc, Part 1 F4a and F5a. Injected
  `bookingStorage`/`sessionStorage`; codes outside the manifest never reach
  storage. Bootstrap adds `dropSetVersion` and `capture`, catalogue entries add
  `card` (additive). The emulator suites pass 74/74.
- Verify: `node --test .\tests\booking-catalogue.test.mjs` (existing base-snapshot
  test, or the proposed `booking-catalogue-server.test.mjs`) and
  `.\tests\quotation-demo-server.test.mjs`; test unknown/encoded/malformed codes,
  projection guards, cross-session isolation, stale Drop versions and database
  unavailability using actual emulator storage.
- Depends on: F3a. Medium, four files: `app\booking-demo-server.mjs`,
  `app\quotation-demo-server.mjs` (catalogue `GET` branches only),
  `tests\booking-catalogue.test.mjs`, `tests\quotation-demo-server.test.mjs`.

### F5a: Arm and replay the first check atomically per session/code (Part 1 of F5)

This is the Part 1/Part 2 seam.

- [x] Acceptance: validate actual-time cancellation eligibility, explicit consent
  and a minimum of 10.00 in the booking currency. Commit one armed setup/replay
  filtered by `isDisplayedDrop` and the threshold in one transaction, and return
  the spec's receipt only after commit. Identical retries preserve the receipt;
  a stale arm request cannot replace a newer revision; a deliberate new minimum
  creates a new revision for that session/code only. Missing or malformed captures
  fail without commit; a valid empty replay commits honestly.
- Evidence: commits 9f57104 and 7e9373c; verification doc, Part 1 F4a and F5a.
  The receipt is the spec shape plus `firstCheck.captureStatus`. Commit 5a85d4a
  makes `expectedRevision` optional as in contract v3: absent skips the stale
  check; present and not current is `409 WATCH_REVISION_STALE`. The browser
  re-arm step passes again.
- Verify: `node --test .\tests\booking-drop-watch.test.mjs` with emulator races,
  lost acknowledgements, raised minima, mixed currency, changing cancellation
  windows, missing versus empty captures and changed Drop sets; zero upstream calls.
- Depends on: F4a. Medium, four files: `app\domain\booking-drop-watch.mjs`,
  `app\quotation-session-storage.mjs`, `app\quotation-demo-server.mjs` (`/watch`
  branch only), `tests\booking-drop-watch.test.mjs`.

### F6: Build the start grid and Original Booking confirmation page

- [x] Acceptance: use the Ticket and Stamp design for curated photo/city/dates/
  price/scenario cards, then "Your agency booked this" and one "Set up a drop"
  action. Show staging quotation/capture-date note, cannot-start reason and honest
  image fallbacks. No Altovo/AirBorneo logo, arbitrary code or share-link input (Altovo\n  may be named as the staging booking engine, owner decision 18 Oct 2026).
- Evidence: commits 8390e8e and 0694b94; verification doc, Part 1 F6 and F7a.
  Every real card has `photo: null` until S0.5, so judges see the drawn fallback.
  A reviewed photo also needs its exact `/assets/...` route in
  `app\booking-demo-server.mjs` when S0.5 supplies it. Done 18 Oct (S0.5): all
  six real cards now show reviewed hotel photos; the fallback remains for none.
- Verify: `node --test .\tests\booking-setup-ui.test.mjs` and
  `node .\tests\booking-judge.browser.mjs` (existing base-snapshot harness; the
  proposed `booking-firestore.browser.mjs` is Part 2's integrated harness); inspect
  mobile/desktop and keyboard screenshots, dynamic scenario status and direct
  navigation/refresh.
- Depends on: F4a, F5a. Medium, five files: `app\public\booking.html`,
  `app\public\booking.css` (catalogue/booked sections), `app\public\booking-judge.js`,
  `tests\booking-setup-ui.test.mjs`, `tests\booking-judge.browser.mjs`.

### F7a: Consent, minimum saving, cannot-start and armed state (Part 1 of F7)

- [x] Acceptance: explicit consent/minimum setup screens with the 10.00 floor,
  cannot-start states from actual-time eligibility, and a visible committed armed
  state driven only by the arm receipt. No extra customer step or delay; a failed
  arm shows a retryable error and never a fake armed state.
- Evidence: commits 8390e8e and 0694b94; verification doc, Part 1 F6 and F7a.
  Open for Part 2: the arm `fetch` lives in `app\public\booking-live.js`, which
  still sends no `expectedRevision`. It should send `judge.armRequestBody(data,
  minimum)`, a one-line change, so a stale tab gets 409 instead of overwriting.
- Verify: `node .\tests\booking-judge.browser.mjs` reaching armed on mobile and
  desktop with keyboard; reload after arming shows the same committed receipt.
- Depends on: F6. Small, three files: `app\public\booking-judge.js`,
  `app\public\booking.html` (setup/checking sections), `tests\booking-judge.browser.mjs`.

### F7c: Journey strip, hand-off and delivery email (owner decisions, 18 Oct 2026)

- [x] Acceptance: a 3-step strip (Pick a booking on Altovo's engine / Set up a drop,
  RoomDrop / Get your drop, RoomDrop app) follows the visible screen; after the
  committed receipt a stamp-style hand-off opens the Drops view (the owner explicitly
  approved this extra step, superseding "no extra customer step or delay" for the
  step 2 to 3 transition only; the arm transaction is unchanged); an optional delivery
  email commits in the arm transaction and every response shows it masked (seam v7).
- Evidence: commits 1f82761 and a32e350. Emulator suites 97/97; `npm test` 411 tests,
  379 pass, 0 fail, 32 skipped; `tests\booking-judge.browser.mjs` and
  `tests\booking-emulator.browser.mjs` passed (320, 768, 1440).
- Open for Part 2: `booking-live.js` on this branch still builds the arm body inline,
  so the email is sent only once Part 2's `judge.armRequestBody(data, minimum)` call
  is merged. Part 2 must bind and confirm on `publicWatch(scope.watch)`.

### F9a: Minimum hosted Firestore wiring for setup (Part 1 of F9)

Reassigned to Codex by the user on 18 October 2026 (with F10a); not done in the
Part 1 worktree.

- [x] Acceptance: inject real Firestore booking/session storage at hosted startup
  for catalogue, bootstrap and arm, keeping production emulator/credential/origin
  guards intact. Startup never seeds or imports data. No memory/file fallback for
  these routes in hosted mode.
- Evidence (19 Oct): done by Codex in merge b1eda30 ("Transferred F9a" in the d14f70f
  integration record below). `app\booking-cloud.mjs:24-31` builds `createBookingStorage`
  and `createFirestoreSessionStorage` from `createRoomdropFirestore` with no fallback;
  `:65` throws `DURABLE_STORAGE_REQUIRED`. Serving in the v6d image (revision
  hotel-price-hunter-00024-twg).
- Verify: `node --test .\tests\quotation-cloud.test.mjs` cases for catalogue and
  arm with injected test dependencies and bounded missing-storage failure.
- Depends on: F7a. Small, two files: `app\booking-cloud.mjs`,
  `tests\quotation-cloud.test.mjs` (coordinate with F9b).

### F10a: Minimum packaging closure for setup (Part 1 of F10)

Reassigned to Codex by the user on 18 October 2026 (with F9a); not done in the
Part 1 worktree.

- [x] Acceptance: release preparation and `Dockerfile.booking` include the new
  Part 1 modules (adapter, booking/session storage, arm domain) and their
  dependency closure, excluding credentials and private captures.
- Evidence (19 Oct): done by Codex in merge b1eda30 ("Transferred F10a" below);
  `scripts\prepare-booking-release.mjs` freezes the manifest-only exact-source
  context that `Dockerfile.booking` copies. Packaged images v6/v6c/v6d passed the
  emulator smoke and network-disabled guards before release.
- Verify: `node --test .\tests\public-demo-release.test.mjs` cases for the new
  files; exact-context build of the packaged entrypoint against the emulator.
- Depends on: F9a. Small, two files: `scripts\prepare-booking-release.mjs`,
  `Dockerfile.booking` (coordinate with F10b).

### F11a: Part 1 acceptance evidence (Part 1 of F11)

- [x] Acceptance: an emulator-only launcher seeds only explicit reviewed test
  captures via the guarded importer. Browser evidence shows start grid ->
  Original Booking -> setup -> committed armed state; setup survives an app
  restart against the same emulator; two judges on one code and one judge across
  two codes do not overwrite one another. Record Part 1 evidence in its own
  section of the verification report, local versus live proof separately.
- Evidence: commits d3db493 and 6808e32; verification doc, Part 1 F11a. Local
  emulator proof only (the F10a dependency moved to Codex; no packaged image is
  claimed). `tests\booking-emulator.browser.mjs` passed: seeded launch, six photo
  cards, Original Booking with hotel/room photos, two judges and two codes kept
  apart, restart without seed keeps every setup. Emulator suites 99/99,
  `npm test` 393 tests, 362 pass, 0 fail, 31 skipped; `git diff --check` clean.
  Live calls made today by the owner are listed separately there.
- Verify: `node .\tests\booking-judge.browser.mjs`, the Part 1 emulator tests,
  `npm test` with pass/fail/skip counts, and `git diff --check`.
- Depends on: F10a. Small, three files: `scripts\serve-booking-demo.mjs`,
  `docs\public-demo-firestore-verification.md` (Part 1 section), `tasks\todo.md`.

### Checkpoint Part 1: Drop Watch armed

- [x] Emulator/API evidence proves isolation, one committed arm with its first
  replay receipt and restart recovery across independent app/storage instances.
  (F4a/F5a emulator tests with two clients; F11a launcher restart test and
  browser walk.)
- [x] The replay is labelled as captured data, never a fresh rate search; expired
  sessions and non-armable bookings cannot arm. Relevant tests run.
  (`firstCheck.mode: 'captured-replay'`, "Replayed check · captured ... · not
  live"; expired session 403 `DEMO_SESSION_REQUIRED`, non-refundable and ended
  windows 409 `WATCH_CANNOT_START`; emulator suites 99/99.)
- [x] Arm receipt shape matches the spec seam; Part 2 has been told of any change.
  (Receipt unchanged since contract v3. The S0.5 storage additions, Drop `photo`
  and optional `card.roomPhoto`, are read-side only and reported for Part 2.)

## Part 2 - RoomDrop app after watch activation

Owner: Codex. Append Part 2 notes and evidence only within this section. Part 2
consumes the Part 1 arm receipt and must not change the arm transaction contract
without coordinating.

Ownership update authorised by the user on 18 October: Codex now also owns F9a
(hosted Firestore wiring) and F10a (packaging), alongside F9b/F10b. The Part 1
sections above remain historical task records. Claude retains F6/F7a (setup UI,
`booking-judge.js`, `drop-watch.js`, catalogue/booked/setup HTML/CSS) and F11a
evidence. The initial merge authorised pinned `d14f70f`; a subsequent user go-ahead
also authorised `8423825`. No later commit or photo work is included. No push,
deploy, production import or live upstream call.

### F3b: Session confirmation and context fields (Part 2 of F3)

- [x] Acceptance: extend the F3a session store with `byCode[code]` confirmation
  and bounded conversation context and the session-wide advice counters, in the
  same transactional, hashed, one-hour, 64-session model. Invalidate a
  confirmation or context that no longer belongs to the current watch revision.
- Verify: `node --test .\tests\quotation-session-storage.test.mjs` Part 2 cases:
  restart, isolation and per-code invalidation of confirmation/context.
- Depends on: F3a. Small, two files: `app\quotation-session-storage.mjs`
  (additions only), `tests\quotation-session-storage.test.mjs` (Part 2 cases).

### F4b: Confirm, advice and chat routes on durable sessions (Part 2 of F4)

- [x] Acceptance: confirm/advice/chat per-code routes read durable sessions and
  the committed watch receipt; preserve Host/Origin/CSRF, query rejection,
  bounds and no upstream call except the guarded model call outside transactions.
- Verify: `node --test .\tests\quotation-demo-server.test.mjs` Part 2 cases with
  actual emulator storage, cross-session isolation and database unavailability.
- Depends on: F3b, F5a. Small, two files: `app\quotation-demo-server.mjs`
  (confirm/advice/chat branches only), `tests\quotation-demo-server.test.mjs`.

### F5b: Membership, safe rearming and idempotent selection receipts (Part 2 of F5)

- [x] Acceptance: confirm only a current qualifying Drop for an armed watch,
  retaining acknowledgements and `reservationCreated:false`, `quoteModified:false`,
  `customerRefund:null`. Same-Drop retries return one selection receipt; a rearm
  invalidates a confirmation outside the new set; stale versions return
  `DROPS_CHANGED`. Rearming uses the Part 1 arm operation unchanged.
- Verify: `node --test .\tests\booking-drop-watch.test.mjs` Part 2 cases:
  concurrent confirms, lost responses, rearm races and changed Drop sets.
- Depends on: F4b. Medium, three files: `app\domain\booking-drop-watch.mjs`
  (selection functions only), `app\quotation-demo-server.mjs`,
  `tests\booking-drop-watch.test.mjs`.

### Checkpoint F3-F5 (Part 2): Durable judge actions after arming

- [x] Emulator/API evidence proves guarded confirmation and restart recovery of
  confirmation/context across independent app/storage instances.
- [x] Expired sessions and stale bindings cannot confirm. Relevant tests run.

### F7b: Connect the replay result to Deals, Review and Confirmed (Part 2 of F7)

- [x] Acceptance: show armed/replayed results with capture and replay times from
  the receipt. Feed only the session's qualifying captured Drops to existing
  screens, ranking and labels; preserve reduced-flexibility consent,
  empty/unavailable states, navigation, refresh and idempotent confirmation.
- Verify: `node --test .\tests\booking-live.test.mjs` plus the browser harness;
  prove two judges on one quotation and one judge across two quotations cannot
  leak or overwrite choices. A changed minimum cannot confirm an excluded Drop.
- Depends on: F7a, F5b. Medium, five files: `app\public\booking-live.js`,
  `app\public\booking-live-data.js`, `app\public\booking.html` (options/review/
  confirmed sections), `tests\booking-live.test.mjs`,
  `tests\booking-firestore.browser.mjs`.

### F8: Preserve grounded Gemini context per judge and code

- [x] Acceptance: use the authorised code's current replayed facts and bounded
  context. Atomically reserve session allowance before external inference; late
  replies cannot overwrite another code, a changed watch or newer confirmation.
  Keep existing per-instance throttles and current unavailable behavior.
- Verify: `node --test .\tests\quotation-advice-server.test.mjs .\tests\booking-advice.test.mjs`;
  injected-provider counters prove transaction retries cause no extra inference,
  and cross-code navigation/concurrent writes remain safe. No real model calls.
- Depends on: F7b. Medium, five files: `app\quotation-demo-server.mjs`,
  `app\quotation-session-storage.mjs`, `app\public\stay-advice.js`,
  `tests\quotation-advice-server.test.mjs`, `tests\booking-advice.test.mjs`.

### Checkpoint F6-F8 (Part 2): Complete local judge journey

- [x] Start grid, Original Booking confirmation, cannot-start, consent/minimum,
  armed/replayed check, Deals, Review and Confirmed pass mobile/desktop inspection.
- [x] Catalogue facts and replay labels stay honest; two-session/multi-code
  isolation, keyboard navigation and model-unavailable paths have raw evidence.
- Evidence (19 Oct, local only): merges f47960e and 5eaf0ae plus db270ce; real-capture,
  judge, v3 and Firestore browser gates at 320/390/768/1024/1440 px, two judges/two
  codes, stale tab, dialog/keyboard checks (see the 8423825 and 33bb55f records below
  and `.local\roomdrop-part2-status.md`). Live production equivalent is the cloud
  acceptance item further down.

### F9b: Complete the hosted Firestore entrypoints (Part 2 of F9)

- [x] Acceptance: load the bounded reviewed catalogue manifest without a
  single-booking file fallback for every route. Remove the mandatory snapshot
  copy, close storage cleanly and keep production emulator/credential/origin
  guards intact. Startup never seeds or imports data.
- Verify: `node --test .\tests\quotation-cloud.test.mjs`; exercise the exact
  entrypoints with injected test dependencies and bounded missing-storage failure.
- Depends on: F8, F9a. Medium, four files: `app\booking-cloud.mjs`,
  `app\quotation-cloud.mjs`, `Dockerfile.booking`, `tests\quotation-cloud.test.mjs`.

### F10b: Export and verify the frozen curated runtime (Part 2 of F10)

- [x] Acceptance: release preparation includes the full dependency closure and
  reviewed code/version catalogue manifest, excluding credentials and private
  captures. Keep the exact-commit source/context lineage and static allowlists.
- Verify: `node --test .\tests\public-demo-release.test.mjs`; exact-context
  Docker build, packaged emulator/test-harness success and bounded failure smoke.
  Public browsing, arming and confirming make zero Altovo/Gateway requests.
- Depends on: F9b, F10a. Small, two files: `scripts\prepare-booking-release.mjs`,
  `tests\public-demo-release.test.mjs`.

### F11b: Record final acceptance and prepare the release bundle (Part 2 of F11)

- [x] Local acceptance: record full regression/browser/restart coverage and remaining
  content gaps, with exact build/start/import/rollback commands. Prepare session
  TTL and preservation checks for later release review.
- Verify: `node .\tests\booking-firestore.browser.mjs`, `npm test`, packaged smoke
  and `git diff --check`. Run the existing booking browser regression where its
  historical single-snapshot contract still applies; label its evidence separately.
- Depends on: F10b, F11a. Medium, four files:
  `docs\public-demo-firestore-verification.md` (Part 2 section),
  `docs\public-demo-firestore-release.md`, `tasks\todo.md`,
  `tests\booking-firestore.browser.mjs`.

### Checkpoint F9-F11 (Part 2): Ready for a separate release decision

Historical pre-integration component record (18 October, contract v1):

- [x] F3b/F5b component slice: `quotation-session-actions.mjs` adds transactional
  selection/context/allowance operations without writing `watch`. Tests include
  commit failure, expiry, CSRF, revisions, concurrent idempotent receipts,
  shared allowance and independent-client restart recovery on the 8281 emulator.
- [x] F4b component slice: `quotation-post-watch.mjs` and
  `quotation-durable-actions.test.mjs` verify injected contract-v1 HTTP guards,
  immutable source reads, inference outside transactions and late-response rejection.
- [x] F7b local slice: receipt-only membership, capture/replay times, empty versus
  unavailable, Review/Confirmed refresh, rearm and two-judge/two-code isolation.
  `booking-after-watch.browser.mjs` passes 320/768/1024/1440 px. This proof uses
  the base memory-backed arm and does not complete integrated persistence.
- [x] F8/F9b contract slice: bounded bootstrap projection and UI restoration,
  durable action wiring and Firestore-only startup/shutdown tested with injected
  storage factories. No real model call. Part 1 GET must include
  `publicPostWatchState({ scope, bundle })` for conversation restoration.
- [x] F10b preparation slice: manifest-only export, recursive dependency closure,
  exact source hashes and explicitly marked test-source bundles. An incomplete
  commit cannot silently package missing Part 1 dependencies.
- [x] F3b-F11b integrated acceptance: bring in Part 1 only after the user's
  integration go-ahead, reconcile factory wiring, include the bootstrap projection,
  and run `booking-firestore.browser.mjs` against the actual modules. Its current
  result is `PART1_DEPENDENCIES_UNAVAILABLE`, not a pass.
  Done 18 Oct: authorised merge b1eda30; `booking-firestore.browser.mjs` passes
  against the actual modules (see "Authorised d14f70f integration" below).
- [x] F10b/F11b release candidate: freeze the combined exact commit with actual
  reviewed code/version pins, build and smoke that image against the emulator,
  then refresh cloud preservation/import/TTL/rollback evidence for approval.
  Test-source images and the earlier memory image are not release candidates.
  Done 19 Oct: frozen v6d source 6969c09 (app code baf62af), image
  `sha256:9333e743...`, v6c manifest pins, emulator smoke passed; owner-run
  `.local\deploy-roomdrop-v6d.ps1` refreshed preservation/import/rollback and
  serves hotel-price-hunter-00024-twg at 100%. TTL enabled 19 Oct (see below); the
  same image now serves as restart probe revision 00025-5bg.

Those component proofs alone did not close acceptance. The authorised merge record below supersedes their integration blockers.
Evidence and commands: `docs\public-demo-firestore-verification.md` (Part 2) and
`docs\public-demo-firestore-release.md`.

Contract v2 follow-up (Part 2 only):

- [x] Map `getDrops` booking-unavailable to 404; keep invalid session/storage
  diagnostics bounded and verify no confirmation is committed on refusal.
- [x] Delegate hosted client creation to `createRoomdropFirestore`; pass the
  reviewed `catalogueCodes` to the session factory.
- [x] `part1-session-v2.test.mjs` reads pinned Part 1 source through `git show`
  and verifies actual memory/Firestore compatibility, catalogue rejection,
  unchanged guards/watch, receipt/context persistence and the `ttlAt` Timestamp.
  No Part 1 source is copied or edited and no branch is merged/rebased.
- [x] Whole-journey acceptance and combined release remain open. Claude reports
  AIRB000179-184 captured (180-183 armable with three Drops each, 179/184
  non-refundable); Part 2 has not inspected or imported those real captures.
  Re-scoped 19 Oct: the combined release is done (v6d live, see the F10b/F11b
  item above) and the real captures are imported (v6/v6c, AIRB000185 replaced 184).
  Only live whole-journey acceptance remains, tracked by the cloud acceptance item below.
  Done 19 Oct: live acceptance passed (see the cloud acceptance item below).

Contract v3 follow-up (Part 2 only):

- [x] Send `expectedRevision: data.watch?.revision ?? 0` in the arm body; a
  stale or unavailable response does not replace the committed receipt.
- [x] Validate `firstCheck.captureStatus` and bootstrap capture/Drop-set metadata;
  preserve legacy receipt support and honest empty/unavailable states.
- [x] Pass `bookingStorage` as the sole factory source; retain loaded version
  bindings separately as `reviewedCatalogue`. Recognise the new bounded 503 codes.
- [x] `booking-v3.browser.mjs` passes at 320/768/1024/1440 px against an injected
  v3 arm endpoint. The memory-receipt browser harness explicitly strips the new
  request field for the untouched legacy base server and proves no revision logic.
- [x] Full integrated proof remains blocked by the no-merge/no-rebase boundary.
  Also relay the source-inspected omitted-revision mismatch at `d14f70f` to Claude;
  the updated client always includes the field and is unaffected by that fallback.
  Superseded 18 Oct: the user authorised merges b1eda30, f47960e and 5eaf0ae, which
  include the owner-authored optional revision fix (8423825).

- [ ] Plan approval (given 18 October 2026) precedes coding; local checks and raw
  acceptance evidence are complete. The full catalogue content matrix (S0) remains
  unchecked until supplied and captured; storage mechanics alone do not complete it.
  Note 19 Oct: production holds the six-booking v6c catalogue (179 cannot-start,
  180-183 and 185 watchable). The S0.4 gaps (closing soon, non-MYR, multi-night,
  multi-adult) are still uncovered unless the user waives them.
- [x] Present exact production import, image/configuration, session TTL and rollback
  commands for approval. Preserve existing visitor/agency/watch data and private
  access boundaries; never commit `.local\` or merge the research branches.
  Re-scoped 19 Oct: import, image/configuration and rollback were approved and run by
  the owner (`.local\deploy-roomdrop-v6.ps1`, `-v6c.ps1`, `-v6d.ps1`; receipts
  `.local\deploy-preflight\production-import*.json`; rollback target 00023-vf2).
  Only session TTL remains: `gcloud firestore fields ttls list` is still empty; propose
  TTL on `roomdropPublicSessionsV1.ttlAt` in (default) for separate approval.
  Done 19 Oct: the user approved it; `gcloud firestore fields ttls update ttlAt
  --collection-group=roomdropPublicSessionsV1 --enable-ttl` ran and `ttls list`
  shows `roomdropPublicSessionsV1.ttlAt` state ACTIVE.
- [x] After separately approved execution, verify public curated reads, replay
  labels, live eligibility, restart persistence and two-judge isolation, with
  before/after private-service checks. Liveness alone cannot close acceptance.
  Partial 19 Oct: the v6d SMOKE stage on 00024-twg passed health, catalogue (six
  entries, 179 blocked), six fresh per-code reads, eight photo hashes and before/after
  agency/database/TTL/scheduler/jobs/IAM preservation. Still open: browser replay
  labels, arm/confirm, restart persistence and two-judge isolation on the live service.
  Done 19 Oct: `tests\live-acceptance.mjs` passed on 00024-twg: replay labels at 390 px
  (no page errors or external requests), arm and confirm on AIRB000180 (no reservation
  or quote change), two-judge isolation (180/181, separate cookies and CSRF tokens) and
  same-cookie persistence (session stored under sha256(cookie) with `ttlAt`). With user
  approval, restart probe revision hotel-price-hunter-00025-5bg (env RESTART_PROBE only,
  same image) took 100% traffic and `--after-restart` passed (AIRB000180 watch revision 1).
  00025-5bg now serves; rollback targets are 00024-twg and 00023-vf2. Evidence:
  `.local\live-acceptance`.

### Authorised d14f70f integration - current local acceptance

- [x] Merge pinned `d14f70f` as `b1eda30`; protected storage, arm and setup modules
  match the parent exactly. No later Part 1 work is merged.
- [x] Transferred F9a: both hosted entrypoints now use the curated customer facade,
  durable catalogue sessions and the bootstrap confirmation/conversation projection.
  Production emulator/origin/credential guards remain intact.
- [x] Transferred F10a: actual storage/arm dependency closure is frozen in the
  exact-source manifest-only context and the local image passes an emulator smoke.
- [x] Reviewed real catalogue imported into 8281 / demo-roomdrop-part2 only: six
  codes, twelve captured Drops, with non-refundable 179/184 refusing arm.
- [x] Real-capture browser gate passes at 320/768/1024/1440 px, actual UTC, including
  two judges writing isolated watches, two codes, confirmation/context restart,
  high-minimum empty replay and unchanged shared facts.
- [x] Full Node run: 399 tests, 370 passed, 0 failed, 29 skipped. Targeted core
  emulator run: 48 passed, 0 failed, 0 skipped. The hardcoded 8181 importer test
  was excluded; the reviewed real importer ran against 8281 instead.
- [x] F11b final handoff/release acceptance awaits Claude's F6/F7a and F11a. The
  current image is an integration candidate. Later merges, any live capture/model
  call, production import, push, deployment or access change need their authority.
  Superseded: F6/F7a/F11a integrated (f47960e, 5eaf0ae, db270ce); later releases
  v6/v6c/v6d shipped with owner approval.

Current evidence and exact pins are in the Part 2 integration section of
`docs/public-demo-firestore-verification.md` and the release document.

### Authorised 8423825 setup merge - current verification

- [x] Merge pinned `8423825` as `f47960e`, including the owner-authored optional
  revision fix and F6/F7a setup screens. Protected source matches the parent.
- [x] The arm fetch now sends `judge.armRequestBody(data, minimum)`. An actual
  same-session two-tab browser test rejects the stale tab without changing the
  newer receipt, at all four viewport widths.
- [x] Gemini launches from the Drops/Review headings in document flow. Geometry
  checks and screenshots at 320/768/1024/1440 px verify that it does not cover
  card prices or consent/actions. Dialog, history, keyboard and refresh checks pass.
- [x] Full Node: 408 tests, 379 passed, 0 failed, 29 skipped. Core emulator: 50
  passed, 0 failed, 0 skipped. Updated judge, v3, real-capture and historical
  single-snapshot browser regressions pass. Two judge-browser assertions were
  aligned with existing Part 2 failure copy and replay/capture timestamp detail.
- [x] Refreshed exact-source image and both hosted entrypoints pass the emulator
  smoke and network-disabled production-emulator guard; source `f47960e`.
- [x] Photo capture remains in progress with Claude, and final F11a/F11b release
  handoff remains open. No further merge, push, deploy, production import or live
  call is included in this approval.
  Done: eight reviewed photos (f386e57, rendered in c7de6a4) are packaged and their
  hashes match on the live service (v6d SMOKE); release handoff superseded as above.

### Authorised 33bb55f / contract v5 merge - current local acceptance

- [x] Merge pinned 33bb55f as 5eaf0ae; Part 1 storage, session, arm, helper and
  setup HTML are preserved. F9a/F10a remain Codex-owned; F6/F7a/F11a are integrated.
- [x] Source c7de6a4 uses reviewed local Drop photos with Hotel photo labels in
  cards/Review/Confirmed; absent/failed images show an honest fallback. All eight
  approved JPEGs are packaged and hash-checked through the served image.
- [x] Hash-only and history routing use the URL's code and reload saved state;
  real 182 -> 181 navigation and a hash change during arm pass. The arm request
  continues to delegate to judge.armRequestBody(data, minimum).
- [x] Browser geometry and screenshots pass 320/390/768/1024/1440 px. Gemini is
  in heading flow, clear of Drop text and review consent/actions.
- [x] Full Node: 419 tests, 388 pass, zero fail, 31 skips. Targeted actual emulator:
  53/53. Real-capture, setup, arm-contract and historical booking browsers pass.
- [x] F11b local acceptance/bundle: frozen source c7de6a4, both hosted entrypoints,
  real emulator restart/isolation and network-disabled CLI guards pass. Evidence
  and exact image/pins are in the current Part 2 verification and release docs.
- [x] Later release decision: forthcoming engine recapture/new Drop-set pins,
  current cloud preservation/configuration, production importer support, TTL and
  rollback review. No push, deploy, production import or live call ran.
  Decided 19 Oct: engine recapture cut by the user; new Gateway Drop-set pins shipped
  as v6/v6c (5a23d40, f86e6cd); guarded production importer a3e02e7; preservation
  and rollback reviewed in each owner-run release script. TTL alone carries over to
  the open session TTL item above.

## Hackathon AI restoration, 17 October

- [x] Revisit the agreed plan and restore its Gemini preference/comparison role to the current quotation flow.
- [x] Implement a server-side Vertex AI adviser with grounded output, per-room conversation context and request guards.
- [x] Add selected-room questions with loading, unavailable, failure and stale-navigation handling.
- [x] Verify privacy, financial boundaries, unchanged selection authority, responsive UI and production SDK startup without generation.
- [x] Pass newly authorised live Gemini 3.8 Flash semantic checks for price, uncertain plans and room/meal differences (3/3; allowance exhausted; `docs/gemini-38-evaluation.md`).
- [x] Review and publish the customer image/configuration release, then verify the public AI journey (270/270 regressions; 3/3 production checks; `docs/gemini-production-release.md`).

Contract and acceptance boundaries: `docs/quotation-gemini-contract.md`. Earlier completed milestone evidence below remains historical.

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
- [x] Full regression passed **194/194**, zero failures/skips; independent review and
  two copied-source guard mutations pass. Exact-500 daily pagination and local worker
  failure diagnostics are corrected with regressions. Network-disabled packaging
  checks pass; source `c9a7d7f` and the local image are pinned in the verification
  record and retained clean `.local/roomdrop-watch-release` checkout.
- [x] Obtain separately scoped cloud approval (**go ahead**), upload the exact
  candidate and deploy the private customer service plus non-running watch job.
  Independent registry and **44+4** supported metadata/direct-access checks passed;
  agency fingerprints/grants are unchanged and Scheduler remains absent. The exact
  job-binding CLI correction has a regression and **7/7** focused tests pass. Final
  full emulator regression passes **195/195**, zero failures/skips.
- [x] User confirmed all live customer/agency checks. One approved job execution
  `roomdrop-price-watch-vm4f2` completed; independent **20/20** checks prove one task/
  attempt, durable checkpoint and truthful `SOURCE_UNAVAILABLE` for the promoted
  fixture baseline (no search/offers, one preview-only event). Human acceptance has
  no automated signed capture. The execution approval is spent; Scheduler remains
  absent and separately gated. See `docs/roomdrop-cloud-execution.md`.

## Customer clarity follow-up — 15 October

The user reported many UI issues, too much text and unclear customer steps after
the functional live check. `docs/customer-clarity-contract.md` bounds the local UX
change: shorter default copy, one customer step guide, clear stage-specific actions,
compact watch evidence and truthful pending/completed refunds. Domain authority,
approved terms, brand/photo-card structure and manual transitions remain protected.

- [x] Implement and independently browser-review the local revision at mobile and
  desktop. Final browser regression passes **8 clarity + 11 postcard + 17 watch**
  groups; the emulator Node suite passes **195/195**, zero skips. Independent review
  covers 26 captured states, a killed non-refundable gate mutation and nine focused
  accessibility checks. Completed-state duplicate text/dead-end action are removed.
  Initial/review wording is 19%/11% shorter with material terms retained. See
  `docs/customer-clarity-verification.md` for exact source/run boundaries.
- [x] User **Approved** the exact UI image and customer-only private update on
  16 October. Source `16adf72b` is retained in `.local/roomdrop-ui-release`;
  uploaded registry bytes match the pins and revision `hotel-price-hunter-00008-87j`
  is ready with full traffic. All **40/40** release checks pass, including preserved
  booking/watch/case data, private access and unchanged agency/IAM/watch-job state.
  Scheduler remains absent and the spent execution was not rerun. See
  `docs/customer-clarity-execution.md` for evidence and coverage limits.
- [ ] Human-confirm the revised signed-in customer UI by refresh only. Browser
  connection failed before page access; no booking/watch/simulation actions need
  repeating. Keep this separate from the earlier human functional acceptance.

## Selected results labels — 16 October

- [x] Integrate the user's chosen option B: full-width relationship bands and
  explicit Save amounts, preserving fee/refund wording, landscape photographs,
  review consent and the manual simulated transaction flow. Prototype alternatives
  remain on their separate branch. See `docs/offer-band-integration.md`.
- [x] Browser verification passes 8 clarity + 11 postcard + 17 watch groups;
  inspected mobile and desktop screenshots. The full emulator Node suite passes
  195/195, zero failures/skips. Refresh only the isolated phone
  preview after committing; the private cloud release remains unchanged.
- [ ] Separate agent UX review requested by the user; the delivery includes a
  self-contained prompt with the exact commit, phone URL and evidence boundaries.
