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

#### S0.5 photo path: Gateway image sources and reviewed local photos (18 October 2026)

User decision: photos come from the Gateway search response. The first S0.4
capture dropped them, so a re-capture is needed (owner-run, not done here).

- `scripts\prepare-altovo-catalogue.mjs` now writes, beside each bundle (outside
  its integrity hash), `imageSources: { kind: 'remote-source-urls-pending-review',
  renderable: false, hotel: { url, caption } | null, drops: [{ optionId, url,
  caption }] }`. Hotel: first `data[].avatar` with an https URL in `urls.md`,
  `urls.lg`, `urls.sm`, then flat `md`/`lg`/`sm`. Drop: the first image of the
  matched rate (by its private rate detail) or else its room, same size order, or
  null. Only https URLs without credentials are kept; anything else is null.
  Not-searched codes (179, 184) have `hotel: null, drops: []`.
  `normaliseGatewayRates` is unchanged and still drops images.
- `app\booking-storage.mjs`: optional reviewed image manifest
  `{ [code]: { hotel?: photo|null, drops?: { [optionId]: photo|null } } }`, with
  photo `{ asset: 'assets/<a-z0-9->.jpg|png|webp', alt }`. A Drop photo becomes the
  optional `photo` fact of that Drop (absent when unreviewed, so earlier Drop-set
  versions are unchanged). A hotel photo fills a `photo: null` card and refuses a
  different existing card photo (`IMAGE_MANIFEST_CONFLICT`). Unknown codes or Drop
  ids, remote URLs and extra keys give `IMAGE_MANIFEST_INVALID`. Prepared
  `imageSources` are accepted only as `renderable: false` and never stored.
- `scripts\import-altovo-catalogue.mjs --images=PATH` reads the manifest (inside
  the workspace) and refuses missing assets (`CARD_PHOTO_MISSING`,
  `DROP_PHOTO_MISSING`).
- Evidence: `node --test .\tests\altovo-catalogue.test.mjs` 17/17 pass (two new:
  with images, without images, non-https, missing or non-object avatar).
  `node --test .\tests\booking-storage.test.mjs` with the Part 1 emulator env:
  15/15 pass (three new, one emulator round trip of a Drop photo and a filled
  card photo with no remote URL stored). All non-browser tests except
  `daily-watch-job` with the emulator env: 376/376 pass.
