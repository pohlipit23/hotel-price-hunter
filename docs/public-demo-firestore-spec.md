# Spec: RoomDrop curated booking demo and Firestore persistence

Status: approved judge-flow decisions from `roomdrop-booking-setup-handoff.md`
incorporated on 18 October 2026. The user approved the implementation plan on
18 October 2026, with one modification: delivery is split into Part 1 (sample
preparation and judge setup through Drop Watch armed) and Part 2 (the RoomDrop
app after watch activation). See "Delivery split, seam and ownership" below.
Live capture/import, deployment and access changes keep their separate approval
boundaries. No persistence implementation or release is claimed by this spec.

Terms follow `GLOSSARY.md`: Original Booking, Current Booking, Drop Watch and Drop.

## Objective and approved judge journey

Give hackathon judges a durable, isolated RoomDrop journey through curated
Original Bookings captured from real Altovo staging quotations. Persist the
shared booking facts and captured Drops in Firestore; persist each judge's
choices in their own anonymous session.

The approved journey is:

1. Start page: a RoomDrop card grid of about six curated quotations.
2. Original Booking confirmation page: "Your agency booked this", one primary
   "Set up a drop" action, and a visible small note that a staging quotation
   stands in for a confirmed booking, including the Altovo capture date.
3. Setup: explicit consent and minimum saving, followed by the armed state.
4. Immediate first check: replay the captured Drops, clearly labelled as replay.
5. Existing Deals, Review and Confirmed screens, retaining the selection-only
   acknowledgement and explicit cancellation-flexibility consent.

Use RoomDrop's Ticket and Stamp style, short copy and existing brand assets.
Show no Altovo or AirBorneo logo or co-branding; the factual staging-source note
remains visible. A judge never supplies a share link or an arbitrary booking code.

## Scope and existing work

- Reuse project `sincere-apex-511418-p0` and its existing `(default)` Firestore
  database after verifying current identity, permissions and database metadata.
- Tenant is `air1.app.altovostaging.com`. Never use production Altovo or trave10.
  The separate Altovo booking application and tenant settings remain unchanged.
- The owner creates quotations through the Altovo B2B storefront. A quotation
  remains `status='quote'`; no supplier reservation, payment or conversion occurs.
  The quotation stands in for the Original Booking throughout this demo.
