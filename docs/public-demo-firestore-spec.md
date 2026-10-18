# Spec: RoomDrop Original Booking and Drops Firestore persistence

Status: revised 18 October from the design approved earlier that day. The single
immutable demo snapshot is superseded by per-booking records created from an
Altovo share link. Open items are marked and tracked on the wayfinder map.
Implementation planning is pending review; implementation has not started.
Date: 18 October 2026, Asia/Kuala_Lumpur.

Terms follow [GLOSSARY.md](../GLOSSARY.md): Original Booking, Current Booking,
Drop Watch and Drop.

## Objective

Store each Original Booking that arrives from an Altovo share link, the Drops
found for it and the customer's Drop Watch setup in Firestore. Retain each
visitor's anonymous session and confirmed Drop choice across application restarts
and Cloud Run instances.
Preserve the current RoomDrop interface, explicit acknowledgements and
selection-only behavior. This is one capability: a durable journey from an
Altovo quotation to an armed Drop Watch, with sessions referencing the booking.

Agreed scope and defaults:

- Reuse project `sincere-apex-511418-p0` and its existing `(default)` Firestore
  database. Verify the actual database and runtime identity before live work;
  do not create a second database or change the existing database location.
- Retain the existing fixed one-hour session lifetime and cookie contract.
- The Original Booking comes from a real quotation that a B2B agent creates in
  the Altovo storefront at `trave10.app.altovostaging.com`. The Altovo app is used
  unchanged. RoomDrop receives it through an Altovo share link and reads it once.
- The record remains an Altovo quotation; it is never converted into a supplier
  booking. RoomDrop treats it as the Original Booking.
- Persist the booking facts, Drops, Drop Watch setup, the confirmed Drop, session
  guards, per-session advice counters and the existing bounded conversation
  context. Preserve the current behavior that a deliberate confirmation of
  another Drop replaces the current receipt.
- Arming the Drop Watch and recording when the first check is due is in scope.
  Running checks on a schedule, live rate searches, notifications, sign-in,
  Firebase Hosting and submission publication stay outside this capability.

## Current contract and tech stack

Node.js ES modules, built-in HTTP server and `node:test`.
`@google-cloud/firestore` is already pinned to `9.3.1`; no new dependency is needed.
The current `app/booking-cloud.mjs` entrypoint uses `app/booking-demo-server.mjs`,
which delegates API calls to `app/quotation-demo-server.mjs`.
The latter currently owns an in-memory session map and reads one packaged
quotation prepared offline by `scripts/prepare-quotation-demo.mjs`.

The separate `app/server.mjs` / `app/storage.mjs` simulation runtime already uses
Firestore, including visitor, agency and watch collections. Those data models and
their existing records are outside this change. Reuse established configuration,
transaction conventions and the eligibility rules in `app/domain/price-watch.mjs`
without attaching new records to simulation data.

Altovo facts this spec relies on (from the Altovo repository, staging only):

- A quotation is an Altovo booking with `status='quote'`; no payment or supplier
  call is made, and its stored total is retail (net plus agent markup).
- An agent who can read the booking mints a capability token with
  `GET /bookings/share-token?code=`. It is valid for 7 days by default.
  `GET /v2/bookings/json?code&token` then reads that booking without login.
- The payload is compatible with the EasyGDS shape that `quotationBaseline()`
  already parses (`travel_start_date`, `cart_items[0].product.selected_offer`,
  `search.payload.travelers`).

## Behavior and data requirements

### Intake from an Altovo share link

A public intake request carries one Altovo share link. The server:

1. Accepts only links whose host is the trave10 staging tenant
   (`trave10.app.altovostaging.com` or its staging API host). Any other host,
   tenant or production URL is rejected before a network call.
2. Reads `/v2/bookings/json` once with the code and token, server-side, with a
   bounded timeout. The browser never calls Altovo.
3. Requires `status='quote'` and a single standalone hotel item, consistent with
   the standalone single-room policy in `tasks/plan.md`.
4. Normalises the display-safe Original Booking facts: hotel, room, board,
   dates, occupancy, nationality, retail total and currency, free-cancellation
   flag and deadline, and the cancellation schedule where present.
   (Open: the exact required fields and their fallbacks are decided by the
   ticket "Booking facts contract and when a watch can't start".)
5. Evaluates Drop Watch eligibility and stores the reason when it cannot start.
   Existing reasons from `price-watch.mjs` apply: non-refundable, cancellation
   facts unknown, free-cancellation window passed. (Open: final list, same ticket.)

