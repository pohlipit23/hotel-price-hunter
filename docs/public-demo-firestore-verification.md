# RoomDrop curated judge flow: verification evidence

Contract: `docs\public-demo-firestore-spec.md`. Tasks: `tasks\todo.md`. Each part
records evidence only in its own section. No section is evidence of a deployment,
a production import or a new live call.

## Part 1 - Sample preparation and judge setup through Drop Watch armed

Owner: Claude, worktree `.local\roomdrop-part1`, branch `claude/roomdrop-part1-armed`.

### F0: Capture and scaffolding audit (18 October 2026)

Method: read-only local inspection of key names, provenance fields and file
hashes. No Altovo, Gateway or Gemini call, no Firestore read or write. Private
payload values are not copied here; only key names, scenario characteristics and
SHA-256 digests of the whole local files.

#### Local captures (ignored, never tracked)

`git check-ignore -v` in the shared checkout matches `.gitignore:9:.local/` for
every file below, and `git ls-files .local` is empty in both the shared checkout
and this worktree.

| File (under the shared checkout `.local\`) | Bytes | Modified | SHA-256 |
| --- | --- | --- | --- |
| `altovo-sample\AIRB000179.projection.json` | 1851 | 2026-10-18 19:11 | `1edc7b2832737a689047b13607a148fef97546a5ed0fe1ab7dc78ad689b74264` |
| `altovo-sample\AIRB000180.projection.json` | 2149 | 2026-10-18 19:11 | `8eb6e0d8caf0a46b852cac57d133653c8b17e75f674512d9be18dd855d6f73eb` |

Provenance recorded inside both projections: `source: altovo-staging`,
`tenantHost: air1.app.altovostaging.com`, read through the share-token JSON route
on `readAt: 2026-10-18` (date only, no time of day). Each says contact, agent,
supplier ids, prebook tokens and `json_url` were not stored. No share token is
stored. The tenant host is recorded provenance, not tenancy proof: tenancy rests
on the owner-approved code list (now enforced by `--approved-codes`, see F1).

Allowlisted keys present (names only):

- top level: `source`, `tenantHost`, `readPath`, `readAt`, `note`, `booking`,
  `hotel`, `room`, `price`, `cancellation`, `absent`;
- `booking`: `code`, `status`, `currency`, `retailTotal`, `travelStart`,
  `travelEnd`, `createdAt`;
- `hotel`: `name`, `star`, `countryCode`, `cityCode`, `checkin`, `checkout`,
  `roomCount`, `paxCount`, `nightCount`, `supplierSource`, `gatewayHotelId`; plus
  `provider` (AIRB000179 only) and `checkinTime`/`checkoutTime` (AIRB000180 only);
- `room`: `name`, `boardBasis`, `boardCode`, `bed` (null in both);
- `price`: `supplierCurrency`, `supplierTotal`, `fxRate`, `retailTotal`,
  `agentMarkup`, `markup`, `tax` (all three fees are 0 in both);
- `cancellation`: `offerNonRefundable`, `offerFreeCancellation`,
  `offerFreeCancellationDeadline`, `productFreeCancellation`,
  `productFreeCancellationDeadline`, `cancellationDeadline`, `schedule[]`
  (`utcFrom`, `utcTo`, `penaltySupplier`, `penaltyRetail`); plus
  `supplierCancellationDeadline` and `buffer` (AIRB000180 only);
- `absent` (declared not supplied): cart items, nationality, residency, child
  ages, adult/child split.

Supplier-side fields (`provider`, `supplierSource`) stay in `.local` only; the
adapter does not carry them into a baseline. AIRB000179's offer deadline is the
`1970-01-01 00:00` sentinel; AIRB000180's offer deadline is naive local time.
Both have offset-bearing UTC schedules.

#### Gateway captures

There is no Gateway capture for AIRB000179 or AIRB000180. The Gateway files that
exist locally are older (16 October) live-engine and quotation-demo observations
for other hotels and stays (stays from 2026-11-12 and 2027-01-21, quotation
DEMOP010223). Neither Gateway hotel id of the two curated codes occurs in them.
They are not Drops for this catalogue and must not be reused as such. Hashes are
recorded for integrity only:

| File (under `.local\`) | Bytes | SHA-256 |
| --- | --- | --- |
| `live-engine\gateway-observation-8f237d31-1b66-4600-9fd4-c255a861911a.json` | 171439 | `4f68e4f41d47564f3da23f67f9d938e10dd1870676a80ec1684b1c92ba16f5b4` |
| `live-engine\gateway-observation-db07af15-72bb-4122-9277-aa6dad4081f1.json` | 426006 | `1bed51170d7db162bbdff750101c51c19596a5cdb7282e7f4ff2ebc09deb84ad` |
| `live-engine\direct-gateway-5d553881-884b-4fa0-aebd-a1d2cebbef7e-private.json` | 406109 | `968c652285ab6f69cb814da5c5314f9cc5ab5cdac0670b7ac9c9adc0f657c9c6` |
| `live-engine\direct-gateway-5d553881-884b-4fa0-aebd-a1d2cebbef7e-private-wire.json` | 392300 | `3ec2e54fbb891ff39e8062b373b7f232a7c5d18a0da7b12df7d881e7a85876a5` |
| `live-engine\direct-gateway-final-projection-private.json` | 414791 | `bf9f9a691ac953156eec4abbad5c430ba020cf66beda7efa991e17dada6e503a` |
| `quotation-demo\gateway-input-DEMOP010223.json` | 187 | `739e56aefafd242180f6ceb2488e8b79e29365de80007a5b732b240f9a590791` |
| `gateway-rate-input.json` | 188 | `62d2dca6949de254cf924526af7cd61e44c64313e066a7a89280285cf9f5e4f1` |

The shared checkout's `.local\altovo-catalogue\` does not exist: no prepared
catalogue has been written.

#### Base-snapshot scaffolding (authored by neither part; reviewed, not proof)

- `app\domain\altovo-quotation.mjs`: share-projection adapter (`altovoBaseline`,
  `watchBlocker`). Before F1 it accepted naive schedule times as local time, read
  a missing `offerNonRefundable` as refundable, and had no conflict, contiguity,
  provenance or FX-binding checks. F1 fixed these.
- `scripts\prepare-altovo-catalogue.mjs`: owner-run preparation. Before F1 it had
  no dry run (without `--execute` it only listed requirements), no approved code
  list and no per-code capture record. A failed search already blocked the whole
  run.
- `tests\fixtures\altovo-catalogue.mjs`: tracked copies of the two projections'
  allowlisted display facts (no tokens, contacts or supplier source names). The
  three Drops for AIRB000180 are invented fixture rates, not captures.
- `app\public\drop-watch.js` (stateless rules: 14-day closing-soon, the 10.00
  agency minimum, `qualifyingDrops`) and `app\public\booking-judge.js` (catalogue,
  booked, setup and check screens).
- `app\booking-demo-server.mjs` (rewrites `/api/booking-demo/*`) and the
  catalogue `GET`, `/q/<code>` and `/watch` branches of
  `app\quotation-demo-server.mjs`. Sessions, `byCode[code].watch`, confirmations
  and rate limits live in a process-local Map (64 sessions, 1 hour). The hosted
  catalogue is a file baked into the image (`release\booking-catalogue.json`,
  not tracked). The watch is a single in-memory assignment. It is lost on
  restart and has no content or Drop-set version.
- Tests: `tests\altovo-quotation.test.mjs`, `tests\booking-catalogue.test.mjs`,
  `tests\booking-judge.browser.mjs` (port 0, fixture catalogue).

Gaps for later Part 1 tasks: no Firestore session or catalogue authority (F2,
F3a, F5a); no card photo (chosen by index parity), city name or scenario label
(S0.5, F4a); a missing capture is indistinguishable from an empty one at the
server and UI (F2, F4a); the UI shows an unknown `freeUntil` as "No free
cancellation" rather than unknown (F7a).

Base snapshot test run before any Part 1 change (worktree at `3c07af3`):

- `node --test .\tests\booking-catalogue.test.mjs`: tests 8, pass 8, fail 0,
  skipped 0.
- `node --test .\tests\altovo-quotation.test.mjs`: tests 5, pass 5, fail 0.

### S0.1: Scenario slots of the two existing projections

| Slot | Filled by | Facts (UTC) | Remaining evidence |
| --- | --- | --- | --- |
| Refundable, armable | AIRB000180 (Bangkok, MYR, breakfast, 1 night, 1 adult) | zero-penalty tier ends 2027-02-14T16:58:59Z; offset deadlines agree | Matching Gateway Drop capture (S0.4) |
| Non-refundable, cannot start | AIRB000179 (Kuala Lumpur, MYR, breakfast, 1 night, 1 adult) | `offerNonRefundable: true`, one fully charged tier | None: packaged with no search |
| Free cancellation closing soon | Gap | AIRB000180 would only become closing-soon from 2027-01-31; real dates are not altered to fake it | Owner-created quotation |
| Variety: city, currency or board | Partial: two cities | Both MYR, both breakfast, both 1 night and 1 adult, both 5-star | Owner-created quotations |

Owner-created quotation needs for S0.2 (air1 staging, `status='quote'`, one room,
1 to 4 adults, explicit UTC cancellation schedule):

1. A refundable quotation whose free-cancellation deadline falls within 14 days of
   the planned judging window (closing soon, still armable).
2. Two or three further refundable quotations that add variety: another city, a
   board other than breakfast (for example room only), more than one night or
   two adults, and a different booking currency if the air1 agency can quote one.
3. Optionally a refundable quotation whose free window has already ended, if a
   real one exists. This is only needed if the owner wants that state shown.

Each new code needs an owner-approved code list entry, a sanitised projection
(S0.3), and for armable entries a bounded Gateway capture (S0.4). The coverage
matrix stays open until those exist. These two samples prove mechanics only.

### F1: Adapter and capture preparation

`tests\altovo-catalogue.test.mjs` is a new file. The existing
`tests\altovo-quotation.test.mjs` is kept and still passes. One of its fixtures
now sets `offerFreeCancellation: false`, because a free-cancellation flag with
every tier charged is a conflict, and conflicts stay unknown.

It covers:

- naive schedule instants refused;
- a missing or non-boolean non-refundable flag leaves cancellation unknown;
- six conflicting-fact cases;
- the 1970 sentinel and naive offer deadlines ignored;
- overlapping or gapped tiers, and penalty money/currency bindings;
- schedule coverage at arm time;
- retail/source/FX bindings;
- missing core facts with reasons;
- absent display facts listed in `notSupplied`;
- provenance and agency defaults (`searchContextSource: agency-default`,
  `occupancySource: agency-default-adults-only`);
- preparation:
  - a dry run that makes no upstream call and writes nothing;
  - the approved-code list;
  - an injected Gateway search that uses only the my/my adults-only defaults;
  - per-code capture records (`not-searched`, `observed`, `observed-empty`);
  - failed searches (HTTP, application failure, hotel mapping) leave the run
    blocked with no catalogue file;
  - cannot-start entries prepared with no network call;
  - the display-safe public projection (`deploymentCatalogue`), which drops
    private references and the capture record.

Commands (worktree, 18 October 2026, after commit `4393134`):

- `node --test .\tests\altovo-catalogue.test.mjs .\tests\altovo-quotation.test.mjs .\tests\booking-catalogue.test.mjs`:
  tests 28, pass 28, fail 0, skipped 0.
- `node .\tests\booking-judge.browser.mjs`: exit 0. It listens on port 0 and
  writes screenshots to the worktree's ignored `.local\judge-flow\browser`.
- Local dry run of the real projections. This ran in-process: `main` was called
  with `root` set to the shared checkout and a `fetchImpl` that throws on any
  call. Result: `status: validated`, AIRB000179 `NON_REFUNDABLE` with no planned
  search, AIRB000180 armable with one planned search. Both pass the zero-fee FX
  binding. No file was written.

Still open:

- no live S0.2 to S0.4 step has run;
- no Drops exist for AIRB000180;
- card photo, city name and scenario label are curated S0.5 facts and are not
  part of the bundle yet.

### F2: Immutable booking and Drop storage and the guarded importer (18 October 2026)

Commit `a9f42d9`. New files:

- `app\booking-storage.mjs`
- `scripts\import-altovo-catalogue.mjs`
- `tests\booking-storage.test.mjs`
- `tests\fixtures\curated-bookings.json`

The fixture is synthetic. Its booking facts are the tracked F1 fixture facts. Its
three Drops, option ids and `privateReferences` values are invented, and
`privateReferences` is never copied into any record.

Covered:

- the dry run touches no Firestore client;
- private fields refused, both supplier keys in options and baseline;
- visitor state refused in the baseline and the card manifest;
- a missing or failed capture is refused (`CAPTURE_MISSING`);
- a valid `observed-empty` capture is accepted and published as such;
- a cannot-start booking is published as `not-searched`, and `getDrops` returns
  `CAPTURE_UNAVAILABLE` for it, never an empty search;
- capture and code mismatches, bundle integrity hash, duplicate Drop ids and card
  validation;
- importer argument guards: `EMULATOR_REQUIRED`, `PRODUCTION_IMPORT_NOT_ENABLED`
  (even with `--production-import-approved`), `PRODUCTION_IMPORT_REFUSED`, and
  workspace path checks.

Emulator cases use two clients and a per-test `test-<uuid>-roomdrop` prefix:

- reads from the second client;
- three concurrent identical imports give one `created` and two `unchanged`, with
  3 Drops and 1 Drop set;
- a later identical retry keeps the original `importedAt`;
- changed facts and changed card labels give `BOOKING_CHANGED`;
- an interrupted two-code import publishes neither code;
- a later capture adds Drop set 2 with the same content version;
- rebinding an earlier Drop id gives `DROP_CONFLICT`;
- the importer CLI against the emulator, then `loadHostedCatalogue`;
- no root collection other than the test's own changes.

After the runs the emulator had 0 root collections left.

### F3a: Durable sessions and the per-code watch entry (18 October 2026)

Commit `5535935`. New files: `app\quotation-session-storage.mjs` and
`tests\quotation-session-storage.test.mjs`. The memory adapter and the Firestore
adapter run the same contract cases.

Covered:

- the cookie digest is the document id, and the raw cookie appears in no stored
  field;
- one-hour expiry with an injected clock (read gives `null`, write gives
  `DEMO_SESSION_REQUIRED`);
- refused mutations commit nothing: a thrown domain error, a code outside the
  catalogue (`BOOKING_UNAVAILABLE`), a changed csrfToken or expiresAt, and an
  async callback;
- unknown Part 2 fields are preserved;
- restart, using a new client instance;
- two judges on one code, and one judge on two codes, isolated under concurrent
  transactions from two clients;
- a new Drop-set version resets only that judge's `watch` for that code;
- 10 concurrent creates against a cap of 4, from two clients: exactly 4 created;
- the default cap of 64, then `SESSION_CAPACITY`;
- an expired session frees its place and its document is deleted;
- an unreachable database gives `STORAGE_UNAVAILABLE`, with no fallback;
- the memory adapter is refused under production or Cloud Run variables.

A terminated SDK client was not used for the failure case, because the SDK then
raises unhandled rejections. That case uses a refusing database stand-in instead.

Commands (worktree, emulator `roomdrop-part1-firestore` 127.0.0.1:8181, project
`demo-roomdrop-part1`, `RUN_FIRESTORE_INTEGRATION=1`, `NODE_ENV=test`):

- `node --test .\tests\altovo-catalogue.test.mjs .\tests\booking-storage.test.mjs .\tests\quotation-session-storage.test.mjs`:
  tests 41, pass 41, fail 0, skipped 0.
- The same two new files without the emulator variables: tests 26, pass 12,
  fail 0, skipped 14 (the emulator cases).
- `npm test` without emulator variables: tests 352, pass 332, fail 0, skipped 20.

Still open:

- S0.6 needs real reviewed captures, so only the synthetic fixture has been
  imported;
- nothing is wired into the HTTP server yet (F4a, F5a).

### S0.2 to S0.4: Owner-created quotations and live captures (18 October 2026)

These were LIVE steps, each separately approved by the user and run by the owner
or under the owner's session on 18 October 2026. This worktree made no live call;
it records what was reported and re-checks local file hashes only.

- S0.2: the owner created air1 staging quotations AIRB000181 to AIRB000184
  (`status='quote'`). Approved air1 code list (tenant provenance):
  AIRB000179, AIRB000180, AIRB000181, AIRB000182, AIRB000183, AIRB000184.
- S0.3: sanitised projections for AIRB000181 to AIRB000184 were captured in the
  owner's logged-in browser (share-token route, then `v2/bookings/json`), with
  allowlisting done in the page. Tokens and raw bodies never left the page. Four
  seven-day share tokens were minted; none is stored anywhere. AIRB000182's room
  name contained an en dash, replaced with an ASCII hyphen in the projection.
- S0.4: one preparation run made 5 live calls (1 Gateway login, 4 search-by-id),
  all HTTP 200, no retries. AIRB000180 to AIRB000183 are `observed` with 3 Drops
  each. Estimates use the quotation FX rate and the `my`/`my` adults-only agency
  defaults (`searchContextSource: agency-default`). AIRB000179 and AIRB000184 are
  `NON_REFUNDABLE` and `not-searched`, with no search.

SHA-256 recomputed in this worktree (files in the shared checkout's ignored
`.local\`, never tracked):

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `altovo-sample\AIRB000179.projection.json` | 1851 | `1edc7b2832737a689047b13607a148fef97546a5ed0fe1ab7dc78ad689b74264` |
| `altovo-sample\AIRB000180.projection.json` | 2149 | `8eb6e0d8caf0a46b852cac57d133653c8b17e75f674512d9be18dd855d6f73eb` |
| `altovo-sample\AIRB000181.projection.json` | 2232 | `f01dbd557d73390745871e31eb79d8e72a2d46ad75dedbc1a9fdd7711b5032e4` |
| `altovo-sample\AIRB000182.projection.json` | 2294 | `b6c0544f15936dec09eadda4cc1a8ce9fbbe1ca99440013ca4038014ef43fe70` |
| `altovo-sample\AIRB000183.projection.json` | 2267 | `e4d66a76efbd73746c5f994cdb8e2fec16dfa1a5aeb79e1c08b0ddd32e0f4499` |
| `altovo-sample\AIRB000184.projection.json` | 2068 | `559cadb85f84a2ef6759603d236c6b983c04640c9a757d28bd480560f4fb563f` |
| `altovo-catalogue\catalogue-87ab61f1-25f5-4b18-a98d-7c57a0d34f91.json` | 32515 | `d3df4e16f9e33e2d17ce884b3e92af352b0d837449cc5709e7cf469f9d192039` |

Scenario coverage from the prepared catalogue (no private payload copied):

| Code | City | Board | Cancellation (UTC) | Capture |
| --- | --- | --- | --- | --- |
| AIRB000179 | Kuala Lumpur | Breakfast | non-refundable | not-searched |
| AIRB000180 | Bangkok | Breakfast | free until 2027-02-14T16:58:59Z | observed, 512 offers, 3 Drops |
| AIRB000181 | Singapore | Breakfast | free until 2027-02-21T05:59:59Z | observed, 908 offers, 3 Drops |
| AIRB000182 | Singapore | Room only | free until 2027-02-01T15:58:59Z | observed, 349 offers, 3 Drops |
| AIRB000183 | Hong Kong | Room only | free until 2026-12-06T15:58:59Z | observed, 273 offers, 3 Drops |
| AIRB000184 | Kuala Lumpur | Breakfast | non-refundable | not-searched |

All six are MYR, one night and one adult. Filled slots: refundable/armable
(180 to 183), non-refundable/cannot-start (179, 184), city variety (four cities)
and board variety (two room-only baselines). AIRB000181's two best Drops are room
only against a breakfast baseline, so they are not like-for-like. Still missing:

- closing soon within days: AIRB000183 has the nearest deadline, 49 days after
  18 October, and only becomes closing-soon (14-day rule) from 2026-11-22;
- a non-MYR booking currency;
- more than one night;
- more than one adult.

### S0.5: Provisional card metadata (pending the owner)

The owner has not yet decided card photos or labels. A clearly marked
provisional draft exists only in this worktree's ignored
`.local\cards-draft.json` (SHA-256
`ffe03a7d6f0377cf2f56320d9a35cdb7fa95190a8316c08da6b44fef1e5080c7`):

- labels: 180 "Big drop", 181 "Drop, but room only", 182 "Small drop",
  183 "Closest cancellation deadline", 179 and 184 "Can't watch - non-refundable";
- city names from each projection's `hotel.cityCode` (KUL, BKK, SIN, HKG),
  corroborated by the hotel name in the same projection;
- provisional order 180, 181, 182, 183, 179, 184;
- `photo: null` for every card. No bundle carries a reviewed image, so the UI
  must use its honest image fallback.

S0.5 stays open until the owner reviews photos, labels and order. A reviewed
change of label or order is a content change and gives `BOOKING_CHANGED` against
the emulator import below; re-import into a fresh prefix or emulator then.

### S0.6: Guarded emulator import of the six real captures (18 October 2026)

Input: `.local\s0.6\catalogue-import.json` in this worktree (ignored, SHA-256
`d996d05477ed524ea5f7ddd2170d2ab9e4e138005872cdd0330c6fba5d5ab81e`). It is the
prepared catalogue's six entries with `privateReferences` removed, plus the
provisional cards. `git check-ignore -v` matches `.gitignore:9:.local/`.

1. Dry run, `node .\scripts\import-altovo-catalogue.mjs --catalogue=.local/s0.6/catalogue-import.json`:
   `status: validated`. 179 and 184 `not-searched` with 0 Drops; 180 to 183
   `observed` with 3 Drops each.
2. Before execution the emulator (127.0.0.1:8181, `demo-roomdrop-part1`) had no
   root collections.
3. `... --execute --project=demo-roomdrop-part1 --database=(default) --emulator=127.0.0.1:8181`:
   `mode: emulator-import`, `status: imported`, all six `created`.
4. Read-back with a new client, using `loadHostedCatalogue`, `listCatalogue` and
   `getDrops(code, { dropSetVersion })`:
   - order and cards as drafted;
   - every `bundle.snapshotVersion` equals its `contentVersion`;
   - baselines and Drop options equal the input;
   - no bundle has `privateReferences`;
   - 180 to 183 give `observed`, 3 Drops, at their capture times
     (12:08:20.739Z to 12:08:34.799Z);
   - 179 and 184 throw `CAPTURE_UNAVAILABLE`, never an empty search.
5. The emulator then held 24 documents: 6 bookings, 6 Drop sets and 12 Drops.
   No stored key is private or visitor state.
6. An identical second `--execute` returned `unchanged` for all six.

Content versions (first 12 hex characters): 179 `1e490d803265`,
180 `d7572d0b5c89`, 181 `98132d9fd3ff`, 182 `830d59ea02e1`,
183 `7d5b74b1aff6`, 184 `d77e996890f5`. This is local emulator evidence only.
A production import remains a separate LIVE step that needs its own approval.

### F4a and F5a: Storage-backed catalogue, bootstrap and the atomic arm (18 October 2026)

Commits `9f57104` (pure arm), `70f9547` (server wiring) and `7e9373c` (HTTP and
emulator arm tests). New files: `app\domain\booking-drop-watch.mjs`,
`tests\booking-drop-watch.test.mjs` and `tests\fixtures\roomdrop-harness.mjs`
(test harness and a read-only stand-in built from the import plan). Changed:
`app\quotation-demo-server.mjs` (catalogue `GET`, bootstrap and `/watch`
branches, plus session plumbing) and `app\booking-demo-server.mjs` (pass-through
of the injected storage). The final route and receipt shape is in the spec
section "Arm route as implemented".

Covered against the emulator, with the imported synthetic fixture in per-test
prefixes and two clients:

- catalogue in card order with cards and request-time blockers and tags;
- the session document is the cookie digest; the raw cookie is stored nowhere;
- bootstrap returns the content and Drop-set versions, the capture record and
  only this session's watch;
- unknown, lower-case, percent-encoded, over-long and suffixed codes are 404 and
  never reach `getBooking`; queries are rejected;
- two judges on one code and one judge on two codes stay isolated;
- a restart (new server, new storage objects on a second client) keeps the cookie,
  csrf and committed watch;
- a Drop set imported while the app runs makes the stored watch stale for that
  code only: bootstrap shows `null`, the old revision is `WATCH_REVISION_STALE`
  and a fresh arm starts at revision 1;
- four identical arms sent at once to two app instances give one revision-1
  receipt, already readable from the other client; a lost-acknowledgement retry
  returns the same receipt;
- three minima racing from revision 0 commit exactly one; the others are 409;
  a raise to revision 2 cannot be reverted by retrying the winning request;
- two judges arming one code at once both get revision 1 without overwriting;
- a deleted Drop document is `503 CAPTURE_UNAVAILABLE` with nothing committed;
  an `observed-empty` capture commits a completed replay with no Drops;
- an expired session is `403 DEMO_SESSION_REQUIRED`; a fresh session at the free
  deadline is `409 WATCH_CANNOT_START` / `FREE_CANCELLATION_ENDED`, uncommitted;
- no request left loopback and the injected adviser was never called on the
  arm path.

Without the emulator:

- the pure arm cases: receipt, threshold and the 10.00 floor in JPY, MYR and KWD
  minor units, request validation, identical and stale retries, a Drop-set
  reset, eligibility at the arming instant, missing, malformed and mixed-currency
  captures with no mutation, and isolation of other codes and unknown fields;
- factory guards: hosted booking storage needs Firestore sessions, and mixed data
  sources are refused;
- database failure: `503 CATALOGUE_UNAVAILABLE` or `503 DEMO_UNAVAILABLE`, no SDK
  text, no cookie, and recovery once storage returns;
- the existing file-catalogue tests through the same code path. A re-arm there
  now needs `expectedRevision`.

Commands (worktree, emulator `roomdrop-part1-firestore` 127.0.0.1:8181, project
`demo-roomdrop-part1`, `RUN_FIRESTORE_INTEGRATION=1`, `NODE_ENV=test`):

- `node --test .\tests\altovo-catalogue.test.mjs .\tests\booking-storage.test.mjs .\tests\quotation-session-storage.test.mjs .\tests\booking-catalogue.test.mjs .\tests\booking-drop-watch.test.mjs .\tests\quotation-demo-server.test.mjs`:
  tests 74, pass 74, fail 0, skipped 0.
- The three server files without the emulator variables: tests 33, pass 24,
  fail 0, skipped 9.
- `npm test` without emulator variables: tests 373, pass 344, fail 0, skipped 29.
- Afterwards the emulator held only the S0.6 `roomdropBookingsV1` collection
  (6 bookings). Every test collection had been deleted.
- `node .\tests\booking-judge.browser.mjs`: FAILS at the change-minimum step at
  320 px. The re-arm gets `409 WATCH_REVISION_STALE`, because the arm request in
  `app\public\booking-live.js` (Part 2 file) sends no `expectedRevision`. The
  first arm passes. This needs the coordinated one-line change described in the
  Part 1 report (F7a).

Still open: the browser flow above, F6/F7a screens (cards, photos, capture note),
hosted startup wiring (F9a) and the emulator launcher (F11a).

## Part 2 - 18 October 2026, pre-integration history

The current authorised integration result is recorded at the end of this Part 2
section. The blockers and component results immediately below are historical.

Worktree: `.local\roomdrop-part2`, branch `codex/roomdrop-part2-app`.
Base: `3c07af3`. Binding storage interface: v3 supplied by Claude through the user.
All runtime tests and evidence below are local. No live capture, model call,
production import, source push, deployment, IAM/TTL change or Scheduler execution.

| Boundary | Result | Evidence |
| --- | --- | --- |
| Node regressions, including actual v2 session and Part 2 emulator cases | Pass: 336 tests, 330 passed, 0 failed, 6 skipped | `.local\part2-node-tests-v3.log` |
| Part 2 transactions on real Firestore | Pass: independent clients, hashed test cookie ids, concurrent confirmations, allowance contention, context restart | `quotation-session-actions.test.mjs` with `RUN_ROOMDROP_PART2_FIRESTORE=1` |
| Durable confirm/chat HTTP on real Firestore | Pass: separate servers/clients, restart recovery, stored follow-up context, unchanged watch/shared records | `quotation-durable-actions.test.mjs`, contract-v1 adapters over test-owned emulator documents |
| Actual Part 1 v2 session adapter compatibility | Pass: memory and real Firestore, invariant/catalogue rejection, preserved watch, receipt/context persistence, `ttlAt` Timestamp | `part1-session-v2.test.mjs`; pinned `5535935` source read via `git show` and evaluated only in memory |
| Full existing judge UI | Historical pre-v3 pass: 320/768/1440 px; rerun after integration | `.local\judge-flow\browser\result.json`, 27 screenshots; untouched base arm predates `expectedRevision` |
| Part 2 UI | Pass: 320/768/1024/1440 px, keyboard, refresh, isolation, rearm, empty/unavailable, no external requests | `.local\part2-browser\result.json`, 24 screenshots; explicit legacy request adapter, memory receipt and injected model |
| v3 arm/rearm requests and refusal states | Pass: 320/768/1024/1440 px; first revision 0, current revision on rearm, stale/503 preserve the receipt | `.local\part2-v3-browser\result.json`; injected v3 arm endpoint, not actual Part 1 arm proof |
| Historical single-snapshot booking UI | Pass: 320/768/1440 px | `.local\restore-booking-ui\browser\result.json`; synthetic two-Drop snapshot, no live rates |
| Hosted startup | Pass with injected factories; storage failure precedes model/listen, stores close once, invalid production/emulator profiles rejected | `quotation-cloud.test.mjs` |
| Manifest and dependency closure | Pass with explicitly injected Part 1 source doubles | `public-demo-release.test.mjs`; output is `test-prepared-offline`, no registry tag |
| Test-source Docker build and bounded startup failure | Pass: read-only/network-disabled container refuses unavailable storage with exit 1 and a safe diagnostic | `.local\part2-test-docker-build.log`, `.local\part2-test-image-failure.log`; test-only image, not release proof |
| Actual integrated browser persistence | Blocked | `.local\part2-firestore-browser\result.json`: `PART1_DEPENDENCIES_UNAVAILABLE`; zero accepted checks |
| Combined exact-source image and production candidate | Blocked | Part 1 session/bootstrap/arm modules are absent from this branch; no merge/rebase is authorised |

The final exact-commit release-preparation probe also failed closed as intended:
`SOURCE_DEPENDENCY_MISSING` for Part 1's `app/booking-storage.mjs`.
Evidence: `.local\part2-release-gate.log`. It emitted no successful release manifest.

The emulator is the existing Docker container `roomdrop-part2-firestore`, bound to
`127.0.0.1:8281`, project `demo-roomdrop-part2`. Tests create unique namespaces and
delete only their own documents. They do not flush the emulator or touch the
Part 1/8081 containers. Browser servers allocate port 0. Manual booking/quotation
ports remain 8294/8293, and the separate simulation app uses 8290.

One early full run had an unrelated failure in the unchanged IAP claim-timing
test (`agency-iap-auth.test.mjs:72`). That file passed alone and subsequent full
runs passed. No agency/auth code or test was changed. An initial browser assertion
also caught changed empty-state copy; the corrected copy preserves the existing
phrase and explicitly says the check is captured. Final browser results above pass.

The earlier frozen memory-source image at source `7da023e` built and passed a
network-disabled smoke. It was superseded by the manifest/Firestore entrypoint
change and is not a Part 2 release candidate. Its historical logs are
`.local\part2-docker-build.log` and `.local\part2-image-smoke.log`.

### Remaining integration work

Part 1's storage implementation is progressing separately. No Part 1 source was
copied into this worktree and no research branch was merged. The durable routes
use contract-v1 `get`/`transact`, `getBooking`/`getDrops` and the hosted loader.
The current GET/watch branches remain the base snapshot's memory implementation.
They must be reconciled with Part 1 after the user's integration go-ahead.
The v2 follow-up reads the committed storage code without copying it into this
checkout: actual session adapters are compatible, but that does not integrate
the missing runtime files or prove the Part 1 arm/GET journey.

Part 1's per-code bootstrap must spread
`publicPostWatchState({ scope, bundle })` from `quotation-session-actions.mjs`.
That projection hides stale confirmations and returns bounded conversation only
for the current watch. Do not expose the whole session or advice counters.
Run the integrated browser gate after this hookup; it checks actual restart,
two judges, two codes, context, rearm and immutable shared facts.

All original Part 2 acceptance checkboxes remain open pending that proof. The
six-curated-quotation content matrix and production importer/TTL approval are
separate Part 1/release prerequisites; synthetic rate fixtures cannot close them.
Claude reports all six codes AIRB000179-184 captured, with 180-183 armable and
three Drops each, and 179/184 non-refundable. That is an owner report; Part 2
has not read the real capture payloads or imported them.

The v3 request test does not exercise omitted `expectedRevision`: the client now
always supplies it. Source inspection of `d14f70f` found omission defaults to 0
and still participates in the stale check, differing from the v3 interface text.
This is recorded for Claude in the spec follow-up; no Part 1 code was edited.

### Reproduction

```powershell
Set-Location 'C:\Users\pohli\Sites\hotel-price-hunter\.local\roomdrop-part2'
$env:GOOGLE_CLOUD_PROJECT='demo-roomdrop-part2'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8281'
$env:RUN_ROOMDROP_PART2_FIRESTORE='1'
Remove-Item Env:RUN_FIRESTORE_INTEGRATION -ErrorAction SilentlyContinue
npm.cmd test
node tests\booking-after-watch.browser.mjs
node tests\booking-v3.browser.mjs
# Requires actual Part 1 modules integrated into this worktree:
node tests\booking-firestore.browser.mjs
git diff --check
```

`RUN_FIRESTORE_INTEGRATION` stays unset here because the unrelated historical
daily-watch test binds explicitly to 8081 / `demo-roomdrop-iap-qa`. The six inherited
integration skips are reported as skips. Memory tests are not Firestore proof.

## Part 2 - Authorised d14f70f integration (current)

The user authorised merging only `d14f70fe6b5ac1dbba19844679e5b45250748627`.
Merge commit `b1eda30c341377104937d3cde2b5e0317bdb20c4` has that exact second parent.
F9a and F10a ownership transferred to Codex. Claude retains F6/F7a setup UI and
F11a evidence; no later Part 1 commit has been merged.

The protected `booking-storage.mjs`, `quotation-session-storage.mjs`,
`domain/booking-drop-watch.mjs`, `domain/altovo-quotation.mjs`, `booking-judge.js`
and `drop-watch.js` match `d14f70f` unchanged. The arm request/receipt/transaction
is preserved. The client explicitly sends `expectedRevision`, including on retry.
Part 2 owns durable post-watch mutations and the filtered bootstrap projection;
catalogue confirmations and conversation no longer use a process-local mirror.

| Current proof | Result | Raw evidence under the worktree's ignored `.local/` |
| --- | --- | --- |
| Reviewed real import, default RoomDrop namespace, demo project/8281 only | Pass: six codes, 12 captured Drops, create-only import | `integration/real-import.json`, `integration/import-input-hashes.json` |
| Actual-UTC catalogue eligibility and arm | Pass: 180-183 return 200/observed; 179/184 return 409/NON_REFUNDABLE | `part2-firestore-real-browser/result.json`, `catalogueChecks` |
| Real-capture integrated browser | Pass: 320/768/1024/1440 px; arm, qualifying Drops, confirm, restart, context, two judges writing separate watches, two codes, rearm to empty | `part2-firestore-real-browser/result.json`, 12 screenshots |
| Shared fact preservation / external requests | Pass: before/after shared booking/Drop-fact equality; zero external browser requests and page errors | Same browser result; only this run's private session namespace is deleted |
| Full merged Node suite | Pass: 399 tests, 370 passed, 0 failed, 29 skipped | `integration/merged-node-tests-final.log` |
| Actual core Firestore tests on Part 2 emulator | Pass: 48 passed, 0 failed, 0 skipped | `integration/part1-core-emulator.log` |
| Exact-source manifest export and Docker build | Pass: actual modules, dependency closure, no payload snapshots/private captures | `integration/release-pin.json`, `integration/docker-build.log` |
| Packaged runtime with actual emulator injection | Pass: both hosted entrypoints, six-code catalogue, real arm/confirm/retry, restart, judge isolation, unavailable model and unchanged shared facts | `integration/image-smoke.log` |
| Production emulator guard in final image | Pass: both entrypoints refuse with bounded exit 1, network disabled | `integration/image-guard-results.json`, `integration/*-guard.log` |

The targeted core run covered session, arm, catalogue and quotation server tests.
It did not run the separate storage test case that hardcodes 8181 / Part 1's
project. The real importer was instead executed explicitly against the authorised
8281 / `demo-roomdrop-part2` endpoint. Full-suite skips remain reported separately;
the two test counts overlap and must not be added together.

The real capture file was
`C:/Users/pohli/Sites/hotel-price-hunter/.local/altovo-catalogue/catalogue-87ab61f1-25f5-4b18-a98d-7c57a0d34f91.json`,
SHA-256 `d3df4e16f9e33e2d17ce884b3e92af352b0d837449cc5709e7cf469f9d192039`.
Its entries were combined with the supplied six-card draft in an ignored local
import input. At-import card bytes hashed to
`ffe03a7d6f0377cf2f56320d9a35cdb7fa95190a8316c08da6b44fef1e5080c7`.
Later draft formatting changed, but canonical card data compares equal. The
assembled input hashes to
`f66b7d9a61d4bdbc9d7b71eef65f1b90c6033eb0ab7134b259163c1f09e36761`.
No captures or private references are committed or included in the image.

### Frozen local integration candidate

| Pin | Value |
| --- | --- |
| Runtime source | `a1a3fcfdfe5b83dabb2d830355b9df5b70399710` |
| Context SHA-256 | `76b5f5316a6e4efa75de1acb0c937744bb6b676f37d900baf455fff7277d20b9` |
| Catalogue manifest SHA-256 | `cb0a3fbe3146c8181844a574333389d769ed6780481849dd20fc6e5c86dc4dc5` |
| Local image tag | `roomdrop-booking:a1a3fcfdfe5b-76b5f5316a6e` |
| Local image ID | `sha256:4e6d38efe613fe980d76af3243da0c8bec9696ba55902704163a25f79ab14bf0` |
| Context/manifest directory | `.local/booking-release-609773ee-c8d2-4aad-8d22-d55b158cf1b1/` |

The image smoke uses an explicit test factory to connect the frozen server to
the actual Part 2 emulator. It does not enable an emulator environment switch in
production. The ordinary command-line guard was tested separately without network.
The quotation entrypoint now serves the same curated RoomDrop facade as booking;
the old quotation page cannot bootstrap a catalogue and is not the hosted surface.
The local image ID is not a verified registry digest; no registry push occurred.

Self-review covered binding/expiry/receipt correctness, bounded source reads,
transaction purity, request guards, source privacy, cleanup and ownership. No
external OCR or live model evaluation was run. All model responses in browser/API
tests were injected; the packaged model-unavailable path made zero model calls.
A deliberate confirmation-projection mutation was caught by the focused regression
test; the original bytes were restored and the focused test passed again.
Evidence: `integration/review-mutation.log`; the runtime source remains unchanged.

F3b/F4b/F5b/F7b/F8/F9a/F9b/F10a/F10b have current local proof. Final F11b release
acceptance remains open for Claude's F6/F7a/F11a update and retest. No push,
deployment, production import, live upstream call, IAM/TTL change or schedule ran.

```powershell
Set-Location 'C:\Users\pohli\Sites\hotel-price-hunter\.local\roomdrop-part2'
$env:GOOGLE_CLOUD_PROJECT='demo-roomdrop-part2'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8281'
node tests\booking-firestore.browser.mjs --existing --catalogue=.local\integration\reviewed-real-catalogue.json
$env:RUN_ROOMDROP_PART2_FIRESTORE='1'
Remove-Item Env:RUN_FIRESTORE_INTEGRATION -ErrorAction SilentlyContinue
npm.cmd test
# Separate run: these files use the selected 8281 emulator; do not include the daily-watch test.
$env:RUN_FIRESTORE_INTEGRATION='1'
node --test tests\quotation-session-storage.test.mjs tests\booking-drop-watch.test.mjs tests\booking-catalogue.test.mjs tests\quotation-demo-server.test.mjs
Remove-Item Env:RUN_FIRESTORE_INTEGRATION -ErrorAction SilentlyContinue
```