- Captures currently available under ignored `.local\altovo-sample\` are
  `AIRB000179.projection.json` (non-refundable) and
  `AIRB000180.projection.json` (refundable). The handoff records live share-read
  verification, not verification performed by this specification update.
- Grow the curated catalogue to about six owner-created quotations, covering
  armable, non-refundable/cannot-start, cancellation closing soon, and variation
  in city, currency or board. Importing two records does not complete that target.
- Existing untracked `app\domain\altovo-quotation.mjs` and
  `scripts\prepare-altovo-catalogue.mjs` are scaffolding to review and extend.
  Their presence is not proof of a verified adapter, captured Drops or persistence.
- The separate simulation runtime, agency case data and existing watch jobs remain
  outside this data model. Preserve their behavior and stored records.
- Public share-link intake, customer accounts/invitations, scheduled checks, live
  runtime rate searches, email, Firebase Hosting and submission publication are
  deferred. Admin capture and Firestore import are separate guarded operations.

## Tech stack and current seams

Node.js ES modules, the built-in HTTP server and `node:test` remain the stack.
Use the already pinned `@google-cloud/firestore` dependency (`9.3.1`).
`app\booking-cloud.mjs` uses `app\booking-demo-server.mjs`, delegating its booking
APIs to `app\quotation-demo-server.mjs`. During this documentation pass, concurrent
changes added file-backed catalogue routes and per-code state while sessions still
use a process-local Map. Those changes are unreviewed existing work, not completed
Firestore persistence. Reconcile them first; replace hosted session authority and
catalogue payload loading with Firestore, without a file or memory fallback.

The current `quotationBaseline()` cannot parse the Altovo share response: it has
no `cart_items`, nationality, residency or child ages. Use an explicit Altovo
adapter. Existing hosted guards forbid emulator and credential-file environment
activation; keep that protection. Use a separate explicit local emulator harness.
The current deployment projection accepts at most three displayed Drops and rejects
private-looking keys. Add narrow typed catalogue projections and route allowlists;
do not disable the recursive private-field checks or expose the capture bundle.

## Administrative capture and import

### Source capture

The handoff records these air1 staging routes:

- `GET /api/bookings/share-token?code=` requires the agent session and returns a
  seven-day unrevocable capability token.
- `GET /api/v2/bookings/json?code&token` reads the quotation without login.

Share tokens are transient capture credentials. Never store them in Firestore,
public assets, logs, source or reports. The response is unmasked and may include
contacts, supplier costs and a tenant-wide legacy JSON token; retain only explicit
allowlisted fields. Never persist the raw response. Hostname alone does not prove
quotation tenancy because share-token lookup crosses tenants: require the owner's
approved air1 code list and recorded provenance for each curated record. Do not
invent a response field as tenant proof.

Capture is an owner-run local operation, defaulting to dry-run. Capture new
quotations or make bounded Gateway requests only after explicit authorization.
The public Cloud Run image exposes neither capture nor import endpoints and makes
zero Altovo or Gateway requests while judges browse, arm or confirm.

### Booking facts contract

For curated records require a valid quotation code/status, one standalone hotel
and room, Gateway hotel id, hotel display name, consistent stay dates, room/board
facts, `pax_count`, original retail amount/currency, and source provenance/time.
Keep retail and supplier/source amount-currency pairs distinct. Reject malformed
core facts; label genuinely absent optional display fields as not supplied.

Nationality, residency and detailed guest ages are absent from the share read.
Preserve that absence. For the approved demo capture only, use `my`/`my` and
adults-only search occupancy, explicitly recorded as agency defaults, including
`searchContextSource: agency-default`. Do not present the adult/child composition
as verified source data or apply this assumption to general live bookings.

Trust the explicit `non_refundable` flag and the `cancellations[].utc_*`
schedule for cancellation assessment. Do not use the 1970 sentinel or infer a
timezone for a naive offer-level deadline. Validate schedule ordering, current
coverage and bound penalty money/currency. Unknown or conflicting facts remain
unknown; a bare free-cancellation flag does not make a booking armable.

### Firestore layout and immutability

| Location | Data and authority |
| --- | --- |
| `roomdropBookingsV1/{code}` | Immutable normalised Original Booking, retail/currency, provenance, capture time, scenario/card metadata and content version |
| `roomdropBookingsV1/{code}/drops/{dropId}` | Immutable captured Drop facts, capture time, booking/version binding, pricing limitations and provenance |
| `roomdropPublicSessionsV1/{sha256(cookieToken)}` | Private anonymous session, guards/counters and `byCode[code]` entries containing that judge's setup, replay receipt, confirmation and context |

An explicit admin-import command validates existing captures and creates records
only. It defaults to dry-run, accepts an identical retry, and rejects changed
Original Booking facts under the same code with `BOOKING_CHANGED`. Replayed Drop
imports cannot duplicate or overwrite earlier Drops. Include only reviewed local
photo assets, card ordering and scenario labels. The public catalogue is an
explicit bounded allowlist; arbitrary document/code lookup is not exposed.

Publish a booking's display entry only once its required facts and complete
captured Drop-set manifest validate together. A valid zero-result capture is
explicitly different from a missing/failed capture. Adding later captures records
a new Drop-set version; earlier documents remain immutable. Content comparisons
exclude incidental import timestamps and all visitor state. Import never changes
sessions, existing simulation data, agency records or watch jobs.

Source read time, Gateway capture time and admin import time are separate facts.
None is a new live price check. Booking/Drop records have no session TTL.

## Catalogue, confirmation and access

The start page lists only imported approved entries, with photo, city, dates,
retail price/currency and a scenario label. Combine a curated scenario label with
current eligibility so a formerly armable entry cannot advertise expired consent
eligibility. Missing images have an honest fallback. All catalogue facts are
intentionally public demo data; private session choices are never public.

Use path-based routes, proposed as `/api/booking-demo/catalogue` and
`/api/booking-demo/q/<code>` with narrow action suffixes. Update the current
exact-URL rewrite/static-asset allowlists deliberately. Retain query-string
rejection and strict code validation. Public routes cannot create or refresh
catalogue entries, read private captures or trigger upstream calls.

Opening an approved card shows the Original Booking confirmation page. Ineligible
bookings remain viewable with their reason and a disabled setup action. Selecting
a different catalogue entry returns its shared facts and only the current session's
`byCode[code]` state. No invitation token or login is needed for this judge flow.

## Session, setup and replay contract

Keep the fixed one-hour session lifetime, HttpOnly SameSite=Strict cookie, Secure
in production, no-store responses and exact Host/Origin/CSRF guards. Store only
the cookie's SHA-256 digest as the document id, not its raw bearer value.

Each session entry binds the booking content version and Drop-set version.
Use `session.byCode[code]` for explicit consent/time/wording version, minimum saving,
watch revision, armed time, first-check receipt, confirmed Drop and bounded
conversation context. A judge may visit multiple entries independently. Two judges
opening one quotation must never overwrite or read each other's setup or receipt.

The demo agency minimum is 10.00 in the booking currency, converted using that
currency's minor-unit precision. The judge may raise it. Never use mixed-currency
thresholds or an implicit FX conversion. No notification-frequency input is required
by this judge-flow slice; notifications and scheduling remain deferred.

Evaluate eligibility at arming time using actual UTC time, with an injectable clock
in tests. Block non-refundable bookings, unknown/conflicting cancellation facts,
no current zero-penalty cancellation window and a reached free deadline. Store
the reason with the session's evaluated result, not as permanent booking eligibility.
A passing eligibility result never grants supplier transaction authority.

Arming and first-check replay are one committed session action:

- Validate the session, consent, minimum, current versions and eligibility.
- Run the pure replay over that booking's valid captured set. Use
  `isDisplayedDrop` plus an indicative difference at or above the judge's minimum;
  bind currency and booking/Drop versions. Preserve the existing three-card ranking
  and labels without certifying room equivalence or a final customer refund.
- Persist armed time and one completed replay receipt with replay time, original
  capture time(s), mode `captured-replay`, threshold and qualifying Drop ids.
  Label it "Replayed check" in the UI; do not claim a fresh search or live rate.
- A valid capture with no qualifying result produces an honest empty state. Missing
  or malformed capture data produces unavailable, never a successful empty search
  or a successful armed/replayed response without a commit.

Identical request retries return the same committed setup and replay. A deliberate
new minimum replaces only that session/code's setup with a new watch revision and
recomputed replay. Reject stale retries rather than restoring an older setup.
Invalidate a confirmation that no longer belongs to the current armed setup.
Shared booking facts and Drops are never modified by arming or confirming.

A Drop cannot be confirmed without this session's armed watch, membership in its
current qualifying set and the existing explicit acknowledgements. Revalidate
session/version/eligibility guards at mutation time. Same-Drop concurrent requests
and lost-response retries return one selection receipt. Different deliberate
selections serialize; the last committed selection is current. Receipt fields stay
`reservationCreated:false`, `quoteModified:false`, `customerRefund:null`.
The Current Booking stays the Original Booking throughout this tranche.

Changed booking/Drop bindings invalidate only the affected per-code state and
stale mutations return `DROPS_CHANGED`; other catalogue choices remain isolated.
Expired sessions cannot read or mutate state. A new session starts fresh; expiry
does not delete the shared booking records or captured Drops.

## Delivery split, seam and ownership

Approved by the user on 18 October 2026 as a modification of the implementation
plan. The split is a delivery and ownership boundary inside the single approved
customer journey; it adds no customer step, delay or screen. Task-level
redistribution is in `tasks\todo.md` (S0 and F0-F11, with `a`/`b` sub-tasks).

### Part 1 - Sample preparation and judge setup through Drop Watch armed

- Sample preparation as an explicit tracked task (S0): about six curated real
  quotations in the unchanged air1 Altovo staging B2B app. The owner creates
  missing quotations; inspect the two existing projections first. Creation,
  sanitised projection capture, matching per-quotation Gateway Drop capture,
  photo/scenario metadata and guarded Firestore import are tracked separately.
  Plan approval grants no new live-call allowance.
- Validated admin import and immutable shared Original Booking/Drop records.
  Public judges open only the curated catalogue: no free-text booking lookup,
  share-link intake or login.
- Durable anonymous sessions and isolated `session.byCode[code]` choices,
  preserving the 10.00 agency minimum in the booking currency.
- Start-page card grid, then the Original Booking confirmation page with "Your
  agency booked this", the visible staging/capture note and "Set up a drop".
- Consent and minimum-saving screens, cannot-start states and actual-time
  eligibility checks. Visible acceptance ends at a committed armed state.
- The minimum shared backend/API, packaging and emulator/browser evidence needed
  to prove setup survives restart and two judges do not overwrite one another.

### Part 2 - RoomDrop app after watch activation

- Present the immediate replay result with its original capture and replay
  timestamps, including honest empty/unavailable states. Filtering and the atomic
  replay remain governed by this spec and the seam below.
- Connect the session's qualifying Drops to the existing Deals, Review and
  Confirmed screens, preserving ranking, navigation and explicit acknowledgements.
- Enforce current armed-watch/Drop membership, safe rearming, stale-version
  rejection and idempotent selection receipts.
- Durable Gemini context for the correct judge and catalogue code, injected
  responses in local tests and no calls inside transactions.
- Integrated restart/isolation/browser regressions and final frozen-image,
  source/context, rollback and release evidence. Prepare a concrete release bundle
  for separate approval; never deploy or import production data automatically.

#### Part 2 implementation notes - storage interface v1

The binding interface supplied in `.local\roomdrop-part1-interfaces.md` uses
`sessionStorage.transact(cookieValue, fn)`: a synchronous callback mutates the
session and returns an operation result, resolved only after commit. Part 2's
`quotation-session-actions.mjs` adds confirmation, bounded conversation and
session allowance fields through that interface. It never assigns `watch` or
writes shared booking/Drop records. The separate helper avoids creating or
replacing Part 1's session-core file while Part 1 is implementing it.

Confirm/advice/chat accept `watchBinding` outside `watch`: key-sorted JSON of the
committed receipt. It is required for revisioned receipts and checked when sent
with legacy receipts. This rejects stale selections even when the selected Drop
remains in a newer replay. The arm request and receipt are unchanged. Legacy
requests without a binding remain supported only for non-revisioned receipts.

Part 1's per-code bootstrap can spread
`publicPostWatchState({ scope, bundle })` from `quotation-session-actions.mjs`.
It returns only a current confirmation and
`conversation: { watchBinding, chatHistory }`, with at most four allowlisted turns.
The UI restores that conversation only for the matching code, snapshot and watch.
This projection hookup and Part 1's durable GET/watch integration remain required
before integrated acceptance; the base snapshot's GET/watch still use memory.

The hosted entrypoints now require Firestore stores and
`release/booking-catalogue-manifest.json`, containing only
`{ schemaVersion: 1, entries: [{ code, contentVersion, dropSetVersion }] }`.
Startup compares these reviewed pins to `loadHostedCatalogue(bookingStorage)`;
there is no snapshot-file fallback or startup import. Source doubles are available
only through explicit release-test injection, marked `test-injected`, assigned a
`roomdrop-booking-test` image name and no registry destination.

#### Part 2 contract v2 follow-up

Contract v2 is additive. Part 2's hosted store factory now delegates Firestore
creation to `createRoomdropFirestore(environment)` and passes the reviewed
manifest's code list as `catalogueCodes` to the session factory. The durable
handler returns 404 for `BOOKING_UNAVAILABLE` from `getDrops`; invalid session
state and storage failures remain bounded 503 responses without internal details.
The importer input is `{ schemaVersion, entries, cards }` and remains admin-only.
Bundles bind `snapshotVersion` to `contentVersion` and need no private references.

Compatibility tests read the actual session module from pinned Part 1 commit
`553593537b0e8741bfe877c2cf7ad911deff2dec` via `git show` and evaluate those bytes
in memory. They verify Part 2 actions against both its memory and real Firestore
adapters, including catalogue bounds, invariant rejection, unchanged watches,
receipt/context persistence and `ttlAt`. This is storage compatibility proof,
not a branch merge or acceptance of the unfinished GET/watch integration.

#### Part 2 contract v3 follow-up

Integration authority update: the user authorised merging Part 1 at `d14f70f`
into the Part 2 worktree, preserving its storage modules and atomic arm unchanged.
F9a/F10a now belong to Codex. Claude retains F6/F7a setup screens and F11a
evidence, with further integration requiring another go-ahead. The reviewed real
catalogue may be imported only into `demo-roomdrop-part2` at `127.0.0.1:8281`.
No push, deployment, production import or upstream live call is authorised.

The arm body now sends `expectedRevision: data.watch?.revision ?? 0`, as requested
by Part 1. A stale response preserves the committed receipt and asks the judge to
reload the latest setup; catalogue/runtime unavailability stays on setup without
claiming a successful arm. The receipt adapter accepts `firstCheck.captureStatus`
only as `observed` or `observed-empty`, and rejects contradictory capture metadata
or a claimed empty capture with nonempty captured options. Legacy receipts remain
supported. Bootstrap `dropSetVersion` continues to bind receipt validity; `card`
is additive display metadata.

Hosted startup now passes `bookingStorage` as its sole catalogue source, with
the already validated loaded entries separately named `reviewedCatalogue` for
Part 2's version guards. This avoids passing the conflicting `catalogue` source
argument to Part 1's v3 factory. Reconcile the remaining GET/watch implementation
only during the separately authorised integration.

Read-only follow-up for Part 1: in `d14f70f`, `armRequest` defaults an omitted
`expectedRevision` to 0 and `armDropWatch` compares it to the current revision.
Changing a minimum after revision 1 without the field therefore appears to reject
with `WATCH_REVISION_STALE`, whereas the v3 interface notes describe omission as
no stale check. This is source inspection, not an executed Part 1 arm test. The
Part 2 client always supplies the field and does not depend on omission semantics.

#### Authorised 8423825 setup integration

The subsequent user-authorised merge includes `8423825` only, with Part 1's
optional-revision fix `5a85d4a` and the F6/F7a setup screens. The earlier omitted-
revision discrepancy is resolved by that parent. Part 2's arm fetch delegates to
`judge.armRequestBody(data, minimum)` rather than duplicating its payload logic.
An actual-emulator two-tab check proves a stale tab cannot overwrite a newer setup.

The Gemini launch button now sits in the Drops or Review heading, in document
flow, retaining the same dialog, question state and keyboard behaviour. Geometry
and browser checks cover 320/768/1024/1440 px; prices and consent controls are not
covered by the button. No Part 1 setup source was edited. Photo capture remains
with Claude and is not part of this merge; a later merge needs its own go-ahead.

### The seam: the atomic arm operation and its receipt

"Starts the watcher" means: valid consent and minimum saved, armed state
committed. Part 1 ends at one atomic arm operation that, in a single committed
session transaction for one session and code:

1. validates the session, CSRF/Origin, consent, the minimum (at least 10.00 in
   the booking currency, integer minor units), the current booking content
   version and Drop-set version, and actual-time cancellation eligibility;
2. runs the already approved immediate captured first-check replay (pure, over
   that booking's valid captured Drop set, `isDisplayedDrop` plus the minimum);
3. commits consent, minimum, watch revision, armed time and the completed replay
   receipt under `session.byCode[code].watch`; and
4. returns the committed receipt only after the commit.

Never split this transaction, report a fake success or add another customer step
or delay. Missing or malformed capture data fails without a commit (unavailable),
which is distinct from a valid committed empty replay.

Base-snapshot code before F4a/F5a (memory-backed, superseded; see "Arm route as
implemented" below):

- Route: `POST /api/booking-demo/q/<code>/watch`, allowlisted in
  `app\booking-demo-server.mjs` (`bookingApi`) and served by
  `app\quotation-demo-server.mjs` as `/api/quotation-demo/q/<code>/watch`.
  Bootstrap `GET /api/booking-demo/q/<code>` returns `watch` (the committed
  receipt or `null`), `blocker`, `agencyMinimumSavingMinor` and `csrfToken`.
- Request body (exact keys): `{ snapshotVersion, consent: true, minimumSavingMinor }`.
- Success `200`: `{ watch: { armedAt, minimumSavingMinor, firstCheck: { replayed:
  true, checkedAt, dropOptionIds } }, dropOptionIds }`. `checkedAt` is the
  bundle's original capture time; `dropOptionIds` are the qualifying Drops.
- Errors: `400 INVALID_WATCH`, `400 WATCH_CONSENT_REQUIRED`,
  `400 MINIMUM_SAVING_INVALID`, `409 SNAPSHOT_CHANGED`,
  `409 WATCH_CANNOT_START` with `reason` (`watchBlocker` codes such as
  `NON_REFUNDABLE`, `NO_FREE_CANCELLATION`, `FREE_CANCELLATION_ENDED`,
  `STAY_STARTED`, `CANCELLATION_FACTS_UNKNOWN`), `403 DEMO_SESSION_REQUIRED`,
  `404 BOOKING_UNAVAILABLE`.

Proposed Part 1 receipt (backward-compatible superset; Part 1 commits it in
Firestore). Existing fields keep their names and meaning so current UI keeps working:

```json
{
  "watch": {
    "code": "AIRB000180",
    "revision": 1,
    "contentVersion": "<booking content version>",
    "dropSetVersion": "<captured Drop-set version>",
    "consent": { "version": "<consent wording version>", "acceptedAt": "<UTC>" },
    "currency": "THB",
    "minimumSavingMinor": 1000,
    "armedAt": "<UTC commit time>",
    "firstCheck": {
      "mode": "captured-replay",
      "replayed": true,
      "status": "completed",
      "replayedAt": "<UTC, equals armedAt>",
      "checkedAt": "<earliest original capture time>",
      "capturedAt": ["<UTC original capture time(s)>"],
      "thresholdMinor": 1000,
      "dropOptionIds": ["<qualifying Drop ids, existing ranking order>"]
    }
  },
  "dropOptionIds": ["<same as watch.firstCheck.dropOptionIds>"]
}
```

`snapshotVersion` in the request is the booking content version; Part 1 may add
an optional `expectedRevision` (absent or `0` for a first arm) so a stale request
cannot replace a newer setup (`409 WATCH_REVISION_STALE`). An identical retry of
the committed request returns the same receipt with no new revision. Missing or
malformed captures return `503 CAPTURE_UNAVAILABLE` with no commit. The receipt
never contains raw captures, tokens, supplier references or another session's data.

Part 2 consumes this receipt (`watch` from the arm response or bootstrap) as the
only authority for qualifying Drops, replay labels and membership. Part 2 must not
change the arm request, transaction, error codes or receipt fields without
coordinating with Part 1 and recording the change here; it may add its own fields
outside `watch` (for example confirmation and context under `byCode[code]`).

#### Storage seam (F2 and F3a, implemented 18 October 2026)

These signatures implement the orchestrator contract
`.local\roomdrop-part1-interfaces.md` draft v1. Error `.code` values are binding.

`app\booking-storage.mjs` holds the shared, create-only catalogue records. Part 2
only reads them.

```js
createBookingStorage({ firestore, prefix = 'roomdrop' })
// Collections: `${prefix}BookingsV1/{code}`, `.../dropSets/{000001..}`, `.../drops/{dropId}`.
listCatalogue()
// -> [{ code, order, contentVersion, dropSetVersion, card: { order, cityName, scenarioLabel, photo } }]
//    ordered by card.order, at most 20 entries.
getBooking(code)
// -> { code, contentVersion, dropSetVersion, bundle, capture: { status, capturedAt } } | null
//    null for a malformed or unknown code; no lookup runs for a malformed code.
//    bundle = { schemaVersion: 1, snapshotVersion: contentVersion, transactionMode: 'selection-only',
//    baseline, options (the current Drop set, ranked), checkedAt, completeness, customerRefund: null,
//    reservationCreated: false }. It has no privateReferences; hosted mode wraps it as selection-only.
//    capture.status is 'observed' | 'observed-empty' | 'not-searched'.
getDrops(code, { dropSetVersion } = {})
// -> { dropSetVersion, captureStatus: 'observed' | 'observed-empty', capturedAt, drops: [option facts] }
//    throws CAPTURE_UNAVAILABLE (not-searched, or a missing/mismatched Drop document),
//    DROP_SET_CHANGED (a given dropSetVersion is not the current one),
//    BOOKING_UNAVAILABLE (malformed or unknown code; an addition to contract v1).
importBundle(input, { execute = false, now } = {})
// Admin/importer only. input = { schemaVersion: 1, entries: [{ code, blocker, capture, bundle }], cards: [...] }.
// -> { mode: 'dry-run' | 'executed', importedAt?, entries: [{ code, contentVersion, dropSetVersion,
//      captureStatus, dropCount, result: 'validated' | 'created' | 'unchanged' | 'drop-set-added' }] }
// One transaction for the whole input. Error codes: BOOKING_CHANGED, DROP_CONFLICT, DROP_DUPLICATE,
// CAPTURE_MISSING, CAPTURE_MISMATCH, BUNDLE_INTEGRITY_FAILED, BUNDLE_INVALID, CARD_INVALID,
// CATALOGUE_INVALID, PRIVATE_FIELD_REJECTED, VISITOR_STATE_REJECTED, DROP_SET_LIMIT, STORAGE_UNAVAILABLE.
loadHostedCatalogue(bookingStorage)
// -> { entries: [{ code, contentVersion, dropSetVersion, bundle }] }; throws CATALOGUE_UNAVAILABLE.
createRoomdropFirestore(environment = process.env)
// Server client with the app/storage.mjs guards: Firestore only, and the emulator only on loopback
// outside Cloud Run/production.
```

`contentVersion` is the SHA-256 of the key-sorted booking record (code, baseline,
card). A changed card label is therefore also `BOOKING_CHANGED`. `dropSetVersion`
hashes the capture record, the Drop facts in rank order, and the content version.
Import timestamps are excluded from both. A later capture adds the next
`dropSets` sequence. Earlier Drop and Drop-set documents are never rewritten, and
the current set is the highest sequence. `snapshotVersion` in the arm request is
compared with `contentVersion`. The session entry also binds `dropSetVersion`.

`app\quotation-session-storage.mjs` holds the judges' private sessions:

```js
createFirestoreSessionStorage({ firestore, now, prefix = 'roomdrop', maxSessions = 64, ttlMs = 3_600_000, catalogueCodes = null })
createMemorySessionStorage({ now, maxSessions, ttlMs, catalogueCodes, environment = process.env })
// The memory adapter is for tests and loopback runs only. It throws under NODE_ENV=production,
// K_SERVICE or CLOUD_RUN_JOB.
// Both return { mode, create(), get(cookieValue), transact(cookieValue, fn) }:
create()               // -> { cookieValue, session }; throws SESSION_CAPACITY, STORAGE_UNAVAILABLE
get(cookieValue)       // -> session | null (malformed, unknown or expired); throws STORAGE_UNAVAILABLE
transact(cookieValue, fn)
// One transaction. fn(session) mutates a private copy in place, synchronously, and returns a result.
// The result resolves only after the commit. Firestore may run fn more than once on retry, so fn
// must be pure: no network, Gemini or Firestore calls. Errors thrown by fn propagate unchanged and
// commit nothing. Throws DEMO_SESSION_REQUIRED (malformed, missing or expired), STORAGE_UNAVAILABLE,
// BOOKING_UNAVAILABLE (a byCode key outside catalogueCodes), and SESSION_STATE_INVALID (csrfToken or
// expiresAt changed, more than 20 codes, an entry without 64-hex versions, an async fn, or over 200 kB).
codeScope(session, code, { contentVersion, dropSetVersion })
// -> session.byCode[code], created as { contentVersion, dropSetVersion, watch: null } if absent.
// If the stored versions differ, it rebinds them and resets only `watch`. Throws BOOKING_UNAVAILABLE
// for a malformed code and SESSION_STATE_INVALID for malformed versions.
```

A session is `{ csrfToken, expiresAt (epoch ms), byCode }`, stored at
`${prefix}PublicSessionsV1/{sha256(cookieValue)}`. The document also holds a
hidden `ttlAt` timestamp for a TTL policy that needs separate approval. The raw
cookie value is never stored. Capacity is counted in one shared document,
`${prefix}PublicSessionsV1Capacity/live`, inside the create transaction.
Expired sessions listed there are deleted in that same transaction. Values must
be JSON data. Every write keeps fields Part 1 does not own. Part 2 (F3b) adds its
fields through `transact`, using its own helper next to `codeScope`, and never
writes `watch`.

#### Arm route as implemented (F4a and F5a, 18 October 2026)

Server factories take injected storage: `createBookingDemoServer`,
`createQuotationDemoServer` and `createHostedQuotationDemoServer` accept
`{ bookingStorage, sessionStorage }` in place of `bundle`/`snapshot`/`catalogue`.
Hosted mode requires `sessionStorage.mode === 'firestore'`. Locally a missing
`sessionStorage` defaults to the memory adapter. A file catalogue still works
through the same read interface, with memory sessions. The packaged hosted file
catalogue keeps its existing process-local sessions until F9a.

- The manifest (`listCatalogue`) is read on first use and retried after a
  failure. A code outside it is `404 BOOKING_UNAVAILABLE` without any lookup.
  Each request then re-reads `getBooking(code)`, so a new Drop set is seen at once.
- `GET /api/booking-demo/catalogue`: entries as before, plus
  `card: { order, cityName, scenarioLabel, photo } | null`.
- `GET /api/booking-demo/q/<code>`: as before, plus `dropSetVersion` and
  `capture: { status, capturedAt }`. `watch` is this session's committed receipt
  only while it is bound to the current content and Drop-set versions, else `null`.
- `POST /api/booking-demo/q/<code>/watch`: body keys `snapshotVersion`, `consent`,
  `minimumSavingMinor` and optional `expectedRevision`. An absent
  `expectedRevision` skips the stale check: the committed minimum again is an
  identical retry, and a new minimum makes the next revision. A present
  `expectedRevision` that is not the current revision (0 before the first arm)
  is `409 WATCH_REVISION_STALE`. Clients that re-arm send
  `data.watch?.revision ?? 0` (`armRequestBody` in `app\public\booking-judge.js`).
  The booking is read before the transaction, then
  `armDropWatch` (`app\domain\booking-drop-watch.mjs`) runs inside one
  `sessionStorage.transact`, in this order:
  1. snapshot check;
  2. identical retry;
  3. revision staleness;
  4. eligibility at the request time;
  5. capture validity;
  6. replay and commit.

  The receipt is sent only after the commit.
- An identical retry is the same minimum with `expectedRevision` absent or equal
  to the committed revision or the one before it. It returns the committed receipt
  unchanged. A new minimum on the current revision creates revision + 1. A new
  Drop set or content version resets the watch, and the revision then starts at 1.
- Receipt: exactly the proposed shape above, plus one additive field,
  `watch.firstCheck.captureStatus` (`observed` or `observed-empty`). It tells an
  empty search apart from offers that did not qualify.
  `watch.consent.version` is `roomdrop-drop-watch-consent-2026-10-18`.
- Errors as listed above, plus `503 CATALOGUE_UNAVAILABLE` (manifest or catalogue
  unreadable) and `503 DEMO_UNAVAILABLE` (any other storage failure, no SDK
  detail). A capture that is missing, `not-searched` on an armable booking, or
  malformed is `503 CAPTURE_UNAVAILABLE` with no commit. Malformed includes a
  Drop not priced in the booking currency, a missing capture time and an empty
  capture that holds Drops. A valid `observed` or `observed-empty` capture with no
  qualifying Drop commits a completed replay with `dropOptionIds: []`.
- The confirm, advice and chat branches read the armed watch from the durable
  session. Their own confirmation, history and rate-limit state stays
  process-local until Part 2 (F4b) moves it into `transact`.

### Ownership

- Part 1: Claude, worktree `.local\roomdrop-part1`, branch
  `claude/roomdrop-part1-armed`.
- Part 2: Codex, worktree `.local\roomdrop-part2`, branch
  `codex/roomdrop-part2-app`.
- Both branch from `roomdrop/judge-flow-base`, a snapshot of pre-existing
  uncommitted shared-checkout work authored by neither part. Neither part claims
  that snapshot's code as its own implementation or as proof of completion.

Primary file ownership (proposed names are not yet created):

- Part 1: `app\domain\altovo-quotation.mjs`, `scripts\prepare-altovo-catalogue.mjs`,
  `scripts\import-altovo-catalogue.mjs`, `app\booking-storage.mjs`,
  `app\quotation-session-storage.mjs` (session core and `byCode[code].watch`),
  `app\domain\booking-drop-watch.mjs` (arm and replay), `app\public\drop-watch.js`,
  `app\public\booking-judge.js`, catalogue/booked/setup/checking sections of
  `app\public\booking.html` and `app\public\booking.css`, `bookingApi` route
  allowlist in `app\booking-demo-server.mjs`, the catalogue `GET` and `/watch`
  branches of `app\quotation-demo-server.mjs`, `scripts\serve-booking-demo.mjs`
  (emulator launcher), and tests `tests\altovo-quotation.test.mjs`,
  `tests\altovo-catalogue.test.mjs`, `tests\booking-storage.test.mjs`,
  `tests\quotation-session-storage.test.mjs`, `tests\booking-catalogue.test.mjs`,
  `tests\booking-drop-watch.test.mjs`, `tests\booking-judge.browser.mjs`,
  `tests\fixtures\`.
- Part 2: `app\public\booking-live.js`, `app\public\booking-live-data.js`,
  `app\public\stay-advice.js`, options/review/confirmed/advice sections of
  `app\public\booking.html` and `app\public\booking.css`, the confirm/advice/chat
  branches of `app\quotation-demo-server.mjs`, confirmation/context additions in
  `app\quotation-session-storage.mjs`, `app\booking-cloud.mjs`,
  `app\quotation-cloud.mjs`, `Dockerfile.booking` and
  `scripts\prepare-booking-release.mjs` beyond Part 1's minimum, and tests
  `tests\booking-live.test.mjs`, `tests\booking-live.browser.mjs`,
  `tests\quotation-advice-server.test.mjs`, `tests\booking-advice.test.mjs`,
  `tests\quotation-cloud.test.mjs`, `tests\public-demo-release.test.mjs`,
  `tests\booking-firestore.browser.mjs`, `docs\public-demo-firestore-release.md`.
- Shared, append-only in the part's own section: this spec (Part 1 owns the seam
  subsection), `tasks\todo.md`, `tasks\plan.md` and
  `docs\public-demo-firestore-verification.md`. Shared code files above
  (`app\quotation-demo-server.mjs`, `app\booking-demo-server.mjs`,
  `app\quotation-session-storage.mjs`, `booking.html`, `booking.css`,
  `Dockerfile.booking`, `scripts\prepare-booking-release.mjs`) are edited only in
  the owning part's branches/sections; a cross-part change is coordinated first.
  `GLOSSARY.md` terms are not changed by either part without the user.

## Atomicity, Gemini, limits and failure behavior

Use retry-safe Firestore transactions for session changes and create-only imports.
Generate candidate identifiers/times before retryable callbacks. No transaction
callback may call Altovo, Gateway or Gemini. Commit before reporting success;
a timeout with unknown acknowledgement remains safe to retry.

Reserve the existing four-advice-requests-per-minute allowance per session across
instances. Preserve the existing per-instance limits of twenty requests/minute
and two concurrent calls, without describing these as a global inference budget.
Gemini receives only the allowlisted context for the selected catalogue code and
current qualifying Drops. Merge at most four chat turns and two advice turns per
Drop into the matching session/code after rechecking live guards. A late response
cannot overwrite confirmation, another code's context or expired state.

Preserve the 64-live-session capacity with shared concurrency-safe accounting and
bounded cleanup/reads. Catalogue size is admin-bounded. Never silently fall back
to memory storage in production, leak SDK errors, log free-text questions or
report successful setup/confirmation before its commit.

## Expiry and deployment boundaries

Reject expired sessions in application code independently of asynchronous TTL
cleanup. Prepare TTL only for the session collection, separately approved before
activation. The source share link's expiry does not affect captured Firestore
records or cause re-reading. Dynamic cancellation eligibility still expires at
the captured free deadline. No running schedule is introduced by this decision.

Use the Cloud Run attached identity and server SDK. No browser Firestore SDK,
public database rule or service-account key is needed. Verify current runtime
access before release; request any exact missing permission instead of broadening
IAM silently. Preserve current private services, saved data and access policies.

## Commands and project structure

Commands below are proposed acceptance commands, not completed test evidence.
Use Windows PowerShell from the project directory. New test/script names are
planned outputs; `.local\` remains ignored and must never be committed.

```powershell
Set-Location 'C:\Users\pohli\Sites\hotel-price-hunter'
# Start only if the intended emulator is not already available.
gcloud emulators firestore start --host-port=127.0.0.1:8081 --project=demo-roomdrop-iap-qa
# In another PowerShell session:
$env:GOOGLE_CLOUD_PROJECT='demo-roomdrop-iap-qa'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8081'
$env:RUN_FIRESTORE_INTEGRATION='1'
$env:NODE_ENV='test'
Remove-Item Env:K_SERVICE,Env:CLOUD_RUN_JOB,Env:STORAGE_MODE,Env:GEMINI_MODEL,Env:GOOGLE_CLOUD_LOCATION,Env:QUOTATION_ADVICE_ENABLED -ErrorAction SilentlyContinue
node --test .\tests\altovo-catalogue.test.mjs .\tests\booking-storage.test.mjs .\tests\quotation-session-storage.test.mjs .\tests\booking-drop-watch.test.mjs
npm test
node .\tests\booking-firestore.browser.mjs
git diff --check
```

- `app\domain\altovo-quotation.mjs`: validate/map the distinct Altovo projection.
- `scripts\prepare-altovo-catalogue.mjs`: owner-only capture/preparation, not a
  runtime source. Review existing scaffolding with injected HTTP before live use.
- New booking/session storage and guarded admin import modules: Firestore authority.
- Existing booking/quotation server seams and `app\public\`: catalogue, confirmation,
  setup and existing Deals/Review/Confirmed UI, using explicit test injection.
- `tests\`: Node, actual emulator and real-browser coverage; evidence in `.local\`.
- `tasks\plan.md`, `tasks\todo.md`: reviewable implementation order and acceptance.

Follow the existing two-space indentation, named exports and dependency injection:

```js
export function replayCapturedDrops({ baseline, drops, minimumSavingMinor }) {
  return drops.filter(drop => isDisplayedDrop(baseline, drop)
    && drop.indicativeDifferenceMinor >= minimumSavingMinor);
}
```

The snippet illustrates style and the pure filter, not the full currency, version,
authority or capture validator. `npm run build` targets the separate pitch Worker
and is not evidence that this Cloud Run entrypoint works.

## Verification and success criteria

1. Admin import accepts only approved sanitised air1 captures. Identical and
   concurrent imports are safe; changed facts/private fields fail. Shared booking
   facts, catalogue metadata and captured Drops remain immutable.
2. Two real Firestore clients and two app instances recover a session across restart;
   two judges on one code and one judge across two codes retain isolated choices.
3. Arming checks dynamic cancellation and the 10.00 currency-bound floor, commits
   one replay, filters by `isDisplayedDrop` and the raised threshold, and handles
   zero results versus missing capture honestly. Retries and changed-minimum races
   cannot duplicate or revert state. No upstream request occurs.
4. Confirming requires an armed watch and current qualifying Drop/acknowledgements;
   selection receipts are idempotent and retain all selection-only flags.
5. Start/card grid, Original Booking confirmation, cannot-start, setup, replay,
   Deals, Review and Confirmed work on mobile and desktop with keyboard access.
   Source and replay labels are visible; agency/provider branding is absent.
6. Expiry, capacity, stale bindings, database failure and late model responses fail
   safely. Unit/HTTP/emulator tests use injected model and upstream responses.
   Report full-suite pass/failure/skip counts; relevant emulator tests must run.
7. The exact packaged hosted entrypoint works against the emulator and retains
   strict production guards. Later separately approved cloud acceptance proves
   imported catalogue reads, restart persistence and session isolation. A health
   label alone does not establish these facts.

## Boundaries and remaining prerequisites

- Always: curated air1 staging data only; admin capture/import separate from public
  runtime; explicit projections, session guards and transactions; preserve unrelated
  work and existing services/data; distinguish local from live evidence.
- Ask first: the implementation plan was approved on 18 October 2026 (with the
  Part 1/Part 2 split); do not ask for that approval again. Ask before
  new live quotation/Gateway captures, additional live Gemini checks, production
  Firestore imports, deployment, IAM/TTL changes or source publication. Present
  concrete reviewed commands/artifacts before a release decision.
- Never: commit `.local\`, tokens, raw responses or credentials; merge the research
  branches; change Altovo code/settings; call confirm-quote; create a reservation,
  convert/requote the chosen Drop, change the Original Booking, move money, cancel,
  refund, deliver email, start Scheduler or use production Altovo.

The approved handoff settles public entry/identity (anonymous curated catalogue),
per-session watch ownership, replayed first check and Deals handoff for this
tranche. Broader invitation/identity and Drop-to-quotation work is deferred.
Wayfinder map is GitHub issue #2; the handoff records research #3/#4/#5 as closed
and decisions/prototype #6/#7/#8/#9 as open. Do not infer remote ticket closure
from this local spec update. Exact field mapping, tenant provenance, catalogue
coverage and the new screens must be verified during the proposed work.

Owner-created additional quotations and their bounded captures are prerequisites
for the full six-entry catalogue and are tracked as Part 1 task S0 in
`tasks\todo.md`; its live steps each need separate user approval. Existing captures are not evidence of Gateway
results for every record. Verify these locally before requesting further calls.
Before live release verify database, identity/configuration, reviewed import set,
current scenario eligibility, rollback and preservation of unrelated data. Existing
memory-only visitor sessions may require a reset at the first persistent release.

References: `docs\roomdrop-booking-setup-handoff.md`, `GLOSSARY.md`,
`docs\quotation-demo-contract.md`, `docs\quotation-gemini-contract.md`,
`docs\gemini-chat-ui.md` and `docs\price-watch-contract.md`. Authoritative Firestore
semantics: https://docs.cloud.google.com/firestore/docs/security/iam,
https://firebase.google.com/docs/firestore/manage-data/transactions and
https://firebase.google.com/docs/firestore/ttl.