Never store the raw Altovo response, the share-link token, booking contacts
(encrypted in Altovo), traveller names, supplier `confirmation_number` or
`bk_ref`, credentials or other actionable supplier references, unless the
booking facts ticket decides a specific field is required.

### Original Booking record

Store the normalised facts in `roomdropBookingsV1/{altovoBookingCode}`, with the
source system (`altovo-staging`), tenant (`trave10`), Altovo read time, intake
time, schema version and selection-only flags. The Altovo read time is distinct
from the intake time; neither makes observed rates fresh.

The booking facts are immutable after intake. A repeated intake of the same code
with identical normalised facts is accepted and returns the existing record. A
repeated intake whose facts differ is rejected with `BOOKING_CHANGED`; it never
overwrites the record. Booking records have no session TTL.

The record also holds the Drop Watch setup, written by the customer:

- consent, given explicitly, with its timestamp and the wording version shown;
- minimum saving, never below the agency minimum saving;
- notification frequency, stored for later use;
- armed time and the time the first check is due.
  (Open: how the first check is recorded without a scheduler.)

A booking whose eligibility check failed can be shown to the customer but cannot
arm a Drop Watch.

### Drops

Each Drop found for a booking is a document in
`roomdropBookingsV1/{altovoBookingCode}/drops/{dropId}`. A Drop records when and
how it was found, the display-safe offer facts, its price against the Current
Booking, its eligibility and its display label (Best drop, More flexibility,
Another drop). New findings are added as new Drop documents; they never modify
the booking facts or earlier Drops.

For the current demo, the Drops come from the existing captured Gateway search
for that booking. Live rate searches stay outside this capability.
(Open: whether and when a chosen Drop becomes an Altovo quotation is decided by
the ticket "When a Drop becomes an Altovo quotation".)

### Private durable session

Use a dedicated versioned collection, proposed name `roomdropPublicSessionsV1`.
Derive its document identifier from a SHA-256 digest of the server-generated
cookie token; do not store the raw cookie token or expose document identifiers.
The client cannot choose a document path, project or database.