- Owner-run helpers (session scratchpad, not tracked): `run-s04-images.mjs`
  (same guard as the S0.4 run: POST login at most 1, search-by-id at most 4, no
  retries, path/status/ms logged; dry run by default, `--execute` for live) and
  `plan-image-downloads.mjs` (lists each unique URL with code, role and target
  `app/public/assets/roomdrop-<code>-<role>[-n].jpg`; `--download` does one GET per
  URL with no redirects, keeps image/jpeg|png|webp up to 600 KB whose bytes match
  the type, writes create-only and prints SHA-256 and bytes, plus an image
  manifest under `.local\roomdrop-images\`). Both were proven offline only: dry
  run (0 calls, 4 planned searches), injected fake Gateway (1 login, 4 searches,
  guard refusals for other origin, GET, query string, other path and a fifth
  search), and a fake-fetch download whose manifest passed an importer dry run.
  Neither ran live.
- Still needed after the live re-capture: review the downloaded files, then add
  each exact `/assets/...` route to `app\booking-demo-server.mjs` and
  `app\quotation-demo-server.mjs`, and render Drop photos in the UI. A
  re-capture gives new Drop ids and prices, so the Drop set changes on re-import.

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
- the existing file-catalogue tests through the same code path. (Superseded by
  5a85d4a: a re-arm without `expectedRevision` is no longer checked.)

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
  Part 1 report (F7a). Fixed by 5a85d4a below.

Still open: hosted startup wiring (F9a) and the emulator launcher (F11a).

### Arm request fix: optional expectedRevision (18 October 2026)

Commits `5a85d4a` and `b0cc105`. Contract v3 makes `expectedRevision` optional.
An absent value skips the stale check: the committed minimum again returns the
same receipt, and a new minimum makes the next revision. A present value that is
not the current revision is `409 WATCH_REVISION_STALE`. New tests cover absent,
stale and current, both in the pure arm and over HTTP. The racing first-arm
emulator test and one catalogue test now send revision 0 explicitly, because
only an explicit revision can lose a race.

### F6 and F7a: Start grid, Original Booking, setup and armed state (18 October 2026)

Commits `8390e8e` (screens) and `0694b94` (browser walk). Files:
`app\public\booking-judge.js`, the catalogue and booked sections of
`app\public\booking.html` and `app\public\booking.css`,
`tests\booking-setup-ui.test.mjs` (new) and `tests\booking-judge.browser.mjs`.

- Start cards come from the catalogue `card`: the curated city with the country,
  dates, retail price, the scenario label and the request-time eligibility tag.
  The scenario label shows only while the booking can still start. With
  `photo: null` (all six real cards until S0.5) the card shows a drawn airmail
  fallback ("No photo yet" with the city), never another hotel's picture.
- The Original Booking page keeps "Your agency booked this" and the single "Set
  up a drop" action, and adds the capture date: "A real Altovo staging quotation
  standing in for a confirmed booking · captured 18 Oct 2026" (from
  `baseline.source.readAt`). A booking that cannot start shows its reason, and the
  setup action stays visible but disabled (`aria-describedby` the reason).
- Setup offers minimum choices from the 10.00 floor in the booking currency's
  minor units (MYR, JPY and KWD unit cases). Consent is required. The armed line
  comes only from the committed receipt. `armRequestBody` sends
  `expectedRevision: data.watch?.revision ?? 0`.
- The browser walk serves `tests\fixtures\curated-bookings.json` through the
  storage read interface with memory sessions, on port 0. At 320, 768 and 1440 px
  it covers the grid with no text inputs and no partner logo, and opening a card
  by keyboard. It goes through setup by Tab, arrow and Space, and the consent
  prompt. An injected `503` arm keeps the setup screen with "could not be armed"
  and no armed or checking screen, and the retry arms. A reload shows the same
  armed line, and bootstrap returns the same `watch` as the arm response. It also
  covers re-arms to revision 3, Drops, Review and Confirmed, and the cannot-start
  paths. A second server at 15 Feb 2027 shows "Cannot start: free cancellation
  ended" with no scenario label, and the Original Booking page shows "Free
  cancellation has ended".

Commands (worktree; emulator variables as above for the first):

- `node --test .\tests\altovo-catalogue.test.mjs .\tests\booking-storage.test.mjs .\tests\quotation-session-storage.test.mjs .\tests\booking-catalogue.test.mjs .\tests\booking-drop-watch.test.mjs .\tests\quotation-demo-server.test.mjs .\tests\booking-setup-ui.test.mjs`:
  tests 83, pass 83, fail 0, skipped 0.
- `node --test .\tests\booking-setup-ui.test.mjs`: tests 7, pass 7.
- `npm test` without emulator variables: tests 382, pass 353, fail 0, skipped 29.
- `node .\tests\booking-judge.browser.mjs`: passed (all four check groups,
  no page errors, no external requests). Screenshots are in the ignored
  `.local\judge-flow\browser\`: `start`, `booked`, `setup`, `arm-failed`,
  `checking`, `armed`, `empty`, `review`, `confirmed` and `cannot-start` at each
  width, plus `ended-start-768` and `ended-booked-768`.

Open: the arm `fetch` is in `app\public\booking-live.js` (Part 2), which still
sends no `expectedRevision`. It works because an absent value is allowed, but a
stale tab can then replace a newer setup. Part 2 should send
`judge.armRequestBody(data, minimum)`. Reviewed photos (S0.5) also need exact
asset routes in `app\booking-demo-server.mjs`.

### S0.5 photos: reviewed assets, image manifest and re-import (18 October 2026)

Commits `f386e57` (assets), `633faac` (static routes), `add2bd1` (`card.roomPhoto`)
and `dacf89a` (rendering).

Provenance. The second guarded Gateway run (5 calls) returned no image fields
in search-by-id, so the photos came from the air1 quotation share-link JSON
(hotel avatar and booked-room images), read in the owner's logged-in browser.
Source URLs: the shared checkout's ignored
`.local\altovo-sample\image-sources-2026-10-18.json`; download record with
SHA-256 and bytes: `.local\altovo-sample\image-downloads-2026-10-18.json`. The
owner approved 9 downloads and reviewed them; the AIRB000184 room photo (a
bathroom toiletries close-up) was rejected and deleted. The first capture,
`catalogue-87ab61f1-...`, stays the Drops of record; `catalogue-722868cc-...` is
not imported. Labels, city names and order in `.local\cards-draft.json` are
owner-approved; its status now also records the approved photos.

Committed assets (`app\public\assets\`, public reviewed images):

| Asset | Size | Bytes | SHA-256 | Alt (owner-approved) |
| --- | --- | --- | --- | --- |
| `roomdrop-airb000179-hotel.jpg` | 350x259 | 29361 | `c37163f7eeb49dbecc6b4c6a6dc32714666be8965e8089eedd8ae0257614f4ed` | Grand Hyatt Kuala Lumpur lobby at night |
| `roomdrop-airb000180-hotel.jpg` | 350x207 | 29645 | `0edabded9b3826965a454654de9066f86d0da513e1339a21a948f6d45a264184` | Siam Kempinski Hotel Bangkok and its pool gardens |
| `roomdrop-airb000181-hotel.jpg` | 350x233 | 33036 | `ffad05442298da0d92609810cb8231fa1a54f5bac9286dc3bd0e09a0ee9210e1` | Pan Pacific Singapore at dusk |
| `roomdrop-airb000181-room.jpg` | 1200x800 | 128624 | `d7b04271290bc20f001862c489e89a42c3f6864a516925feb503b16bf41707b0` | Executive Marina Bay Room with a city view |
| `roomdrop-airb000182-hotel.jpg` | 350x209 | 28368 | `c6a5e29606ac80e64f047ef5d1b32a22b1e8356a309801870420ed7892d0daf7` | PARKROYAL COLLECTION Pickering with its sky gardens |
| `roomdrop-airb000182-room.jpg` | 1200x926 | 143297 | `2ab56bcfa7ccbbaaa5a5280d0cff37ebb8524d09d2218a58adb20b8b03f4662c` | Lifestyle Premier King room with a garden view |
| `roomdrop-airb000183-hotel.jpg` | 350x262 | 29923 | `30700529bb819cf9eb8ef83efcdb74e2105153ae75c63f45716e71490c2dcb39` | The Park Lane Hong Kong at dusk |
| `roomdrop-airb000184-hotel.jpg` | 350x263 | 30733 | `2590621056d95c690e70d30d9bd83ee64ee58dfa7d3cba49fe2764170d8276ec` | Kuala Lumpur skyline at sunset from Banyan Tree Kuala Lumpur |

The six hotel photos are byte-identical to the download record. The two room
photos were resized locally (PowerShell System.Drawing, high-quality bicubic,
JPEG quality 82, no metadata) from 3000x2000 / 399891 bytes
(`550808513c6e...`) and 2560x1975 / 402288 bytes (`372b34b3cd7f...`). The hotel
avatars are only 350 px wide, so they look soft on the 1440 px Original Booking
page; a larger source would need a new owner-approved download.

- Static routes: each of the eight exact `/assets/...` paths is in the
  allowlists of `app\booking-demo-server.mjs` and `app\quotation-demo-server.mjs`
  (`image/jpeg`); the rejected 184 room photo and unknown names are 404.
- Storage (additive to contract v4): the image manifest accepts `room` next to
  `hotel` and `drops`. It fills the card's optional `roomPhoto` (`{ asset, alt }`,
  absent when none), refuses a different existing room photo
  (`IMAGE_MANIFEST_CONFLICT`); the importer refuses an unshipped room asset
  (`CARD_PHOTO_MISSING`).
- Image manifest: ignored `.local\s0.5\image-manifest.json` (3852 bytes, SHA-256
  `bc8aa163fc742f75e70811e5555eceaa94aab0ba34cd0e3b926c99b6879e8fd6`): six hotel
  photos, room photos for 181 and 182, and for each of the 12 Drops of 180 to 183
  the hotel photo with its alt suffixed " - hotel photo" (no room-specific Drop
  photo source exists).
- Re-import into the Part 1 emulator (127.0.0.1:8181, `demo-roomdrop-part1`):
  dry run `validated`; `--execute` over the S0.6 records gave `BOOKING_CHANGED`
  (create-only records); the six `roomdropBookingsV1` records were then deleted
  from this emulator only and the import executed (`created` x6); an identical
  retry returned `unchanged` x6. Read-back with a new client: card order and
  labels as approved, `card.photo` and `card.roomPhoto` equal the manifest,
  every Drop from `getDrops` and every bundle option carries the hotel photo
  with the " - hotel photo" alt, 179 and 184 still `CAPTURE_UNAVAILABLE`, and no
  remote URL or `imageSources` in any record. New content versions (first 12
  hex): 179 `d9d613f7e152`, 180 `00be05a4a41c`, 181 `b2ab7f5ae071`,
  182 `f729d12c8651`, 183 `fff808d37063`, 184 `6a61cf9e7846`.
- Rendering (Part 1 sections): start cards show the reviewed hotel photo on top
  with a "Hotel photo" label; the drawn fallback has no label. The Original
  Booking page labels its photo "Hotel photo" and, for 181 and 182, adds a
  "Room photo" snapshot with the booked room name. No room photo (or a failed
  load) shows nothing; the hotel photo never stands in for the room.
- For Part 2: each Drop now has `photo: { asset, alt }` (the hotel photo, alt
  ending " - hotel photo"). The Drop cards in `app\public\booking-live.js` still
  show the generic "Illustrative photo"; they should render `'/' + drop.photo.asset`
  with a visible "Hotel photo" label, and keep the fallback when `photo` is absent.

### F11a: Part 1 acceptance evidence (18 October 2026)

Commits `d3db493` (launcher) and `6808e32` (browser walk). F9a (hosted Firestore
wiring) and F10a (packaging) were reassigned to Codex by the user and are not
part of this evidence.

`scripts\serve-booking-demo.mjs` adds an emulator-only mode:
`--emulator=127.0.0.1:PORT --project=demo-... [--seed=PATH [--images=PATH]] [--port=N]`.
It refuses production, Cloud Run and non-loopback binds (`LOCAL_MODE_REQUIRED`),
a non-loopback emulator, a non-`demo-` project or a mismatched
`FIRESTORE_EMULATOR_HOST` (`EMULATOR_REQUIRED`), and mixed or unknown arguments,
before any client exists. Seeding runs only through the importer's guarded,
create-only execute path; a refused seed stops the launch. Shared records and
judge sessions live in the emulator. Advice is unconfigured in this mode.

Local proof (no live call):

- `tests\booking-catalogue.test.mjs` launcher cases: 14 refusals with no client
  or import; against the emulator, a refused seed writes nothing, a seeded
  launch serves the catalogue, a judge arms, a restart without a seed keeps the
  same cookie, CSRF token and watch, and a second identical seed is `unchanged`.
- `node .\tests\booking-emulator.browser.mjs` with the emulator variables:
  passed, no page errors, no external requests. Launch 1:
  `--seed=.local/s0.6/catalogue-import.json --images=.local/s0.5/image-manifest.json
  --port=8194`, printed "Seeded through the guarded importer: AIRB000179
  unchanged, ..." (all six unchanged). At 320, 768 and 1440 px: six cards in the
  approved order, each with its reviewed hotel photo loaded and labelled, no
  fallback; Original Booking for 181 (hotel and room photo), 180 (hotel only)
  and 179 (hotel only, setup disabled). Judge A armed 181 (Any drop, MYR 10)
  and 182 (MYR 50), both revision 1 with a `captured-replay` first check;
  judge B armed 181 at MYR 100. Each judge kept their own watch, and B had none
  on 182. Launch 2 had no seed; both judges reloaded into their committed
  armed lines and identical bootstrap watches. Screenshots (ignored):
  `.local\judge-flow\emulator\` `start`, `booked-airb000181`,
  `booked-airb000180`, `booked-airb000179` at each width, `armed-airb000181-768`,
  `restarted-armed-airb000181` at 768 and 390. The evidence sessions were then
  deleted; the emulator holds only the six imported bookings.
- `node .\tests\booking-judge.browser.mjs`: passed. The fixture's Siam card now
  uses its reviewed hotel photo; the Hyatt card keeps the drawn fallback.
- Observation for Part 2: an in-page hash change from `#drops-AIRB000182` to
  `#drops-AIRB000181` kept showing 182's armed line until a reload. The walk
  reloads; this was not investigated further.

Commands (worktree; emulator variables `FIRESTORE_EMULATOR_HOST=127.0.0.1:8181`,
`GOOGLE_CLOUD_PROJECT=demo-roomdrop-part1`, `RUN_FIRESTORE_INTEGRATION=1`,
`NODE_ENV=test` for the first):

- `node --test .\tests\altovo-quotation.test.mjs .\tests\altovo-catalogue.test.mjs .\tests\booking-storage.test.mjs .\tests\quotation-session-storage.test.mjs .\tests\booking-catalogue.test.mjs .\tests\booking-drop-watch.test.mjs .\tests\quotation-demo-server.test.mjs .\tests\booking-setup-ui.test.mjs`:
  tests 99, pass 99, fail 0, skipped 0.
- `npm test` without emulator variables: tests 393, pass 362, fail 0, skipped 31.
- `node .\tests\booking-judge.browser.mjs`: passed.
- `node .\tests\booking-emulator.browser.mjs` (emulator variables, no
  `RUN_FIRESTORE_INTEGRATION`): passed.
- `git diff --check`: clean.

Live calls on 18 October 2026 (all owner-approved and owner-run in the owner's
browser or session; this worktree made none):

- S0.3 share-link reads: AIRB000181 to AIRB000184 for projections, then
  AIRB000179 to AIRB000184 again for images; 10 seven-day share tokens minted in
  total, none stored.
- Gateway: 2 guarded runs of 5 calls each (1 login and 4 search-by-id), all as
  recorded above; the second returned no image fields.
- 9 image GETs for the approved downloads.
- 2 failed Altovo probes, `hotels/details` and `image/list`, both 404 on air1.