A session contains a schema version, revision, creation and expiry timestamps,
the booking code it belongs to, CSRF material, current confirmation (a Drop id),
minute-window advice count and the bounded conversation context already used by
the server. Retain the current maximum of four chat turns and two advice turns
per displayed Drop. Do not persist provider credentials, supplier references,
raw provider responses, IP addresses or additional identity fields.
Free-text questions remain private session context and must not enter logs,
fixtures or public exports.
(Open: the customer identity tied to a session is decided by the ticket "How the
customer receives the RoomDrop invitation, and what identity they need".)

Bootstrap restores a live session using the existing HttpOnly, SameSite=Strict
cookie, with Secure retained in production. Missing or expired sessions receive
a new server-generated identity. A known session whose booking or Drop set has
changed must not restore an old receipt or conversation against different Drops:
bootstrap rotates the session, and stale mutation requests return `DROPS_CHANGED`.

The browser projection stays allowlisted. Only its own session's public receipt,
CSRF token, booking facts, Drops and existing display/model fields are returned.
This slice does not introduce a conversation-history API or promise to redraw
prior chat after reload.

### Atomic updates and failure behavior

- Intake is idempotent: concurrent intakes of the same code create one booking
  record. The Altovo read happens outside the transaction; the transaction only
  creates the record or compares it with the existing one.
- Arming the Drop Watch validates the session, expiry, origin, CSRF, booking
  eligibility, consent and minimum saving in one transaction. Repeating the same
  setup returns the same armed state.
- Confirm a Drop only after validating the current session, expiry, origin,
  CSRF, that the Drop belongs to the session's booking, and required
  acknowledgements.
- Repeated confirmations of the current Drop return the same committed receipt,
  including after a lost HTTP response or server restart. Concurrent identical
  confirmations create one receipt. Competing different selections serialize;
  the last committed deliberate selection is the current receipt.
- Transaction callbacks must be retry-safe. Generate candidate identifiers
  outside callbacks. Never call Altovo, Gemini or a supplier inside a transaction.
- Reserve the existing four-advice-requests-per-minute allowance atomically per
  session before invoking Gemini. Preserve the current per-instance limits of
  twenty requests per minute and two concurrent calls; do not describe these
  per-instance limits as a project-wide inference budget.
- A model response may append only its bounded context, after rechecking the
  session, expiry and Drop set. It cannot overwrite a newer selection or restore
  expired state. Concurrent updates must not lose committed fields.
- Preserve bounded session creation, including the existing capacity of 64 live
  sessions, with a shared concurrency-safe policy. Bound intake the same way so
  the public endpoint cannot create unbounded booking records. Expired sessions
  do not consume live capacity. Do not scan an unbounded collection on every
  request.
- A failed or timed-out storage or Altovo operation produces a sanitized
  unavailable response. Never return a successful intake, armed watch or receipt
  before its write commits, or silently switch production to memory storage.
  Retrying is safe even if the earlier write committed but its acknowledgement
  was lost.

### Expiry, access and retention

Reject expired sessions in application reads and writes, independent of physical
deletion. Store a Firestore timestamp usable for TTL, and prepare the session
collection's TTL policy as an explicit release configuration change. Expired
records may await asynchronous deletion; they never regain access or capacity.

Booking records and Drops do not expire with sessions. The Altovo share link
expires after 7 days; RoomDrop keeps the facts captured at intake and never
re-reads Altovo with an expired or stored token.
(Open: what a running Drop Watch does once the share link has expired.)

Use the Cloud Run attached identity and server SDK credentials. No browser
Firestore SDK, public database rule, service-account key or new login is needed.
The Altovo read needs no Altovo credentials beyond the share-link token supplied
in the request. Verify effective server access before release and identify any
missing exact permission; do not broaden IAM silently. Existing agency/watch
access and data must remain intact.

## Commands

Commands run from `C:/Users/pohli/Sites/hotel-price-hunter` in PowerShell.
These are acceptance commands for the later implementation, not proof of a run.

```powershell
# Start only if the intended local emulator is not already running.
gcloud emulators firestore start --host-port=127.0.0.1:8081 --project=demo-roomdrop-iap-qa

# In a separate shell: emulator-only focused and complete regression suites.
$env:GOOGLE_CLOUD_PROJECT='demo-roomdrop-iap-qa'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8081'
$env:RUN_FIRESTORE_INTEGRATION='1'
$env:NODE_ENV='test'
Remove-Item Env:K_SERVICE,Env:CLOUD_RUN_JOB,Env:STORAGE_MODE,Env:GEMINI_MODEL,Env:GOOGLE_CLOUD_LOCATION,Env:QUOTATION_ADVICE_ENABLED -ErrorAction SilentlyContinue
node --test tests/booking-intake.test.mjs tests/booking-storage.test.mjs tests/quotation-session-storage.test.mjs tests/quotation-demo-server.test.mjs tests/quotation-advice-server.test.mjs tests/quotation-cloud.test.mjs
node --test tests/*.test.mjs

# Syntax, patch integrity and current booking browser regression.
node --check app/quotation-demo-server.mjs
git diff --check
node tests/booking-live.browser.mjs --snapshot=.local/quotation-demo/ACCEPTED-CAPTURE.json
```

The intake, booking-storage and session-storage tests are proposed new files.
Intake tests use a recorded, sanitised trave10 share-link response stored under
`.local/` and an injected HTTP client; they make no live Altovo calls.
`ACCEPTED-CAPTURE.json` must be replaced with the actual accepted ignored capture
path. The existing browser regression establishes UI behavior only; add an
emulator-backed restart and isolation harness for persistence evidence.
`npm run build` builds the separate pitch Worker and is not verification of this
Cloud Run entrypoint.

## Project structure and code style

- `app/quotation-demo-server.mjs`: session integration and guarded API behavior.
- `app/booking-demo-server.mjs`, `app/booking-cloud.mjs`,
  `app/quotation-cloud.mjs`: dependency injection and executable storage setup.
- A small Altovo share-link reader in `app/`: host allowlist, single read,
  normalisation into Original Booking facts.
- Small dedicated booking/Drop/session-storage modules in `app/`.
- `tests/*.test.mjs`: Node unit, HTTP and real-emulator integration checks.
- `tests/booking-live.browser.mjs`: current booking UI regression.
- Existing release-preparation scripts and Docker files: package the real
  entrypoint and required dependency closure.
- `docs/`: contract, verification and release evidence.

Follow existing two-space indentation, named exports and injected dependencies.
Keep SDK-specific work in storage code. Example of the existing transaction style:

```js
return this.database.runTransaction(async transaction => {
  const snapshot = await transaction.get(reference);
  if (!snapshot.exists) throw new Error('Visitor not found.');
  const previous = snapshot.data();
  const next = change(copy(previous));
  transaction.set(reference, next);
  return next;
});
```

This is a style example from `app/storage.mjs`, not the complete session validator.

## Testing strategy and success criteria

Use `node:test`, the actual local Firestore emulator, a recorded Altovo response
and injected Gemini responses. An in-memory test double alone cannot satisfy
persistence acceptance.

1. Intake accepts a recorded trave10 share-link response, stores only approved
   display facts and records the eligibility result. It rejects other hosts,
   tenants and production URLs before any network call, rejects non-quote and
   multi-item bookings, and never stores the token, contacts or traveller names.
2. Repeated identical intakes return one record; concurrent intakes create one
   record; an intake with different facts for an existing code is rejected with
   `BOOKING_CHANGED`. Adding a Drop never changes the booking facts or earlier
   Drops.
3. Arming requires explicit consent and a minimum saving at or above the agency
   minimum, and is refused for an ineligible booking.
4. Two independent storage clients and two app instances observe the same live
   session, booking and committed receipt. Restarting the app preserves them
   with the same cookie. Another visitor cannot read or mutate that session.
5. Same-Drop concurrent requests and lost-acknowledgement retries return one
   receipt. Competing updates preserve committed selection, counters and context.
   Transaction retries make zero additional Altovo or model calls.
6. Expiry, Drop set changes, stale CSRF, missing acknowledgements, capacity,
   database failure, Altovo failure and late model responses fail safely, with no
   memory fallback. One session's rate allowance is enforced across instances.
7. The booking browser journey works at mobile and desktop sizes; consent
   remains explicit. Confirmation still reports `reservationCreated:false`,
   `quoteModified:false`, `customerRefund:null`.
8. The complete emulator-backed regression suite finishes with recorded pass,
   failure and skip counts. Relevant integration tests must run, not be skipped.
   The packaged production entrypoint starts and serves its expected assets;
   tests must not make live Altovo, supplier or model calls.
9. Later cloud acceptance proves a real trave10 share link is taken in, the
   Drop Watch is armed, and anonymous-session persistence holds across
   independent app instances or a controlled restart, plus session isolation.
   Liveness and a configured storage label alone do not prove persistence.

## Boundaries

- Always: accept only trave10 staging share links; read Altovo server-side only;
  validate session ownership and inputs; keep updates atomic; test against the
  real emulator; preserve unrelated dirty work; report local and live proof
  separately; keep existing public/private service boundaries.
- Ask first: obtain approval of the implementation plan before coding; present
  the concrete tested release before deployment, IAM/TTL policy changes or
  source publication. Any live Altovo intake beyond the recorded sample, and any
  additional live Gemini check, needs its own bounded allowance.
- Never: convert the quotation into a supplier booking, create real reservations,
  modify the source quotation, change Altovo code or tenant settings, use
  production Altovo, cancel bookings, issue refunds, send email, start Scheduler,
  copy private source references or share-link tokens into stored or public
  state, commit credentials, or delete existing visitor/agency/watch data.

## Open questions and live prerequisites

Open decisions, tracked as wayfinder tickets:

- Booking facts contract and when a watch can't start: required Altovo fields,
  fallbacks and the final eligibility reasons.
- How the customer receives the RoomDrop invitation, and what identity they need.
- When a Drop becomes an Altovo quotation.

Not yet specified:

- How the first check is recorded without a scheduler.
- What a running Drop Watch does once the 7-day share link has expired.
- How an armed booking record feeds the existing Deals screen.

Before live execution, verify database identity/location, attached runtime
permissions, the current service configuration and that the trave10 tenant
serves share-token reads. Decide the exact TTL activation command and rollback
behavior in the reviewed release bundle. Existing in-memory sessions cannot be
migrated after their process disappears; the first persistent release may
require a fresh anonymous session; that limitation remains explicit in the
release review.

## Primary references

- [Firestore server IAM](https://docs.cloud.google.com/firestore/docs/security/iam):
  the server SDK uses IAM; client rules do not establish server permissions.
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions):
  transaction functions may execute more than once under concurrent changes.
- [Firestore TTL](https://firebase.google.com/docs/firestore/ttl): physical expiry
  deletion is asynchronous, so access expiry must be enforced by the application.

Related local contracts: `quotation-demo-contract.md`,
`quotation-gemini-contract.md`, `gemini-chat-ui.md`, `data-contract.md` and
`price-watch-contract.md`. Altovo references (in the Altovo repository):
`docs/knowledge-base/quotations-feature.md` and the share-token routes in
`services/platform` `bookings.py`.
